// 26 Kasım 2026 denetiminde canlı veride bulunan hataların testleri
import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, modelKeys, specsFromName, isSpecKey } from '../lib/catalog.js';
import { planMatches } from '../scraper/eslestir.mjs';
import { wrongProduct } from '../src/api.js';
import { cheapestOf } from '../src/pages.js';

const keysOf = (name) => { const k = classify(name); return modelKeys({ name, ...k, ...specsFromName(name, k || {}) }); };
const same = (a, b) => keysOf(a).some((k) => keysOf(b).includes(k));

test('SSD hız değerleri model kodu sayılmaz (2 TB ve 4 TB birleşmiyordu)', () => {
  assert.ok(!same('KINGSTON 2 TB KC3000 PCIe 7000-7000MB/s 4.0 M.2 SSD', 'KINGSTON 4TB KC3000 PCIe 7000-7000MB/s 4.0 M.2 SSD'));
  assert.ok(!same('Памет SSD 256GB, KingSpec NX, NVMe, M.2 (2280), скорост на четене до 1600-3500MB/s, скорост на запис до 600-3200MB/s',
    'Памет SSD 512GB, KingSpec NX, NVMe, M.2 (2280), скорост на четене до 1600-3500MB/s, скорост на запис до 600-3200MB/s'));
  assert.ok(!same('TWINMOS 512GB M.2 PCIe Gen3 NVMe M.2 SSD (3600-3250Mb/s) TLC 3DNAND', 'TWINMOS 1TB M.2 PCIe Gen3 NVMe SSD (3600-3250Mb/s) TLC 3DNAND'));
  assert.ok(isSpecKey('70007000MBS') && isSpecKey('16003500MB') && !isSpecKey('SKC3000D2048G'));
  // Gerçek üretici kodu hâlâ eşleşir
  assert.ok(same('Kingston KC3000 2048GB M.2 2280 SKC3000D2048G', 'KINGSTON 2TB KC3000 SKC3000D/2048G NVMe SSD'));
});

test('hazır bilgisayar işlemci ya da ekran kartı sanılmaz', () => {
  for (const n of ['HP Pro 400 G9 99P34ET i7-13700 16GB 512GB SSD  Dos Masaüstü PC', 'HP Elite 800 G9 i7-14700 32GB 1TB SSD 8GB RTX 4060 Windows 11 Pro Masaüstü PC',
    'PC-Intel-Raptor-i3-14100/8GB/256GB', 'HP Pro Tower 290 997W8ET G9 i7-12700 16GB 512GB SSD Dos Masaüstü PC']) {
    assert.equal(classify(n).type, 'desktop', n);
  }
  // Parçalar parça kalır
  assert.deepEqual(classify('Процесор Intel Core i7-12700, дванадесетядрен (2.1/4.9 GHz, 25MB Cache, 0.3/1.5GHz GPU, LGA1700) BOX'), { type: 'part', category: 'cpu' });
  assert.deepEqual(classify('MSI GeForce RTX 5070 Ti 16GB GAMING TRIO OC'), { type: 'part', category: 'gpu' });
  assert.deepEqual(classify('CORSAIR 16GB (2X8GB) DDR4 3200MHZ C16 VENGEANCE RGB PRO SL AMD RYZEN BLACK PC RAM'), { type: 'part', category: 'ram' });
  assert.deepEqual(classify('Patriot Viper Elite 5 Ultra 64GB (2x32GB) 6000MHz CL36 DDR5 RAM'), { type: 'part', category: 'ram' });
});

test('anakartta "M.2" yuvası Apple M2 işlemcisi sanılmaz', () => {
  const k = classify('ASUS Prime A620M-K AM5 DDR5 6400 Hdmi Vga M2 USB3.2 Aura RGB mATX Anakart');
  assert.equal(specsFromName('ASUS Prime A620M-K AM5 DDR5 6400 Hdmi Vga M2 USB3.2 Aura RGB mATX Anakart', k).cpu, undefined);
  assert.equal(specsFromName('Apple MacBook Air 13 M2 8GB 256GB', { type: 'laptop' }).cpu, 'M2');
});

test('eşleştirme planı: eski hatalı anahtar ve farklı kapasite birleşmez', () => {
  const plan = planMatches([
    { id: 1, name: 'KINGSTON 2 TB KC3000 PCIe 7000-7000MB/s 4.0 M.2 SSD', type: 'part', category: 'ssd', storage_gb: 2000, mkeys: ' SKC3000D2048G 70007000MBS ', n: 3 },
    { id: 2, name: 'KINGSTON 4TB KC3000 PCIe 7000-7000MB/s 4.0 M.2 SSD', type: 'part', category: 'ssd', storage_gb: 4000, mkeys: ' 70007000MBS ', n: 1 },
  ]);
  assert.deepEqual(plan.merges, []);
});

test('yanlış ürüne bağlı teklif tanınır', () => {
  assert.ok(wrongProduct({ ptype: 'part', pcat: 'cpu' }, { type: 'desktop', category: null }));
  assert.ok(wrongProduct({ ptype: 'part', pcat: 'ssd', pstorage: 2000 }, { type: 'part', category: 'ssd', storage_gb: 4000 }));
  assert.ok(!wrongProduct({ ptype: 'part', pcat: 'ssd', pstorage: 1000 }, { type: 'part', category: 'ssd', storage_gb: 1024 }));
  assert.ok(!wrongProduct({ ptype: 'phone', pcat: null }, { type: 'phone' }));
});

test('en ucuz ülke stokta olan teklifler arasından seçilir', () => {
  const pc = { TR: { price_eur: 100, in_stock: 0 }, BG: { price_eur: 150, in_stock: 1 }, GR: { price_eur: 170, in_stock: 1 } };
  assert.equal(cheapestOf(pc).cheapest, 'BG');
  assert.equal(cheapestOf(pc).min, 150);
  // Hiçbirinde stok yoksa en düşük fiyat
  assert.equal(cheapestOf({ TR: { price_eur: 100, in_stock: 0 }, BG: { price_eur: 150, in_stock: 0 } }).cheapest, 'TR');
});
