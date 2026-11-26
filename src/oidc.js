// GitHub Actions kimliği (OIDC): tarama işi şifre taşımaz. Her istekte GitHub'ın imzaladığı kısa ömürlü bir
// belirteç (JWT) gönderir; burada GitHub'ın açık anahtarlarıyla doğrulanır. Yalnızca bu deponun
// .github/workflows/scrape.yml iş akışından gelen belirteç kabul edilir. Böylece GitHub'da ADMIN_PASSWORD
// gizli anahtarı gerekmez ve Cloudflare'deki şifre değişse de tarama bozulmaz.
const ISSUER = 'https://token.actions.githubusercontent.com';
export const AUDIENCE = 'ucfiyat';
const DEFAULT_REPO = 'volkandoyran/internet-sitesi';
const WORKFLOW = '.github/workflows/scrape.yml';

let jwks = null, jwksAt = 0;
async function keys(force = false) {
  if (!force && jwks && Date.now() - jwksAt < 3600e3) return jwks;
  const r = await fetch(ISSUER + '/.well-known/jwks', { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error('GitHub anahtarları alınamadı: ' + r.status);
  jwks = (await r.json()).keys || [];
  jwksAt = Date.now();
  return jwks;
}

const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const part = (s) => JSON.parse(new TextDecoder().decode(b64url(s)));

export const jwtMi = (t) => /^eyJ[\w-]*\.[\w-]+\.[\w-]+$/.test(t || '');

// Belirteç geçerliyse true. claims kontrolü ayrı fonksiyonda (test edilebilir).
export async function githubActionsMi(token, env, now = Date.now()) {
  if (!jwtMi(token)) return false;
  try {
    const [h, p, s] = token.split('.');
    const head = part(h), claims = part(p);
    if (head.alg !== 'RS256' || !claimsGecerli(claims, env, now)) return false;
    let jwk = (await keys()).find((k) => k.kid === head.kid);
    if (!jwk) jwk = (await keys(true)).find((k) => k.kid === head.kid); // anahtar yenilenmiş olabilir
    if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(s), new TextEncoder().encode(h + '.' + p));
  } catch {
    return false;
  }
}

export function claimsGecerli(c, env = {}, now = Date.now()) {
  const repo = (env.GITHUB_REPO || DEFAULT_REPO).toLowerCase();
  const t = Math.floor(now / 1000);
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  return c.iss === ISSUER
    && aud.includes(AUDIENCE)
    && String(c.repository || '').toLowerCase() === repo
    && String(c.workflow_ref || '').toLowerCase().startsWith(`${repo}/${WORKFLOW}@`)
    && typeof c.exp === 'number' && c.exp > t - 60
    && (typeof c.nbf !== 'number' || c.nbf <= t + 60);
}
