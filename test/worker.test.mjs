// Worker'ı yerelde (wrangler + geçici, boş D1) çalıştırıp uçtan uca güvenlik ve API testleri.
// Canlı veritabanına dokunmaz: her çalıştırmada geçici klasörde yeni bir yerel veritabanı açılır.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unstable_dev } from 'wrangler';

const ADMIN = 'test-admin-sifresi-1';
const SITE = 'test-site-sifresi-2';
let w, dir, B;

// Basit çerez kavanozu
const jar = () => {
  const c = {};
  return {
    set(res) { for (const h of res.headers.getSetCookie?.() || []) { const [kv] = h.split(';'); const i = kv.indexOf('='); c[kv.slice(0, i)] = kv.slice(i + 1); } },
    get header() { return Object.entries(c).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('; '); },
  };
};
const req = (path, { j, ...o } = {}) => fetch(B + path, { redirect: 'manual', ...o, headers: { ...(j ? { cookie: j.header } : {}), ...(o.headers || {}) } });
const bearer = { authorization: 'Bearer ' + ADMIN };

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ucf-test-'));
  w = await unstable_dev('src/worker.js', {
    config: 'wrangler.jsonc', vars: { ADMIN_PASSWORD: ADMIN, SITE_PASSWORD: SITE }, persistTo: dir, logLevel: 'error',
    experimental: { disableExperimentalWarning: true, disableDevRegistry: true }, ip: '127.0.0.1',
  });
  B = `http://${w.address}:${w.port}`; // gerçek HTTP isteği: Worker adresi tarayıcıdaki gibi görür (Origin karşılaştırması)
  // Kur ve örnek veri (yalnızca geçici veritabanına)
  await req('/api/admin/settings', { headers: bearer }); // şema kurulur
}, { timeout: 120000 });
after(async () => { await w?.stop(); await rm(dir, { recursive: true, force: true }); });

async function siteGirisi() {
  const j = jar();
  const r = await req('/giris', { method: 'POST', body: new URLSearchParams({ sifre: SITE, hedef: '/' }), headers: { 'cf-connecting-ip': '10.0.0.1' } });
  assert.equal(r.status, 303);
  j.set(r);
  return j;
}
async function adminGirisi(j) {
  const r = await req('/api/admin/login', { j, method: 'POST', body: JSON.stringify({ password: ADMIN }), headers: { 'content-type': 'application/json', origin: B, 'cf-connecting-ip': '10.0.0.2' } });
  assert.equal(r.status, 200, await r.clone().text());
  j.set(r);
  return j;
}

test('girişsiz API 401, site çerezi admin API açmaz', async () => {
  assert.equal((await req('/api/products')).status, 401);
  const j = await siteGirisi();
  assert.equal((await req('/api/products', { j })).status, 200);
  assert.equal((await req('/api/admin/settings', { j })).status, 401);
  assert.equal((await req('/api/admin/settings', { headers: { authorization: 'Bearer ' + SITE } })).status, 401);
});

test('admin oturumu: çerez HttpOnly/Secure/Strict, çıkışta iptal, CSRF engeli', async () => {
  const j = await siteGirisi();
  const r = await req('/api/admin/login', { j, method: 'POST', body: JSON.stringify({ password: ADMIN }), headers: { 'content-type': 'application/json', origin: B } });
  assert.equal(r.status, 200, await r.clone().text());
  const ck = (r.headers.getSetCookie() || []).join(';');
  assert.match(ck, /ucf_admin=[0-9a-f]{64}/);
  assert.match(ck, /HttpOnly/); assert.match(ck, /Secure/); assert.match(ck, /SameSite=Strict/); assert.match(ck, /Path=\/api\/admin/);
  j.set(r);
  assert.equal((await req('/api/admin/check', { j })).status, 200);
  // Başka siteden gelen değiştirici istek reddedilir
  const csrf = await req('/api/admin/settings', { j, method: 'PUT', body: '{}', headers: { 'content-type': 'application/json', origin: 'https://kotu.example' } });
  assert.equal(csrf.status, 403);
  const ok = await req('/api/admin/settings', { j, method: 'PUT', body: '{}', headers: { 'content-type': 'application/json', origin: B } });
  assert.equal(ok.status, 200);
  // Çıkış: oturum sunucuda silinir, eski çerez artık geçmez
  const eski = j.header;
  const out = await req('/api/admin/logout', { j, method: 'POST', headers: { origin: B } });
  assert.equal(out.status, 200);
  assert.equal((await fetch(B + '/api/admin/check', { headers: { cookie: eski } })).status, 401);
});

