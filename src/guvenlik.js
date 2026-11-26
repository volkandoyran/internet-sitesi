// Güvenlik yardımcıları (26 Kasım 2026 denetimi):
//  - Giriş denemesi sınırı: aynı IP'den 15 dakikada 10 yanlış şifre -> 15 dakika bekleme (site ve admin girişi ayrı sayılır).
//    Yalnızca yanlış denemede veritabanına yazılır; doğru şifre sayacı sıfırlar. Başka IP'deki meşru kullanıcı etkilenmez.
//  - Admin oturumu: şifre tarayıcıda saklanmaz. Girişte bir kez doğrulanır, 12 saatlik rastgele bir oturum kimliği
//    HttpOnly + Secure + SameSite=Strict çerezle verilir. Veritabanında yalnızca kimliğin SHA-256 özeti durur;
//    çıkışta silinir, admin şifresi değişince tüm oturumlar kendiliğinden geçersiz olur.
//  - Hata yanıtı: kullanıcıya genel mesaj ve takip kodu; teknik ayrıntı yalnızca Worker günlüğüne yazılır.

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const iso = (ms = Date.now()) => new Date(ms).toISOString();

export async function esit(a, b) {
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(String(a))), crypto.subtle.digest('SHA-256', enc.encode(String(b)))]);
  return crypto.subtle.timingSafeEqual(x, y);
}

export const GUVENLIK_TABLOLARI = [
  `CREATE TABLE IF NOT EXISTS login_failures (key TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0, first_at TEXT NOT NULL, locked_until TEXT)`,
  `CREATE TABLE IF NOT EXISTS admin_sessions (id_hash TEXT PRIMARY KEY, pw_tag TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)`,
];

// ---------- Giriş denemesi sınırı ----------
export const DENEME = { max: 10, pencereDk: 15, kilitDk: 15 };
const ipOf = (request) => request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || 'yerel';

// Kilitliyse kalan saniye, değilse 0
export async function kilitli(env, request, alan) {
  try {
    const row = await env.DB.prepare('SELECT locked_until FROM login_failures WHERE key = ?').bind(`${alan}:${ipOf(request)}`).first();
    if (!row || !row.locked_until) return 0;
    const kalan = Math.ceil((Date.parse(row.locked_until) - Date.now()) / 1000);
    return kalan > 0 ? kalan : 0;
  } catch { return 0; } // sayaç tablosu okunamazsa giriş engellenmez (yalnızca gecikme korur)
}

export async function yanlisDeneme(env, request, alan) {
  const key = `${alan}:${ipOf(request)}`;
  const now = Date.now();
  const pencere = iso(now - DENEME.pencereDk * 60e3);
  try {
    // Pencere dışındaki eski sayım sıfırlanır; 10. yanlışta kilit konur
    await env.DB.prepare(`INSERT INTO login_failures (key, count, first_at, locked_until) VALUES (?, 1, ?, NULL)
      ON CONFLICT(key) DO UPDATE SET
        count = CASE WHEN first_at < ? OR (locked_until IS NOT NULL AND locked_until < ?) THEN 1 ELSE count + 1 END,
        first_at = CASE WHEN first_at < ? OR (locked_until IS NOT NULL AND locked_until < ?) THEN excluded.first_at ELSE first_at END,
        locked_until = CASE WHEN first_at < ? OR (locked_until IS NOT NULL AND locked_until < ?) THEN NULL
                            WHEN count + 1 >= ? THEN ? ELSE locked_until END`)
      .bind(key, iso(now), pencere, iso(now), pencere, iso(now), pencere, iso(now), DENEME.max, iso(now + DENEME.kilitDk * 60e3)).run();
    // Eski kayıtlar temizlenir (tablo büyümesin)
    if (Math.random() < 0.1) await env.DB.prepare('DELETE FROM login_failures WHERE first_at < ? AND (locked_until IS NULL OR locked_until < ?)').bind(iso(now - 864e5), iso(now)).run();
  } catch (e) { console.error(JSON.stringify({ olay: 'giris_sayaci', hata: String(e && e.message) })); }
}

export async function dogruDeneme(env, request, alan) {
  try { await env.DB.prepare('DELETE FROM login_failures WHERE key = ?').bind(`${alan}:${ipOf(request)}`).run(); } catch {}
}

// ---------- Admin oturumu ----------
export const ADMIN_COOKIE = 'ucf_admin';
export const ADMIN_SURE_SN = 12 * 3600;
const pwTag = async (pw) => (await sha('ucfiyat-admin-oturum-v1:' + pw)).slice(0, 32);

export function cerez(request, ad) {
  for (const p of (request.headers.get('cookie') || '').split(';')) {
    const i = p.indexOf('=');
    if (i > 0 && p.slice(0, i).trim() === ad) return p.slice(i + 1).trim();
  }
  return '';
}

export async function oturumAc(env) {
  const id = hex(crypto.getRandomValues(new Uint8Array(32)));
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').bind(iso(now)),
    env.DB.prepare('INSERT INTO admin_sessions (id_hash, pw_tag, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .bind(await sha(id), await pwTag(env.ADMIN_PASSWORD), iso(now), iso(now + ADMIN_SURE_SN * 1000)),
  ]);
  return `${ADMIN_COOKIE}=${id}; Max-Age=${ADMIN_SURE_SN}; Path=/api/admin; HttpOnly; Secure; SameSite=Strict`;
}

export async function oturumKapat(env, request) {
  const id = cerez(request, ADMIN_COOKIE);
  if (id) { try { await env.DB.prepare('DELETE FROM admin_sessions WHERE id_hash = ?').bind(await sha(id)).run(); } catch {} }
  return `${ADMIN_COOKIE}=; Max-Age=0; Path=/api/admin; HttpOnly; Secure; SameSite=Strict`;
}

// Admin yetkisi: { ok, via: 'bearer' | 'cookie' }.
// Bearer: GitHub Actions tarayıcısı (ADMIN_PASSWORD). Çerez: paneldeki oturum.
export async function adminMi(request, env) {
  const pw = env.ADMIN_PASSWORD;
  if (!pw) return { ok: false };
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (bearer) return { ok: await esit(bearer, pw), via: 'bearer' };
  const id = cerez(request, ADMIN_COOKIE);
  if (!/^[0-9a-f]{64}$/.test(id)) return { ok: false };
  const row = await env.DB.prepare('SELECT pw_tag FROM admin_sessions WHERE id_hash = ? AND expires_at > ?').bind(await sha(id), iso()).first();
  return { ok: !!row && row.pw_tag === (await pwTag(pw)), via: 'cookie' };
}

// Çerezle gelen değiştirici istekler yalnızca sitenin kendi sayfasından kabul edilir (CSRF)
export function ayniKaynak(request, url) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
  const origin = request.headers.get('origin');
  if (origin) return origin === url.origin;
  const site = request.headers.get('sec-fetch-site');
  return site === 'same-origin';
}

// ---------- Hata yanıtı ----------
export function hataKaydi(e, request, yer = 'api') {
  const id = crypto.randomUUID().slice(0, 8);
  let path = '';
  try { path = new URL(request.url).pathname; } catch {}
  console.error(JSON.stringify({ olay: 'sunucu_hatasi', hata_id: id, yer, yol: path, yontem: request.method, mesaj: String(e && e.message), yigin: String(e && e.stack || '').slice(0, 2000) }));
  return id;
}
