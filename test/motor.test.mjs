import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseRobots, robotsAllows, isChallenge, Getirici, EngelHatasi, RobotsHatasi } from '../scraper/motor/http.mjs';
import { extractProduct, applySelectors, htmlOldPrice, breadcrumb } from '../scraper/extract.mjs';
import { adapterFor } from '../scraper/stores.mjs';
import { priceChanged, checkConfig } from '../src/api.js';

test('robots.txt kuralları', () => {
  const r = parseRobots(`User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /sepet\nDisallow: /*?filtre=\nAllow: /sepet/kampanya\nCrawl-delay: 2\nSitemap: https://x/s.xml`);
  assert.equal(r.delay, 2);
  assert.equal(robotsAllows(r, 'https://x/urun/asus-laptop'), true);
  assert.equal(robotsAllows(r, 'https://x/sepet'), false);
  assert.equal(robotsAllows(r, 'https://x/sepet/kampanya'), true);
  assert.equal(robotsAllows(r, 'https://x/laptop?filtre=1'), false);
  assert.equal(robotsAllows(parseRobots('User-agent: *\nDisallow:'), 'https://x/a'), true);
});

test('bot doğrulama sayfası tanınır', () => {
  assert.ok(isChallenge('<html><head><title>Just a moment...</title></head><script src="/cdn-cgi/challenge-platform/x"></script>'));
  assert.ok(isChallenge('<div class="g-recaptcha" data-sitekey="x"></div>'));
  assert.ok(!isChallenge('<html><title>ASUS Vivobook</title><script type="application/ld+json">{}</script>'));
});

test('eski fiyat, açıklama ve kategori (JSON-LD)', () => {
  const html = `<script type="application/ld+json">[{"@type":"BreadcrumbList","itemListElement":[{"position":2,"name":"Dizüstü"},{"position":1,"name":"Bilgisayar"},{"position":3,"name":"ASUS Vivobook 15"}]},
    {"@type":"Product","name":"ASUS Vivobook 15","description":"<p>15.6&quot; FHD, <b>16 GB</b> RAM</p>","offers":{"@type":"Offer","price":"24999","priceCurrency":"TRY","availability":"https://schema.org/InStock",
    "priceSpecification":[{"@type":"UnitPriceSpecification","priceType":"https://schema.org/StrikethroughPrice","price":"29999"}]}}]</script>`;
  const p = extractProduct(html, 'TRY');
  assert.equal(p.price, 24999);
  assert.equal(p.old_price, 29999);
  assert.equal(p.description, '15.6" FHD, 16 GB RAM');
  assert.equal(p.store_category, 'Bilgisayar > Dizüstü');
  assert.equal(breadcrumb('<p>yok</p>'), null);
});

test('HTML eski fiyat: yalnızca makul değer', () => {
  assert.equal(htmlOldPrice('<span class="product-old-price old-price">1.299,00 €</span>', 999), 1299);
  assert.equal(htmlOldPrice('<span class="old-price">899,00 €</span>', 999), null);  // güncelden düşük
  assert.equal(htmlOldPrice('<span class="old-price">99.999,00</span>', 999), null); // 3 katından fazla
});

test('CSS seçicileriyle çıkarım (JSON-LD yoksa)', () => {
  const html = `<h1 class="t"> Lenovo IdeaPad Slim 3 </h1><div class="fiyat">649,90 лв.</div><del class="eski">799,90</del><img class="ana" src="https://x/a.jpg"><span class="tukendi">Изчерпан</span>`;
  assert.equal(extractProduct(html, 'EUR'), null);
  const p = applySelectors(html, extractProduct(html, 'EUR'), { name: 'h1.t', price: '.fiyat', old_price: 'del.eski', image: 'img.ana@src', out_of_stock: '.tukendi' }, 'EUR');
  assert.deepEqual(p, { name: 'Lenovo IdeaPad Slim 3', price: 649.9, currency: 'EUR', old_price: 799.9, image: 'https://x/a.jpg', in_stock: false, brand: null, mpn: null, description: null, store_category: null });
  // JSON-LD değeri seçiciden önce gelir
  const ld = `<script type="application/ld+json">{"@type":"Product","name":"A","offers":{"price":"10","priceCurrency":"EUR"}}</script><div class="fiyat">99</div>`;
  assert.equal(applySelectors(ld, extractProduct(ld, 'EUR'), { price: '.fiyat' }, 'EUR').price, 10);
});

