// Kendi ürün ve fiyat toplama motorumuz. GitHub Actions'ta saatte bir çalışır; ücretli servis ya da yapay zekâ kullanmaz.
// 1) Siteden plan alınır: zamanı gelen (panelde seçilen sıklığa göre) ya da "Şimdi çalıştır" denen mağazalar,
// 2) her mağazanın site haritasından ürün bağlantıları bulunur (önbellekli), yeni bağlantılar ve fiyatı eskiyen bilinen
//    bağlantılar açılır; önce schema.org JSON-LD, yoksa meta / HTML / panelde girilen CSS seçicileri okunur,
// 3) addan tür/kategori/özellik ve eşleştirme anahtarı çıkarılır, sonuçlar siteye gönderilir
//    (site aynı bağlantıyı yeniden eklemez, fiyat değişmediyse geçmişe satır yazmaz),
// 4) her mağazanın sonucu (başarılı / engellendi / hata) siteye raporlanır. Bir mağazanın bozulması diğerlerini durdurmaz.
// Ortam: SITE_URL, ADMIN_PASSWORD; isteğe bağlı MAGAZA (tek mağaza, zamanı gelmemiş olsa da), YENI_LIMIT, YENILE_LIMIT,
// KURU=1 (siteye yazmaz, yalnızca okunanları gösterir), HEPSI=1 (zamanı gelmemiş mağazaları da tara), ORNEK (kuru denemede mağaza başına sayfa)
import { extractProduct, extractSpecPairs, applySelectors } from './extract.mjs';
import { specsFromPairs, columnsFromSpecs } from '../lib/pcspecs.js';
import { STORES, adapterFor } from './stores.mjs';
import { classify, isExcluded, specsFromName, matchKey, modelKeys } from '../lib/catalog.js';
import { runMatching } from './eslestir.mjs';
import { Getirici, EngelHatasi, RobotsHatasi } from './motor/http.mjs';

const SITE = (process.env.SITE_URL || '').replace(/\/$/, '');
const PW = process.env.ADMIN_PASSWORD;
const DRY = process.env.KURU === '1';
if (!DRY && (!SITE || !PW)) { console.error('SITE_URL ve ADMIN_PASSWORD gerekli.'); process.exit(1); }
const NEW_LIMIT = +process.env.YENI_LIMIT || 400;      // mağaza başına, çalıştırma başına yeni ürün sayfası
const REFRESH_LIMIT = +process.env.YENILE_LIMIT || 800; // mağaza başına fiyatı yenilenecek bilinen sayfa
const SAMPLE = +process.env.ORNEK || 0;                 // kuru denemede mağaza başına en fazla bu kadar sayfa
const PARALLEL = 4;                                     // aynı anda taranan mağaza (her mağaza kendi içinde sırayla)
const BLOCK_STOP = 2;                                   // art arda bu kadar engelde mağaza bu turda bırakılır
const auth = { authorization: 'Bearer ' + PW };
const only = process.env.MAGAZA;
const net = new Getirici({ cacheDir: process.env.ONBELLEK || '.cache/scraper' });

async function api(path, init = {}) {
  const r = await fetch(`${SITE}/api/admin/${path}`, { ...init, headers: { ...auth, ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers || {}) }, signal: AbortSignal.timeout(60000) });
  const txt = await r.text();
  let data = null;
  try { data = JSON.parse(txt); } catch {}
  return { ok: r.ok, status: r.status, data, txt };
}

async function rates() {
  for (const u of ['https://api.frankfurter.dev/v1/latest?base=EUR&symbols=TRY', 'https://api.frankfurter.app/latest?from=EUR&to=TRY']) {
    try {
      const j = await (await fetch(u, { signal: AbortSignal.timeout(15000) })).json();
      if (j.rates && j.rates.TRY > 0) return { TRY: j.rates.TRY };
    } catch (e) { console.warn('Kur alınamadı:', u, e.message); }
  }
  return {};
}

const locs = (xml) => [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\s\]]+)/g)].map((m) => m[1].replace(/&amp;/g, '&'));

