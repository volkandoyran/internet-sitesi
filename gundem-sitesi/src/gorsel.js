// Haber görselleri. Telif açısından güvenli iki kaynak kullanılır:
//  1. Haberde adı geçen kişi/kurum için Wikipedia'daki SERBEST LİSANSLI (Wikimedia Commons) fotoğraf;
//     fotoğrafçı ve lisans atfı kaydedilir ve haber sayfasında gösterilir.
//  2. Kişi yoksa ya da fotoğrafı bulunamazsa yapay zekâyla üretilmiş temsili görsel (gerçek kişi
//     çizilmez, "temsili" olarak etiketlenir). Ücretsiz kotayı korumak için çalışma başına sınırlı.
// Hiçbiri olmazsa kapak.js'teki SVG kapak kullanılır.

import { sehitMi } from './metin.js';

const SAAT = 3600e3;
const sayi = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);
export const gorselAyarlari = (env) => ({
  limit: sayi(env.GORSEL_LIMIT, 9),        // görsel çalışması başına haber (ücretsiz planın 50 alt istek sınırına sığar)
  aiLimit: sayi(env.GORSEL_AI_LIMIT, 3),   // çalışma başına yapay zekâ görseli
  aiGunluk: sayi(env.GORSEL_AI_GUNLUK, 35), // 24 saatte en fazla yapay zekâ görseli (~104 nöron/adet; ücretsiz 10.000 nöron metinlerle paylaşılıyor)
  saklaGun: sayi(env.SAKLA_GUN, 7),
});

export const CIKARMA_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';
// Hafif model: ölçümde boyuttan bağımsız ≈ 104 nöron/görsel (eski flux-1-schnell ≈ 170).
export const GORSEL_MODEL = '@cf/black-forest-labs/flux-2-klein-4b';
export const YEDEK_GORSEL_MODEL = '@cf/black-forest-labs/flux-1-schnell';
export const GORSEL_EN = 640, GORSEL_BOY = 360;
const UA = { 'user-agent': 'GundemOzeti/1.0 (haber sitesi; Wikimedia API)' };

const CIKARMA_SISTEM = `Bir haber başlığı ve kısa metni verilecek. Yalnızca JSON yaz, başka hiçbir şey yazma:
{"kisi": "<haberin ana konusu olan GERÇEK kişinin tam adı; yoksa boş>", "sahne": "<haberi anlatan genel bir sahnenin İngilizce kısa tarifi; tanınabilir gerçek kişi, logo, yazı olmasın>"}`;

