// İkinci aşama: barkod, varyant koruması, şüpheli fiyat, güvenilirlik, kontrol sıklığı, bot kimliği
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractProduct, validGtin } from '../scraper/extract.mjs';
import { compatible, modelKeys } from '../lib/catalog.js';
import { planMatches } from '../scraper/eslestir.mjs';
import { judgePrice, confidenceOf, nextCheck } from '../src/api.js';
import { parseRobots, robotsAllows, UA } from '../scraper/motor/http.mjs';

test('barkod (GTIN) doğrulama ve okuma', () => {
  assert.equal(validGtin('4006381333931'), '4006381333931');
  assert.equal(validGtin('4006381333932'), null);           // kontrol hanesi yanlış
  assert.equal(validGtin('036000291452'), '0036000291452');  // UPC-A, 13 haneye
  assert.equal(validGtin('0000000000000'), null);
  assert.equal(validGtin('12345'), null);
  assert.equal(validGtin(null), null);
  const html = '<script type="application/ld+json">{"@type":"Product","name":"Samsung 990 PRO 1TB","sku":"MZ-V9P1T0BW","gtin13":"8806094215038","offers":{"price":"120","priceCurrency":"EUR"}}</script>';
  const p = extractProduct(html, 'EUR');
  assert.equal(p.gtin, '8806094215038');
  assert.equal(p.sku, 'MZ-V9P1T0BW');
  assert.equal(p.source, 'jsonld');
  assert.ok(modelKeys({ ...p, type: 'part', category: 'ssd' }).includes('GTIN:8806094215038'));
});

test('varyant koruması: farklı depolama/RAM ya da çok farklı fiyat uyuşmaz', () => {
  assert.equal(compatible({ storage_gb: 256, price_eur: 900 }, { storage_gb: 512, price_eur: 1000 }), false);
  assert.equal(compatible({ ram_gb: 8 }, { ram_gb: 16 }), false);
  assert.equal(compatible({ storage_gb: 1000 }, { storage_gb: 1024 }), true);
  assert.equal(compatible({ price_eur: 100 }, { price_eur: 500 }), false);
  assert.equal(compatible({ price_eur: 100, storage_gb: 256 }, { price_eur: 120 }), true);
  // Aynı barkod: depolama okuması farklı olsa da aynı ürün
  assert.equal(compatible({ gtin: '8806094215038', storage_gb: 1000 }, { gtin: '8806094215038', storage_gb: 2000 }), true);
  // Ortak anahtar olsa da 256 GB ve 512 GB telefonlar birleşmez
  const plan = planMatches([
    { id: 1, type: 'phone', name: 'Apple iPhone 17 Pro 256GB', storage_gb: 256, mkeys: ' X:1 ' },
    { id: 2, type: 'phone', name: 'Apple iPhone 17 Pro 512GB', storage_gb: 512, mkeys: ' X:1 ' },
    { id: 3, type: 'phone', name: 'KINHTO IPHONE 17 PRO 256GB', storage_gb: 256, mkeys: ' X:1 ' },
  ]);
  const pairs = plan.merges.map((m) => [m.keep, m.drop].sort().join('-'));
  assert.ok(!pairs.some((p) => p.includes('2')), JSON.stringify(plan.merges));
  assert.equal(plan.merges.length, 1);
});

test('şüpheli fiyat: büyük sıçrama bekletilir, tekrar görülürse kabul edilir', () => {
  const prev = { price: 1000, price_eur: 1000, verified: 1 };
  assert.equal(judgePrice(null, 50, 50).action, 'accept');
  assert.equal(judgePrice(prev, 900, 900).action, 'accept');
  assert.equal(judgePrice(prev, 100, 100).action, 'hold');      // %90 düşüş
  assert.equal(judgePrice(prev, 3000, 3000).action, 'hold');    // 3 kat
  assert.equal(judgePrice({ ...prev, pending_price: 100 }, 101, 101).action, 'confirm');
  assert.equal(judgePrice({ ...prev, pending_price: 100 }, 150, 150).action, 'hold');
  // Doğrulanmamış (ilk eklemede aykırı) fiyat aynı kalırsa doğrulanır
  assert.equal(judgePrice({ price: 100, price_eur: 100, verified: 0 }, 100, 100).verified, 1);
  assert.equal(judgePrice({ price: 100, price_eur: 100, verified: 0 }, 300, 300).verified, 0);
});

test('güvenilirlik puanı ve sonraki kontrol zamanı', () => {
  assert.equal(confidenceOf('jsonld'), 90);
  assert.ok(confidenceOf('jsonld+render') < 90);
  assert.ok(confidenceOf('html') < confidenceOf('meta'));
  assert.ok(confidenceOf('jsonld', false) <= 30);
  assert.ok(confidenceOf('jsonld', true, true) < 90);
  const t0 = '2026-11-26T00:00:00.000Z';
  const h = (iso) => (Date.parse(iso) - Date.parse(t0)) / 3600e3;
  assert.equal(h(nextCheck(t0, 6, true, 0)), 5.75);           // değişti: mağaza sıklığı
  assert.ok(h(nextCheck(t0, 6, false, 9)) > 20);              // uzun süre değişmedi: seyrek
  assert.ok(h(nextCheck(t0, 6, false, 100)) <= 24);           // en çok 4 katı
  assert.equal(h(nextCheck(t0, 6, true, 0, true)), 0.5);      // şüpheli: bir sonraki turda
});

test('dürüst bot kimliği ve ona özel robots.txt kuralı', () => {
  assert.match(UA, /^UcfiyatBot\/1\.0 \(\+https:\/\//);
  assert.ok(!/Mozilla|Chrome|Safari/.test(UA));
  assert.ok(/^[\x20-\x7e]+$/.test(UA)); // HTTP başlığında yalnızca ASCII
  const r = parseRobots('User-agent: *\nDisallow: /sepet\n\nUser-agent: UcfiyatBot\nDisallow: /\n');
  assert.equal(robotsAllows(r, 'https://x/urun/1'), false);
  assert.equal(robotsAllows(parseRobots('User-agent: *\nDisallow: /sepet\n'), 'https://x/urun/1'), true);
});