async function sitemapUrls(cfg) {
  let maps = cfg.sitemaps || [];
  if (cfg.sitemapsFromRobots) {
    const robots = await net.page(cfg.sitemapsFromRobots, { robots: false, retries: 1 });
    maps = [...robots.matchAll(/^sitemap:\s*(\S+)/gim)].map((m) => m[1]);
    if (!maps.length) maps = [new URL(cfg.sitemapsFromRobots).origin + '/sitemap.xml'];
  }
  const urls = new Set();
  let blocked = null;
  for (const m of maps) {
    try {
      const list = locs(await net.sitemap(m));
      // Site haritası dizini ise alt haritaları da aç
      if (list.length && list.every((u) => /\.xml(\.gz)?($|\?)/i.test(u))) {
        for (const sub of list) {
          try { for (const u of locs(await net.sitemap(sub))) urls.add(u); } catch (e) { if (e instanceof EngelHatasi) throw e; console.warn('  alt harita okunamadı:', sub, e.message); }
        }
      } else list.forEach((u) => urls.add(u));
    } catch (e) {
      if (e instanceof EngelHatasi) { blocked = e; break; }
      console.warn('  site haritası okunamadı:', m, e.message);
    }
  }
  if (blocked && !urls.size) throw blocked;
  return [...urls];
}

// ---------- Plan ----------
let plan = null;
if (SITE && PW) {
  const r = await api('scraper/plan');
  if (r.ok) plan = r.data.retailers;
  else console.warn('Plan alınamadı (site henüz güncellenmemiş olabilir):', r.status);
}
// Plan yoksa (eski site ya da kuru deneme) koddaki tüm mağazalar adaydır
if (!plan) plan = Object.keys(STORES).map((id) => ({ id, site: STORES[id].site || '', currency: STORES[id].currency || 'EUR', scrape: 1, due: true, config: null }));
const todo = plan.filter((r) => (only ? r.id === only : r.scrape && (r.due || process.env.HEPSI === '1')));
if (!todo.length) { console.log('Zamanı gelen mağaza yok. Çıkılıyor.'); process.exit(0); }
console.log('Bu turda taranacak:', todo.map((r) => r.id).join(', '));

let known = []; // [{retailer_id, url, updated_at}]
if (!DRY) {
  const r = await api('catalog');
  if (!r.ok) { console.error('Bilinen bağlantılar alınamadı:', r.status, r.txt.slice(0, 300)); process.exit(1); }
  known = r.data;
}
const rateMap = await rates();
console.log('Kur:', rateMap);

async function post(items, stat) {
  if (DRY) { for (const it of items) if (!it.gone && !it.error) console.log('  [kuru]', JSON.stringify(it).slice(0, 900)); return; }
  for (let i = 0; i < items.length; i += 10) {
    const r = await api('catalog', { method: 'POST', body: JSON.stringify({ rates: rateMap, items: items.slice(i, i + 10) }) });
    if (!r.ok) { console.error('  gönderilemedi:', r.status, r.txt.slice(0, 300)); stat.gonderilemedi = (stat.gonderilemedi || 0) + 1; continue; }
    for (const k of ['added', 'linked', 'updated', 'removed', 'changed', 'unchanged']) stat.site[k] = (stat.site[k] || 0) + (r.data?.[k] || 0);
  }
}

