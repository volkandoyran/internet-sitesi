// Siteyi yalnızca sahibine açan giriş kapısı.
// - Tarayıcıdan gelen herkes önce /giris sayfasında şifreyi girer: SITE_PASSWORD (varsa) ya da ADMIN_PASSWORD; doğru şifre
//   bir yıl geçerli, HttpOnly bir çerez bırakır. Şifre değişirse eski çerezler kendiliğinden geçersizleşir.
// - Tarama işleri (GitHub Actions) "authorization: Bearer <ADMIN_PASSWORD>" başlığıyla gelir; onlar çerezsiz geçer.
// - Her yanıta noindex başlığı eklenir; arama motorları siteyi dizine almaz.

const COOKIE = 'ucf_oturum';
const YIL = 365 * 24 * 3600;
// Girişsiz açık kalan küçük dosyalar: ana ekrana eklenen kısayolun simgesi ve robots.txt
const ACIK = new Set(['/robots.txt', '/icon.svg', '/icon-180.png', '/icon-512.png', '/manifest.webmanifest', '/favicon.ico']);

import { esit, kilitli, yanlisDeneme, dogruDeneme, DENEME } from './guvenlik.js';

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

// Çerez değeri: şifreyle imzalanmış sabit bir metin (şifrenin kendisi çerezde durmaz)
async function oturumDegeri(pw) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode('ucfiyat-site-oturumu-v1')));
}

function cerez(request, ad) {
  for (const p of (request.headers.get('cookie') || '').split(';')) {
    const i = p.indexOf('=');
    if (i > 0 && p.slice(0, i).trim() === ad) return p.slice(i + 1).trim();
  }
  return '';
}

export function noindex(res) {
  const r = new Response(res.body, res);
  r.headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
  return r;
}