test('giriş denemesi sınırı: 10 yanlıştan sonra doğru şifre de beklemede, başka IP etkilenmez', async () => {
  const ip = { 'cf-connecting-ip': '10.9.9.9' };
  for (let i = 0; i < 10; i++) {
    const r = await req('/giris', { method: 'POST', body: new URLSearchParams({ sifre: 'yanlis' + i }), headers: ip });
    assert.equal(r.status, 401);
  }
  const kilit = await req('/giris', { method: 'POST', body: new URLSearchParams({ sifre: SITE }), headers: ip });
  assert.equal(kilit.status, 429);
  assert.ok(+kilit.headers.get('retry-after') > 0);
  const baska = await req('/giris', { method: 'POST', body: new URLSearchParams({ sifre: SITE }), headers: { 'cf-connecting-ip': '10.9.9.10' } });
  assert.equal(baska.status, 303);
}, { timeout: 60000 });

test('admin veri doğrulaması: geçersiz fiyat, para birimi, adres, kimlik ve tekrar', async () => {
  const H = { ...bearer, 'content-type': 'application/json' };
  const post = (path, body, method = 'POST') => req('/api/admin/' + path, { method, body: JSON.stringify(body), headers: H });
  const p = await (await post('products', { name: 'Test laptop', type: 'laptop' })).json();
  assert.ok(p.id > 0);
  assert.equal((await post('products', { name: 'X', type: 'uzay-gemisi' })).status, 400);
  assert.equal((await post('products', { name: 'X', type: 'laptop', ram_gb: 'abc' })).status, 400);
  assert.equal((await post('products', { name: 'X', type: 'laptop', image: 'javascript:alert(1)' })).status, 400);
  assert.equal((await post('products/999999', { name: 'Yok' }, 'PUT')).status, 404);
  assert.equal((await post('products/abc', { name: 'Yok' }, 'PUT')).status, 400);
  assert.equal((await req('/api/admin/products/999999', { method: 'DELETE', headers: bearer })).status, 404);
  const offer = (o) => post('offers', { product_id: p.id, retailer_id: 'technomarket', url: 'https://www.technomarket.bg/x-1', manual: true, ...o });
  for (const price of [-5, 0, 'NaN', 'Infinity', 1e9, '12abc']) assert.equal((await offer({ price })).status, 400, 'fiyat ' + price);
  assert.equal((await offer({ price: 100, currency: 'USD' })).status, 400);
  assert.equal((await offer({ price: 100, url: 'ftp://x.com/a' })).status, 400);
  assert.equal((await offer({ price: 100, url: 'https://kul:sifre@x.com/a' })).status, 400);
  assert.equal((await offer({ price: 100, product_id: 999999 })).status, 404);
  assert.equal((await offer({ price: 100, retailer_id: 'yok-magaza' })).status, 404);
  const ok = await offer({ price: 100 });
  assert.equal(ok.status, 200, await ok.clone().text());
  assert.equal((await offer({ price: 120 })).status, 409); // aynı mağaza + aynı bağlantı
  const { id } = await ok.json();
  // Aynı fiyatla güncelleme geçmişe satır eklemez, farklı fiyat ekler
  await post('offers/' + id, { url: 'https://www.technomarket.bg/x-1', price: 100, manual: true }, 'PUT');
  await post('offers/' + id, { url: 'https://www.technomarket.bg/x-1', price: 90, manual: true }, 'PUT');
  const h = await (await req('/api/admin/history/' + p.id, { headers: bearer })).json();
  assert.deepEqual(h.history.map((x) => x.price).sort(), [100, 90].sort());
  assert.equal((await post('offers/999999', { price: 1, manual: true }, 'PUT')).status, 404);
});

