import test from 'node:test';
import assert from 'node:assert/strict';
import { rssAyristir, duzMetin, xmlCoz } from '../gundem-sitesi/src/rss.js';
import { imza, benzerlik, eslesen, urlSade, ESIK } from '../gundem-sitesi/src/ayikla.js';
import { sablonMetin, temizle, paylasimMetni, ceviriAyir, GOVDE_SINIR } from '../gundem-sitesi/src/metin.js';

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
  assert.equal(m, 'Gövde\n\nKaynak: TRT Haber (+1 kaynak)');
  assert.equal(paylasimMetni({ metin: 'Gövde', kaynaklar: [{ ad: 'BBC News', url: 'https://bbc/1', dil: 'en' }] }), 'Gövde\n\nKaynak: BBC News (Türkçe çeviri)');
  assert.ok(duzMetin('<b>a</b>&nbsp;b') === 'a b');
});

// --- Herkese açık site ---
import { metniAyir, goreli, haberKarti, detayGovde } from '../gundem-sitesi/src/sayfa.js';
import { haberiCoz } from '../gundem-sitesi/src/veri.js';

test('site: hashtag ayırma ve kaçış', () => {
  assert.deepEqual(metniAyir('Meclis yeni yasayı kabul etti. #meclis #yasa'), { govde: 'Meclis yeni yasayı kabul etti.', etiketler: ['#meclis', '#yasa'] });
  const h = haberiCoz({ id: 7, baslik: '<b>Son dakika</b>', metin: 'Özet', kaynaklar: JSON.stringify([{ ad: 'A', url: 'https://a.com/x' }, { ad: 'Kötü', url: 'javascript:alert(1)' }]), kaynak_sayisi: 2, ilk_gorulme: '2026-11-21T10:00:00Z' });
  assert.equal(h.kaynaklar.length, 1);
  const html = haberKarti(h, Date.parse('2026-11-21T10:30:00Z'));
  assert.match(html, /&lt;b&gt;Son dakika/);
  assert.match(html, /30 dk önce/);
  assert.match(html, /2 kaynakta/);
  assert.doesNotMatch(detayGovde(h), /javascript:/);
});

test('site: göreli zaman', () => {
  const s = Date.parse('2026-11-21T12:00:00Z');
  assert.equal(goreli('2026-11-21T11:59:50Z', s), 'az önce');
  assert.equal(goreli('2026-11-21T09:00:00Z', s), '3 sa önce');
});

