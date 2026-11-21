import test from 'node:test';
import assert from 'node:assert/strict';
import { videoyaUygun, hassasMi, yasMi, YAS_SOZU, seslendirme, videoAciklamasi, videoBasligi, kaynakAdlari } from '../gundem-sitesi/src/video.js';

const haber = (o = {}) => ({
  baslik: "İstanbul'da hafta sonu sağanak yağış bekleniyor",
  metin: 'Meteoroloji, cumartesi başlayacak yağışın pazar sabahına kadar süreceğini açıkladı. #istanbul #hava',
  kaynaklar: JSON.stringify([{ id: 'aa', ad: 'Anadolu Ajansı', url: 'https://aa.com.tr/x' }, { id: 'ntv', ad: 'NTV', url: 'https://ntv.com.tr/y' }]),
  ...o,
});

test('iki kaynaklı, hassas olmayan haber videoya uygun', () => {
  assert.equal(videoyaUygun(haber()), true);
});

test('tek kaynaklı haber videoya çevrilmez', () => {
  assert.equal(videoyaUygun(haber({ kaynaklar: JSON.stringify([{ id: 'aa', ad: 'AA' }]) })), false);
  // aynı kaynağın iki haberi de tek kaynak sayılır
  assert.equal(videoyaUygun(haber({ kaynaklar: JSON.stringify([{ id: 'a', ad: 'AA' }, { id: 'b', ad: 'AA' }]) })), false);
});

test('siyaset, sağlık ve suç haberleri videoya çevrilmez', () => {
  assert.equal(hassasMi(haber({ baslik: 'Bakanlıktan yeni açıklama' })), true);
  assert.equal(hassasMi(haber({ baslik: 'Şüpheli gözaltına alındı' })), true);
  assert.equal(hassasMi(haber({ baslik: 'Yeni grip aşısı için uyarı' })), true);
  assert.equal(hassasMi(haber({ baslik: 'Aşırı yağış uyarısı' })), false);
  assert.equal(hassasMi(haber({ baslik: 'Okullar yarın tatil' })), false);
});

test('seslendirme: başlık, metin, kaynak adı; hashtag ve bağlantı yok', () => {
  const s = seslendirme(haber());
  assert.match(s, /^İstanbul'da hafta sonu sağanak yağış bekleniyor\. Meteoroloji/);
  assert.match(s, /Kaynak: Anadolu Ajansı, NTV\.$/);
  assert.doesNotMatch(s, /#|https?:/);
});

test('açıklama kaynak adını ve yapay zekâ notunu içerir, bağlantı içermez', () => {
  const a = videoAciklamasi(haber());
  assert.match(a, /Kaynak: Anadolu Ajansı, NTV/);
  assert.match(a, /yapay zekâ/);
  assert.match(a, /#haber #gündem #istanbul #hava/);
  assert.doesNotMatch(a, /https?:/);
});

test('video başlığı 100 karakteri geçmez', () => {
  const b = videoBasligi(haber({ baslik: 'Çok uzun '.repeat(20) }));
  assert.ok(b.length <= 100);
  assert.match(b, /#Shorts$/);
  assert.deepEqual(kaynakAdlari(haber()), ['Anadolu Ajansı', 'NTV']);
});

import { githubJetonuDogru, OIDC_KITLE } from '../gundem-sitesi/src/video.js';

const b64u = (b) => Buffer.from(b).toString('base64url');
async function jetonUret(ozel, degisen = {}, kid = 'k1') {
  const simdi = Math.floor(Date.now() / 1000);
  const yuk = {
    iss: 'https://token.actions.githubusercontent.com', aud: OIDC_KITLE, repository: 'volkandoyran/internet-sitesi',
    ref: 'refs/heads/main', workflow_ref: 'volkandoyran/internet-sitesi/.github/workflows/gundem-video.yml@refs/heads/main',
    exp: simdi + 300, nbf: simdi - 5, ...degisen,
  };
  const govde = `${b64u(JSON.stringify({ alg: 'RS256', kid }))}.${b64u(JSON.stringify(yuk))}`;
  const imza = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', ozel, new TextEncoder().encode(govde));
  return `${govde}.${b64u(new Uint8Array(imza))}`;
}

test('GitHub OIDC jetonu: yalnızca bu deponun main dalındaki video iş akışı kabul edilir', async () => {
  const cift = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', cift.publicKey)), kid: 'k1' };
  const secenek = { anahtarlar: async () => [jwk] };
  assert.equal(await githubJetonuDogru({}, await jetonUret(cift.privateKey), secenek), true);
  assert.equal(await githubJetonuDogru({}, await jetonUret(cift.privateKey, { repository: 'baskasi/depo' }), secenek), false);
  assert.equal(await githubJetonuDogru({}, await jetonUret(cift.privateKey, { ref: 'refs/heads/dal' }), secenek), false);
  assert.equal(await githubJetonuDogru({}, await jetonUret(cift.privateKey, { aud: 'baska' }), secenek), false);
  assert.equal(await githubJetonuDogru({}, await jetonUret(cift.privateKey, { workflow_ref: 'volkandoyran/internet-sitesi/.github/workflows/scrape.yml@refs/heads/main' }), secenek), false);
  assert.equal(await githubJetonuDogru({}, await jetonUret(cift.privateKey, { exp: 1 }), secenek), false);
  const baska = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  assert.equal(await githubJetonuDogru({}, await jetonUret(baska.privateKey), secenek), false, 'yanlış imza');
  assert.equal(await githubJetonuDogru({}, 'bozuk.jeton', secenek), false);
});

test('görsel (jpg) dosyası doğru türle sunulur, yetkisiz sıra isteği reddedilir', async () => {
  const { videoIstek } = await import('../gundem-sitesi/src/video.js');
  const kv = new Map([['7.jpg', new Uint8Array([0xff, 0xd8, 0xff]).buffer]]);
  const env = { VIDEO: { get: async (k) => kv.get(k) ?? null } };
  const r = await videoIstek(new Request('https://x/video/7.jpg'), env, '/video/7.jpg');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/jpeg');
  assert.equal((await videoIstek(new Request('https://x/video/7.mp4'), env, '/video/7.mp4')).status, 404);
  const s = await videoIstek(new Request('https://x/api/video/sira?tur=foto', { method: 'POST' }), env, '/api/video/sira');
  assert.equal(s.status, 401);
});

test('şehit haberi yas tonunda: taziye cümlesi, hashtag yok, terör kelimesi düşürmez', () => {
  const h = haber({ baslik: "Hakkari'de terör saldırısı: 2 asker şehit oldu", metin: 'Milli Savunma Bakanlığı acı haberi duyurdu. #şehit #hakkari' });
  assert.ok(yasMi(h));
  assert.equal(hassasMi(h), false);
  assert.ok(videoyaUygun(h));
  assert.ok(seslendirme(h).includes(YAS_SOZU));
  const a = videoAciklamasi(h);
  assert.ok(a.includes(YAS_SOZU));
  assert.ok(!a.includes('#'));
  assert.ok(!videoBasligi(h).includes('#Shorts'));
  assert.ok(hassasMi(haber({ baslik: 'Şehit cenazesinde Erdoğan konuştu' })), 'siyaset yine düşer');
  assert.equal(yasMi(haber()), false);
});
