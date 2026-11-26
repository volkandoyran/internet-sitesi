// Siteye giriş başlığı. GitHub Actions'ta şifre yerine GitHub'ın imzaladığı kısa ömürlü kimlik belirteci (OIDC)
// kullanılır (iş akışında "permissions: id-token: write"); belirteç 4 dakikada bir yenilenir.
// Actions dışında (yerelde) ADMIN_PASSWORD kullanılır.
const AUDIENCE = 'ucfiyat';
let cached = null, at = 0;

export async function authHeaders() {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL, req = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (url && req) {
    if (!cached || Date.now() - at > 4 * 60e3) {
      const r = await fetch(`${url}&audience=${AUDIENCE}`, { headers: { authorization: 'bearer ' + req }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error('GitHub kimlik belirteci alınamadı: ' + r.status);
      cached = (await r.json()).value;
      at = Date.now();
    }
    return { authorization: 'Bearer ' + cached };
  }
  const pw = (process.env.ADMIN_PASSWORD || '').trim();
  return pw ? { authorization: 'Bearer ' + pw } : {};
}

export const hasAuth = () => !!((process.env.ACTIONS_ID_TOKEN_REQUEST_URL && process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) || (process.env.ADMIN_PASSWORD || '').trim());
