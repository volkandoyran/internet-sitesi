// Zamanlanmış çalışma: kaynakları çek → tekrarları ayıkla → metin yaz → (platform varsa) paylaş → temizle
import { KAYNAKLAR } from './kaynaklar.js';
import { rssAyristir, xmlCoz } from './rss.js';
import { imza, eslesen, urlSade } from './ayikla.js';
import { aiMetin, aiCeviri, sablonMetin, paylasimMetni } from './metin.js';
import { aktifPlatformlar } from './paylas.js';

const SAAT = 3600e3;
const sayi = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);

export const ayarlar = (env) => ({
  yeniSaat: sayi(env.YENI_HABER_SAAT, 24),       // bundan eski haberler alınmaz
  eslesmeSaat: sayi(env.ESLESME_SAAT, 36),       // tekrar ararken bakılan süre
  aiLimit: sayi(env.AI_LIMIT, 5),                // çalışma başına yapay zekâ metni (ücretsiz kota: metin + görsel günde 10.000 nöronu aşmasın)
  yabanciLimit: sayi(env.YABANCI_LIMIT, 2),      // bunun kaçı yabancı haber çevirisine ayrılır
  yabanciSaat: sayi(env.YABANCI_SAAT, 6),        // bu sürede çevrilemeyen yabancı haber yayınlanmaz
  paylasimLimit: sayi(env.PAYLASIM_LIMIT, 2),    // çalışma başına platform başına paylaşım
  paylasimSaat: sayi(env.PAYLASIM_SAAT, 6),      // bundan eski haberler paylaşılmaz
  saklaGun: sayi(env.SAKLA_GUN, 7),
});