// Yalnızca yerel yönlendirmeye izin ver (açık yönlendirme olmasın)
const guvenliHedef = (s) => (typeof s === 'string' && s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\') ? s : '/');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function girisSayfasi(hedef, hata, basKodu, status = 200) {
  const html = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#16202a">
<meta name="apple-mobile-web-app-title" content="Üçfiyat">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icon-180.png">
<link rel="manifest" href="/manifest.webmanifest">
<title>Giriş · Üçfiyat</title>
${basKodu}
<style>
  :root { color-scheme: light dark; --bg: #f3f5f8; --kart: #fff; --yazi: #131b25; --soluk: #566272; --cizgi: #c6cfd9; --vurgu: #131b25; --vurgu-yazi: #fff; --hata: #b42318; --odak: #1d5fd0; --isaret: #ffd84d; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0f151c; --kart: #17202a; --yazi: #e9eef3; --soluk: #9eabb9; --cizgi: #3a4757; --vurgu: #e9eef3; --vurgu-yazi: #0f151c; --hata: #ff8a80; --odak: #6ea2ff; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; min-height: 100dvh; display: grid; place-items: center; padding: 16px; background: var(--bg); color: var(--yazi);
         font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  form { width: 100%; max-width: 380px; background: var(--kart); border: 1px solid var(--cizgi); border-radius: 16px; padding: 28px 24px 24px;
         box-shadow: 0 1px 2px rgba(19,27,37,.05), 0 8px 24px -12px rgba(19,27,37,.18); }
  .logo { display: flex; align-items: center; gap: 10px; margin: 0 0 18px; font-weight: 800; font-size: 20px; letter-spacing: -.01em; }
  .logo span { display: grid; gap: 2px; width: 22px; }
  .logo i { display: block; height: 5px; border-radius: 1.5px; }
  h1 { margin: 0 0 4px; font-size: 20px; }
  p { margin: 0 0 18px; color: var(--soluk); font-size: 14.5px; }
  label { display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; }
  input { width: 100%; font: inherit; font-size: 16px; min-height: 50px; padding: 0 14px; border-radius: 12px; border: 1.5px solid var(--cizgi); background: transparent; color: inherit; }
  input:focus { outline: none; border-color: var(--yazi); box-shadow: 0 0 0 4px color-mix(in srgb, var(--odak) 22%, transparent); }
  button { width: 100%; margin-top: 14px; font: inherit; font-size: 16px; font-weight: 700; min-height: 50px; border: 0; border-radius: 12px; background: var(--vurgu); color: var(--vurgu-yazi); cursor: pointer; }
  button:hover { opacity: .9; }
  button:focus-visible { outline: 3px solid var(--odak); outline-offset: 2px; }
  .hata { color: var(--hata); font-size: 14px; margin: 12px 0 0; }
</style>
</head>
<body>
<form method="post" action="/giris">
  <div class="logo" aria-hidden="true"><span><i style="background:#c8102e"></i><i style="background:#1560bd;width:72%"></i><i style="background:#00875a;width:86%"></i></span>Üçfiyat</div>
  <h1>Giriş yap</h1>
  <p>Bu site özeldir. Devam etmek için şifreni gir.</p>
  <label for="sifre">Şifre</label>
  <input id="sifre" name="sifre" type="password" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" required autofocus>
  <input type="hidden" name="hedef" value="${esc(hedef)}">
  <button type="submit">Giriş yap</button>
  ${hata ? `<div class="hata" role="alert">${esc(hata)}</div>` : ''}
</form>
</body>
</html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

// İsteğe izin verilirse null, verilmezse döndürülecek yanıtı verir.
// basKodu: giriş sayfasının <head>'ine eklenecek kod (Search Console doğrulama etiketi sahiplik kanıtı için kalır).
export async function kapi(request, env, url, basKodu = '') {
  const pw = env.ADMIN_PASSWORD;
  // Siteye giriş şifresi: ayrı SITE_PASSWORD gizli anahtarı varsa o, yoksa admin şifresi
  const sitePw = env.SITE_PASSWORD || pw;
  const path = url.pathname;

  if (path === '/giris') {
    if (request.method === 'POST' && sitePw) {
      const form = await request.formData().catch(() => null);
      // Telefon klavyelerinin eklediği baştaki/sondaki boşluklar yok sayılır
      const sifre = String((form && form.get('sifre')) || '').trim();
      const hedef = guvenliHedef(form && form.get('hedef'));
      // Aynı IP'den çok sayıda yanlış deneme: şifre hiç denetlenmeden beklemeye alınır
      const bekle = await kilitli(env, request, 'site');
      if (bekle) {
        const res = girisSayfasi(hedef, `Çok sayıda yanlış deneme. ${Math.ceil(bekle / 60)} dakika sonra tekrar deneyin.`, basKodu, 429);
        res.headers.set('retry-after', String(bekle));
        return res;
      }
      const dogru = (await esit(sifre, sitePw.trim())) || (pw && (await esit(sifre, pw.trim())));
      if (dogru) {
        await dogruDeneme(env, request, 'site');
        return new Response(null, {
          status: 303,
          headers: {
            location: hedef,
            'set-cookie': `${COOKIE}=${await oturumDegeri(sitePw)}; Max-Age=${YIL}; Path=/; HttpOnly; Secure; SameSite=Lax`,
            'cache-control': 'no-store',
          },
        });
      }
      await yanlisDeneme(env, request, 'site');
      await new Promise((r) => setTimeout(r, 800)); // tahmin denemelerini yavaşlat
      return girisSayfasi(hedef, `Şifre yanlış. (${DENEME.pencereDk} dakikada en fazla ${DENEME.max} deneme)`, basKodu, 401);
    }
    return girisSayfasi(guvenliHedef(url.searchParams.get('hedef')), sitePw ? '' : 'Site şifresi ayarlanmamış (ADMIN_PASSWORD).', basKodu);
  }
  if (path === '/cikis') {
    return new Response(null, { status: 303, headers: { location: '/giris', 'set-cookie': `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax` } });
  }
  if (ACIK.has(path)) return null;
  if (!sitePw) return girisSayfasi('/', 'Site şifresi ayarlanmamış (ADMIN_PASSWORD).', basKodu, 503);

  // Tarama işleri ve admin paneli: Bearer başlığı
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (bearer && pw && (await esit(bearer, pw))) return null;
  // Tarayıcı: oturum çerezi
  const c = cerez(request, COOKIE);
  if (c && (await esit(c, await oturumDegeri(sitePw)))) return null;

  if (path.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'Giriş gerekli.' }), { status: 401, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Giriş gerekli.', { status: 401 });
  // Ana sayfa: giriş formu doğrudan gösterilir (Search Console doğrulaması yönlendirmesiz görebilsin)
  if (path === '/' && !url.search) return girisSayfasi('/', '', basKodu);
  const hedef = path + url.search;
  return new Response(null, { status: 302, headers: { location: '/giris' + (hedef !== '/' ? '?hedef=' + encodeURIComponent(hedef) : ''), 'cache-control': 'no-store' } });
}
