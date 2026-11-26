// Arama: SQL ön süzmeli yeni yol ile tüm kataloğu okuyan eski yol aynı sonucu vermeli; yeni yol daha az satır okumalı.
// Gerçek SQLite (node:sqlite) üzerinde D1 benzeri küçük bir bağdaştırıcıyla çalışır; ağ ve canlı veritabanı yok.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleApi, loadProducts, clearProductCache, sqlWords, searchWhere } from '../src/api.js';

// D1 bağdaştırıcısı: okunan satırları sayar
function d1(db) {
  const stat = { rows: 0 };
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => { const r = db.prepare(sql).all(...args); stat.rows += r.length; return { results: r }; },
    first: async () => { const r = db.prepare(sql).get(...args); if (r) stat.rows++; return r ?? null; },
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
  });
  return { stat, prepare: (sql) => stmt(sql), batch: async (list) => Promise.all(list.map((s) => s.run())) };
}

function fixture() {
  const db = new DatabaseSync(':memory:');
  const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8').replace(/--[^\n]*/g, '');
  for (const q of schema.split(';').map((x) => x.trim()).filter(Boolean)) db.exec(q);
  db.exec("INSERT OR REPLACE INTO settings (key, value) VALUES ('rate_TRY', '55')");
  const now = new Date().toISOString(), old = new Date(Date.now() - 20 * 864e5).toISOString();
  const P = [
    ['laptop', null, 'Lenovo ThinkPad E14 Gen 6 i5-1335U 16GB 512GB', 'Lenovo', 'Core i5-1335U', 50, null, null, 16, 512, 14],
    ['laptop', null, 'LENOVO İDEAPAD SLIM 3 15IRH10 İ7-13620H 16GB 1TB', 'LENOVO', 'Core i7-13620H', 70, null, null, 16, 1000, 15.6],
    ['laptop', null, 'Лаптоп Lenovo IdeaPad Slim 3 15IRH10 83K10009BM', 'Lenovo', null, null, null, null, 8, 512, 15.6],
    ['laptop', null, 'ΦΟΡΗΤΟΣ ΥΠΟΛΟΓΙΣΤΗΣ ASUS VIVOBOOK 15 X1504VA i5-1335U 8GB 512GB', 'ASUS', 'Core i5-1335U', null, null, null, 8, 512, 15.6],
    ['laptop', null, 'MSI Katana 15 B13VFK i7-13620H RTX 4060 16GB 1TB', 'MSI', 'Core i7-13620H', 70, 'RTX 4060', 55, 16, 1000, 15.6],
    ['laptop', null, 'Apple MacBook Air 13 M3 8GB 256GB', 'Apple', 'M3', null, null, null, 8, 256, 13.6],
    ['desktop', null, 'HP Pro 400 G9 99P34ET i7-13700 16GB 512GB SSD Masaüstü PC', 'HP', 'Core i7-13700', 72, null, null, 16, 512, null],
    ['desktop', null, 'Мини компютър ASUS ExpertCenter PN42 N100 8GB 256GB', 'ASUS', null, null, null, null, 8, 256, null],
    ['part', 'cpu', 'AMD Ryzen 7 7800X3D Tray 4.2 GHz 8 Çekirdek 96MB AM5 İşlemci', 'AMD', 'Ryzen 7 7800X3D', 77, null, null, null, null, null],
    ['part', 'gpu', 'ASUS TUF Gaming GeForce RTX 5070 Ti 16GB GDDR7 OC', 'ASUS', null, null, 'RTX 5070 Ti', 70, null, null, null],
    ['part', 'ssd', 'KINGSTON 2 TB KC3000 PCIe 7000-7000MB/s 4.0 M.2 SSD', 'KINGSTON', null, null, null, null, null, 2000, null],
    ['part', 'anakart', 'ASUS Prime A620M-K AM5 DDR5 6400 Hdmi Vga M2 USB3.2 mATX Anakart', 'ASUS', 'M2', 57, null, null, null, null, null],
    ['phone', null, 'KINHTO IPHONE 17 PRO MAX 256GB SILVER', 'APPLE', null, null, null, null, null, 256, 6.9],
    ['phone', null, 'Смартфон Samsung Galaxy A17 4GB 128GB', 'Samsung', null, null, null, null, 4, 128, 6.7],
    ['tablet', null, 'Apple iPad Air 11 M3 128GB Wi-Fi', 'Apple', 'M3', null, null, null, 8, 128, 11],
    ['laptop', null, 'Eski fiyatlı laptop i7 16GB', 'Test', null, null, null, null, 16, 512, 15],
    ['laptop', null, 'Fiyatsız laptop', 'Test', null, null, null, null, 16, 512, 15],
  ];
  const ins = db.prepare('INSERT INTO products (type, category, name, brand, cpu, cpu_score, gpu, gpu_score, ram_gb, storage_gb, screen_in) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  P.forEach((p) => ins.run(...p));
  // Dolgu: aramayla ilgisiz çok sayıda ürün (yeni yolun daha az okuduğunu ölçmek için)
  for (let i = 0; i < 400; i++) ins.run(i % 2 ? 'part' : 'phone', i % 2 ? 'ram' : null, `Dolgu urun ${i}`, 'X', null, null, null, null, 8, 128, null);
  const off = db.prepare('INSERT INTO offers (product_id, retailer_id, url, price, currency, price_eur, in_stock, manual, updated_at) VALUES (?,?,?,?,?,?,?,0,?)');
  const shops = [['pckolik', 'TRY'], ['technomarket', 'EUR'], ['eshop-gr', 'EUR'], ['jarcomputers', 'EUR']];
  const n = P.length + 400;
  for (let id = 1; id <= n; id++) {
    if (id === 17) continue; // fiyatsız
    for (let k = 0; k < 1 + (id % 3); k++) {
      const [s, c] = shops[(id + k) % 4];
      const eur = 100 + ((id * 37 + k * 91) % 1400);
      off.run(id, s, `https://${s}.example/${id}-${k}`, c === 'TRY' ? eur * 55 : eur, c, eur, (id + k) % 5 === 0 ? 0 : 1, id === 16 ? old : now);
    }
  }
  return db;
}

const QUERIES = [
  '', 'q=lenovo', 'q=LENOVO', 'q=ideapad', 'q=İdeapad', 'q=ıdeapad', 'q=thinkpad e14', 'q=i7 16gb', 'q=katana rtx 4060',
  'q=macbook air m3', 'q=15irh10', 'q=лаптоп', 'q=ΥΠΟΛΟΓΙΣΤΗΣ', 'q=vivobook&country=GR', 'q=lenovo&budget=600', 'q=lenovo&budget=600&country=TR',
  'ram=16', 'storage=1024', 'cpu=70', 'gpu=55', 'type=desktop', 'type=all&q=asus', 'type=part&category=cpu&q=7800x3d',
  'type=part&q=rtx 5070', 'type=part&category=ssd&q=kc3000', 'type=part&q=a620m', 'bolum=telefon&type=phone&q=iphone 17',
  'type=mobile&q=galaxy', 'bolum=tablet&type=tablet&q=ipad', 'q=eski fiyatlı', 'q=fiyatsız', 'q=100%_x', 'q=yokboyleurun',
  'q=ryzen 7', 'q=17', 'budget=50', 'type=all&budget=300&country=BG',
];

test('arama: SQL ön süzmeli yol eski yolla birebir aynı sonucu verir ve daha az satır okur', async () => {
  const db = fixture();
  const env = { DB: d1(db) };
  let toplamYeni = 0, toplamEski = 0;
  for (const q of QUERIES) {
    const url = 'https://x/api/products?' + q;
    clearProductCache();
    env.DB.stat.rows = 0;
    const yeni = await (await handleApi(new Request(url), env, ['products'])).json();
    const yeniSatir = env.DB.stat.rows;
    // Eski yol: tüm katalog bellekteyken arama aynı kodu tüm katalog üzerinde çalıştırır
    clearProductCache();
    env.DB.stat.rows = 0;
    await loadProducts(env);
    const eski = await (await handleApi(new Request(url), env, ['products'])).json();
    const eskiSatir = env.DB.stat.rows;
    assert.deepEqual(yeni, eski, 'sonuç farklı: ' + q);
    toplamYeni += yeniSatir; toplamEski += eskiSatir;
  }
  // Ön süzme toplamda çok daha az satır okur (birebir sonuç olmayan aramalar tüm kataloğa düşer)
  assert.ok(toplamYeni < toplamEski / 2, `yeni ${toplamYeni} satır, eski ${toplamEski} satır`);
});

test('ürün ayrıntısı tüm kataloğu okumaz, sonuç aynı', async () => {
  const db = fixture();
  const env = { DB: d1(db) };
  clearProductCache();
  env.DB.stat.rows = 0;
  const yeni = await (await handleApi(new Request('https://x/api/products/5'), env, ['products', '5'])).json();
  const yeniSatir = env.DB.stat.rows;
  clearProductCache();
  await loadProducts(env);
  const eski = await (await handleApi(new Request('https://x/api/products/5'), env, ['products', '5'])).json();
  assert.deepEqual(yeni, eski);
  assert.equal(yeni.product.id, 5);
  assert.ok(yeniSatir < 200, 'okunan satır: ' + yeniSatir);
  assert.equal((await handleApi(new Request('https://x/api/products/0'), env, ['products', '0'])).status, 404);
  assert.equal((await handleApi(new Request('https://x/api/products/abc'), env, ['products', 'abc'])).status, 404);
});

test('SQL kalıpları: Türkçe İ/ı, özel karakter ve ASCII dışı kelimeler güvenli', () => {
  assert.deepEqual(sqlWords('İdeapad ıdeapad'), ['%_deapad%', '%_deapad%']);
  assert.deepEqual(sqlWords('100%_x'), ['%100\\%\\_x%']);
  assert.deepEqual(sqlWords('лаптоп lenovo'), ['%lenovo%']); // Kiril kelime SQL'de süzülmez, JS'te süzülür
  assert.deepEqual(sqlWords('ryzen 7 16gb rtx 4060 katana'), ['%_atana%']); // özellik kelimeleri ve arkalarındaki sayılar ad süzgecine girmez (JS ile aynı)
  const { where, binds } = searchWhere({ type: 'computer', ram_gb: 16 }, ["%x' OR 1=1 --%"]);
  assert.ok(!where.includes('OR 1=1'), 'kullanıcı girdisi sorguya yazılmaz, yalnızca parametre');
  assert.ok(binds.includes("%x' OR 1=1 --%"));
});
