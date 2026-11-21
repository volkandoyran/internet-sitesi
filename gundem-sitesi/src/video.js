// Kısa dikey haber videoları (YouTube Shorts, Instagram Reels).
// Video, ücretsiz GitHub Actions içinde üretilir (gundem-sitesi/video/uret.py: Piper seslendirme +
// FFmpeg). Bu modül o işe sıradaki uygun haberi verir, biten videoyu Workers KV'de (ücretsiz, kart
// gerektirmez; 48 saat sonra kendiliğinden silinir) saklayıp herkese açık sunar (Instagram videoyu bu adresten çeker) ve platform sonuçlarını `paylasimlar` tablosuna yazar.
// Onay beklenmez; onun yerine kurallar: en az iki kaynak, hassas konular hariç, günlük sınır, acil durdurma.

const SAAT = 3600e3;
const sayi = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);

export const videoAyarlari = (env) => ({
  gunluk: sayi(env.VIDEO_GUNLUK, 4),          // 24 saatte en fazla video
  gorselGunluk: sayi(env.GORSEL_GUNLUK, 2),   // 24 saatte en fazla Instagram fotoğraf gönderisi
  saat: sayi(env.VIDEO_SAAT, 8),              // bundan eski haberden video yapılmaz
  enAzKaynak: sayi(env.VIDEO_EN_AZ_KAYNAK, 2),
  saklaSaat: sayi(env.VIDEO_SAKLA_SAAT, 48),  // KV'deki dosya bu süre sonra kendiliğinden silinir
});

// Videoya çevrilmeyen konular (haber sitede kalır). Yanlış ya da hassas haberin onaysız videoya
// dönüşüp hesabı riske atmaması için bilinçli olarak geniş tutuldu.
const HASSAS = [
  // siyaset
  'seçim', 'secim', 'cumhurbaşkan', 'bakan', 'milletvekil', 'meclis', 'parti', 'chp', 'akp', 'ak parti', 'mhp', 'dem parti',
  'iyi parti', 'muhalefet', 'iktidar', 'erdoğan', 'özgür özel', 'bahçeli', 'imamoğlu', 'kılıçdaroğlu', 'darbe', 'protesto', 'terör',
  'election', 'president', 'minister', 'parliament', 'trump', 'putin', 'netanyahu',
  // sağlık
  'hastalık', 'kanser', 'virüs', 'salgın', 'aşısı', 'aşılama', 'ilaç', 'tedavi', 'covid', 'grip',
  // suç ve yargı
  'cinayet', 'öldür', 'gözaltı', 'tutukla', 'operasyon', 'şüpheli', 'sanık', 'mahkeme', 'dava', 'savcı', 'iddianame',
  'tecavüz', 'istismar', 'taciz', 'saldırı', 'bıçak', 'silah', 'uyuşturucu', 'intihar', 'cesed', 'ceset',
];