test('sunucu hatası: genel mesaj ve takip kodu, teknik ayrıntı yok', async () => {
  // Bozuk JSON gövdesi ve beklenmeyen tipler 500 değil, açıklamalı 400 döner
  const r = await req('/api/admin/offers', { method: 'POST', body: '"metin"', headers: { ...bearer, 'content-type': 'application/json' } });
  assert.equal(r.status, 400);
  const body = await r.text();
  assert.doesNotMatch(body, /SQLITE|D1_|stack|at \w+ \(/i);
});

test('güvenli HTTP başlıkları: CSP, nosniff, çerçeve yasağı, HSTS (giriş sayfası, API ve statik dosya)', async () => {
  const j = await siteGirisi();
  for (const [path, o] of [['/giris', {}], ['/api/products', { j }], ['/style.css', { j }], ['/', { j }]]) {
    const r = await req(path, o);
    const csp = r.headers.get('content-security-policy') || '';
    assert.match(csp, /script-src 'self'(;|$)/, path);
    assert.match(csp, /frame-ancestors 'none'/, path);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff', path);
    assert.equal(r.headers.get('x-frame-options'), 'DENY', path);
    assert.match(r.headers.get('strict-transport-security') || '', /max-age=\d+/, path);
    assert.ok(r.headers.get('referrer-policy'), path);
  }
});

test('admin ürün listesi: sayfalama, arama, ürün no ve süzgeç; inceleme listesi ve fiyat onay/ret', async () => {
  const H = { ...bearer, 'content-type': 'application/json' };
  const post = (path, body, method = 'POST') => req('/api/admin/' + path, { method, body: JSON.stringify(body), headers: H });
  const get = async (path) => (await req('/api/admin/' + path, { headers: bearer })).json();
  // 55 ürün: ilk sayfa 50, ikinci sayfa kalan
  for (let i = 0; i < 55; i++) await post('products', { name: `Sayfa testi ürün ${i}`, type: 'desktop', brand: i === 7 ? 'Zebramarka' : 'Marka' });
  const p1 = await get('products?q=' + encodeURIComponent('Sayfa testi'));
  assert.equal(p1.total, 55); assert.equal(p1.items.length, 50); assert.equal(p1.pages, 2);
  const p2 = await get('products?q=' + encodeURIComponent('Sayfa testi') + '&sayfa=2');
  assert.equal(p2.items.length, 5); assert.equal(p2.page, 2);
  assert.equal((await get('products?q=Zebramarka')).total, 1);
  const tek = await get('products?q=%23' + p1.items[0].id);
  assert.equal(tek.total, 1); assert.equal(tek.items[0].id, p1.items[0].id);
  assert.equal((await get('products?q=' + encodeURIComponent('%_yok'))).total, 0); // LIKE joker karakterleri kaçırılır
  assert.ok((await get('products?sayfa=999')).page >= 1); // aralık dışı sayfa sınırlanır
  assert.ok(Number.isInteger((await get('products')).stats.products));

  // Katalog taraması: fiyat 1000 € → 3000 € sıçrar, bekletilir (sitede eski fiyat kalır)
  const item = (price) => ({ retailer_id: 'jarcomputers', url: 'https://www.jarcomputers.com/inceleme-test', name: 'İnceleme Test Laptop 16GB 512GB', type: 'laptop', price, currency: 'EUR', in_stock: true });
  assert.equal((await post('catalog', { items: [item(1000)] })).status, 200);
  await post('catalog', { items: [item(3000)] });
  let rv = await get('review');
  let o = rv.find((x) => x.url === item(0).url);
  assert.ok(o, 'bekleyen fiyat inceleme listesinde'); assert.equal(o.kind, 'bekliyor'); assert.equal(o.pending_price, 3000);
  // Reddet: bekleyen değişim atılır, fiyat 1000 kalır
  assert.equal((await post(`offers/${o.id}/reddet`, {})).status, 200);
  assert.ok(!(await get('review')).some((x) => x.id === o.id && x.kind === 'bekliyor'));
  assert.equal((await post(`offers/${o.id}/reddet`, {})).status, 409); // işlenmiş kayıt
  // Yeniden sıçrama ve onay: yeni fiyat kabul edilir, geçmişe yazılır
  await post('catalog', { items: [item(3000)] });
  o = (await get('review')).find((x) => x.id === o.id);
  assert.equal(o.kind, 'bekliyor');
  assert.equal((await post(`offers/${o.id}/onayla`, {})).status, 200);
  const h = await get('history/' + o.product_id);
  assert.equal(h.offers[0].price, 3000);
  assert.ok(h.history.some((x) => x.price === 3000));
  assert.equal((await post(`offers/${o.id}/onayla`, {})).status, 409); // zaten onaylı
  // Sitede en ucuz fiyat onaylanan yeni fiyattan hesaplanır
  const site = await siteGirisi();
  const pub = await (await req('/api/products/' + o.product_id, { j: site })).json();
  assert.equal(pub.product.best.price_eur, 3000);
  assert.equal((await post('offers/999999/onayla', {})).status, 404);
  assert.equal((await post('offers/abc/onayla', {})).status, 400);
  // Yanlış eşleşmeyi ayır: ikinci mağazanın teklifi yeni ürüne taşınır, ürünler birbirinden ayrılır
  const prod = await (await post('products', { name: 'Ayırma testi', type: 'laptop' })).json();
  const a = await (await post('offers', { product_id: prod.id, retailer_id: 'technomarket', url: 'https://www.technomarket.bg/ayir-1', price: 500, manual: true })).json();
  const b = await (await post('offers', { product_id: prod.id, retailer_id: 'jarcomputers', url: 'https://www.jarcomputers.com/ayir-2', price: 900, manual: true })).json();
  const sp = await post(`offers/${b.id}/ayir`, {});
  assert.equal(sp.status, 200, await sp.clone().text());
  const { product_id: yeni } = await sp.json();
  assert.notEqual(yeni, prod.id);
  assert.equal((await get('history/' + prod.id)).offers.length, 1);
  assert.equal((await get('history/' + yeni)).offers[0].id, b.id);
  assert.equal((await post(`offers/${a.id}/ayir`, {})).status, 400); // tek bağlantılı ürün ayrılmaz
  const m = (await get('match')).find((x) => x.id === yeni);
  assert.equal(m.split_from, prod.id);
  // Yetkisiz kullanıcı inceleme işlemi yapamaz
  assert.equal((await req('/api/admin/review')).status, 401);
  assert.equal((await req(`/api/admin/offers/${o.id}/onayla`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })).status, 401);
}, { timeout: 120000 });
