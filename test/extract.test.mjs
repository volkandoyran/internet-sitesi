import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPrice, parseNumber } from '../scraper/extract.mjs';
import { cpuScore, gpuScore, parseQuery } from '../lib/specs.js';

test('sayı biçimleri', () => {
  assert.equal(parseNumber('42.999,00 TL'), 42999);
  assert.equal(parseNumber('1,299.99'), 1299.99);
  assert.equal(parseNumber('12.999'), 12999);
  assert.equal(parseNumber('899,90 €'), 899.9);
  assert.equal(parseNumber('1299.99'), 1299.99);
  assert.equal(parseNumber(749), 749);
});

test('JSON-LD fiyatı', () => {
  const html = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Product","name":"X","offers":{"@type":"Offer","price":"1049.00","priceCurrency":"EUR","availability":"https://schema.org/OutOfStock"}}]}</script>`;
  assert.deepEqual(extractPrice(html, 'EUR'), { price: 1049, currency: 'EUR', in_stock: false });
});

test('meta etiketi fiyatı', () => {
  const html = `<meta property="product:price:amount" content="45.999,00"><meta property="product:price:currency" content="TRY">`;
  assert.deepEqual(extractPrice(html, 'TRY'), { price: 45999, currency: 'TRY', in_stock: true });
});

test('fiyat yoksa null', () => assert.equal(extractPrice('<html></html>', 'EUR'), null));

test('özellik puanları', () => {
  assert.ok(cpuScore('Intel Core i7-13700H') > cpuScore('Intel Core i5-1335U'));
  assert.ok(cpuScore('AMD Ryzen 7 7840HS') > cpuScore('AMD Ryzen 5 7530U'));
  assert.ok(gpuScore('RTX 4070') > gpuScore('RTX 4060'));
  assert.equal(cpuScore('Samsung 990 M2 SSD'), null);
  const q = parseQuery('i7 16gb 1tb rtx 4060 laptop');
  assert.equal(q.ram_gb, 16); assert.equal(q.storage_gb, 1024); assert.equal(q.type, 'laptop');
  assert.ok(q.gpu_score >= 55 && q.cpu_score >= 70);
});

test('arama metni ve eşikler', () => {
  const q = parseQuery('i7 16gb rtx 4060');
  assert.equal(q.ram_gb, 16);
  assert.equal(q.gpu_score, 58);
  assert.equal(q.cpu_score, 72);
  assert.ok(cpuScore('Intel Core i5-1335U') >= 50 && cpuScore('Intel Core i5-1335U') < 70);
  assert.ok(cpuScore('AMD Ryzen 7 5800H') >= 70);
  assert.ok(cpuScore('Intel Core i9-14900HX') >= 85);
  assert.equal(gpuScore('NVIDIA GeForce RTX 4060 Laptop'), 58);
  assert.ok(gpuScore('RTX 4070') >= 66);
});