const kucuk = (s) => String(s || '').toLocaleLowerCase('tr-TR');
const kelimeVar = (metin, k) => new RegExp(`(^|[^\\p{L}])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(metin);

export function hassasMi(h) {
  const t = kucuk(`${h.baslik} ${h.metin || ''}`);
  return HASSAS.some((k) => kelimeVar(t, kucuk(k)));
}

const kaynakListesi = (h) => (Array.isArray(h.kaynaklar) ? h.kaynaklar : JSON.parse(h.kaynaklar || '[]'));
export const kaynakAdlari = (h) => [...new Set(kaynakListesi(h).map((k) => k.ad))].slice(0, 3);

export function videoyaUygun(h, a = { enAzKaynak: 2 }) {
  if (!h.metin) return false;
  if (kaynakAdlari(h).length < a.enAzKaynak) return false;
  return !hassasMi(h);
}

const hashtagsiz = (s) => String(s || '').replace(/#[\p{L}\p{N}_]+/gu, '').replace(/\s+/g, ' ').trim();
const nokta = (s) => (/[.!?…]$/.test(s) ? s : `${s}.`);

// Seslendirilecek metin: başlık, botun yazdığı kısa metin, kaynak adları (bağlantı yok)
export function seslendirme(h) {
  const govde = hashtagsiz(h.metin).replace(/…$/, '.');
  const bas = h.baslik.trim();
  const parca = [nokta(bas)];
  if (govde && !kucuk(govde).startsWith(kucuk(bas).slice(0, 40))) parca.push(nokta(govde));
  parca.push(`Kaynak: ${kaynakAdlari(h).join(', ')}.`);
  return parca.join(' ');
}

export function videoBasligi(h) {
  const b = h.baslik.trim();
  return (b.length > 90 ? `${b.slice(0, 89).replace(/\s+\S*$/, '')}…` : b) + ' #Shorts';
}

// Platform açıklaması: metin + kaynak adları + yapay zekâ notu. Bağlantı yok.
export function videoAciklamasi(h) {
  const etiketler = (String(h.metin || '').match(/#[\p{L}\p{N}_]+/gu) || []).slice(0, 2);
  return [
    nokta(hashtagsiz(h.metin) || h.baslik),
    `Kaynak: ${kaynakAdlari(h).join(', ')}`,
    'Bu video yapay zekâ ile seslendirildi.',
    [...new Set(['#haber', '#gündem', ...etiketler])].join(' '),
  ].join('\n\n');
}

async function anahtarDogru(env, verilen) {
  if (!env.VIDEO_ANAHTAR || !verilen) return false;
  const h = async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([h(env.VIDEO_ANAHTAR), h(verilen)]);
  return a.every((x, i) => x === b[i]);
}

// GitHub Actions kimliği (OIDC): video iş akışı gizli anahtar girmeden kendini kanıtlar. Yalnızca bu
// deponun main dalındaki gundem-video.yml iş akışından gelen, GitHub imzalı jeton kabul edilir.
const OIDC = 'https://token.actions.githubusercontent.com';
export const OIDC_KITLE = 'gundem-sitesi';
const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const jsonCoz = (s) => JSON.parse(new TextDecoder().decode(b64u(s)));
let jwks = null;
let jwksZaman = 0;
async function githubAnahtarlari(yenile) {
  if (!jwks || yenile || Date.now() - jwksZaman > SAAT) {
    const r = await fetch(`${OIDC}/.well-known/jwks`);
    if (!r.ok) throw new Error(`JWKS ${r.status}`);
    jwks = (await r.json()).keys;
    jwksZaman = Date.now();
  }
  return jwks;
}

export async function githubJetonuDogru(env, jwt, { simdi = Date.now(), anahtarlar = githubAnahtarlari } = {}) {
  try {
    const [h, p, imza] = String(jwt || '').split('.');
    if (!imza) return false;
    const bas = jsonCoz(h);
    const y = jsonCoz(p);
    const depo = env.VIDEO_DEPO || 'volkandoyran/internet-sitesi';
    if (bas.alg !== 'RS256' || y.iss !== OIDC || y.aud !== OIDC_KITLE || y.repository !== depo || y.ref !== 'refs/heads/main') return false;
    if (!String(y.workflow_ref || '').startsWith(`${depo}/.github/workflows/gundem-video.yml@`)) return false;
    if (!(y.exp * 1000 > simdi) || (y.nbf && y.nbf * 1000 > simdi + 60e3)) return false;
    const jwk = (await anahtarlar(false)).find((k) => k.kid === bas.kid) || (await anahtarlar(true)).find((k) => k.kid === bas.kid);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(imza), new TextEncoder().encode(`${h}.${p}`));
  } catch {
    return false;
  }
}

async function yetkili(env, req) {
  const tasiyici = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (tasiyici && (await githubJetonuDogru(env, tasiyici))) return true;
  return anahtarDogru(env, req.headers.get('x-video-anahtar'));
}

const iso = (ms) => new Date(ms).toISOString();

async function siradaki(env, tur = 'video', simdi = Date.now()) {
  const a = videoAyarlari(env);
  if (env.OTOMATIK_PAYLASIM === '0') return { neden: 'otomatik paylaşım kapalı (OTOMATIK_PAYLASIM=0)' };
  const sinir = tur === 'foto' ? a.gorselGunluk : a.gunluk;
  const bugun = (await env.DB.prepare("SELECT COUNT(*) AS n FROM videolar WHERE zaman >= ? AND durum != 'hata' AND tur = ?")
    .bind(iso(simdi - 24 * SAAT), tur).first()).n;
  if (bugun >= sinir) return { neden: `günlük sınır doldu (${tur} ${bugun}/${sinir})` };
  const adaylar = (await env.DB.prepare(`SELECT h.* FROM haberler h WHERE h.metin IS NOT NULL AND h.ilk_gorulme >= ?
    AND h.kaynak_sayisi >= ? AND NOT EXISTS (SELECT 1 FROM videolar v WHERE v.haber_id = h.id)
    ORDER BY h.kaynak_sayisi DESC, h.ilk_gorulme DESC LIMIT 40`).bind(iso(simdi - a.saat * SAAT), a.enAzKaynak).all()).results;
  const h = adaylar.find((x) => videoyaUygun(x, a));
  if (!h) return { neden: 'uygun haber yok' };
  await env.DB.prepare("INSERT INTO videolar (haber_id, durum, zaman, tur) VALUES (?, 'uretiliyor', ?, ?)").bind(h.id, iso(simdi), tur).run();
  return {
    haber: {
      id: h.id,
      baslik: h.baslik,
      seslendirme: seslendirme(h),
      govde: nokta(hashtagsiz(h.metin).replace(/…$/, '.')),
      kaynak: `Kaynak: ${kaynakAdlari(h).join(', ')}`,
      videoBasligi: videoBasligi(h),
      aciklama: videoAciklamasi(h),
    },
  };
}

const PLATFORM = new Set(['youtube', 'instagram', 'tiktok']);

const UZANTI_TURU = { mp4: 'video/mp4', jpg: 'image/jpeg' };

// /api/video/* ve /video/<id>.mp4|jpg isteklerini karşılar; başka yolsa null döner.
export async function videoIstek(req, env, yol) {
  const dosya = yol.match(/^\/video\/(\d+)\.(mp4|jpg)$/);
  if (dosya && (req.method === 'GET' || req.method === 'HEAD')) {
    const veri = env.VIDEO && (await env.VIDEO.get(`${dosya[1]}.${dosya[2]}`, 'arrayBuffer'));
    if (!veri) return new Response('Bulunamadı', { status: 404 });
    const n = veri.byteLength;
    const h = new Headers({ 'content-type': UZANTI_TURU[dosya[2]], 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=3600' });
    const r = (req.headers.get('range') || '').match(/^bytes=(\d*)-(\d*)$/);
    if (r && (r[1] || r[2])) {
      let bas = r[1] ? Number(r[1]) : n - Number(r[2]);
      let son = r[1] && r[2] ? Math.min(Number(r[2]), n - 1) : n - 1;
      bas = Math.max(0, bas);
      if (bas > son) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${n}` } });
      h.set('content-range', `bytes ${bas}-${son}/${n}`);
      h.set('content-length', String(son - bas + 1));
      return new Response(req.method === 'HEAD' ? null : veri.slice(bas, son + 1), { status: 206, headers: h });
    }
    h.set('content-length', String(n));
    return new Response(req.method === 'HEAD' ? null : veri, { headers: h });
  }
  if (yol === '/video/liste' && (req.method === 'GET' || req.method === 'HEAD')) return videoListesi(env);
  if (!yol.startsWith('/api/video')) return null;
  if (!(await yetkili(env, req))) return Response.json({ hata: 'yetkisiz' }, { status: 401 });

  if (yol === '/api/video/sira' && req.method === 'POST') {
    const tur = new URL(req.url).searchParams.get('tur') === 'foto' ? 'foto' : 'video';
    return Response.json(await siradaki(env, tur));
  }

  const yukle = yol.match(/^\/api\/video\/(\d+)\/dosya$/);
  if (yukle && req.method === 'PUT') {
    if (!env.VIDEO) return Response.json({ hata: 'VIDEO (KV) bağlı değil' }, { status: 500 });
    const id = Number(yukle[1]);
    const v = await env.DB.prepare('SELECT haber_id FROM videolar WHERE haber_id = ?').bind(id).first();
    if (!v) return Response.json({ hata: 'bu haber için video işi yok' }, { status: 404 });
    const veri = await req.arrayBuffer();
    // KV değer sınırı 25 MB; bu videolar genelde 1-5 MB
    if (!veri.byteLength || veri.byteLength > 24e6) return Response.json({ hata: 'dosya boyutu geçersiz' }, { status: 413 });
    const uzanti = (req.headers.get('content-type') || '').startsWith('image/jpeg') ? 'jpg' : 'mp4';
    await env.VIDEO.put(`${id}.${uzanti}`, veri, { expirationTtl: Math.max(60, videoAyarlari(env).saklaSaat * 3600) });
    await env.DB.prepare("UPDATE videolar SET durum = 'yuklendi', dosya = 1 WHERE haber_id = ?").bind(id).run();
    return Response.json({ url: `${new URL(req.url).origin}/video/${id}.${uzanti}` });
  }

  const sonuc = yol.match(/^\/api\/video\/(\d+)\/sonuc$/);
  if (sonuc && req.method === 'POST') {
    const id = Number(sonuc[1]);
    const b = await req.json().catch(() => ({}));
    if (b.platform === 'uretim') {
      // Üretim başarısız: kayıt 'hata' olur, haber bir daha denenmez
      await env.DB.prepare("UPDATE videolar SET durum = 'hata', hata = ? WHERE haber_id = ?").bind(String(b.hata || '').slice(0, 500), id).run();
      return Response.json({ tamam: true });
    }
    if (!PLATFORM.has(b.platform)) return Response.json({ hata: 'platform geçersiz' }, { status: 400 });
    const hata = b.hata ? String(b.hata).slice(0, 500) : null;
    await env.DB.prepare('INSERT OR REPLACE INTO paylasimlar (haber_id, platform, durum, hata, zaman) VALUES (?, ?, ?, ?, ?)')
      .bind(id, b.platform, hata ? 'hata' : 'paylasildi', hata, iso(Date.now())).run();
    return Response.json({ tamam: true });
  }
  return Response.json({ hata: 'bulunamadı' }, { status: 404 });
}