async function kaynakCek(k) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(k.url, {
      signal: ctl.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; GundemBotu/1.0; RSS okuyucu)', accept: 'application/rss+xml, application/xml, text/xml, */*' },
      cf: { cacheTtl: 120 },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const xml = xmlCoz(await r.arrayBuffer(), r.headers.get('content-type') || '');
    const haberler = rssAyristir(xml);
    if (!haberler.length) throw new Error('akışta haber bulunamadı');
    return { k, haberler };
  } catch (e) {
    return { k, hata: e.name === 'AbortError' ? 'zaman aşımı' : String(e.message || e) };
  } finally {
    clearTimeout(t);
  }
}

const satir = (r) => ({ ...r, imza: r.imza.split(' ').filter(Boolean), kaynaklar: JSON.parse(r.kaynaklar) });

export async function topla(env, simdi = Date.now()) {
  const a = ayarlar(env);
  const iso = (ms) => new Date(ms).toISOString();
  const rapor = { kaynak: 0, hataliKaynak: 0, yeni: 0, tekrar: 0, metin: 0, paylasim: 0, hatalar: [] };

  // 1. Kaynaklar
  const sonuc = await Promise.all(KAYNAKLAR.map(kaynakCek));
  const durum = [];
  const adaylar = [];
  for (const s of sonuc) {
    if (s.hata) {
      rapor.hataliKaynak++;
      durum.push(env.DB.prepare('INSERT INTO kaynak_durum (id, son_cekim, hata) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET son_cekim = ?2, hata = ?3').bind(s.k.id, iso(simdi), s.hata));
      continue;
    }
    rapor.kaynak++;
    durum.push(env.DB.prepare('INSERT INTO kaynak_durum (id, son_cekim, son_basari, haber_sayisi, hata) VALUES (?1, ?2, ?2, ?3, NULL) ON CONFLICT(id) DO UPDATE SET son_cekim = ?2, son_basari = ?2, haber_sayisi = ?3, hata = NULL').bind(s.k.id, iso(simdi), s.haberler.length));
    for (const h of s.haberler) {
      const t = h.yayin ? Date.parse(h.yayin) : simdi;
      if (t < simdi - a.yeniSaat * SAAT || t > simdi + SAAT) continue;
      adaylar.push({ ...h, kaynak: s.k, zaman: t });
    }
  }
  if (durum.length) await env.DB.batch(durum);

  // 2. Görülmüş bağlantıları ve son haberleri oku
  const gorulen = new Set((await env.DB.prepare('SELECT url FROM gorulen').all()).results.map((r) => r.url));
  const mevcut = (await env.DB.prepare('SELECT id, imza, kaynaklar FROM haberler WHERE ilk_gorulme >= ?')
    .bind(iso(simdi - a.eslesmeSaat * SAAT)).all()).results.map(satir);
  const degisen = new Set();
  const yeniGorulen = [];

  // 3. Eskiden yeniye işle: ilk veren kaynak haberin ana kaynağı olur
  adaylar.sort((x, y) => x.zaman - y.zaman);
  for (const h of adaylar) {
    const u = urlSade(h.url);
    if (gorulen.has(u)) continue;
    gorulen.add(u);
    yeniGorulen.push(u);
    const im = imza(h.baslik);
    const es = eslesen(im, mevcut);
    const kay = { id: h.kaynak.id, ad: h.kaynak.ad, url: h.url, baslik: h.baslik, ...(h.kaynak.dil ? { dil: h.kaynak.dil } : {}) };
    if (es) {
      rapor.tekrar++;
      if (!es.kaynaklar.some((k) => k.id === kay.id)) { es.kaynaklar.push(kay); degisen.add(es); }
      continue;
    }
    const r = await env.DB.prepare('INSERT INTO haberler (baslik, ozet, imza, kaynaklar, yayin, ilk_gorulme) VALUES (?, ?, ?, ?, ?, ?) RETURNING id')
      .bind(h.baslik, h.ozet || null, im.join(' '), JSON.stringify([kay]), h.yayin, iso(simdi)).first();
    mevcut.push({ id: r.id, imza: im, kaynaklar: [kay] });
    rapor.yeni++;
  }
  const yaz = [...degisen].map((h) => env.DB.prepare('UPDATE haberler SET kaynaklar = ?, kaynak_sayisi = ? WHERE id = ?').bind(JSON.stringify(h.kaynaklar), h.kaynaklar.length, h.id));
  for (let i = 0; i < yeniGorulen.length; i += 50) {
    const parca = yeniGorulen.slice(i, i + 50);
    yaz.push(env.DB.prepare(`INSERT OR IGNORE INTO gorulen (url, zaman) VALUES ${parca.map(() => '(?, ?)').join(',')}`).bind(...parca.flatMap((u) => [u, iso(simdi)])));
  }
  for (let i = 0; i < yaz.length; i += 50) await env.DB.batch(yaz.slice(i, i + 50));

  // 4. Metinler. Önce en önemli yabancı haberler Türkçeye çevrilir (en çok kaynak, en yeni),
  // sonra Türkçe haberlere yapay zekâ metni; kota bitince Türkçe haberlere şablon.
  const bekleyen = (await env.DB.prepare('SELECT id, baslik, ozet, kaynaklar, ilk_gorulme FROM haberler WHERE metin IS NULL ORDER BY kaynak_sayisi DESC, ilk_gorulme DESC').all()).results
    .map((h) => ({ ...h, yabanci: Boolean(JSON.parse(h.kaynaklar)[0]?.dil) }));
  let ai = env.AI ? a.aiLimit : 0;
  const metinYaz = [];
  let ceviri = Math.min(ai, a.yabanciLimit);
  for (const h of bekleyen.filter((x) => x.yabanci)) {
    if (ceviri <= 0) break;
    ceviri--; ai--;
    try {
      const c = await aiCeviri(env, h);
      metinYaz.push(env.DB.prepare("UPDATE haberler SET baslik = ?, metin = ?, metin_turu = 'ceviri' WHERE id = ?").bind(c.baslik, c.metin, h.id));
      rapor.metin++; rapor.ceviri = (rapor.ceviri || 0) + 1;
    } catch (e) { rapor.hatalar.push(`Çeviri: ${e.message || e}`); }
  }
  // Zamanında çevrilemeyen yabancı haberler sessizce düşer (İngilizce metin yayınlanmaz)
  metinYaz.push(env.DB.prepare(`DELETE FROM haberler WHERE metin IS NULL AND ilk_gorulme < ? AND json_extract(kaynaklar, '$[0].dil') IS NOT NULL`)
    .bind(iso(simdi - a.yabanciSaat * SAAT)));
  for (const h of bekleyen.filter((x) => !x.yabanci)) {
    let metin = null;
    let tur = 'sablon';
    if (ai > 0) {
      ai--;
      try { metin = await aiMetin(env, h); tur = 'ai'; } catch (e) { rapor.hatalar.push(`AI: ${e.message || e}`); }
    } else if (env.AI && Date.parse(h.ilk_gorulme) > simdi - 2 * SAAT) {
      continue; // yeni haber: sonraki çalışmada yapay zekâ sırası gelebilir
    }
    metin ||= sablonMetin(h);
    metinYaz.push(env.DB.prepare('UPDATE haberler SET metin = ?, metin_turu = ? WHERE id = ?').bind(metin, tur, h.id));
    rapor.metin++;
  }
  for (let i = 0; i < metinYaz.length; i += 50) await env.DB.batch(metinYaz.slice(i, i + 50));

  // 5. Otomatik paylaşım (yalnızca gizli ayarları girilmiş platformlar)
  for (const p of aktifPlatformlar(env)) {
    const sira = (await env.DB.prepare(`SELECT h.* FROM haberler h WHERE h.metin IS NOT NULL AND h.ilk_gorulme >= ?
      AND NOT EXISTS (SELECT 1 FROM paylasimlar s WHERE s.haber_id = h.id AND s.platform = ?)
      ORDER BY h.kaynak_sayisi DESC, h.ilk_gorulme DESC LIMIT ?`).bind(iso(simdi - a.paylasimSaat * SAAT), p.id, a.paylasimLimit).all()).results.map(satir);
    for (const h of sira) {
      let hata = null;
      try { await p.gonder(env, paylasimMetni(h), h); rapor.paylasim++; } catch (e) { hata = String(e.message || e); rapor.hatalar.push(hata); }
      await env.DB.prepare('INSERT OR REPLACE INTO paylasimlar (haber_id, platform, durum, hata, zaman) VALUES (?, ?, ?, ?, ?)')
        .bind(h.id, p.id, hata ? 'hata' : 'paylasildi', hata, iso(Date.now())).run();
    }
  }

  // 6. Eski kayıtları sil
  const sinir = iso(simdi - a.saklaGun * 24 * SAAT);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM paylasimlar WHERE haber_id IN (SELECT id FROM haberler WHERE ilk_gorulme < ?)').bind(sinir),
    env.DB.prepare('DELETE FROM haberler WHERE ilk_gorulme < ?').bind(sinir),
    env.DB.prepare('DELETE FROM gorseller WHERE haber_id NOT IN (SELECT id FROM haberler)'),
    env.DB.prepare('DELETE FROM icerikler WHERE haber_id NOT IN (SELECT id FROM haberler)'),
    env.DB.prepare('DELETE FROM gorulen WHERE zaman < ?').bind(sinir),
  ]);
  return rapor;
}
