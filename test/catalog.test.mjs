import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, specsFromName, matchKey } from '../lib/catalog.js';
import { extractProduct } from '../scraper/extract.mjs';

test('tür ve kategori', () => {
  assert.deepEqual(classify('AMD Ryzen 7 7800X3D Tray 4.2 GHz 8 Çekirdek 96MB AM5 5nm İşlemci'), { type: 'part', category: 'cpu' });
  assert.deepEqual(classify('Процесор AMD Ryzen 7 7800X3D, осемядрен, Box, без охлаждане'), { type: 'part', category: 'cpu' });
  assert.deepEqual(classify('CPU AMD RYZEN 7 7800X3D 4.20GHZ 8-CORE BOXED'), { type: 'part', category: 'cpu' });
  assert.deepEqual(classify('Samsung 1TB 990 Pro Nvme M.2 Pcie 7450-6900 MB/s'), { type: 'part', category: 'ssd' });
  assert.deepEqual(classify('Памет SSD 1TB, Samsung 990 PRO (MZ-V9P1T0BW), PCIe 4.0 NVMe'), { type: 'part', category: 'ssd' });
  assert.deepEqual(classify('MACBOOK AIR 13.6 M4 STARLIGHT MW0Y3ZE/A'), { type: 'laptop', category: null });
  assert.deepEqual(classify('Lenovo IdeaPad Slim 3 15IRH10 Intel Core i5-13420H 16GB 512GB SSD 15.6" FHD Laptop'), { type: 'laptop', category: null });
  assert.deepEqual(classify('MSI GeForce RTX 5070 12G Ventus 2X OC Ekran Kartı'), { type: 'part', category: 'gpu' });
  assert.deepEqual(classify('Kingston Fury Beast 32GB (2x16GB) DDR5 6000MHz CL36 Ram'), { type: 'part', category: 'ram' });
  assert.deepEqual(classify('Trio AMD OEM Paket - Ryzen 7 7800X3D - RTX 5070 - 32GB DDR5'), { type: 'desktop', category: null });
  assert.deepEqual(classify('Corsair RM850e 850W 80+ Gold Güç Kaynağı'), { type: 'part', category: 'psu' });
  assert.deepEqual(classify('Cooler Master MWE 750 Bronze V3 Power Supply'), { type: 'part', category: 'psu' });
  assert.deepEqual(classify('ASUS TUF Gaming B650-PLUS WIFI AM5 DDR5 ATX Anakart'), { type: 'part', category: 'anakart' });
  assert.deepEqual(classify('Samsung Odyssey G5 27" 165Hz Monitör'), { type: 'part', category: 'monitor' });
  assert.equal(classify('Laptop Çantası 15.6 inç Siyah'), null);
  assert.equal(classify('Logitech MX Master 3S Mouse'), null);
  assert.equal(classify('Philips Barista Brew PSA3228/01'), null);
  assert.deepEqual(classify('amd ryzen 7 7800x3d tray 4 2 ghz 8 cekirdek 96mb am5 5nm islemci'), { type: 'part', category: 'cpu' });
});

test('addan özellikler', () => {
  const l = specsFromName('Lenovo IdeaPad Slim 3 Intel Core i5-13420H 16GB 512GB SSD 15.6" FHD Laptop', { type: 'laptop' });
  assert.equal(l.ram_gb, 16); assert.equal(l.storage_gb, 512); assert.equal(l.screen_in, 15.6); assert.match(l.cpu, /i5-13420H/i);
  const g = specsFromName('ASUS ROG Strix G16 Ryzen 9 8940HX 32GB 1TB SSD RTX 5070 Ti 16"', { type: 'laptop' });
  assert.equal(g.ram_gb, 32); assert.equal(g.storage_gb, 1000); assert.match(g.gpu, /RTX 5070 Ti/i); assert.match(g.cpu, /Ryzen 9 8940HX/i);
  assert.equal(specsFromName('Samsung 990 PRO 1TB', { type: 'part', category: 'ssd' }).storage_gb, 1000);
  assert.equal(specsFromName('MSI GeForce RTX 5070 12G', { type: 'part', category: 'gpu' }).ram_gb, undefined);
});

