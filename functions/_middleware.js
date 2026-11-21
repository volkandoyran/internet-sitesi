// HTML sayfalarının <head> kısmına admin panelinden girilen reklam/analitik kodunu ekler
// (ör. Google AdSense doğrulama betiği). Admin ve API isteklerine dokunmaz.
export async function onRequest({ request, next, env }) {
  const res = await next();
  const path = new URL(request.url).pathname;
  const type = res.headers.get('content-type') || '';
  if (!type.includes('text/html') || path.startsWith('/admin') || !env.DB) return res;
  let code = '';
  try {
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'ad_head'").first();
    code = (row && row.value) || '';
  } catch { return res; }
  if (!code) return res;
  return new HTMLRewriter().on('head', { element(el) { el.append(code, { html: true }); } }).transform(res);
}
