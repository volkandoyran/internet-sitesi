// /ads.txt içeriği admin panelinden yönetilir (AdSense için gerekli)
export async function onRequest({ env }) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'ads_txt'").first();
  return new Response((row && row.value) || '', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
