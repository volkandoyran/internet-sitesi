// Haber görselleri. Telif açısından güvenli iki kaynak kullanılır:
//  1. Haberde adı geçen kişi/kurum için Wikipedia'daki SERBEST LİSANSLI (Wikimedia Commons) fotoğraf;
//     fotoğrafçı ve lisans atfı kaydedilir ve haber sayfasında gösterilir.
//  2. Kişi yoksa ya da fotoğrafı bulunamazsa yapay zekâyla üretilmiş temsili görsel (gerçek kişi
//     çizilmez, "temsili" olarak etiketlenir). Ücretsiz kotayı korumak için çalışma başına sınırlı.
// Hiçbiri olmazsa kapak.js'teki SVG kapak kullanılır.

const SAAT = 3600e3;
const sayi = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);
export const gorselAyarlari = (env) => ({
  limit: sayi(env.GORSEL_LIMIT, 6),        // çalışma başına görsel aranan haber
  aiLimit: sayi(env.GORSEL_AI_LIMIT, 1),   // çalışma başına yapay zekâ görseli (~50 nöron)
  saklaGun: sayi(env.SAKLA_GUN, 7),
});

export const CIKARMA_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';
export const GORSEL_MODEL = '@cf/black-forest-labs/flux-1-schnell';
const UA = { 'user-agent': 'GundemOzeti/1.0 (haber sitesi; Wikimedia API)' };

const CIKARMA_SISTEM = `Bir haber başlığı ve kısa metni verilecek. Yalnızca JSON yaz, başka hiçbir şey yazma:
{"kisi": "<haberin ana konusu olan GERÇEK kişinin tam adı; yoksa boş>", "sahne": "<haberi anlatan genel bir sahnenin İngilizce kısa tarifi; tanınabilir gerçek kişi, logo, yazı olmasın>"}`;

export function jsonAyikla(ham) {
  const m = String(ham || '').match(/\{[\s\S]*\}/);
  if (!m) return {};
  try { const j = JSON.parse(m[0]); return typeof j === 'object' && j ? j : {}; } catch { return {}; }
}

const sade = (s) => String(s || '').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Wikipedia sayfa başlığı kişi adıyla uyumlu mu (soyadı ve en az bir ad daha geçmeli)
export function adUyar(kisi, sayfa) {
  const k = sade(kisi).split(' ').filter((x) => x.length > 1);
  const s = ` ${sade(sayfa)} `;
  if (k.length < 2) return false;
  return s.includes(` ${k[k.length - 1]} `) && k.slice(0, -1).some((x) => s.includes(` ${x} `));
}

const htmlsiz = (s) => String(s || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

async function jget(url) {
  const r = await fetch(url, { headers: UA, cf: { cacheTtl: 3600 } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Kişinin Wikipedia sayfasındaki serbest lisanslı fotoğrafı + atıf
export async function wikiFoto(kisi) {
  for (const dil of ['tr', 'en']) {
    const q = new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrsearch: kisi, gsrlimit: '1',
      prop: 'pageimages', piprop: 'name', pilicense: 'free', origin: '*' });
    const j = await jget(`https://${dil}.wikipedia.org/w/api.php?${q}`);
    const sayfa = Object.values(j?.query?.pages || {})[0];
    if (!sayfa?.pageimage || !adUyar(kisi, sayfa.title)) continue;
    const q2 = new URLSearchParams({ action: 'query', format: 'json', titles: `File:${sayfa.pageimage}`, prop: 'imageinfo',
      iiprop: 'url|extmetadata', iiurlwidth: '1000', origin: '*' });
    const k = await jget(`https://commons.wikimedia.org/w/api.php?${q2}`);
    const bilgi = Object.values(k?.query?.pages || {})[0]?.imageinfo?.[0];
    const meta = bilgi?.extmetadata || {};
    const lisans = htmlsiz(meta.LicenseShortName?.value);
    // Yalnızca Commons'ta olan ve açık lisansı belli dosyalar
    if (!bilgi?.thumburl || !lisans || /fair use|non-free/i.test(lisans)) continue;
    const yazar = htmlsiz(meta.Artist?.value).slice(0, 80) || 'Bilinmiyor';
    return { tur: 'wiki', url: bilgi.thumburl, atif: `Fotoğraf: ${yazar} / ${lisans}, Wikimedia Commons (${sayfa.title})` };
  }
  return null;
}

function base64Bayt(b64) {
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

export async function aiGorsel(env, id, sahne, baslik) {
  const istem = `Editorial news photo illustration: ${sahne || baslik}. Realistic, natural light, wide shot, no text, no captions, no logos, no recognizable real people.`;
  const r = await env.AI.run(GORSEL_MODEL, { prompt: istem.slice(0, 900), steps: 4, width: 768, height: 432 });
  if (!r?.image) throw new Error('görsel modeli boş yanıt verdi');
  await env.GORSEL.put(`g/${id}.jpg`, base64Bayt(r.image), { expirationTtl: gorselAyarlari(env).saklaGun * 24 * 3600 + 86400, metadata: { tur: 'image/jpeg' } });
  return { tur: 'ai', url: null, atif: 'Yapay zekâ ile üretilmiş temsili görsel' };
}

// Zamanlanmış çalışmada: görseli olmayan en önemli haberlere görsel bul
export async function gorselleriDoldur(env, rapor = {}) {
  if (!env.AI) return;
  const a = gorselAyarlari(env);
  const { results } = await env.DB.prepare(`SELECT h.id, h.baslik, h.metin FROM haberler h
    WHERE h.metin IS NOT NULL AND NOT EXISTS (SELECT 1 FROM gorseller g WHERE g.haber_id = h.id)
    ORDER BY h.kaynak_sayisi DESC, h.ilk_gorulme DESC LIMIT ?`).bind(a.limit).all();
  let ai = env.GORSEL ? a.aiLimit : 0;
  for (const h of results) {
    let sonuc = null;
    try {
      const c = await env.AI.run(CIKARMA_MODEL, {
        messages: [{ role: 'system', content: CIKARMA_SISTEM }, { role: 'user', content: `Başlık: ${h.baslik}\nMetin: ${h.metin}` }],
        max_tokens: 120, temperature: 0.1,
      });
      const j = jsonAyikla(typeof c === 'string' ? c : c?.response);
      const kisi = typeof j.kisi === 'string' ? j.kisi.trim() : '';
      if (kisi) sonuc = await wikiFoto(kisi).catch(() => null);
      if (!sonuc) {
        if (ai <= 0) continue; // bu çalışmada yapay zekâ görsel hakkı bitti, sonraki çalışmada denenir
        ai--;
        sonuc = await aiGorsel(env, h.id, typeof j.sahne === 'string' ? j.sahne : '', h.baslik);
      }
    } catch (e) {
      (rapor.hatalar ||= []).push(`Görsel: ${e.message || e}`);
      if (/neuron|quota|limit|4006/i.test(String(e.message))) break; // günlük kota bitti
      sonuc = { tur: 'yok', url: null, atif: null };
    }
    await env.DB.prepare('INSERT OR REPLACE INTO gorseller (haber_id, tur, url, atif) VALUES (?, ?, ?, ?)')
      .bind(h.id, sonuc.tur, sonuc.url, sonuc.atif).run();
    rapor.gorsel = (rapor.gorsel || 0) + 1;
  }
}

export async function gorselBilgi(env, id) {
  try { return await env.DB.prepare('SELECT tur, url, atif FROM gorseller WHERE haber_id = ?').bind(id).first(); } catch { return null; }
}
