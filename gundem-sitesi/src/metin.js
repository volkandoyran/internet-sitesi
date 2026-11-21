// Her haber için kısa sosyal medya metni. Gövdeyi Workers AI yazar (yoksa ya da hata verirse
// şablon kullanılır); kaynak satırı her zaman kodla eklenir ki kaynak asla eksik ya da uydurma olmasın.

export const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export const GOVDE_SINIR = 220;

const SISTEM = `Türkçe haber editörüsün. Verilen başlık ve özetten sosyal medya için en fazla ${GOVDE_SINIR} karakterlik kısa bir paylaşım metni yaz.
Kurallar:
- Yalnızca verilen bilgileri kullan; yorum, tahmin, abartı ve yeni bilgi ekleme.
- Tarafsız ve anlaşılır ol, başlığı kelimesi kelimesine kopyalama.
- Bağlantı, kaynak adı ve emoji yazma. Sonuna en fazla 2 ilgili hashtag ekleyebilirsin.
- Yalnızca paylaşım metnini yaz, açıklama yapma.`;

function kirp(s, n) {
  if (s.length <= n) return s;
  const k = s.slice(0, n - 1);
  const i = k.lastIndexOf(' ');
  return (i > n * 0.6 ? k.slice(0, i) : k).replace(/[\s,;:.-]+$/, '') + '…';
}

// Model çıktısını temizler: tırnak, bağlantı ve "Kaynak:" satırları atılır
export function temizle(s) {
  return (s || '')
    .replace(/https?:\/\/\S+/g, '')
    .split('\n').filter((l) => !/^\s*(kaynak|source)\s*:/i.test(l)).join(' ')
    .replace(/^["“”'\s]+|["“”'\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sablonMetin({ baslik, ozet }) {
  let m = baslik.replace(/\s+/g, ' ').trim();
  const cumle = (ozet || '').match(/^[\s\S]*?[.!?](\s|$)/)?.[0]?.trim() || '';
  if (cumle && !cumle.toLocaleLowerCase('tr-TR').startsWith(m.toLocaleLowerCase('tr-TR').slice(0, 30))) {
    if (!/[.!?…]$/.test(m)) m += '.';
    m += ' ' + cumle;
  }
  return kirp(m, GOVDE_SINIR);
}

export async function aiMetin(env, { baslik, ozet }) {
  const r = await env.AI.run(MODEL, {
    messages: [
      { role: 'system', content: SISTEM },
      { role: 'user', content: `Başlık: ${baslik}\nÖzet: ${(ozet || '').slice(0, 500)}` },
    ],
    max_tokens: 160,
    temperature: 0.4,
  });
  const ham = typeof r === 'string' ? r : r?.response ?? r?.choices?.[0]?.message?.content ?? '';
  const t = temizle(ham);
  if (t.length < 30) throw new Error('model boş ya da çok kısa yanıt verdi');
  return kirp(t, GOVDE_SINIR + 40);
}

const CEVIRI_SISTEM = `Türkçe haber editörüsün. Sana yabancı dilde bir haberin başlığı ve özeti verilecek. Bunu Türkçeye çevirip özetle.
Kurallar:
- Yalnızca verilen bilgileri kullan; yorum, tahmin, abartı ve yeni bilgi ekleme. Özel isimleri doğru yaz.
- Tarafsız ve anlaşılır, doğal bir Türkçe kullan.
- Bağlantı, kaynak adı ve emoji yazma.
- Tam olarak şu iki satırı yaz, başka hiçbir şey yazma:
BAŞLIK: <en fazla 110 karakterlik Türkçe başlık>
METİN: <en fazla ${GOVDE_SINIR} karakterlik Türkçe paylaşım metni, sonunda en fazla 2 Türkçe hashtag>`;

// Model çıktısındaki BAŞLIK/METİN satırlarını ayırır
export function ceviriAyir(ham) {
  const s = String(ham || '');
  const b = s.match(/BA[ŞS]LIK\s*:\s*(.+)/i)?.[1];
  const m = s.match(/METİN\s*:\s*([\s\S]+)/i)?.[1];
  const baslik = temizle(b).replace(/[.\s]+$/, '');
  const metin = temizle(m);
  if (baslik.length < 10 || metin.length < 30) throw new Error('çeviri biçimi hatalı');
  return { baslik: kirp(baslik, 120), metin: kirp(metin, GOVDE_SINIR + 40) };
}

// Yabancı haber: Türkçe başlık + Türkçe paylaşım metni. Şablon yedeği yok (İngilizce metin yayınlanmaz).
export async function aiCeviri(env, { baslik, ozet }) {
  const r = await env.AI.run(MODEL, {
    messages: [
      { role: 'system', content: CEVIRI_SISTEM },
      { role: 'user', content: `Başlık: ${baslik}\nÖzet: ${(ozet || '').slice(0, 600)}` },
    ],
    max_tokens: 220,
    temperature: 0.3,
  });
  return ceviriAyir(typeof r === 'string' ? r : r?.response ?? r?.choices?.[0]?.message?.content ?? '');
}

// Gövde + kaynak satırı: paylaşılacak ve listede gösterilecek tam metin.
// Bağlantı verilmez, yalnızca haberin alındığı yerin adı yazılır (Volkan'ın isteği).
export function paylasimMetni(h) {
  const k = h.kaynaklar[0];
  const ek = h.kaynaklar.length > 1 ? ` (+${h.kaynaklar.length - 1} kaynak)` : '';
  return `${h.metin}\n\nKaynak: ${k.ad}${k.dil ? ' (Türkçe çeviri)' : ''}${ek}`;
}
