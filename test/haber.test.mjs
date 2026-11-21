import test from 'node:test';
import assert from 'node:assert/strict';
import { rssAyristir, duzMetin, xmlCoz } from '../haber-botu/src/rss.js';
import { imza, benzerlik, eslesen, urlSade, ESIK } from '../haber-botu/src/ayikla.js';
import { sablonMetin, temizle, paylasimMetni, GOVDE_SINIR } from '../haber-botu/src/metin.js';

test('RSS 2.0: CDATA, kaçışlı HTML ve tarih', () => {
  const xml = `<rss><channel><title>Kanal</title><item><title><![CDATA[İstanbul'da sağanak &amp; fırtına]]></title>
  <link>https://ornek.com/a?utm_source=rss</link><description>&lt;p&gt;Meteoroloji uyardı.&lt;/p&gt;</description>
  <pubDate>Sat, 21 Nov 2026 18:00:00 +0300</pubDate></item><item><title>Bağlantısız</title></item></channel></rss>`;
  const [h, ...diger] = rssAyristir(xml);
  assert.equal(diger.length, 0);
  assert.equal(h.baslik, "İstanbul'da sağanak & fırtına");
  assert.equal(h.ozet, 'Meteoroloji uyardı.');
  assert.equal(h.yayin, '2026-11-21T15:00:00.000Z');
});

test('Atom ve RDF', () => {
  const atom = `<feed><entry><title>Başlık A</title><link rel="alternate" href="https://x.com/a"/><updated>2026-11-21T10:00:00Z</updated><summary>Özet</summary></entry></feed>`;
  assert.equal(rssAyristir(atom)[0].url, 'https://x.com/a');
  const rdf = `<rdf:RDF><item rdf:about="https://dw.com/1"><title>DW haber</title><link>https://dw.com/1</link><dc:date>2026-11-21T10:00:00Z</dc:date></item></rdf:RDF>`;
  assert.equal(rssAyristir(rdf)[0].yayin, '2026-11-21T10:00:00.000Z');
});

test('ISO-8859-9 akışı doğru çözülür', () => {
  const bytes = new Uint8Array([...Buffer.from('<?xml version="1.0" encoding="ISO-8859-9"?><t>'), 0xfe, 0xf0, 0xdd, ...Buffer.from('</t>')]);
  assert.match(xmlCoz(bytes.buffer), /şğİ/);
});

test('aynı olay farklı kaynakta: eşleşir', () => {
  const a = imza("Meteoroloji'den İstanbul için sarı kodlu uyarı");
  const b = imza('Meteoroloji İstanbul için sarı kodlu uyarı verdi: sağanak geliyor');
  assert.ok(benzerlik(a, b) >= ESIK, String(benzerlik(a, b)));
});

test('farklı olaylar: eşleşmez', () => {
  const a = imza('Merkez Bankası faizi yüzde 35 seviyesinde sabit tuttu');
  const b = imza('Galatasaray deplasmanda Fenerbahçe ile berabere kaldı');
  const c = imza("İstanbul'da trafik kazası: 2 yaralı");
  const d = imza("İzmir'de deprem: AFAD açıklama yaptı");
  assert.ok(benzerlik(a, b) < ESIK);
  assert.ok(benzerlik(c, d) < ESIK);
  assert.equal(eslesen(a, [{ imza: b }, { imza: c }]), null);
});

test('URL sadeleştirme', () => {
  assert.equal(urlSade('https://www.ornek.com/haber/1/?utm_source=x&id=5#yorum'), 'ornek.com/haber/1?id=5');
});

test('şablon metin sınırı aşmaz ve özetten cümle ekler', () => {
  const m = sablonMetin({ baslik: 'Kısa başlık', ozet: 'Bu ilk cümle. Bu ikinci cümle.' });
  assert.equal(m, 'Kısa başlık. Bu ilk cümle.');
  const uzun = sablonMetin({ baslik: 'kelime '.repeat(80), ozet: '' });
  assert.ok(uzun.length <= GOVDE_SINIR);
});

test('model çıktısından bağlantı ve kaynak satırı temizlenir', () => {
  assert.equal(temizle('"Uyarı yapıldı. https://x.com #Hava"\nKaynak: X'), 'Uyarı yapıldı. #Hava');
});

test('paylaşım metni kaynağı her zaman içerir', () => {
  const m = paylasimMetni({ metin: 'Gövde', kaynaklar: [{ ad: 'TRT Haber', url: 'https://trt/1' }, { ad: 'NTV', url: 'https://ntv/1' }] });
  assert.equal(m, 'Gövde\n\nKaynak: TRT Haber (+1 kaynak)\nhttps://trt/1');
  assert.ok(duzMetin('<b>a</b>&nbsp;b') === 'a b');
});
