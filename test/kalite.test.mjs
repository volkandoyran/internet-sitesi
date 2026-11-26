// Volkan'ın gönderdiği örnek test senaryolarının mevcut koda uyarlanmış hali:
// barkod sağlama basamağı, varyant çelişkisi, TR fiyat ayrıştırma, uç fiyatlar, üstel geri çekilme, admin süzgeci.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNumber, validGtin, extractProduct } from '../scraper/extract.mjs';
import { compatible } from '../lib/catalog.js';
import { backoff } from '../scraper/motor/http.mjs';
import { judgePrice, adminWhere, ADMIN_PAGE } from '../src/api.js';

test('GTIN/EAN: sağlama basamağı doğrulanır, tire/boşluk atılır, hatalı ve tekrarlı değer reddedilir', () => {
  // Not: örnek testteki 8690000000017 aslında geçersiz (doğru sağlama basamağı 2)
  assert.equal(validGtin('869-00000-0001-2'), '8690000000012');
  assert.equal(validGtin('8690000000017'), null);
  assert.equal(validGtin('12345'), null);
  assert.equal(validGtin('0000000000000'), null);
  assert.equal(validGtin('4006381333931'), '4006381333931');
  assert.equal(validGtin('96385074'), '96385074'); // EAN-8
});

test('TR/uluslararası fiyat ayrıştırma: binlik/ondalık, para simgesi, eksi ve sıfır', () => {
  assert.equal(parseNumber('12.999,90 TL'), 12999.9);
  assert.equal(parseNumber('1.250 TL'), 1250);
  assert.equal(parseNumber('₺1.299,00'), 1299);
  assert.equal(parseNumber('1 299,90 лв.'), 1299.9);
  assert.equal(parseNumber('$1,299.99'), 1299.99);
  assert.equal(parseNumber('0 TL'), null);
  assert.equal(parseNumber('-500 TL'), null);
  assert.equal(parseNumber('TL -1.250'), null);
  assert.equal(parseNumber(-3), null);
  assert.equal(parseNumber(NaN), null);
  assert.equal(parseNumber(''), null);
});

test('bozuk JSON-LD bloğu taramayı düşürmez; @graph içindeki ürün ve stok okunur', () => {
  const html = `<html><head><script type="application/ld+json">{bozuk json</script>
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":"Product","name":"Test SSD 1TB","mpn":"ABC-123456","gtin13":"4006381333931",
    "offers":{"@type":"Offer","price":"2.499,90","priceCurrency":"TRY","availability":"https://schema.org/OutOfStock"}}]}</script></head><body></body></html>`;
  const p = extractProduct(html, 'TRY');
  assert.equal(p.name, 'Test SSD 1TB');
  assert.equal(p.price, 2499.9);
  assert.equal(p.currency, 'TRY');
  assert.equal(p.in_stock, false);
  assert.equal(p.gtin, '4006381333931');
  assert.equal(p.mpn, 'ABC-123456');
});

test('varyant koruması: depolama, RAM ve ekran boyutu çelişen ürünler eşleşmez; aynı barkod eşleşir', () => {
  assert.equal(compatible({ storage_gb: 256 }, { storage_gb: 512 }), false);
  assert.equal(compatible({ ram_gb: 16 }, { ram_gb: 32 }), false);
  assert.equal(compatible({ screen_in: 14 }, { screen_in: 16 }), false);
  assert.equal(compatible({ screen_in: 27 }, { screen_in: 24 }), false);
  assert.equal(compatible({ screen_in: 15.6 }, { screen_in: 15.6 }), true);
  assert.equal(compatible({ screen_in: 6.7, storage_gb: 256 }, { storage_gb: 256 }), true); // biri bilinmiyorsa engel değil
  assert.equal(compatible({ gtin: '4006381333931', storage_gb: 256 }, { gtin: '4006381333931', storage_gb: 512 }), true);
  assert.equal(compatible({ id: 2, split_from: 1, gtin: '4006381333931' }, { id: 1, gtin: '4006381333931' }), false); // elle ayrılmış
  assert.equal(compatible({ price_eur: 300 }, { price_eur: 1200, max_eur: 1300 }), false); // fiyat düzeyi çok farklı
});

test('şüpheli fiyat: büyük sıçrama bekletilir, ikinci kez aynı gelirse kabul edilir', () => {
  const prev = { price: 1000, price_eur: 1000, verified: 1 };
  assert.equal(judgePrice(prev, 1100, 1100).action, 'accept');
  assert.equal(judgePrice(prev, 3000, 3000).action, 'hold');
  assert.equal(judgePrice({ ...prev, pending_price: 3000 }, 3000, 3000).action, 'confirm');
  assert.equal(judgePrice(null, 5, 5).action, 'accept');
});

test('üstel geri çekilme: 2 → 4 → 8 sn, üst sınır 60 sn, rastgele sapma en çok 1 sn', () => {
  assert.equal(backoff(1, 2000, 0), 2000);
  assert.equal(backoff(2, 2000, 0), 4000);
  assert.equal(backoff(3, 2000, 0), 8000);
  assert.equal(backoff(10, 2000, 0), 60000);
  assert.equal(backoff(1, 2000, 0.999), 2999);
});

test('admin süzgeci: SQL parametreli, LIKE jokerleri kaçırılır, ürün no tam eşleşir', () => {
  const sp = (o) => new URLSearchParams(o);
  assert.deepEqual(adminWhere(sp({})), { sql: '', binds: [] });
  const a = adminWhere(sp({ q: "50%_' OR 1=1" }));
  assert.ok(!a.sql.includes("1=1"));
  assert.ok(a.binds.every((b) => typeof b === 'string'));
  assert.ok(a.binds.includes('%50\\%\\_\'%'));
  assert.deepEqual(adminWhere(sp({ q: '#42' })), { sql: 'WHERE p.id = ?', binds: [42] });
  assert.match(adminWhere(sp({ f: 'inceleme' })).sql, /pending_price/);
  assert.equal(adminWhere(sp({ f: 'bilinmeyen' })).sql, '');
  assert.equal(ADMIN_PAGE, 50);
});

test('ülkeler arası eşleştirme: elle ayrılan ürün aynı ada sahip olsa da yeniden birleştirilmez', async () => {
  const { planMatches } = await import('../scraper/eslestir.mjs');
  const base = { name: 'Apple iPhone 17 Pro 256GB', type: 'phone', storage_gb: 256, n: 1 };
  assert.equal(planMatches([{ ...base, id: 1 }, { ...base, id: 2 }]).merges.length, 1);
  assert.equal(planMatches([{ ...base, id: 1 }, { ...base, id: 2, split_from: 1 }]).merges.length, 0);
});
