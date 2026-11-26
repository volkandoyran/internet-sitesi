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
