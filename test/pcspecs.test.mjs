import test from 'node:test';
import assert from 'node:assert/strict';
import { specsFromPairs, specsFromComputerName, computerSpecs, columnsFromSpecs, tidy } from '../lib/pcspecs.js';
import { extractSpecPairs } from '../scraper/extract.mjs';
import { slug } from '../src/pages.js';

// Technomarket ürün sayfasındaki tablo (kısaltılmış gerçek örnek)
const TM = `<table><tbody><tr><td class="label">Клавиатура</td><td><span class="pre">Кирилизирана<br></span></td></tr><tr><td class="label">Брой ядра</td><td><span class="pre">10 Core<br></span></td></tr><tr><td class="label">Резолюция</td><td><span class="pre">1920 X 1080 (Fhd)<br></span></td></tr><tr><td class="label">Опреснение на дисплея</td><td><span class="pre">144Hz<br></span></td></tr><tr><td class="label">Видеокарта модел</td><td><span class="pre">Geforce Rtx 5050 8Gb<br></span></td></tr><tr><td class="label">SSD</td><td><span class="pre">512 Gb Nvme<br></span></td></tr><tr><td class="label">RAM</td><td><span class="pre">24 Gb<br></span></td></tr><tr><td class="label">HDD</td><td><span class="pre">Няма<br></span></td></tr><tr><td class="label">БАТЕРИЯ</td><td><span class="pre">60Wh<br></span></td></tr><tr><td class="label">Процесор серия</td><td><span class="pre">Intel Core I5<br></span></td></tr><tr><td class="label">Операционна система</td><td><span class="pre">Няма<br></span></td></tr><tr><td class="label">Тип памет</td><td><span class="pre">Ddr5<br></span></td></tr><tr><td class="label">Процесор модел</td><td><span class="pre">I5-13450Hx<br></span></td></tr><tr><td class="label">Диагонал на дисплея (inch)</td><td><span class="pre">15.6 "<br></span></td></tr><tr><td class="label">Цвят</td><td><span class="pre">Сив<br></span></td></tr><tr><td class="label">Модел</td><td><span class="pre">83Je0067Rm<br></span></td></tr><tr><td class="label">Серия</td><td><span class="pre"></span></td></tr></tbody></table>`;

test('mağaza sayfasındaki özellik tablosu', () => {
  const s = specsFromPairs(extractSpecPairs(TM));
  assert.equal(s.cpu, 'i5-13450HX');
  assert.equal(s.gpu, 'GeForce RTX 5050 8 GB');
  assert.equal(s.ram, '24 GB');
  assert.equal(s.ram_type, 'DDR5');
  assert.equal(s.storage, '512 GB NVMe');
  assert.equal(s.refresh, '144 Hz');
  assert.equal(s.os, 'Yok');
  assert.equal(s.battery, '60 Wh');
  assert.equal(s.hdd, undefined);
  assert.match(s.screen, /^15\.6/);
  const c = columnsFromSpecs(s);
  assert.equal(c.ram_gb, 24); assert.equal(c.storage_gb, 512); assert.equal(c.screen_in, 15.6); assert.equal(c.cpu, 'i5-13450HX');
});

test('filtre menüsü (çok bağlantılı hücre) özellik sayılmaz', () => {
  const html = '<table><tr><td>Επεξεργαστής</td><td><a href="#">Intel Core i5</a> <a href="#">Intel Core i7</a> <a href="#">AMD Ryzen 5</a></td></tr></table>';
  assert.deepEqual(specsFromPairs(extractSpecPairs(html)), {});
});

test('sıralama eki ve "yok" değerleri', () => {
  assert.equal(tidy('Vii. Няма'), 'Yok');
  assert.equal(tidy(''), '');
});

test('addan bilgisayar özellikleri', () => {
  const j = specsFromComputerName('Лаптоп Acer Nitro V 16 ANV16-61-R42L(NH.QUMEX.001)(черен), шестядрен AMD Ryzen AI 5 340 2.0/4.8GHz, 16 (40.64cm) WUXGA IPS Display & GF RTX 3050 6GB, 16GB DDR5, 512GB SSD NVMe, 3x USB 3.2 Type-A, No OS, 2.4kg');
  assert.equal(j.os, 'Yok');
  assert.match(j.resolution, /WUXGA/);
  assert.equal(j.panel, 'IPS');
  assert.equal(j.ram_type, 'DDR5');
  assert.equal(j.weight, '2,4 kg');
  assert.equal(j.cores, '6 çekirdek');
  assert.equal(j.screen, '16"');
  assert.equal(j.vram, '6 GB');
  assert.equal(specsFromComputerName('LAPTOP LENOVO THINKPAD T16 G4 INTEL CORE ULTRA 7-255U 64GB 1TB W11P 3Y').os, 'Windows 11 Pro');
  assert.equal(specsFromComputerName('APPLE MACBOOK AIR 13.6 M5 16GB/512GB US KBD SLV').os, 'macOS');
  assert.equal(specsFromComputerName('APPLE MACBOOK AIR 13.6 M5 16GB/512GB US KBD SLV').screen, '13.6"');
  assert.equal(specsFromComputerName('Mini PC N100 Windows 11 Pro').os, 'Windows 11 Pro');
});

test('görüntülenecek özellikler: sayfa > sütun > ad', () => {
  const rows = computerSpecs({ name: 'ASUS NB E1504FA-NJ312 FHD', brand: 'Asus', cpu: 'Ryzen 5 7520U', ram_gb: 8, storage_gb: 512, specs: JSON.stringify({ ram: '16 GB', color: 'Сив' }) });
  const get = (k) => rows.find((r) => r.key === k)?.value;
  assert.equal(get('ram'), '16 GB');
  assert.equal(get('cpu'), 'Ryzen 5 7520U');
  assert.equal(get('color'), 'Gri');
  assert.match(get('resolution'), /Full HD/);
  assert.equal(rows[0].label, 'Marka');
});

test('ürün adresi', () => {
  assert.equal(slug('Лаптоп Acer Nitro V 16'), 'laptop-acer-nitro-v-16');
  assert.equal(slug('ΚΙΝΗΤΟ IPHONE 17 PRO 256GB'), 'kinito-iphone-17-pro-256gb');
  assert.equal(slug('Çanta İçin Özel'), 'canta-icin-ozel');
});
