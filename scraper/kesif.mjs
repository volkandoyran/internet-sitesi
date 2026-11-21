// Keşif: mağazaların site haritası ve kategori yapısını GitHub sunucularından inceler.
// Çıktı: kesif/<magaza>.txt (Actions artifact olarak yüklenir)
import { mkdirSync, writeFileSync } from 'node:fs';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const STORES = {
  pckolik: ['https://pckolik.com.tr', 'https://pckolik.com.tr/urun/amd-ryzen-7-7800x3d-tray-4-2-ghz-8-cekirdek-96mb-am5-5nm-islemci--100-100000910'],
  'eshop-gr': ['https://www.e-shop.gr', 'https://www.e-shop.gr/cpu-amd-ryzen-7-7800x3d-420ghz-8-core-boxed-p-PER.208331'],
  cosmodata: ['https://www.cosmodata.gr', 'https://www.cosmodata.gr/product/397719/hardware-anavathmisi/vasiko-pc-hardware/epexergastes-cpu/epexergastis-amd-ryzen-7-7800x3d-4-2ghz-8-cores-am5-96mb'],
  'mediamarkt-gr': ['https://www.mediamarkt.gr', 'https://www.mediamarkt.gr/category/laptop-tablet-computing/desktop-all-in-one/gaming-desktop'],
  jarcomputers: ['https://www.jarcomputers.com', 'https://www.jarcomputers.com/amd-ryzen-7-7800x3d-100-100000910wof-prod-cpup100100000910wof.html'],
  technomarket: ['https://www.technomarket.bg', 'https://www.technomarket.bg/laptopi/macbook-air-13-6-m4-starlight-mw0y3ze-a-09227987'],
  'laptop-bg': ['https://laptop.bg', 'https://laptop.bg/laptops'],
};
async function get(url) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'tr,el;q=0.8,bg;q=0.7,en;q=0.5' }, redirect: 'follow', signal: AbortSignal.timeout(25000) });
    return { status: r.status, url: r.url, text: await r.text() };
  } catch (e) { return { status: 0, text: '', err: e.message }; }
}
const uniq = (a) => [...new Set(a)];
const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
mkdirSync('kesif', { recursive: true });
for (const [id, [home, sample]] of Object.entries(STORES)) try {
  const out = [];
  const log = (...a) => out.push(a.join(' '));
  const robots = await get(home + '/robots.txt');
  log('# robots', robots.status);
  const maps = uniq([...robots.text.matchAll(/^sitemap:\s*(\S+)/gim)].map((m) => m[1]));
  if (!maps.length) maps.push(home + '/sitemap.xml');
  for (const m of maps.slice(0, 4)) {
    const s = await get(m);
    const locs = [...s.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((x) => x[1]);
    log('# sitemap', m, s.status, 'loc sayısı', locs.length);
    locs.slice(0, 40).forEach((l) => log('  ', l));
    const sub = locs.find((l) => /product|urun|prod|item|p-/i.test(l) && /\.xml/i.test(l));
    if (sub) {
      const ss = await get(sub);
      const sl = [...ss.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((x) => x[1]);
      log('## alt harita', sub, ss.status, sl.length); sl.slice(0, 15).forEach((l) => log('    ', l));
    }
  }
  const h = await get(home);
  log('# ana sayfa', h.status, h.url, 'uzunluk', h.text.length);
  const links = uniq([...h.text.matchAll(/href=["']([^"'#]+)["']/g)].map((x) => x[1]));
  links.filter((l) => /laptop|notebook|lapto|bilgisayar|komp|kompyut|компют|лаптоп|ypologist|pc|cpu|islemci|ekran|ssd|gpu|hardware|ram|anakart|epeksergast|karta|процесор|видео|monit/i.test(dec(l)))
    .slice(0, 120).forEach((l) => log('  link', l));
  const p = await get(sample);
  log('# örnek', sample, p.status, 'uzunluk', p.text.length);
  for (const [, j] of p.text.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) log('  ld+json', j.trim().replace(/\s+/g, ' ').slice(0, 1500));
  for (const m of p.text.matchAll(/<meta[^>]+(?:product:|og:price|itemprop=["'](?:price|sku|mpn|gtin))[^>]*>/gi)) log('  meta', m[0].slice(0, 200));
  const hrefs = uniq([...p.text.matchAll(/href=["']([^"'#]+)["']/g)].map((x) => x[1]));
  log('  örnek sayfadaki bağlantı sayısı', hrefs.length); hrefs.slice(0, 80).forEach((l) => log('    a', l));
  writeFileSync(`kesif/${id}.txt`, out.join('\n'));
  console.log(id, robots.status, h.status, p.status);
} catch (e) { console.log(id, 'HATA', e.message); }