export function jsonAyikla(ham) {
  // Workers AI JSON yanıtı bazen hazır nesne olarak döner
  if (ham && typeof ham === 'object') return Array.isArray(ham) ? {} : ham;
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

// Model yanıtı: { image: base64 } ya da doğrudan bayt akışı
export async function gorselBayt(r) {
  if (!r) return null;
  if (typeof r.image === 'string' && r.image) return base64Bayt(r.image);
  if (r instanceof ReadableStream) { const b = new Uint8Array(await new Response(r).arrayBuffer()); return b.length ? b : null; }
  if (r instanceof ArrayBuffer || ArrayBuffer.isView(r)) { const b = new Uint8Array(r.buffer || r); return b.length ? b : null; }
  return null;
}

export async function aiGorsel(env, id, sahne, baslik) {
  const istem = `Editorial news photo illustration: ${sahne || baslik}. Realistic, natural light, wide shot, no text, no captions, no logos, no recognizable real people.`;
  const prompt = istem.slice(0, 900);
  let bayt;
  try {
    const form = new FormData();
    form.append('prompt', prompt);
    form.append('width', String(GORSEL_EN));
    form.append('height', String(GORSEL_BOY));
    const govde = new Response(form);
    const r = await env.AI.run(GORSEL_MODEL, { multipart: { body: govde.body, contentType: govde.headers.get('content-type') } });
    bayt = await gorselBayt(r);
  } catch (e) {
    console.log(JSON.stringify({ olay: 'gorsel-model-yedek', hata: String(e?.message || e).slice(0, 200) }));
  }
  if (!bayt) bayt = await gorselBayt(await env.AI.run(YEDEK_GORSEL_MODEL, { prompt, steps: 2 }));
  if (!bayt) throw new Error('görsel modeli boş yanıt verdi');
  await env.GORSEL.put(`g/${id}.jpg`, bayt, { expirationTtl: gorselAyarlari(env).saklaGun * 24 * 3600 + 86400, metadata: { tur: 'image/jpeg' } });
  return { tur: 'ai', url: null, atif: 'Yapay zekâ ile üretilmiş temsili görsel' };
}

// Zamanlanmış görsel çalışmasında: görseli olmayan haberlere (en önemlilerden başlayarak, eskiler dahil) görsel bul.
// 'bekle': kişi fotoğrafı yok ve yapay zekâ görsel hakkı dolmuştu; 12 saat sonra yeniden denenir.
export async function gorselleriDoldur(env, rapor = {}) {
  if (!env.AI) return rapor;
  const a = gorselAyarlari(env);
  const { results } = await env.DB.prepare(`SELECT h.id, h.baslik, h.metin FROM haberler h
    LEFT JOIN gorseller g ON g.haber_id = h.id
    WHERE h.metin IS NOT NULL AND (g.haber_id IS NULL OR (g.tur = 'bekle' AND g.zaman < strftime('%Y-%m-%dT%H:%M:%fZ','now','-12 hours')))
    ORDER BY h.kaynak_sayisi DESC, h.ilk_gorulme DESC LIMIT ?`).bind(a.limit).all();
  const gunluk = (await env.DB.prepare(`SELECT count(*) n FROM gorseller WHERE tur = 'ai' AND zaman > strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')`).first())?.n || 0;
  let ai = env.GORSEL ? Math.max(0, Math.min(a.aiLimit, a.aiGunluk - gunluk)) : 0;
  const say = (k) => { rapor[k] = (rapor[k] || 0) + 1; };
  for (const h of results) {
    let sonuc = null;
    try {
      // Şehit haberlerinde yapay zekâ ya da başka kişinin fotoğrafı kullanılmaz; koyu yas kapağı gösterilir
      if (sehitMi(h)) sonuc = { tur: 'yok', url: null, atif: null };
      else {
        const c = await env.AI.run(CIKARMA_MODEL, {
          messages: [{ role: 'system', content: CIKARMA_SISTEM }, { role: 'user', content: `Başlık: ${h.baslik}\nMetin: ${h.metin}` }],
          max_tokens: 120, temperature: 0.1,
        });
        const j = jsonAyikla(typeof c === 'string' ? c : c?.response ?? c);
        const kisi = typeof j.kisi === 'string' ? j.kisi.trim() : '';
        (rapor.kisiler ||= []).push(`${h.id}:${kisi || '-'}`);
        if (kisi) sonuc = await wikiFoto(kisi).catch((e) => { (rapor.hatalar ||= []).push(`Wikipedia ${h.id}: ${e.message || e}`); return null; });
        if (!sonuc && ai > 0) { ai--; sonuc = await aiGorsel(env, h.id, typeof j.sahne === 'string' ? j.sahne : '', h.baslik); }
        if (!sonuc) sonuc = { tur: 'bekle', url: null, atif: null };
      }
    } catch (e) {
      (rapor.hatalar ||= []).push(`Görsel ${h.id}: ${e.message || e}`);
      if (/neuron|quota|4006|too many subrequests/i.test(String(e.message))) break; // kota/istek sınırı: sonraki çalışmada
      continue; // geçici hata: kayıt yazılmaz, sonra yeniden denenir
    }
    await env.DB.prepare('INSERT OR REPLACE INTO gorseller (haber_id, tur, url, atif) VALUES (?, ?, ?, ?)')
      .bind(h.id, sonuc.tur, sonuc.url, sonuc.atif).run();
    say(`gorsel_${sonuc.tur}`);
  }
  return rapor;
}

export async function gorselBilgi(env, id) {
  try { return await env.DB.prepare('SELECT tur, url, atif FROM gorseller WHERE haber_id = ?').bind(id).first(); } catch { return null; }
}