test('fiyat değişimi: yalnızca mağaza fiyatı değişince', () => {
  assert.equal(priceChanged(null, 10, 'EUR'), true);
  assert.equal(priceChanged({ price: 10, currency: 'EUR' }, 10, 'EUR'), false);
  assert.equal(priceChanged({ price: 10, currency: 'EUR' }, 10.001, 'EUR'), false);
  assert.equal(priceChanged({ price: 10, currency: 'EUR' }, 9.99, 'EUR'), true);
  assert.equal(priceChanged({ price: 10, currency: 'TRY' }, 10, 'EUR'), true);
});

test('adaptör ayarı doğrulama ve birleştirme', () => {
  assert.equal(checkConfig('').value, null);
  assert.ok(checkConfig('{bozuk').error);
  assert.ok(checkConfig({ sifre: 1 }).error);
  assert.ok(checkConfig({ urlPattern: '(' }).error);
  assert.ok(checkConfig({ sitemaps: ['ftp://x'] }).error);
  assert.equal(checkConfig({ urlPattern: '/p/', render: true }).value, '{"urlPattern":"/p/","render":true}');
  const a = adapterFor({ id: 'yeni', site: 'https://magaza.com', currency: 'TRY', config: { urlPattern: '/urun/' } });
  assert.equal(a.sitemapsFromRobots, 'https://magaza.com/robots.txt');
  assert.equal(a.currency, 'TRY');
  assert.equal(a.accept('https://magaza.com/urun/asus-vivobook-15-laptop'), true);
  assert.equal(a.accept('https://baska.com/urun/asus-vivobook-15-laptop'), false);
  assert.equal(adapterFor({ id: 'technopolis', site: 'https://www.technopolis.bg' }).render, true);
  assert.equal(adapterFor({ id: 'yok', site: '' }).hasSource, false);
});

// Yerel sahte mağaza: robots, site haritası önbelleği, tekrar deneme, 429 ve CAPTCHA davranışı
test('getirici: robots, önbellek, tekrar deneme, engel', async () => {
  let sitemapHits = 0, flaky = 0;
  const srv = createServer((req, res) => {
    if (req.url === '/robots.txt') return res.end('User-agent: *\nDisallow: /gizli\nSitemap: http://x/sitemap.xml');
    if (req.url === '/sitemap.xml') {
      sitemapHits++;
      if (req.headers['if-none-match'] === '"v1"') { res.writeHead(304); return res.end(); }
      res.writeHead(200, { etag: '"v1"' }); return res.end('<urlset><url><loc>http://x/urun/1</loc></url></urlset>');
    }
    if (req.url === '/urun/1') return res.end('<script type="application/ld+json">{"@type":"Product","name":"Asus Laptop","offers":{"price":"500","priceCurrency":"EUR"}}</script>');
    if (req.url === '/dalgali') { if (flaky++ < 1) { res.writeHead(502); return res.end(); } return res.end('tamam'); }
    if (req.url === '/yavas') { res.writeHead(429); return res.end('Too many'); }
    if (req.url === '/captcha') return res.end('<title>Just a moment...</title>');
    if (req.url === '/yok') { res.writeHead(404); return res.end(); }
    res.writeHead(500); res.end();
  });
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const dir = await mkdtemp(join(tmpdir(), 'onbellek-'));
  try {
    const net = new Getirici({ cacheDir: dir, delayMs: 0, log: () => {} });
    assert.match(await net.page(base + '/urun/1'), /Asus Laptop/);
    await assert.rejects(net.page(base + '/gizli/a'), RobotsHatasi);
    assert.equal(await net.page(base + '/dalgali'), 'tamam');
    assert.equal(net.stats.retries, 1);
    await assert.rejects(net.page(base + '/yavas'), (e) => e instanceof EngelHatasi && e.status === 429);
    await assert.rejects(net.page(base + '/captcha'), (e) => e instanceof EngelHatasi && /CAPTCHA/.test(e.message));
    await assert.rejects(net.page(base + '/yok'), (e) => e.gone === true);
    // Site haritası: ilk istek indirir, ikincisi diskten (istek yok), süre dolunca koşullu istek 304
    await net.sitemap(base + '/sitemap.xml');
    await net.sitemap(base + '/sitemap.xml');
    assert.equal(sitemapHits, 1);
    const xml = await net.sitemap(base + '/sitemap.xml', { maxAgeH: 0 });
    assert.equal(sitemapHits, 2);
    assert.equal(net.stats.notModified, 1);
    assert.match(xml, /urun\/1/);
  } finally { srv.close(); }
});
