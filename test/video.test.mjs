import test from 'node:test';
import assert from 'node:assert/strict';
import { videoyaUygun, hassasMi, seslendirme, videoAciklamasi, videoBasligi, kaynakAdlari } from '../gundem-sitesi/src/video.js';

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