test('çeviri çıktısı: başlık ve metin ayrılır, bozuk çıktı reddedilir', () => {
  const c = ceviriAyir('BAŞLIK: AB liderleri iklim zirvesinde yeni hedefte uzlaştı.\nMETİN: Avrupa Birliği liderleri, 2040 için emisyonları yüzde 90 azaltma hedefinde anlaştı. #AB #iklim');
  assert.equal(c.baslik, 'AB liderleri iklim zirvesinde yeni hedefte uzlaştı');
  assert.match(c.metin, /^Avrupa Birliği liderleri.*#iklim$/);
  assert.throws(() => ceviriAyir('EU leaders agree on climate target'));
});

test('site: yabancı haber rozeti ve bağlantısız kaynak', () => {
  const h = haberiCoz({ id: 3, baslik: 'Başlık', metin: 'Metin', kaynaklar: JSON.stringify([{ ad: 'BBC News', url: 'https://bbc.co.uk/x', dil: 'en' }]), kaynak_sayisi: 1, ilk_gorulme: '2026-11-21T10:00:00Z' });
  const html = haberKarti(h) + detayGovde(h);
  assert.match(html, /Yabancı basından çeviri/);
  assert.doesNotMatch(html, /bbc\.co\.uk/);
});

// --- Kapak ---
import { kapakSvg, satirla } from '../gundem-sitesi/src/kapak.js';

test('kapak: başlık satırlara bölünür, kaçış yapılır, kaynak adı yazılır', () => {
  assert.deepEqual(satirla('bir iki üç dört beş', 8, 4), ['bir iki', 'üç dört', 'beş']);
  assert.equal(satirla('a b c d e f g h', 1, 2).length, 2);
  const svg = kapakSvg({ id: 5, baslik: 'Merkez Bankası <faiz> kararını açıkladı & piyasalar', kaynaklar: [{ ad: 'TRT Haber' }], kaynak_sayisi: 1 });
  assert.match(svg, /^<svg/);
  assert.match(svg, /&lt;faiz&gt;/);
  assert.match(svg, /Kaynak: TRT Haber/);
  assert.match(kapakSvg({ id: 1, baslik: 'X', kaynaklar: [], yabanci: true }), /ÇEVİRİ/);
});

test('site: kartlarda ve haber sayfasında kapak var', () => {
  const h = haberiCoz({ id: 9, baslik: 'Başlık', metin: 'Metin', kaynaklar: '[]', kaynak_sayisi: 1, ilk_gorulme: '2026-11-21T10:00:00Z' });
  assert.match(haberKarti(h), /\/gorsel\/9"/);
  assert.match(detayGovde(h), /\/gorsel\/9"/);
});

// --- Görsel ---
import { adUyar, jsonAyikla, wikiFoto } from '../gundem-sitesi/src/gorsel.js';

test('görsel: kişi adı eşleştirme ve JSON ayıklama', () => {
  assert.ok(adUyar('Recep Tayyip Erdoğan', 'Recep Tayyip Erdoğan'));
  assert.ok(adUyar('Volodimir Zelenskiy', 'Volodymyr Zelenskyy') === false);
  assert.ok(adUyar('Emmanuel Macron', 'Emmanuel Macron'));
  assert.equal(adUyar('Macron', 'Emmanuel Macron'), false);
  assert.equal(adUyar('Ali Koç', 'Koç Holding'), false);
  assert.deepEqual(jsonAyikla('Yanıt: {"kisi": "Ali Veli", "sahne": "x"} bitti'), { kisi: 'Ali Veli', sahne: 'x' });
  assert.deepEqual(jsonAyikla('json yok'), {});
  assert.deepEqual(jsonAyikla({ kisi: 'Ali Veli', sahne: 'x' }), { kisi: 'Ali Veli', sahne: 'x' });
});

test('görsel: Wikipedia fotoğrafı yalnızca serbest lisans ve ad uyuşursa alınır', async () => {
  const eski = globalThis.fetch;
  const istekler = [];
  globalThis.fetch = async (url) => {
    istekler.push(String(url));
    if (String(url).includes('wikipedia.org')) return new Response(JSON.stringify({ query: { pages: { 1: { title: 'Emmanuel Macron', pageimage: 'Macron.jpg' } } } }));
    return new Response(JSON.stringify({ query: { pages: { '-1': { imageinfo: [{ thumburl: 'https://upload.wikimedia.org/m.jpg', extmetadata: { LicenseShortName: { value: 'CC BY 4.0' }, Artist: { value: '<a href="x">Foto Grafçı</a>' } } }] } } } }));
  };
  try {
    const f = await wikiFoto('Emmanuel Macron');
    assert.equal(f.url, 'https://upload.wikimedia.org/m.jpg');
    assert.match(f.atif, /Foto Grafçı \/ CC BY 4\.0, Wikimedia Commons/);
    assert.match(istekler[0], /pilicense=free/);
    assert.equal(await wikiFoto('Ali Veli'), null);
  } finally { globalThis.fetch = eski; }
});

// --- Şehit haberleri ---
import { sehitMi, BASSAGLIGI, aiMetin } from '../gundem-sitesi/src/metin.js';

test('şehit haberi: yaslı şablon, başsağlığı, koyu kapak, rozet', async () => {
  const h = { id: 4, baslik: 'Pençe-Kilit bölgesinde 2 asker şehit oldu', ozet: 'MSB açıkladı.' };
  assert.ok(sehitMi(h));
  assert.equal(sehitMi({ baslik: 'Merkez Bankası faizi sabit tuttu' }), false);
  const s = sablonMetin(h);
  assert.match(s, /^Acı haber: Pençe-Kilit/);
  assert.ok(s.endsWith(BASSAGLIGI));
  const env = { AI: { run: async (_m, b) => { assert.match(b.messages[0].content, /şehit haberi/); return { response: 'Kahreden haber geldi; iki kahraman askerimiz şehit oldu. ' + BASSAGLIGI + ' #acı #asker' }; } } };
  const m = await aiMetin(env, h);
  assert.ok(m.endsWith(`${BASSAGLIGI} #şehit`));
  assert.equal(m.split(BASSAGLIGI).length, 2);
  const env2 = { AI: { run: async () => ({ response: 'Askerimiz şehit oldu. Şehidimize Allah\'tan rahmet, ailesine ve milletimize başsağlığı diliyoruz Şehidimize Allah\'tan rahmet, ailesine başsağlığı.' }) } };
  const m2 = await aiMetin(env2, h);
  assert.equal(m2, `Askerimiz şehit oldu. ${BASSAGLIGI} #şehit`);
  const svg = kapakSvg({ ...h, kaynaklar: [] });
  assert.match(svg, /ACI HABER/);
  assert.match(svg, /#0b0b0c/);
  const k = haberiCoz({ id: 4, baslik: h.baslik, metin: s, kaynaklar: '[]', kaynak_sayisi: 1, ilk_gorulme: '2026-11-21T10:00:00Z' });
  assert.match(haberKarti(k), /Acı haber<\/span>/);
});

test('görsel çalışması: wiki, yapay zekâ, bekle ve şehit ayrımı; günlük sınır', async () => {
  const { gorselleriDoldur } = await import('../gundem-sitesi/src/gorsel.js');
  const yazilan = [];
  const haberlerListe = [
    { id: 1, baslik: 'Macron Paris’te açıklama yaptı', metin: 'x' },
    { id: 2, baslik: 'İstanbul’da sağanak', metin: 'x' },
    { id: 3, baslik: 'Trafik yoğunluğu', metin: 'x' },
    { id: 4, baslik: '2 asker şehit oldu', metin: 'x' },
  ];
  const env = {
    GORSEL_AI_LIMIT: '1',
    GORSEL: { put: async () => {} },
    DB: { prepare: (sql) => ({
      bind: (...a) => ({
        all: async () => ({ results: haberlerListe }),
        run: async () => { yazilan.push(a); },
      }),
      first: async () => ({ n: 0 }),
    }) },
    AI: { run: async (model) => model.includes('flux') ? { image: btoa('jpg') }
      : { response: '{"kisi": "", "sahne": "rainy street"}' } },
  };
  const eski = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('ağ yok'); };
  try {
    env.AI.run = async (model, b) => {
      if (model.includes('flux')) return { image: btoa('jpg') };
      return { response: b.messages[1].content.includes('Macron') ? '{"kisi":"Emmanuel Macron","sahne":"x"}' : '{"kisi":"","sahne":"rain"}' };
    };
    const r = await gorselleriDoldur(env, {});
    // 1: Wikipedia ağ hatası → AI görseli; 2-3: AI hakkı bitti → bekle; 4: şehit → yok
    assert.deepEqual(yazilan.map((x) => [x[0], x[1]]), [[1, 'ai'], [2, 'bekle'], [3, 'bekle'], [4, 'yok']]);
    assert.equal(r.hatalar.length, 1);
  } finally { globalThis.fetch = eski; }
});

test('SEO: Search Console etiketi, Open Graph ve NewsArticle', async () => {
  const { kabuk: kb, haberSemasi } = await import('../gundem-sitesi/src/sayfa.js');
  const h = haberiCoz({ id: 5, baslik: 'Başlık </script>', metin: 'Metin', kaynaklar: JSON.stringify([{ ad: 'TRT Haber', url: 'https://trt/1' }]), kaynak_sayisi: 1, ilk_gorulme: '2026-11-21T10:00:00Z' });
  const html = await kb({ GOOGLE_DOGRULAMA: 'abc123' }, { baslik: h.baslik, govde: '', kanonik: 'https://s/haber/5', makale: haberSemasi({}, 'https://s', h, false) }).text();
  assert.match(html, /<meta name="google-site-verification" content="abc123">/);
  assert.match(html, /og:type" content="article"/);
  assert.match(html, /"@type":"NewsArticle"/);
  assert.doesNotMatch(html, /Başlık <\/script>/);
  assert.match(html, /"name":"TRT Haber"/);
});

test('tüm haberler listesi: gün başlıkları, kaynak ve etiket', async () => {
  const { tumListe } = await import('../gundem-sitesi/src/sayfa.js');
  const k = (id, zaman, ad, dil) => haberiCoz({ id, baslik: `Haber ${id}`, metin: 'm', kaynaklar: JSON.stringify([{ ad, url: 'https://x/' + id, ...(dil ? { dil } : {}) }]), kaynak_sayisi: 1, ilk_gorulme: zaman });
  const html = tumListe([k(3, '2026-11-22T09:00:00Z', 'TRT Haber'), k(2, '2026-11-22T08:00:00Z', 'BBC News', 'en'), k(1, '2026-11-21T08:00:00Z', 'NTV')]);
  assert.equal((html.match(/class="gun"/g) || []).length, 2);
  assert.match(html, /href="\/haber\/2">Haber 2<\/a>.*BBC News · Dünya/s);
  assert.match(tumListe([]), /Bu seçimde haber yok/);
});
