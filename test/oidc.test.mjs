// GitHub Actions kimliği (OIDC): yalnızca bu deponun scrape.yml iş akışından gelen, GitHub imzalı belirteç geçer
import test from 'node:test';
import assert from 'node:assert/strict';
import { githubActionsMi, claimsGecerli, jwtMi } from '../src/oidc.js';

const b64 = (b) => Buffer.from(b).toString('base64url');
const now = Date.now();
const iyi = {
  iss: 'https://token.actions.githubusercontent.com', aud: 'ucfiyat', repository: 'volkandoyran/internet-sitesi',
  workflow_ref: 'volkandoyran/internet-sitesi/.github/workflows/scrape.yml@refs/heads/main',
  exp: Math.floor(now / 1000) + 300, nbf: Math.floor(now / 1000) - 5,
};

test('belirteç alanları', () => {
  assert.ok(claimsGecerli(iyi, {}, now));
  assert.ok(!claimsGecerli({ ...iyi, repository: 'baskasi/internet-sitesi' }, {}, now));
  assert.ok(!claimsGecerli({ ...iyi, workflow_ref: 'volkandoyran/internet-sitesi/.github/workflows/baska.yml@refs/heads/main' }, {}, now));
  assert.ok(!claimsGecerli({ ...iyi, aud: 'https://github.com/volkandoyran' }, {}, now));
  assert.ok(!claimsGecerli({ ...iyi, iss: 'https://kotu.example' }, {}, now));
  assert.ok(!claimsGecerli({ ...iyi, exp: Math.floor(now / 1000) - 600 }, {}, now));
  assert.ok(jwtMi('eyJhbGciOiJSUzI1NiJ9.eyJ4IjoxfQ.abc'));
  assert.ok(!jwtMi('duz-sifre'));
});

test('imza doğrulama (GitHub anahtarları sahte sunucudan)', async () => {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'k1' };
  const sign = async (claims, kid = 'k1', key = privateKey) => {
    const h = b64(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })), p = b64(JSON.stringify(claims));
    const s = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(h + '.' + p));
    return `${h}.${p}.${b64(s)}`;
  };
  const orig = globalThis.fetch;
  globalThis.fetch = async (u) => { assert.match(String(u), /token\.actions\.githubusercontent\.com\/\.well-known\/jwks/); return new Response(JSON.stringify({ keys: [jwk] })); };
  try {
    assert.equal(await githubActionsMi(await sign(iyi), {}), true);
    assert.equal(await githubActionsMi(await sign({ ...iyi, repository: 'x/y' }), {}), false);
    const other = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign']);
    assert.equal(await githubActionsMi(await sign(iyi, 'k1', other.privateKey), {}), false); // başka anahtarla imzalı
    assert.equal(await githubActionsMi(await sign(iyi, 'bilinmeyen'), {}), false);
    const t = await sign(iyi); const [h, , s] = t.split('.');
    assert.equal(await githubActionsMi(`${h}.${b64(JSON.stringify({ ...iyi, repository: 'volkandoyran/internet-sitesi', aud: 'ucfiyat', x: 1 }))}.${s}`, {}), false); // değiştirilmiş içerik
  } finally { globalThis.fetch = orig; }
});
