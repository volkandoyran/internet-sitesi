// Ülkeler ve mağazalar arası eşleştirme. Aynı ürün farklı mağazalarda ayrı ürün olarak açıldıysa
// (ör. Yunanistan'da "KINHTO IPHONE 17 PRO MAX 256GB", Bulgaristan'da "Смартфон Apple iPhone 17 Pro Max ... 256GB")
// ortak anahtarı olanlar tek üründe toplanır; böylece fiyatlar yan yana görünür.
// Anahtarlar burada (GitHub Actions'ta) hesaplanır; site yalnızca birleştirme sorgularını çalıştırır.
import { modelKeys } from '../lib/catalog.js';

// Aynı tür/kategoride ortak anahtarı olan ürünleri gruplar. Dönüş: { merges: [{keep, drop}], keys: [{id, mkeys}] }
export function planMatches(products) {
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const owner = new Map();
  const keysOf = new Map();
  for (const p of products) {
    parent.set(p.id, p.id);
    // Önceki birleştirmelerden gelen anahtarlar korunur (birleşen diğer adların anahtarları)
    const keys = [...new Set([...modelKeys(p), ...String(p.mkeys || '').split(' ').filter(Boolean)])];
    keysOf.set(p.id, keys);
    for (const k of keys) {
      const scope = `${p.type}|${p.type === 'part' ? p.category || '' : ''}|${k}`;
      if (owner.has(scope)) { const a = find(p.id), b = find(owner.get(scope)); if (a !== b) parent.set(a, b); }
      else owner.set(scope, p.id);
    }
  }
  const groups = new Map();
  for (const p of products) { const r = find(p.id); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(p); }
  const merges = [];
  const keys = [];
  for (const g of groups.values()) {
    // En çok teklifi olan (eşitse en eski) ürün kalır; diğerlerinin teklifleri ona taşınır
    g.sort((a, b) => (b.n || 0) - (a.n || 0) || a.id - b.id);
    const keep = g[0];
    if (g.length > 1) merges.push({ keep: keep.id, drop: g.slice(1).map((p) => p.id) });
    const all = [...new Set(g.flatMap((p) => keysOf.get(p.id)))].slice(0, 12);
    const mkeys = all.length ? ` ${all.join(' ')} ` : '';
    if ((keep.mkeys || '') !== mkeys) keys.push({ id: keep.id, mkeys });
  }
  return { merges, keys };
}

// Siteye küçük parçalar halinde gönder (ücretsiz planda istek başına ~50 sorgu sınırı)
export async function runMatching(SITE, auth, { dry = false } = {}) {
  const r = await fetch(`${SITE}/api/admin/match`, { headers: auth });
  if (!r.ok) { console.warn('Eşleştirme: ürün listesi alınamadı', r.status); return; }
  const products = await r.json();
  const { merges, keys } = planMatches(products);
  const dropped = merges.reduce((s, m) => s + m.drop.length, 0);
  console.log(`Eşleştirme: ${products.length} ürün, ${merges.length} grup birleşecek (${dropped} kopya ürün), ${keys.length} ürünün anahtarı güncellenecek`);
  if (dry) { for (const m of merges.slice(0, 30)) console.log('  [kuru]', m.keep, '<-', m.drop.join(',')); return; }
  const send = async (payload) => {
    const res = await fetch(`${SITE}/api/admin/match`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) console.warn('  eşleştirme gönderilemedi:', res.status, (await res.text()).slice(0, 200));
  };
  for (let i = 0; i < merges.length; i += 20) await send({ merges: merges.slice(i, i + 20) });
  for (let i = 0; i < keys.length; i += 33 * 40) await send({ keys: keys.slice(i, i + 33 * 40) });
}

// Tek başına: node scraper/eslestir.mjs (SITE_URL, ADMIN_PASSWORD; KURU=1 yalnızca gösterir)
if (import.meta.url === `file://${process.argv[1]}`) {
  const SITE = (process.env.SITE_URL || '').replace(/\/$/, '');
  if (!SITE || !process.env.ADMIN_PASSWORD) { console.error('SITE_URL ve ADMIN_PASSWORD gerekli.'); process.exit(1); }
  await runMatching(SITE, { authorization: 'Bearer ' + process.env.ADMIN_PASSWORD }, { dry: process.env.KURU === '1' });
}
