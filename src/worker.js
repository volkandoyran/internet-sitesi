// Worker giriş noktası: /api/* ve /ads.txt burada işlenir, diğer her şey public/ klasöründen sunulur.
// Ana sayfaya admin panelinden girilen <head> kodu (ör. AdSense) eklenir.
import { handleApi } from './api.js';
import { matchedPage, specsListPage, productPage, sitemap } from './pages.js';
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
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

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
    const url = new URL(request.url);
    await ensureSchema(env);
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env, url.pathname.slice(5).split('/').filter(Boolean));
    }
    if (url.pathname === '/ads.txt') {
      return new Response(await setting(env, 'ads_txt'), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
    if (url.pathname === '/sitemap.xml') return sitemap(env);
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
  },
};
