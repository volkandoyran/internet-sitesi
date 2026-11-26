// Gerçek tarayıcıyla (Playwright/Chromium) uçtan uca test: giriş, arama, ürün sayfası, admin paneli,
// telefon/tablet/masaüstü genişliklerinde yatay kayma olmaması ve tarayıcı konsolunda CSP/JS hatası olmaması.
// Worker yerelde (wrangler + geçici, boş D1) çalışır; canlı veritabanına dokunmaz.
// Çalıştırma: npm run e2e   (Playwright ve Chromium kurulu olmalı: npx playwright install chromium)
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { unstable_dev } from 'wrangler';

const ADMIN = 'e2e-admin-sifresi-1';
const SITE = 'e2e-site-sifresi-2';
let w, dir, B, browser, chromium;

async function loadPlaywright() {
  try { return (await import('playwright')).chromium; } catch {}
  // Bulut oturumu gibi ortamlarda Playwright genel kurulu olabilir
  for (const base of [process.cwd() + '/', '/opt/node-tools/']) {
    try { return createRequire(base)('playwright').chromium; } catch {}
  }
  return null;
}

const api = (path, body, method = 'POST') => fetch(B + '/api/admin/' + path, {
  method, body: body ? JSON.stringify(body) : undefined,
  headers: { authorization: 'Bearer ' + ADMIN, 'content-type': 'application/json' },
}).then(async (r) => { assert.ok(r.ok, `${path}: ${r.status} ${await r.clone().text()}`); return r.json(); });

before(async () => {
  chromium = await loadPlaywright();
  if (!chromium) return;
  dir = await mkdtemp(join(tmpdir(), 'ucf-e2e-'));
  w = await unstable_dev('src/worker.js', {
    config: 'wrangler.jsonc', vars: { ADMIN_PASSWORD: ADMIN, SITE_PASSWORD: SITE }, persistTo: dir, logLevel: 'error',
    experimental: { disableExperimentalWarning: true, disableDevRegistry: true }, ip: '127.0.0.1',
  });
  B = `http://${w.address}:${w.port}`;
  await api('settings', null, 'GET'); // şema kurulur
  // Örnek veri: aynı laptop üç ülkede (aynı barkod), uzun adlı bir ürün (taşma denemesi) ve bir telefon
  const long = 'Lenovo IdeaPad Slim 5 16IRH8 Intel Core i7-13620H 16GB LPDDR5 1TB SSD 16 inç WUXGA IPS Windows 11 Home Cloud Grey 83BG0012TX';
  const items = [
    { retailer_id: 'jarcomputers', url: 'https://www.jarcomputers.com/e2e-1', name: 'ASUS Vivobook 15 X1504VA i5-1335U 16GB 512GB SSD', price: 649, currency: 'EUR', gtin: '4711387150011' },
    { retailer_id: 'eshop-gr', url: 'https://www.e-shop.gr/e2e-1', name: 'ASUS Vivobook 15 X1504VA i5-1335U 16GB 512GB SSD', price: 699, currency: 'EUR', gtin: '4711387150011' },
    // Kırık görsel: yüklenemeyince kaldırılmalı (CSP satır içi onerror'a izin vermez)
    { retailer_id: 'technomarket', url: 'https://www.technomarket.bg/e2e-2', name: long, price: 999, currency: 'EUR', image: 'https://gorsel.invalid/yok.jpg' },
  ].map((x) => ({ type: 'laptop', in_stock: true, ram_gb: 16, storage_gb: 512, image: null, ...x }));
  await api('catalog', { rates: { TRY: 50 }, items });
  browser = await chromium.launch();
}, { timeout: 180000 });
after(async () => { await browser?.close(); await w?.stop(); if (dir) await rm(dir, { recursive: true, force: true }); });

async function girisliSayfa(viewport, isMobile = false) {
  const ctx = await browser.newContext({ viewport, isMobile, hasTouch: isMobile, locale: 'tr-TR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('JS: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_|Failed to load resource/.test(m.text())) errors.push('Konsol: ' + m.text()); });
  await page.goto(B + '/');
  await page.fill('input[name=sifre]', SITE);
  await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]);
  return { ctx, page, errors };
}

const tasma = (page) => page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const off = [...document.querySelectorAll('body *')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width && r.right > vw + 1 && getComputedStyle(el).position !== 'fixed' && !el.closest('.scroll, [class*=scroll], table');
  }).slice(0, 5).map((el) => el.tagName + '.' + el.className);
  return { scroll: document.documentElement.scrollWidth - vw, off };
});

// E2E_EKRAN=klasör verilirse ekran görüntüleri oraya kaydedilir
const ekran = (page, ad) => process.env.E2E_EKRAN ? page.screenshot({ path: join(process.env.E2E_EKRAN, ad + '.png'), fullPage: false }) : null;

const GENISLIK = [['telefon (iPhone SE)', { width: 375, height: 667 }, true], ['küçük Android', { width: 360, height: 740 }, true],
  ['tablet', { width: 768, height: 1024 }, true], ['masaüstü', { width: 1366, height: 800 }, false]];

