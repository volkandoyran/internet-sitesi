// Worker giriş noktası: tüm istekler önce buradan geçer (site yalnızca sahibine açık, bkz. giris.js).
// /api/* ve /ads.txt burada işlenir, diğer her şey public/ klasöründen sunulur.
// Ana sayfaya admin panelinden girilen <head> kodu (ör. AdSense) eklenir.
import { handleApi } from './api.js';
import { matchedPage, specsListPage, productPage } from './pages.js';
import { kapi, noindex } from './giris.js';
import SCHEMA from '../schema.sql';

// Tablolar yoksa schema.sql'i çalıştırır (ilk yayından sonraki ilk istekte bir kez)
let ready = null;
function ensureSchema(env) {
  ready ||= (async () => {
    const t = await env.DB.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'settings'").first();
    if (!t) {
      const stmts = SCHEMA.replace(/--[^\n]*/g, '').split(';').map((x) => x.trim()).filter(Boolean);
      await env.DB.batch(stmts.map((q) => env.DB.prepare(q)));
      return;
    }
    // Eski kurulumlar için: otomatik katalogla gelen sütun ve dizinler
    const cols = (await env.DB.prepare('PRAGMA table_info(products)').all()).results.map((c) => c.name);
    if (!cols.includes('match_key')) {
      await env.DB.batch([
        env.DB.prepare('ALTER TABLE products ADD COLUMN match_key TEXT'),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS products_match ON products(match_key)'),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS offers_url ON offers(retailer_id, url)'),
      ]);
    }
    // Ülkeler arası eşleştirme anahtarları
    if (!cols.includes('mkeys')) await env.DB.prepare('ALTER TABLE products ADD COLUMN mkeys TEXT').run();
    // Mağaza sayfalarından okunan teknik özellikler
    if (!cols.includes('specs')) await env.DB.prepare('ALTER TABLE products ADD COLUMN specs TEXT').run();
    await migrateScraper(env);
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

// Kendi veri toplama motoru için eklenen sütunlar ve tablo (26 Kasım 2026).
// Yalnızca ekleme yapar: mevcut veriye dokunmaz, tekrar çalıştırmak güvenlidir.
export const SCRAPER_COLUMNS = [
  ['products', 'description', 'TEXT'],
  ['offers', 'old_price', 'REAL'],
  ['offers', 'store_category', 'TEXT'],
  ['offers', 'checked_at', 'TEXT'],
  ['price_history', 'price', 'REAL'],
  ['price_history', 'currency', 'TEXT'],
  ['retailers', 'interval_hours', 'INTEGER NOT NULL DEFAULT 6'],
  ['retailers', 'config', 'TEXT'],
  ['retailers', 'run_requested', 'INTEGER NOT NULL DEFAULT 0'],
  ['retailers', 'last_run_at', 'TEXT'],
  ['retailers', 'last_ok_at', 'TEXT'],
  ['retailers', 'last_error_at', 'TEXT'],
  ['retailers', 'last_error', 'TEXT'],
  ['retailers', 'paused_until', 'TEXT'],
  ['retailers', 'fail_count', 'INTEGER NOT NULL DEFAULT 0'],
];
async function migrateScraper(env) {
  const have = {};
  for (const t of new Set(SCRAPER_COLUMNS.map((c) => c[0]))) {
    have[t] = new Set((await env.DB.prepare(`PRAGMA table_info(${t})`).all()).results.map((c) => c.name));
  }
  const stmts = SCRAPER_COLUMNS.filter(([t, c]) => !have[t].has(c))
    .map(([t, c, def]) => env.DB.prepare(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`));
  stmts.push(env.DB.prepare(`CREATE TABLE IF NOT EXISTS scrape_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, retailer_id TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT,
    ok INTEGER NOT NULL DEFAULT 0, blocked INTEGER NOT NULL DEFAULT 0, pages INTEGER NOT NULL DEFAULT 0,
    added INTEGER NOT NULL DEFAULT 0, changed INTEGER NOT NULL DEFAULT 0, unchanged INTEGER NOT NULL DEFAULT 0,
    errors INTEGER NOT NULL DEFAULT 0, message TEXT)`));
  stmts.push(env.DB.prepare('CREATE INDEX IF NOT EXISTS runs_retailer ON scrape_runs(retailer_id, started_at)'));
  await env.DB.batch(stmts);
}

const safeDecode =(s) => { try { return decodeURIComponent(s); } catch { return s; } };

async function setting(env, key) {
  try {
    const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
    return (row && row.value) || '';
  } catch {
    return '';
  }
}

export default {
  async fetch(request, env) {
    return noindex(await handle(request, env));
  },
};

async function handle(request, env) {
  const url = new URL(request.url);
  await ensureSchema(env);
  // Giriş kapısı. Giriş sayfasına yalnızca Search Console doğrulama etiketi eklenir (site sahipliği korunur).
  const dogrulama = ((await setting(env, 'ad_head')).match(/<meta[^>]+google-site-verification[^>]*>/gi) || []).join('\n');
  const engel = await kapi(request, env, url, dogrulama);
  if (engel) return engel;
  if (url.pathname.startsWith('/api/')) {
    return handleApi(request, env, url.pathname.slice(5).split('/').filter(Boolean));
  }
  if (url.pathname === '/ads.txt') {
    return new Response(await setting(env, 'ads_txt'), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  // Site özel: arama motorlarına site haritası verilmez
  if (url.pathname === '/sitemap.xml') return new Response('Bulunamadı', { status: 404 });
  let res;
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path === '/eslesen') res = await matchedPage(env);
  else if (path === '/ozellikler') res = await specsListPage(env);
  else if (path.startsWith('/urun/')) res = await productPage(env, safeDecode(path.slice(6)), url.origin);
  else res = await env.ASSETS.fetch(request);
  if (!(res.headers.get('content-type') || '').includes('text/html') || url.pathname.startsWith('/admin')) return res;
  const code = await setting(env, 'ad_head');
  if (!code) return res;
  return new HTMLRewriter().on('head', { element(el) { el.append(code, { html: true }); } }).transform(res);
}
