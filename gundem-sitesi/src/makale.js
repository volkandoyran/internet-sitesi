// Haber içeriği: önemli haberler için kaynak haberin sayfası okunur ve yapay zekâ, YALNIZCA oradaki
// bilgilerle kendi cümleleriyle 3-5 paragraflık bir haber metni yazar. Kaynak metin kopyalanmaz,
// yayımlanmaz; haber sayfasında yalnızca yeniden yazılmış metin ve kaynak adı görünür.
// Ücretsiz kotaya sığsın diye hafif model ve günlük sınır kullanılır.

import { duzMetin } from './rss.js';
import { sehitMi, BASSAGLIGI } from './metin.js';

export const ICERIK_MODEL = '@cf/google/gemma-4-26b-a4b-it';
const sayi = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);
export const icerikAyarlari = (env) => ({
  limit: sayi(env.ICERIK_LIMIT, 5),       // çalışma başına haber
  gunluk: sayi(env.ICERIK_GUNLUK, 200),   // 24 saatte en fazla yapay zekâ metni (ölçüm: ~13 nöron/adet)
  kaynakSiniri: 3500,                     // kaynak başına modele verilecek en fazla karakter
});

const GURULTU = /çerez|cookie|abone ol|bültenimize|tüm hakları|copyright|reklam|whatsapp kanal|google news|bizi takip|uygulamamızı indir|yorum yap|giriş yap/i;

// Haber sayfasından gövde paragrafları (ilk denemede <article> içi, yoksa tüm sayfa)
export function sayfaMetni(html) {
  const s = String(html || '').replace(/<(script|style|noscript|svg|figure|aside|nav|header|footer|form|iframe)\b[\s\S]*?<\/\1>/gi, ' ');
  const bolge = s.match(/<article\b[\s\S]*?<\/article>/i)?.[0] || s;
  const gorulen = new Set();
  const ps = [];
  for (const m of bolge.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const t = duzMetin(m[1]);
    if (t.length < 50 || GURULTU.test(t) || gorulen.has(t)) continue;
    gorulen.add(t);
    ps.push(t);
  }
  let metin = ps.join('\n');
  if (metin.length < 200) {
    const d = s.match(/<meta[^>]+(?:property|name)=["'](?:og:)?description["'][^>]*content=["']([^"']+)/i)?.[1];
    if (d && duzMetin(d).length > metin.length) metin = duzMetin(d);
  }
  return metin;
}

async function kaynakMetni(url, sinir) {
  try {
    const r = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; GundemOzeti/1.0; +haber ozeti)', accept: 'text/html' },
      signal: AbortSignal.timeout(8000), redirect: 'follow',
    });
    if (!r.ok || !/html/i.test(r.headers.get('content-type') || 'html')) return '';
    return sayfaMetni((await r.text()).slice(0, 800000)).slice(0, sinir);
  } catch { return ''; }
}

const SISTEM = `Türkçe haber editörüsün. Sana bir haberin başlığı, kısa özeti ve kaynak haberin metni verilecek. Bunlardan okuyucuyu bilgilendiren, kendi cümlelerinle yazılmış bir haber metni yaz.
Kurallar:
- Yalnızca verilen metinlerdeki bilgileri kullan. Metinde olmayan hiçbir bilgi, sayı, isim, yer ya da tarih ekleme; yorum ve tahmin yapma.
- Cümleleri kaynaktan aynen kopyalama, kendi cümlelerinle anlat.
- İlk paragrafta olayın özünü ver (ne oldu, nerede, ne zaman, kim). Sonraki paragraflarda ayrıntıları, rakamları ve yapılan açıklamaları aktar.
- 3-5 paragraf, toplam 120-350 kelime. Bilgi azsa daha kısa yaz; uzatmak için tekrar etme.
- Başlık, hashtag, emoji, bağlantı ya da kaynak adı yazma. Paragrafların arasında boş satır bırak.
- Tarafsız, sade ve doğal bir Türkçe kullan.`;
const YABANCI_EK = '\nKaynak metin yabancı dilde; haberi Türkçe yaz, özel isimleri doğru aktar.';
const YAS_EK = `\nBu bir şehit haberi. Ağırbaşlı, yaslı ve saygılı bir dille yaz; üzüntüyü hissettir, sansasyon yapma. Son paragrafı şu cümleyle bitir: "${BASSAGLIGI}"`;