// Bir ürün sayfasını aç, sınıflandır ve gönderilecekler listesine ekle
async function processUrl(id, cfg, url, stat, items) {
  if (net.seen.has(url)) return; // aynı URL bir turda iki kez çekilmez
  net.seen.add(url);
  try {
    const html = cfg.render ? await net.render(url, { delay: cfg.delayMs }) : await net.page(url, { delay: cfg.delayMs });
    stat.sayfa++;
    stat.blocksInRow = 0;
    let p = extractProduct(html, cfg.currency || 'EUR');
    if (cfg.selectors) p = applySelectors(html, p, cfg.selectors, cfg.currency || 'EUR');
    if (!p) {
      if (DRY) console.log('  [bilgi yok]', url, html.length, (html.match(/<title>([^<]{0,100})/) || [])[1]);
      throw new Error('ürün bilgisi bulunamadı (sayfa yapısı değişmiş olabilir)');
    }
    // Mağaza kategorisi yalnızca okunabilir adlarda kullanılır: tek parça kod adlar
    // (ör. "SIF15_CEZH_2201_1000-WIN-14") yanlış kategoriye konmuş ürün olabilir, alınmaz.
    const readable = /\s/.test(p.name.trim());
    let kind = classify(p.name) || (cfg.kind && readable && !isExcluded(p.name) && cfg.kind(url)) || null;
    // Fiyatı türüne göre çok düşükse aksesuardır (ör. 8 € "laptop" kılıfı)
    if (kind && p.price) {
      const eur = p.currency === 'TRY' ? (rateMap.TRY ? p.price / rateMap.TRY : null) : p.price;
      const min = ['laptop', 'desktop'].includes(kind.type) ? 150 : ['phone', 'tablet'].includes(kind.type) || kind.category === 'monitor' ? 50 : 15;
      if (eur != null && eur < min) kind = null;
    }
    if (!kind) { stat.atlandi++; if (DRY) console.log('  [atlandı]', p.name); items.push({ retailer_id: id, url, gone: true }); return; }
    const specs = specsFromName(p.name, kind);
    // Bilgisayarlarda mağaza sayfasındaki özellik tablosu da okunur (ek istek yok, aynı sayfa)
    let page = null;
    if (['laptop', 'desktop'].includes(kind.type)) {
      page = specsFromPairs(extractSpecPairs(html));
      if (!Object.keys(page).length) page = null;
      else Object.assign(specs, columnsFromSpecs(page));
    }
    const match_key = matchKey(p);
    items.push({
      retailer_id: id, url, name: p.name, brand: p.brand, image: p.image,
      ...kind, ...specs, ...(page ? { specs: page } : {}),
      match_key, keys: modelKeys({ ...p, ...kind, ...specs, match_key }),
      price: p.price, currency: p.currency, in_stock: p.in_stock,
      old_price: p.old_price ?? null, description: p.description ?? null, store_category: p.store_category ?? null,
    });
    stat.eklendi++;
  } catch (e) {
    if (e instanceof EngelHatasi) { stat.blocksInRow++; stat.engel = e.message; throw e.status === 429 || stat.blocksInRow >= BLOCK_STOP ? e : Object.assign(e, { soft: true }); }
    if (e instanceof RobotsHatasi) { stat.robots++; return; }
    stat.hata++;
    const k = e.message.slice(0, 60);
    stat.hatalar[k] = (stat.hatalar[k] || 0) + 1;
    // Hata teklife yazılır, son bilinen fiyat ve geçmiş korunur (14 gün güncellenemeyen fiyat sitede gösterilmez)
    items.push({ retailer_id: id, url, error: e.message.slice(0, 200) });
  }
  if (items.length >= 10) await post(items.splice(0), stat);
}

const staleOf = (id) => known.filter((k) => k.retailer_id === id)
  .sort((a, b) => String(a.updated_at || '').localeCompare(String(b.updated_at || '')));

