// Keşif 2: site haritası URL desenleri ve fiyat işaretlemesi
import { gunzipSync } from 'node:zlib';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
async function get(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60000) });
  const buf = Buffer.from(await r.arrayBuffer());
  const text = (url.endsWith('.gz') || buf[0] === 0x1f) ? gunzipSync(buf).toString() : buf.toString();
  return { status: r.status, text };
}
const locs = (t) => [...t.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((x) => x[1]);
const count = (arr, f) => { const m = {}; for (const a of arr) { const k = f(a); m[k] = (m[k] || 0) + 1; } return Object.entries(m).sort((a, b) => b[1] - a[1]); };
// Technomarket: ilk yol parçası sayıları
let tm = [];
for (let i = 0; i < 4; i++) tm = tm.concat(locs((await get(`https://www.technomarket.bg/sitemap/${i}.xml`)).text));
console.log('== technomarket toplam', tm.length);
for (const [k, n] of count(tm, (u) => new URL(u).pathname.split('/')[1]).slice(0, 150)) console.log('  ', n, k);
// JAR
for (let i = 1; i <= 4; i++) {
  const s = await get(`https://www.jarcomputers.com/export/google/sitemap-${i}.xml.gz`);
  const l = locs(s.text);
  console.log('== jar', i, s.status, l.length);
  l.filter((u, j) => j % Math.max(1, Math.floor(l.length / 25)) === 0).forEach((u) => console.log('   ', u));
  for (const [k, n] of count(l.filter((u) => u.includes('-prod-')), (u) => (u.match(/-prod-([a-z]+)/) || [])[1]?.slice(0, 4)).slice(0, 60)) console.log('   önek', n, k);
}
const jc = await get('https://www.jarcomputers.com/procesori-cat-15.html');
console.log('== jar kategori', jc.status, jc.text.length, [...new Set([...jc.text.matchAll(/href="([^"]*-prod-[^"]*)"/g)].map((x) => x[1]))].length, 'ürün bağlantısı');
console.log([...new Set([...jc.text.matchAll(/href="([^"]*(?:page|p=|\?)[^"]*)"/g)].map((x) => x[1]))].slice(0, 20).join('\n'));
// e-shop
const e1 = locs((await get('https://www.e-shop.gr/sitemap_products.phtml?page=1')).text);
console.log('== eshop sayfa1', e1.length); for (const [k, n] of count(e1, (u) => (u.match(/-p-([A-Z]+)\./) || [])[1])) console.log('   ', n, k);
const ep = (await get('https://www.e-shop.gr/cpu-amd-ryzen-7-7800x3d-420ghz-8-core-boxed-p-PER.208331')).text;
for (const m of ep.matchAll(/.{0,250}(?:itemprop=["']price|309[.,]9|web_price|final_price).{0,250}/gi)) console.log('  eshop fiyat:', m[0].replace(/\s+/g, ' '));
// cosmodata
const cp = (await get('https://www.cosmodata.gr/product/397719/hardware-anavathmisi/vasiko-pc-hardware/epexergastes-cpu/epexergastis-amd-ryzen-7-7800x3d-4-2ghz-8-cores-am5-96mb')).text;
for (const m of [...cp.matchAll(/.{0,200}(?:itemprop|price|€|τιμή).{0,200}/gi)].slice(0, 25)) console.log('  cosmo:', m[0].replace(/\s+/g, ' '));
const cc = await get('https://www.cosmodata.gr/category/388/epexergastes-cpu/');
console.log('== cosmo kategori', cc.status, [...new Set([...cc.text.matchAll(/href="([^"]*\/product\/[^"]*)"/g)].map((x) => x[1]))].length);
console.log([...new Set([...cc.text.matchAll(/href="([^"]*(?:page|pg=)[^"]*)"/g)].map((x) => x[1]))].slice(0, 10).join('\n'));