test('eşleştirme anahtarı', () => {
  assert.equal(matchKey({ mpn: '100-100000910' }), matchKey({ mpn: '100-100000910WOF' }));
  assert.equal(matchKey({ name: 'MACBOOK AIR 13.6 M4 STARLIGHT MW0Y3ZE/A', brand: 'APPLE' }), matchKey({ name: 'Apple MacBook Air M4 16GB 256GB Starlight MW0Y3TU/A', brand: 'Apple' }));
  assert.equal(matchKey({ name: 'Памет SSD 1TB, Samsung 990 PRO (MZ-V9P1T0BW), PCIe 4.0 NVMe' }), 'MZV9P1T0BW');
  assert.equal(matchKey({ mpn: 'MZ-V9P1T0BW' }), 'MZV9P1T0BW');
  assert.equal(matchKey({ name: 'Samsung 990 PRO 1TB DDR5-6000' }), null);
});

test('ürün sayfasından katalog bilgisi', () => {
  const html = `<html><head><meta property="og:image" content="https://x/i.jpg"></head><body>
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Product","name":"AMD Ryzen 7 7800X3D","mpn":"100-100000910","brand":{"@type":"Brand","name":"AMD"},"offers":{"@type":"Offer","price":16999,"priceCurrency":"TRY","availability":"https://schema.org/InStock"}}]}</script></body></html>`;
  assert.deepEqual(extractProduct(html), { name: 'AMD Ryzen 7 7800X3D', brand: 'AMD', mpn: '100-100000910', image: 'https://x/i.jpg', price: 16999, currency: 'TRY', in_stock: true });
  const es = `<title>CPU AMD RYZEN 7 7800X3D - e-shop.gr</title><meta property="og:title" content="CPU AMD RYZEN 7 7800X3D 4.20GHZ 8-CORE BOXED"><meta property="product:brand" content="AMD"><span itemprop="price">309.90</span><meta itemprop="priceCurrency" content="EUR" />`;
  const p = extractProduct(es);
  assert.equal(p.name, 'CPU AMD RYZEN 7 7800X3D 4.20GHZ 8-CORE BOXED'); assert.equal(p.price, 309.9); assert.equal(p.currency, 'EUR');
});

