// Worker giriş noktası: /api/* ve /ads.txt burada işlenir, diğer her şey public/ klasöründen sunulur.
// Ana sayfaya admin panelinden girilen <head> kodu (ör. AdSense) eklenir.
import { handleApi } from './api.js';

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
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env, url.pathname.slice(5).split('/').filter(Boolean));
    }
    if (url.pathname === '/ads.txt') {
      return new Response(await setting(env, 'ads_txt'), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
    const res = await env.ASSETS.fetch(request);
    if (!(res.headers.get('content-type') || '').includes('text/html') || url.pathname.startsWith('/admin')) return res;
    const code = await setting(env, 'ad_head');
    if (!code) return res;
    return new HTMLRewriter().on('head', { element(el) { el.append(code, { html: true }); } }).transform(res);
  },
};
