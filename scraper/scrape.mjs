// Günlük fiyat çekici. GitHub Actions'ta çalışır.
// 1) Siteden takip edilen ürün bağlantılarını alır, 2) her sayfadan fiyatı okur,
// 3) TRY kurunu alır, 4) sonuçları siteye geri yazar.
// Gerekli ortam değişkenleri: SITE_URL (ör. https://ucfiyat.pages.dev), ADMIN_PASSWORD
import { extractPrice } from './extract.mjs';

const SITE = (process.env.SITE_URL || '').replace(/\/$/, '');
const PW = process.env.ADMIN_PASSWORD;
if (!SITE || !PW) { console.error('SITE_URL ve ADMIN_PASSWORD gerekli.'); process.exit(1); }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const auth = { authorization: 'Bearer ' + PW };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rates() {
  // Avrupa Merkez Bankası kurları (ücretsiz, anahtar gerektirmez)
  for (const u of ['https://api.frankfurter.dev/v1/latest?base=EUR&symbols=TRY', 'https://api.frankfurter.app/latest?from=EUR&to=TRY']) {
    try {
      const j = await (await fetch(u, { signal: AbortSignal.timeout(15000) })).json();
      if (j.rates && j.rates.TRY > 0) return { TRY: j.rates.TRY };
    } catch (e) {
      console.warn('Kur alınamadı:', u, e.message);
    }
  }
  return {};
}

async function fetchPage(url) {
  const r = await fetch(url, {
    headers: { 'user-agent': UA, 'accept-language': 'tr,el;q=0.8,bg;q=0.7,en;q=0.5', accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}${r.status === 403 || r.status === 429 ? ' (bot koruması engelledi)' : ''}`);
  return r.text();
}

const offers = await (await fetch(`${SITE}/api/admin/offers`, { headers: auth })).json();
if (!Array.isArray(offers)) { console.error('Teklif listesi alınamadı:', offers); process.exit(1); }
console.log(`${offers.length} bağlantı kontrol edilecek`);

// Aynı siteye art arda yüklenmemek için satıcı başına sırayla, satıcılar arası paralel
const byRetailer = {};
for (const o of offers) (byRetailer[o.retailer_id] ||= []).push(o);
const results = [];
await Promise.all(Object.values(byRetailer).map(async (list) => {
  for (const o of list) {
    try {
      const html = await fetchPage(o.url);
      const found = extractPrice(html, o.currency);
      if (!found) throw new Error('Sayfada fiyat bulunamadı');
      results.push({ id: o.id, price: found.price, currency: found.currency || o.currency, in_stock: found.in_stock });
      console.log(`✓ ${o.retailer_id} ${found.price} ${found.currency || o.currency}`);
    } catch (e) {
      results.push({ id: o.id, error: e.message });
      console.log(`✗ ${o.retailer_id} ${o.url}: ${e.message}`);
    }
    await sleep(2500 + Math.random() * 2000);
  }
}));

const res = await fetch(`${SITE}/api/admin/prices`, {
  method: 'POST',
  headers: { ...auth, 'content-type': 'application/json' },
  body: JSON.stringify({ rates: await rates(), results }),
});
console.log('Sonuç:', res.status, await res.text());
const failed = results.filter((r) => r.error).length;
console.log(`${results.length - failed} başarılı, ${failed} hatalı`);