test('kuru denemede yanlış sınıflananlar', () => {
  assert.deepEqual(classify('ΟΘΟΝΗ DELL P1917S 19" LED VGA DP BLACK'), { type: 'part', category: 'monitor' });
  assert.deepEqual(classify('othoni asus tuf gaming vg27aqa1a 27 quad hd 170hz black'), { type: 'part', category: 'monitor' });
  assert.deepEqual(classify('PSU THERMALTAKE TOUGHPOWER GF3 80 PLUS GOLD ACTIVE PFC 1200W'), { type: 'part', category: 'psu' });
  assert.deepEqual(classify('ASUS TUF Gaming GT502 Horizon Siyah Tempered Glass USB 3.2 ATX Mid Tower Kasa'), { type: 'part', category: 'kasa' });
  assert.deepEqual(classify('ASUS Prime A620M-K AM5 DDR5 6400 Hdmi Vga M2 USB3.2 Aura RGB mATX Anakart'), { type: 'part', category: 'anakart' });
  assert.deepEqual(classify('VGA BIOSTAR RADEON RX560 4GB GDDR5'), { type: 'part', category: 'gpu' });
  assert.deepEqual(classify('CASE DEEPCOOL MATREXX 40 3FS GAMING MIDI TOWER RGB BLACK'), { type: 'part', category: 'kasa' });
  assert.deepEqual(classify('Кутия за компютър Lian Li Lancool 207, ATX, черна'), { type: 'part', category: 'kasa' });
  assert.deepEqual(classify('Кутия 1stPlayer MEGAVIEW MV8, ATX/microATX/Mini-ITX, 2x USB 3.0, 7x 120 mm A-RGB вентилатора, черна'), { type: 'part', category: 'kasa' });
  assert.deepEqual(classify('Кутия APNX V1, ATX/MicroATX/Mini-ITX, 1x USB 3.2, бяла, с прозорец, без захранване'), { type: 'part', category: 'kasa' });
  assert.deepEqual(classify('Захранване Corsair RM850e, 850W, 80 Plus Gold'), { type: 'part', category: 'psu' });
  assert.deepEqual(classify('PSU FSP SP500-A 450W ATX'), { type: 'part', category: 'psu' });
  assert.deepEqual(classify('Настолен компютър Lenovo IdeaCentre 3'), { type: 'desktop', category: null });
  assert.deepEqual(classify('AOC 25G4KUR 24.5" 420Hz 1ms HDMI DP Fast IPS Gaming Monitör'), { type: 'part', category: 'monitor' });
  for (const n of [
    'OLYMPIA CPD-425 ΦΟΡΗΤΗ ΑΡΙΘΜΟΜΗΧΑΝΗ ΜΕ ΤΑΙΝΙΑ', 'MACLEAN MC-851 ΒΑΣΗ ΣΤΗΡΙΞΗΣ DESKTOP 10KG',
    'TP-LINK TL-SF1008LP 8-PORT 10/100 MBPS DESKTOP SWITCH WITH 4-PORT POE', 'TP-LINK TAPO T315 SMART TEMPERATURE AND HUMIDITY MONITOR',
    'TP-LINK TAPO P110 (2-PACK) MINI SMART WI-FI SOCKET, ENERGY MONITORING', 'MOTOROLA 50-14000-058R POWER SUPPLY',
    'AKYGA AK-ND-73 ZEBRA POWER SUPPLY 24V / 4.17A 100W 6.3 X 3.0', 'Раница за лаптоп Asus ROG BP1500G, до 15.6"',
    'Почистващ комплект за LCD монитор', 'Предпазен протектор за Apple MacBook 12, Ultra Thin PC Case',
    'ASUS TUF Gaming TF120 ARGB 120mm Beyaz Üçlü Kasa Fanı', 'HP Scanjet 2400', 'HP CTRG N339 BLK C8767EE',
    'Компютърно бюро Carmen CR-118 E, ПДЧ, 150 x 70 cm', 'Архивна кутия за документи, 350х250х100 mm, бяла', 'Филтър за компютърна кутия Lian Li Lancool III LAN3-1W, бял',
    'Поставка за PC кутия NewStar CPU-M100BLACK, мобилна', 'Кутия Asus ProArt PA40SU, за M.2 (2230/2280) SSD, NVMe, USB 4 Type-C', 'Кутия 2.5" (6.35 cm), SATA, USB3.0, черна',
    'HONEYWELL ΜΟΝΑΔΑ ΤΡΟΦΟΔΟΤΙΚΟΥ 12V DC/500 MA', 'HAMA 220889 UNIVERSAL SCREEN SHELF FOR TV AND MONITORS, 30.0 X 12.7 CM', 'HAMA 200018 UNIVERSAL USB-C CAR NOTEBOOK POWER SUPP. UNIT',
    'HAMA 101772-216530 NICE NOTEBOOK HARDCASE UP TO 40 CM (15.6) BLACK', 'HAMA 200129 ALL IN ONE USB CARD READER USB-A USB 2.0', 'G-ROC TB-30SA LED NOTEBOOK MONITOR LIGHT BAR 33CM',
    'HAMA 200760 USB HARD DISK HOUSING FOR 2.5 SSD AND HDD HARD DISKS', 'HAMA 200343 CONVERTER HDMI TO VGA', 'HI-DI-HI LB-01 LAPTOP MESSENGER 15.4"',
    'Barebone сървър Asus RS521A-E12-RS12U', 'KVM суич Aten CS1732B', 'Офис бюро RFG Lisabon (DG02-D0116HB)', 'Вентилатор Arctic P12, 120mm',
  ]) assert.equal(classify(n), null, n);
});