async function runStore(r) {
  const id = r.id;
  const cfg = adapterFor(r);
  const stat = { id, started_at: new Date().toISOString(), harita: 0, aday: 0, yeni: 0, yenilenen: 0, sayfa: 0, eklendi: 0, atlandi: 0, robots: 0, hata: 0, hatalar: {}, site: {}, blocksInRow: 0 };
  const items = [];
  try {
    if (!cfg.hasSource) throw new Error('Mağazanın site haritası ya da site adresi tanımlı değil (panelden adaptör ayarı girin).');
    const all = await sitemapUrls(cfg);
    stat.harita = all.length;
    const candidates = all.filter((u) => { try { return cfg.accept(u); } catch { return false; } });
    if (cfg.order) candidates.sort(cfg.order);
    if (cfg.arrange) candidates.splice(0, candidates.length, ...cfg.arrange(candidates));
    stat.aday = candidates.length;
    const mine = staleOf(id);
    const knownSet = new Set(mine.map((k) => k.url));
    // Yakın zamanda kontrol edilmiş bağlantılar tekrar açılmaz (sıklığın %80'i kadar süre)
    const freshFor = Math.max(1, (r.interval_hours || 6) * 0.8) * 3600e3;
    const stale = mine.filter((k) => !k.updated_at || Date.now() - Date.parse(k.updated_at) > freshFor).slice(0, cfg.refreshLimit ? Math.min(cfg.refreshLimit, REFRESH_LIMIT) : REFRESH_LIMIT).map((k) => k.url);
    let fresh = candidates.filter((u) => !knownSet.has(u)).slice(0, cfg.newLimit ? Math.min(cfg.newLimit, NEW_LIMIT) : NEW_LIMIT);
    let queue = [...fresh, ...stale];
    if (SAMPLE) { fresh = fresh.slice(0, SAMPLE); queue = [...fresh, ...stale.slice(0, Math.max(0, SAMPLE - fresh.length))]; }
    stat.yeni = fresh.length; stat.yenilenen = queue.length - fresh.length;
    console.log(`${id}: haritada ${all.length}, aday ${candidates.length}, yeni ${stat.yeni}, yenilenecek ${stat.yenilenen}${cfg.render ? ' (Playwright)' : ''}`);
    for (const url of queue) {
      try { await processUrl(id, cfg, url, stat, items); } catch (e) { if (!e.soft) throw e; }
    }
    if (items.length) await post(items.splice(0), stat);
    stat.ok = stat.harita > 0 && (stat.sayfa > 0 || queue.length === 0);
    if (!stat.harita) stat.mesaj = 'Site haritası bulunamadı ya da boş (panelden adaptör ayarına sitemaps girin).';
    else if (!stat.ok && stat.robots) stat.mesaj = 'robots.txt bu sayfalara izin vermiyor';
    else if (!stat.ok) stat.mesaj = Object.keys(stat.hatalar)[0] || 'Hiç sayfa okunamadı';
  } catch (e) {
    if (items.length) await post(items.splice(0), stat).catch(() => {});
    stat.ok = false;
    stat.blocked = e instanceof EngelHatasi;
    // 429: site "yavaşla" diyor; 403/CAPTCHA: erişim yok. İkisinde de mağaza duraklatılır, engel aşılmaya çalışılmaz.
    stat.mesaj = stat.blocked ? `Engellendi: ${e.message}. Mağaza duraklatıldı, engel aşılmaya çalışılmaz.` : e.message;
    console.error(id, stat.blocked ? 'ENGELLENDİ:' : 'başarısız:', e.message);
  }
  stat.finished_at = new Date().toISOString();
  return stat;
}

// Kuyruk: en fazla PARALLEL mağaza aynı anda; her mağaza kendi içinde sırayla ve beklemeli
const summary = [];
const queue = [...todo];
await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
  while (queue.length) summary.push(await runStore(queue.shift()));
}));
await net.close();

// Rapor: panelde son başarılı / son hata zamanı ve mesajı
const runs = summary.map((s) => ({
  retailer_id: s.id, started_at: s.started_at, finished_at: s.finished_at, ok: !!s.ok, blocked: !!s.blocked, pause_hours: s.blocked ? 24 : 0,
  pages: s.sayfa, added: s.site.added || 0, changed: s.site.changed || 0, unchanged: s.site.unchanged || 0, errors: s.hata,
  message: s.ok ? (s.hata ? `${s.hata} sayfada hata: ${Object.keys(s.hatalar).slice(0, 2).join(' | ')}` : null) : s.mesaj,
}));
if (!DRY) {
  const r = await api('scraper/report', { method: 'POST', body: JSON.stringify({ runs }) });
  if (!r.ok) console.warn('Rapor gönderilemedi:', r.status, r.txt.slice(0, 200));
  // Ülkeler ve mağazalar arası eşleştirme: aynı ürünün ayrı açılmış kayıtları birleştirilir
  try { await runMatching(SITE, auth, { dry: DRY }); } catch (e) { console.error('Eşleştirme başarısız:', e.message); }
}

console.log('\n=== Özet ===');
for (const s of summary) { delete s.blocksInRow; console.log(JSON.stringify(s)); }
console.log('Ağ:', JSON.stringify(net.stats));
const bad = summary.filter((s) => !s.ok);
if (bad.length) console.log(`::warning::${bad.length} mağaza başarısız: ${bad.map((s) => `${s.id} (${s.mesaj})`).join('; ').slice(0, 900)}`);
