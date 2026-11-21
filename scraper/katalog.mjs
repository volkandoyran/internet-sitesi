// Otomatik katalog tarayıcısı. GitHub Actions'ta çalışır.
// 1) Her mağazanın site haritasından bilgisayar ürünü olabilecek bağlantıları bulur,
// 2) yeni bağlantıları ve fiyatı eskiyen bilinen bağlantıları açar,
// 3) addan tür/kategori/özellik ve eşleştirme anahtarı çıkarır, 4) sonuçları siteye gönderir.
// Ortam: SITE_URL, ADMIN_PASSWORD; isteğe bağlı YENI_LIMIT, YENILE_LIMIT, MAGAZA (tek mağaza)
import { gunzipSync } from 'node:zlib';
import { extractProduct } from './extract.mjs';
import { STORES } from './stores.mjs';
import { classify, isExcluded, specsFromName, matchKey } from '../lib/catalog.js';

const SITE = (process.env.SITE_URL || '').replace(/\/$/, '');
const PW = process.env.ADMIN_PASSWORD;
if (!SITE || !PW) { console.error('SITE_URL ve ADMIN_PASSWORD gerekli.'); process.exit(1); }
const NEW_LIMIT = +process.env.YENI_LIMIT || 400;      // mağaza başına, çalıştırma başına yeni ürün sayfası
const REFRESH_LIMIT = +process.env.YENILE_LIMIT || 800; // mağaza başına fiyatı yenilenecek bilinen sayfa
const DELAY = 700;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const auth = { authorization: 'Bearer ' + PW };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, timeout = 30000) {
  const r = await fetch(url, {
    headers: { 'user-agent': UA, 'accept-language': 'tr,el;q=0.8,bg;q=0.7,en;q=0.5', accept: 'text/html,application/xhtml+xml,application/xml' },
    redirect: 'follow', signal: AbortSignal.timeout(timeout),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}${r.status === 403 || r.status === 429 ? ' (bot koruması)' : ''}`);
  let buf = Buffer.from(await r.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
  // Karakter kodlaması: başlıktan ya da <meta charset> etiketinden (e-shop.gr ISO-8859-7 kullanıyor)
  const head = buf.subarray(0, 3000).toString('latin1');
  const cs = ((r.headers.get('content-type') || '').match(/charset=([\w-]+)/i) || head.match(/charset=["']?([\w-]+)/i) || [])[1] || 'utf-8';
  try { return new TextDecoder(cs.toLowerCase()).decode(buf); } catch { return buf.toString('utf8'); }
}

const locs = (xml) => [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\s\]]+)/g)].map((m) => m[1].replace(/&amp;/g, '&'));

async function sitemapUrls(cfg) {
  let maps = cfg.sitemaps || [];
  if (cfg.sitemapsFromRobots) {
    const robots = await fetchText(cfg.sitemapsFromRobots);
    maps = [...robots.matchAll(/^sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  }
  const urls = new Set();
  for (const m of maps) {
    try {
      const list = locs(await fetchText(m, 90000));
      // Site haritası dizini ise alt haritaları da aç
      if (list.length && list.every((u) => /\.xml(\.gz)?($|\?)/i.test(u))) {
        for (const sub of list) for (const u of locs(await fetchText(sub, 90000))) urls.add(u);
      } else list.forEach((u) => urls.add(u));
    } catch (e) {
      console.warn('  site haritası okunamadı:', m, e.message);
    }
  }
  return [...urls];
}

async function rates() {
  for (const u of ['https://api.frankfurter.dev/v1/latest?base=EUR&symbols=TRY', 'https://api.frankfurter.app/latest?from=EUR&to=TRY']) {
    try {
      const j = await (await fetch(u, { signal: AbortSignal.timeout(15000) })).json();
      if (j.rates && j.rates.TRY > 0) return { TRY: j.rates.TRY };
    } catch (e) { console.warn('Kur alınamadı:', u, e.message); }
  }
  return {};
}

async function post(items, rateMap, stat) {
  if (DRY) { for (const it of items) console.log('  [kuru]', JSON.stringify(it).slice(0, 400)); return; }
  for (let i = 0; i < items.length; i += 10) {
    const res = await fetch(`${SITE}/api/admin/catalog`, {
      method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ rates: rateMap, items: items.slice(i, i + 10) }),
    });
    const txt = await res.text();
    if (!res.ok) { console.error('  gönderilemedi:', res.status, txt.slice(0, 300)); continue; }
    try { const r = JSON.parse(txt); for (const k of ['added', 'linked', 'updated', 'removed']) stat.site[k] = (stat.site[k] || 0) + (r[k] || 0); } catch {}

  }
}

// Sitede zaten olan bağlantılar (fiyatı en eski olan önce)
// KURU=1: siteye hiçbir şey göndermeden dener, örnek sonuçları yazar
const DRY = process.env.KURU === '1';
let known = []; // [{retailer_id, url, updated_at}]
if (!DRY) {
  const knownRes = await fetch(`${SITE}/api/admin/catalog`, { headers: auth });
  if (!knownRes.ok) { console.error('Bilinen bağlantılar alınamadı:', knownRes.status, await knownRes.text()); process.exit(1); }
  known = await knownRes.json();
}
const rateMap = await rates();
console.log('Kur:', rateMap);

const only = process.env.MAGAZA;
const summary = [];
await Promise.all(Object.entries(STORES).filter(([id]) => !only || id === only).map(async ([id, cfg]) => {
  const stat = { id, harita: 0, aday: 0, yeni: 0, yenilenen: 0, eklendi: 0, atlandi: 0, hata: 0, hatalar: {}, site: {} };
  summary.push(stat);
  try {
    const all = await sitemapUrls(cfg);
    stat.harita = all.length;
    const candidates = all.filter((u) => { try { return cfg.accept(u); } catch { return false; } });
    if (cfg.order) candidates.sort(cfg.order);
    stat.aday = candidates.length;
    const mine = known.filter((k) => k.retailer_id === id);
    const knownSet = new Set(mine.map((k) => k.url));
    const fresh = candidates.filter((u) => !knownSet.has(u)).slice(0, NEW_LIMIT);
    const stale = mine.sort((a, b) => String(a.updated_at || '').localeCompare(String(b.updated_at || ''))).slice(0, REFRESH_LIMIT).map((k) => k.url);
    stat.yeni = fresh.length; stat.yenilenen = stale.length;
    console.log(`${id}: haritada ${all.length}, aday ${candidates.length}, yeni ${fresh.length}, yenilenecek ${stale.length}`);
    const items = [];
    for (const url of [...fresh, ...stale]) {
      try {
        const html = await fetchText(url);
        const p = extractProduct(html);
        if (!p) { if (DRY) console.log('  [bilgi yok]', url, html.length, (html.match(/<title>([^<]{0,100})/) || [])[1]); throw new Error('ürün bilgisi bulunamadı'); }
        const kind = classify(p.name) || (cfg.kind && !isExcluded(p.name) && cfg.kind(url)) || null;
        if (!kind) { stat.atlandi++; if (DRY) console.log('  [atlandı]', p.name); items.push({ retailer_id: id, url, gone: true }); continue; }
        items.push({
          retailer_id: id, url, name: p.name, brand: p.brand, image: p.image,
          ...kind, ...specsFromName(p.name, kind),
          match_key: matchKey(p), price: p.price, currency: p.currency, in_stock: p.in_stock,
        });
        stat.eklendi++;
      } catch (e) {
        stat.hata++;
        const k = e.message.slice(0, 60);
        stat.hatalar[k] = (stat.hatalar[k] || 0) + 1;
        items.push({ retailer_id: id, url, error: e.message.slice(0, 200) });
      }
      if (items.length >= 10) await post(items.splice(0), rateMap, stat);
      await sleep(DELAY + Math.random() * 500);
    }
    if (items.length) await post(items, rateMap, stat);
  } catch (e) {
    stat.hata++;
    stat.hatalar[e.message.slice(0, 60)] = 1;
    console.error(id, 'başarısız:', e.message);
  }
}));

console.log('\n=== Özet ===');
for (const s of summary) console.log(JSON.stringify(s));
