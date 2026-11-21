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

// Gövde + kaynak satırı: paylaşılacak ve listede gösterilecek tam metin
export function paylasimMetni(h) {
  const k = h.kaynaklar[0];
  const ek = h.kaynaklar.length > 1 ? ` (+${h.kaynaklar.length - 1} kaynak)` : '';
  return `${h.metin}\n\nKaynak: ${k.ad}${ek}\n${k.url}`;
}