// Model çıktısını paragraflara ayırır ve temizler
export function icerikTemizle(ham) {
  let s = String(ham || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*<\/think>/i, '');
  const paragraflar = s.split(/\n\s*\n|\n(?=\S)/)
    .map((p) => p.replace(/\*\*|__|^#+\s*/g, '').replace(/https?:\/\/\S+/g, '').replace(/#[\p{L}\d_]+/gu, '').replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0 && !/^(başlık|kaynak|source|title)\s*:/i.test(p));
  return paragraflar.join('\n\n');
}

export async function icerikYaz(env, h, kaynak) {
  const sehit = sehitMi(h);
  const r = await env.AI.run(ICERIK_MODEL, {
    messages: [
      { role: 'system', content: SISTEM + (h.yabanci ? YABANCI_EK : '') + (sehit ? YAS_EK : '') },
      { role: 'user', content: `Başlık: ${h.baslik}\nÖzet: ${(h.ozet || '').slice(0, 600)}\n\nKaynak haber metni:\n${kaynak}` },
    ],
    max_tokens: 1000,
    temperature: 0.3,
    chat_template_kwargs: { enable_thinking: false }, // düşünme kapalı: tüm çıktı metne gitsin, nöron harcanmasın
  });
  const ham = typeof r === 'string' ? r : r?.response ?? r?.choices?.[0]?.message?.content ?? '';
  let t = icerikTemizle(ham);
  if (t.length < 200) throw new Error(`model kısa yanıt verdi (${t.length})`);
  if (sehit && !t.includes(BASSAGLIGI.slice(0, 25))) t += `\n\n${BASSAGLIGI}`;
  return t;
}

// Zamanlanmış çalışmada: içeriği olmayan son 2 günün en önemli haberlerine metin yaz.
// Kaynak sayfası okunamaz ve RSS özeti de kısaysa 'yok' işaretlenir (uydurma metin yazılmaz).
export async function icerikleriDoldur(env, rapor = {}) {
  if (!env.AI) return rapor;
  const a = icerikAyarlari(env);
  const gunluk = (await env.DB.prepare(`SELECT count(*) n FROM icerikler WHERE tur IN ('ai', 'hata') AND zaman > strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')`).first())?.n || 0;
  const hak = Math.max(0, Math.min(a.limit, a.gunluk - gunluk));
  rapor.hak = hak;
  if (!hak) return rapor;
  const { results } = await env.DB.prepare(`SELECT h.id, h.baslik, h.ozet, h.kaynaklar FROM haberler h
    LEFT JOIN icerikler i ON i.haber_id = h.id
    WHERE h.metin IS NOT NULL AND (i.haber_id IS NULL OR (i.tur = 'hata' AND i.zaman < strftime('%Y-%m-%dT%H:%M:%fZ','now','-6 hours')))
      AND h.ilk_gorulme > strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days')
    ORDER BY h.kaynak_sayisi DESC, h.ilk_gorulme DESC LIMIT ?`).bind(hak).all();
  const say = (k) => { rapor[k] = (rapor[k] || 0) + 1; };
  for (const satir of results) {
    let kaynaklar = [];
    try { kaynaklar = JSON.parse(satir.kaynaklar || '[]'); } catch { /* bozuk */ }
    const h = { ...satir, yabanci: Boolean(kaynaklar[0]?.dil) };
    const metinler = [];
    for (const k of kaynaklar.slice(0, 2)) {
      if (!/^https?:\/\//.test(k?.url || '')) continue;
      const m = await kaynakMetni(k.url, a.kaynakSiniri);
      if (m.length >= 200) metinler.push(m);
    }
    let kaynak = metinler.join('\n\n---\n\n');
    if (!kaynak && (h.ozet || '').length >= 150) kaynak = h.ozet;
    let tur = 'yok', metin = null;
    if (kaynak) {
      try { metin = await icerikYaz(env, h, kaynak); tur = 'ai'; }
      catch (e) {
        // Ücretsiz günlük kota bittiyse (4006) nöron harcanmadı: kayıt düşmeden çalışmayı bitir
        if (/4006|daily free allocation/i.test(String(e?.message || e))) { rapor.kota = true; break; }
        // Hata da günlük sınırdan sayılır ve 6 saat sonra yeniden denenir; üst üste 2 hatada çalışma durur (nöron israfı olmasın)
        say('hata'); rapor.sonHata = String(e?.message || e).slice(0, 200);
        await env.DB.prepare("INSERT OR REPLACE INTO icerikler (haber_id, tur, metin, kaynak_uzunluk) VALUES (?, 'hata', NULL, ?)").bind(h.id, kaynak.length).run();
        if (rapor.hata >= 2) break;
        continue;
      }
    }
    await env.DB.prepare('INSERT OR REPLACE INTO icerikler (haber_id, tur, metin, kaynak_uzunluk) VALUES (?, ?, ?, ?)')
      .bind(h.id, tur, metin, kaynak.length).run();
    say(tur);
  }
  return rapor;
}
