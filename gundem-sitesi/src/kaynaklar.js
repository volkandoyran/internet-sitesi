// Gündemin toplandığı Türkçe haber RSS kaynakları.
// Yeni kaynak eklemek için listeye { id, ad, url } satırı yazmak yeterli.
// Durumları (son çekim, hata, haber sayısı) /kaynaklar sayfasında görünür.
export const KAYNAKLAR = [
  { id: 'trt', ad: 'TRT Haber', url: 'https://www.trthaber.com/sondakika_articles.rss' },
  { id: 'aa', ad: 'Anadolu Ajansı', url: 'https://www.aa.com.tr/tr/rss/default?cat=guncel' },
  { id: 'ntv', ad: 'NTV', url: 'https://www.ntv.com.tr/gundem.rss' },
  { id: 'hurriyet', ad: 'Hürriyet', url: 'https://www.hurriyet.com.tr/rss/gundem' },
  { id: 'milliyet', ad: 'Milliyet', url: 'https://www.milliyet.com.tr/rss/rssnew/gundemrss.xml' },
  { id: 'sabah', ad: 'Sabah', url: 'https://www.sabah.com.tr/rss/gundem.xml' },
  { id: 'haberturk', ad: 'Habertürk', url: 'https://www.haberturk.com/rss' },
  { id: 'cumhuriyet', ad: 'Cumhuriyet', url: 'https://www.cumhuriyet.com.tr/rss/son_dakika.xml' },
  { id: 'sozcu', ad: 'Sözcü', url: 'https://www.sozcu.com.tr/feeds-rss-category-gundem' },
  { id: 'bbc', ad: 'BBC Türkçe', url: 'https://feeds.bbci.co.uk/turkce/rss.xml' },
  { id: 'dw', ad: 'DW Türkçe', url: 'https://rss.dw.com/rdf/rss-tur-all' },
  { id: 'euronews', ad: 'Euronews Türkçe', url: 'https://tr.euronews.com/rss' },
];
