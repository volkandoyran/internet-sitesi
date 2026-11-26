// Elle eklenen bağlantıların fiyat çekicisi. GitHub Actions'ta çalışır.
// Katalog motoru (katalog.mjs) site haritası olan her mağazanın bağlantılarını zaten günceller; bu betik yalnızca
// site haritası / site adresi tanımlı olmayan mağazalara elle eklenmiş ürün bağlantılarını kontrol eder.
// Gerekli ortam değişkenleri: SITE_URL, ADMIN_PASSWORD
import { extractPrice, htmlOldPrice } from './extract.mjs';
import { adapterFor } from './stores.mjs';
import { Getirici, EngelHatasi } from './motor/http.mjs';

const SITE = (process.env.SITE_URL || '').replace(/\/$/, '');
const PW = process.env.ADMIN_PASSWORD;
if (!SITE || !PW) { console.error('SITE_URL ve ADMIN_PASSWORD gerekli.'); process.exit(1); }
const auth = { authorization: 'Bearer ' + PW };
const net = new Getirici({ delayMs: 2500 });

async function rates() {
  // Avrupa Merkez Bankası kurları (ücretsiz, anahtar gerektirmez)
  for (const u of ['https://api.frankfurter.dev/v1/latest?base=EUR&symbols=TRY', 'https://api.frankfurter.app/latest?from=EUR&to=TRY']) {
    try {
      const j = await (await fetch(u, { signal: AbortSignal.timeout(15000) })).json();
      if (j.rates && j.rates.TRY > 0) return { TRY: j.rates.TRY };
    } catch (e) { console.warn('Kur alınamadı:', u, e.message); }
  }
  return {};
}

const retailers = await (await fetch(`${SITE}/api/admin/retailers`, { headers: auth })).json();
const covered = new Set((Array.isArray(retailers) ? retailers : []).filter((r) => {
  let config = null;
  try { config = r.config ? JSON.parse(r.config) : null; } catch {}
  return adapterFor({ ...r, config }).hasSource;
}).map((r) => r.id));
const allOffers = await (await fetch(`${SITE}/api/admin/offers`, { headers: auth })).json();
if (!Array.isArray(allOffers)) { console.error('Teklif listesi alınamadı:', allOffers); process.exit(1); }
const offers = allOffers.filter((o) => !covered.has(o.retailer_id));
console.log(`${offers.length} elle eklenmiş bağlantı kontrol edilecek`);
if (!offers.length) process.exit(0);

// Aynı siteye art arda yüklenmemek için satıcı başına sırayla, satıcılar arası paralel; engelde o satıcı bırakılır
const byRetailer = {};
for (const o of offers) (byRetailer[o.retailer_id] ||= []).push(o);
const results = [];
await Promise.all(Object.values(byRetailer).map(async (list) => {
  for (const o of list) {
    try {
      const html = await net.page(o.url);
      const found = extractPrice(html, o.currency);
      if (!found) throw new Error('Sayfada fiyat bulunamadı');
      results.push({ id: o.id, price: found.price, currency: found.currency || o.currency, in_stock: found.in_stock, old_price: found.old_price || htmlOldPrice(html, found.price) });
      console.log(`✓ ${o.retailer_id} ${found.price} ${found.currency || o.currency}`);
    } catch (e) {
      results.push({ id: o.id, error: e.message });
      console.log(`✗ ${o.retailer_id} ${o.url}: ${e.message}`);
      if (e instanceof EngelHatasi) { for (const x of list.slice(list.indexOf(o) + 1)) results.push({ id: x.id, error: 'Atlandı: mağaza engelledi' }); break; }
    }
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
