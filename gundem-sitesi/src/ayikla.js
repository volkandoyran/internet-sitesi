// Tekrar ayıklama: aynı olayı anlatan haberleri farklı kaynaklardan gelse de tek haberde toplar.
// Başlıklar küçük harfe, eksiz köklere ve anlamlı kelime kümesine indirilir; kümeler yeterince
// örtüşüyorsa haber aynı sayılır.

const DURAK = new Set(`ve ile da de ki bu şu o bir için gibi daha çok en mi mı mu mü ama ya veya
ise ne neden nasıl olan oldu olarak sonra önce kadar göre den dan ten tan yeni son dakika
haber haberi açıklama açıkladı dedi etti yaptı var yok tüm her hem ilk iki üç`.split(/\s+/));

// Türkçe büyük/küçük harf dönüşümü + aksan sadeleştirme (ş→s gibi) ile karşılaştırma anahtarı
export function sadelestir(s) {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/[âà]/g, 'a').replace(/[îì]/g, 'i').replace(/[ûù]/g, 'u')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/['’`]\p{L}*/gu, '') // kesme işaretinden sonraki ekleri at: "İstanbul'da" → "istanbul"
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const DURAK_SADE = new Set([...DURAK].map(sadelestir));

// Başlıktan kelime kümesi; kelimeler ilk 5 harfle kısaltılır ki ekler (istanbul/istanbulda) eşleşsin
export function imza(baslik) {
  const k = sadelestir(baslik).split(' ').filter((w) => w.length > 1 && !DURAK_SADE.has(w));
  return [...new Set(k.map((w) => (/^\d+$/.test(w) ? w : w.slice(0, 5))))];
}

export function benzerlik(a, b) {
  if (!a.length || !b.length) return 0;
  const B = new Set(b);
  const ortak = a.filter((w) => B.has(w)).length;
  const jaccard = ortak / (a.length + b.length - ortak);
  const kapsama = ortak / Math.min(a.length, b.length);
  // Kısa başlıklarda kapsama yanıltıcı olabilir; en az 3 ortak kelime iste
  return ortak >= 3 ? Math.max(jaccard, kapsama * 0.85) : jaccard;
}

export const ESIK = 0.55;

// Yeni haber için mevcut haberler arasında en benzerini bulur (eşik altındaysa null)
export function eslesen(imzaYeni, mevcut) {
  let en = null;
  let puan = ESIK;
  for (const h of mevcut) {
    const p = benzerlik(imzaYeni, h.imza);
    if (p >= puan) { puan = p; en = h; }
  }
  return en;
}

// URL'yi karşılaştırma için sadeleştirir (izleme parametreleri, # ve sondaki / atılır)
export function urlSade(u) {
  try {
    const x = new URL(u);
    x.hash = '';
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$|from$)/i.test(k)) x.searchParams.delete(k);
    return (x.host.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '') + x.search).toLowerCase();
  } catch {
    return u;
  }
}
