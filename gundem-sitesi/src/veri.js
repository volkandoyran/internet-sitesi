// D1'den okuma. Site hiçbir şey yazmaz; tablo henüz yoksa (bot ilk kez çalışmadıysa) boş liste döner.

export const SAYFA_BOYU = 30;

export function haberiCoz(r) {
  let kaynaklar = [];
  try { kaynaklar = JSON.parse(r.kaynaklar || '[]'); } catch { /* bozuk kayıt */ }
  return {
    id: r.id,
    baslik: r.baslik,
    metin: r.metin || '',
    kaynaklar: Array.isArray(kaynaklar) ? kaynaklar.filter((k) => k && /^https?:\/\//.test(k.url || '')) : [],
    kaynak_sayisi: r.kaynak_sayisi || 1,
    yabanci: Array.isArray(kaynaklar) && Boolean(kaynaklar[0]?.dil),
    zaman: r.ilk_gorulme,
  };
}

async function guvenli(sorgu) {
  try { return await sorgu(); } catch (e) {
    if (/no such table/i.test(String(e?.message))) return null;
    throw e;
  }
}

const ALANLAR = 'id, baslik, metin, kaynaklar, kaynak_sayisi, ilk_gorulme';

export async function haberler(env, { sayfa = 1, cok = false, ara = '' } = {}) {
  const kosul = ['metin IS NOT NULL'];
  const param = [];
  if (cok) kosul.push('kaynak_sayisi > 1');
  if (ara) { kosul.push('(baslik LIKE ? OR metin LIKE ?)'); param.push(`%${ara}%`, `%${ara}%`); }
  const sql = `SELECT ${ALANLAR} FROM haberler WHERE ${kosul.join(' AND ')}
    ORDER BY ilk_gorulme DESC LIMIT ? OFFSET ?`;
  const r = await guvenli(() => env.DB.prepare(sql).bind(...param, SAYFA_BOYU + 1, (sayfa - 1) * SAYFA_BOYU).all());
  const satir = r?.results || [];
  return { liste: satir.slice(0, SAYFA_BOYU).map(haberiCoz), sonraki: satir.length > SAYFA_BOYU };
}

// Son 24 saatte en çok kaynağın verdiği haberler
export async function oneCikanlar(env, adet = 5) {
  const r = await guvenli(() => env.DB.prepare(`SELECT ${ALANLAR} FROM haberler
    WHERE metin IS NOT NULL AND kaynak_sayisi > 1 AND ilk_gorulme > strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')
    ORDER BY kaynak_sayisi DESC, ilk_gorulme DESC LIMIT ?`).bind(adet).all());
  return (r?.results || []).map(haberiCoz);
}

export async function haber(env, id) {
  const r = await guvenli(() => env.DB.prepare(`SELECT ${ALANLAR} FROM haberler WHERE id = ? AND metin IS NOT NULL`).bind(id).first());
  return r ? haberiCoz(r) : null;
}

export async function sonHaberler(env, adet) {
  const r = await guvenli(() => env.DB.prepare(`SELECT ${ALANLAR} FROM haberler WHERE metin IS NOT NULL ORDER BY ilk_gorulme DESC LIMIT ?`).bind(adet).all());
  return (r?.results || []).map(haberiCoz);
}