const kacis = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Son üretilen videolar: telefondan izle, indir, açıklamayı kopyala (hesaplar bağlanana kadar elle paylaşım için)
async function videoListesi(env) {
  const a = videoAyarlari(env);
  const l = (await env.DB.prepare(`SELECT v.haber_id, v.zaman, v.tur, h.baslik, h.metin, h.kaynaklar,
      (SELECT group_concat(s.platform || ':' || s.durum) FROM paylasimlar s WHERE s.haber_id = v.haber_id AND s.platform IN ('youtube','instagram','tiktok')) AS paylasim
    FROM videolar v JOIN haberler h ON h.id = v.haber_id WHERE v.dosya = 1 AND v.zaman >= ? ORDER BY v.zaman DESC LIMIT 30`)
    .bind(iso(Date.now() - a.saklaSaat * SAAT)).all()).results;
  const kart = (v) => { const foto = v.tur === 'foto'; const yol = `/video/${v.haber_id}.${foto ? 'jpg' : 'mp4'}`; return `<article><h2>${kacis(v.baslik)}</h2>
${foto ? `<img src="${yol}" alt="" loading="lazy">` : `<video controls preload="metadata" playsinline src="${yol}"></video>`}
<p class="m">${kacis(new Date(v.zaman).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }))}${v.paylasim ? ` · ${kacis(v.paylasim.replace(/:paylasildi/g, ' ✓').replace(/:hata/g, ' ✗'))}` : ''}</p>
<a class="b" href="${yol}" download="gundem-${v.haber_id}.${foto ? 'jpg' : 'mp4'}">${foto ? 'Görseli' : 'Videoyu'} indir</a>
<textarea readonly rows="7">${kacis(videoAciklamasi(v))}</textarea>
<button type="button" onclick="navigator.clipboard.writeText(this.previousElementSibling.value);this.textContent='Kopyalandı'">Açıklamayı kopyala</button></article>`; };
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Videolar · ${kacis(env.SITE_ADI || 'Gündem Özeti')}</title><style>
body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#0b1220;color:#e5e7eb}main{max-width:560px;margin:0 auto;padding:16px}
h1{font-size:22px}article{background:#162036;border-radius:12px;padding:16px;margin:0 0 20px}h2{font-size:17px;margin:0 0 10px}
img{width:100%;border-radius:8px;display:block}video{width:100%;aspect-ratio:9/16;max-height:70vh;background:#000;border-radius:8px}.m{color:#9ca3af;font-size:13px;margin:6px 0 10px}
textarea{width:100%;box-sizing:border-box;margin:10px 0 6px;background:#0b1220;color:#e5e7eb;border:1px solid #334155;border-radius:8px;padding:8px;font-size:14px;line-height:1.4;font-family:inherit}
a.b,button{display:inline-block;background:#d92a2a;color:#fff;border:0;border-radius:8px;padding:10px 14px;font:600 15px system-ui;text-decoration:none;cursor:pointer}
</style></head><body><main><h1>Son videolar ve görseller</h1><p class="m">Dosyalar ${a.saklaSaat} saat saklanır. Hesaplar bağlı değilken buradan indirip elle paylaşabilirsin.</p>
${l.length ? l.map(kart).join('\n') : '<p>Henüz video yok. Video işi günde 4 kez (08:20, 12:20, 16:20, 20:20), görsel işi 2 kez (10:50, 18:50) çalışır.</p>'}</main></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