for (const [ad, vp, mobil] of GENISLIK) {
  test(`${ad}: giriş, arama, ürün sayfası; yatay kayma yok, JS/CSP hatası yok`, async (t) => {
    if (!chromium) return t.skip('Playwright kurulu değil');
    const { ctx, page, errors } = await girisliSayfa(vp, mobil);
    await page.waitForSelector('#results a.name', { timeout: 15000 });
    let o = await tasma(page);
    assert.ok(o.scroll <= 0, `ana sayfada yatay kayma ${o.scroll}px: ${o.off.join(', ')}`);
    // Arama
    await page.fill('#q', 'vivobook');
    await page.press('#q', 'Enter');
    await page.waitForFunction(() => [...document.querySelectorAll('#results a.name')].some((a) => /Vivobook/i.test(a.textContent)) && document.querySelectorAll('#results a.name').length === 1, null, { timeout: 15000 });
    const sonuc = await page.textContent('#results');
    assert.match(sonuc, /649/); // en ucuz fiyat görünür
    await ekran(page, `arama-${vp.width}`);
    o = await tasma(page);
    assert.ok(o.scroll <= 0, `arama sonucunda yatay kayma ${o.scroll}px: ${o.off.join(', ')}`);
    // Ürün sayfası (sunucuda üretilir): iki ülke, en ucuz JAR
    await Promise.all([page.waitForNavigation(), page.click('#results a.name')]);
    assert.match(page.url(), /\/urun\/\d+-/);
    const urun = await page.textContent('body');
    assert.match(urun, /JAR Computers/); assert.match(urun, /e-shop\.gr/);
    o = await tasma(page);
    assert.ok(o.scroll <= 0, `ürün sayfasında yatay kayma ${o.scroll}px: ${o.off.join(', ')}`);
    // Uzun adlı ürün sayfası taşmamalı
    await page.goto(B + '/?q=ideapad');
    await page.waitForSelector('#results a.name', { timeout: 15000 });
    await Promise.all([page.waitForNavigation(), page.click('#results a.name')]);
    o = await tasma(page);
    assert.ok(o.scroll <= 0, `uzun adlı üründe yatay kayma ${o.scroll}px: ${o.off.join(', ')}`);
    await page.waitForFunction(() => !document.querySelector('img[src*="gorsel.invalid"]'), null, { timeout: 15000 });
    // Dokunmatik hedefler: arama düğmesi ve ana bağlantılar en az 40px yüksek (telefon)
    if (mobil) {
      await page.goto(B + '/');
      const h = await page.evaluate(() => document.querySelector('#search button[type=submit], #search button')?.getBoundingClientRect().height || 0);
      assert.ok(h >= 40, `arama düğmesi ${h}px`);
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  }, { timeout: 90000 });
}

test('admin paneli (telefon): giriş, ürün arama/sayfalama, inceleme sekmesinde şüpheli fiyatı onaylama', async (t) => {
  if (!chromium) return t.skip('Playwright kurulu değil');
  // Şüpheli fiyat sıçraması oluştur (649 → 1999 €, bekletilir)
  await api('catalog', { items: [{ retailer_id: 'jarcomputers', url: 'https://www.jarcomputers.com/e2e-1', name: 'ASUS Vivobook 15 X1504VA i5-1335U 16GB 512GB SSD', type: 'laptop', price: 1999, currency: 'EUR', in_stock: true, gtin: '4711387150011' }] });
  const { ctx, page, errors } = await girisliSayfa({ width: 375, height: 740 }, true);
  await page.goto(B + '/admin/');
  await page.fill('input[name=pw]', ADMIN);
  await page.click('#login button');
  await page.waitForSelector('#pfilter', { timeout: 15000 });
  assert.equal((await tasma(page)).scroll <= 0, true, 'admin ürünler sekmesi taşıyor');
  await page.fill('#filter', 'ideapad');
  await page.click('#pfilter button');
  await page.waitForFunction(() => document.querySelectorAll('#plist > details').length === 1, null, { timeout: 10000 });
  await ekran(page, 'admin-urunler-telefon');
  // İnceleme sekmesi: rozet 1, onayla
  await page.waitForFunction(() => document.querySelector('#review-n')?.textContent === '1', null, { timeout: 10000 });
  await page.click('[data-tab=review]');
  await page.waitForSelector('#tab-review [data-rv=onayla]');
  await ekran(page, 'admin-inceleme-telefon');
  assert.match(await page.textContent('#tab-review'), /1\.999/);
  assert.ok((await tasma(page)).scroll <= 0, 'inceleme sekmesi taşıyor');
  await page.click('#tab-review [data-rv=onayla]');
  await page.waitForFunction(() => /İncelenecek bir şey yok/.test(document.querySelector('#tab-review').textContent), null, { timeout: 10000 });
  assert.deepEqual(errors, []);
  await ctx.close();
}, { timeout: 90000 });

test('güvenlik: site başka sitede çerçeveye gömülemez, girişsiz sayfa giriş ekranına gider', async (t) => {
  if (!chromium) return t.skip('Playwright kurulu değil');
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const r = await page.goto(B + '/admin/');
  assert.match(page.url(), /\/giris/);
  assert.equal(r.headers()['x-frame-options'], 'DENY');
  await ctx.close();
});
