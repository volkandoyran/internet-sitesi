// Gündem sitesi: otomasyonun merkezi. Yarım saatte bir Türkçe RSS kaynaklarından gündemi toplar
// (bot.js), tekrarları ayıklar, kaynaklı kısa metin yazar, bağlı platformlarda otomatik paylaşır ve
// haberleri herkese açık bir haber sitesi olarak yayınlar. /panel paylaşım metinlerini ve kaynak durumunu gösterir.
import SCHEMA from '../schema.sql';
import { topla } from './bot.js';
import { videoIstek } from './video.js';
import { kapakSvg } from './kapak.js';
import { gorselBilgi } from './gorsel.js';
import { listeSayfasi, kaynakSayfasi } from './panel.js';
import { haberler, oneCikanlar, haber, sonHaberler } from './veri.js';
import { kabuk, liste, oneCikanBlok, aramaFormu, sayfalama, detayGovde, HAKKINDA, kac } from './sayfa.js';

const sayfaNo = (url) => Math.max(1, Math.min(200, parseInt(url.searchParams.get('sayfa') || '1', 10) || 1));

export function rss(env, kok, liste) {
  const ad = env.SITE_ADI || 'Gündem Özeti';
  const ogeler = liste.map((h) => `<item><title>${kac(h.baslik)}</title><link>${kok}/haber/${h.id}</link><guid>${kok}/haber/${h.id}</guid>
<pubDate>${new Date(h.zaman).toUTCString()}</pubDate><description>${kac(h.metin)}</description></item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${kac(ad)}</title><link>${kok}/</link>
<description>${kac(env.SITE_ACIKLAMA || '')}</description><language>tr</language>
${ogeler}</channel></rss>`;
}

let hazir = null;
function semaKur(env) {
  hazir ||= env.DB.batch(SCHEMA.replace(/--[^\n]*/g, '').split(';').map((x) => x.trim()).filter(Boolean).map((q) => env.DB.prepare(q)))
    .catch((e) => { hazir = null; throw e; });
  return hazir;
}

// Sabit sürede karşılaştırma
async function sifreDogru(env, verilen) {
  if (!env.ADMIN_PASSWORD || !verilen) return false;
  const h = async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([h(env.ADMIN_PASSWORD), h(verilen)]);
  return a.every((x, i) => x === b[i]);
}

export default {
  async scheduled(event, env) {
    await semaKur(env);
    const r = await topla(env, event.scheduledTime);
    console.log(JSON.stringify({ gundemBotu: r }));
  },

  async fetch(req, env) {
    await semaKur(env);
    const url = new URL(req.url);
    const kok = url.origin;
    const yol = url.pathname.replace(/\/+$/, '') || '/';
    // Elle çalıştırma: curl -X POST -H "x-admin-sifre: ..." https://<site>/api/calistir
    if (yol === '/api/calistir' && req.method === 'POST') {
      if (!(await sifreDogru(env, req.headers.get('x-admin-sifre')))) return Response.json({ hata: 'yetkisiz' }, { status: 401 });
      return Response.json(await topla(env));
    }
    // Kısa video işleri (GitHub Actions'taki video üreticisi) ve /video/<id>.mp4 dosyaları: src/video.js
    if (yol.startsWith('/api/video') || yol.startsWith('/video/')) {
      const v = await videoIstek(req, env, yol);
      if (v) return v;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('İzin verilmiyor', { status: 405 });

    if (yol === '/') {
      const sayfa = sayfaNo(url);
      const ara = (url.searchParams.get('q') || '').trim().slice(0, 80);
      const [{ liste: l, sonraki }, one] = await Promise.all([
        haberler(env, { sayfa, ara }),
        sayfa === 1 && !ara ? oneCikanlar(env) : [],
      ]);
      const govde = aramaFormu(ara) + oneCikanBlok(one)
        + (ara ? `<h2 class="bolum">“${kac(ara)}” için sonuçlar</h2>` : '')
        + liste(l, ara ? { bosMesaj: 'Bu aramayla eşleşen haber bulunamadı.' } : undefined)
        + sayfalama('/', sayfa, sonraki, ara ? `&q=${encodeURIComponent(ara)}` : '');
      return kabuk(env, { secili: 'son', govde, kanonik: sayfa === 1 && !ara ? `${kok}/` : undefined });
    }
    if (yol === '/cok-konusulan') {
      const sayfa = sayfaNo(url);
      const { liste: l, sonraki } = await haberler(env, { sayfa, cok: true });
      return kabuk(env, { baslik: 'Çok konuşulanlar', secili: 'cok', aciklama: 'Birden çok haber kaynağında yer alan gündem başlıkları.',
        govde: liste(l, { bosMesaj: 'Henüz birden çok kaynakta geçen haber yok.' }) + sayfalama('/cok-konusulan', sayfa, sonraki) });
    }
    // /gorsel/<id>: fotoğraf varsa onu (Commons'a yönlendirme ya da KV'deki yapay zekâ görseli), yoksa SVG kapak
    const kp = yol.match(/^\/(kapak|gorsel)\/(\d+)(?:\.svg|\.jpg)?$/);
    if (kp) {
      const id = Number(kp[2]);
      if (kp[1] === 'gorsel') {
        const g = await gorselBilgi(env, id);
        if (g?.tur === 'wiki' && g.url) return Response.redirect(g.url, 302);
        if (g?.tur === 'ai' && env.GORSEL) {
          const v = await env.GORSEL.get(`g/${id}.jpg`, 'arrayBuffer');
          if (v) return new Response(v, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=604800' } });
        }
      }
      const h = await haber(env, id);
      if (!h) return new Response('Bulunamadı', { status: 404 });
      return new Response(kapakSvg(h), { headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=1800' } });
    }
    const m = yol.match(/^\/haber\/(\d+)$/);
    if (m) {
      const h = await haber(env, Number(m[1]));
      if (!h) return kabuk(env, { baslik: 'Bulunamadı', govde: '<p class="bos">Bu haber bulunamadı.</p>', durum: 404 });
      const g = await gorselBilgi(env, h.id);
      const foto = g && (g.tur === 'wiki' || g.tur === 'ai');
      return kabuk(env, { baslik: h.baslik, aciklama: h.metin, govde: detayGovde(h, foto ? g.atif : null), kanonik: `${kok}/haber/${h.id}`,
        gorsel: foto ? `${kok}/gorsel/${h.id}.jpg` : null });
    }
    if (yol === '/panel') return listeSayfasi(env, url);
    if (yol === '/panel/kaynaklar') return kaynakSayfasi(env);
    if (yol === '/hakkinda') return kabuk(env, { baslik: 'Hakkında', secili: 'hakkinda', govde: HAKKINDA });
    if (yol === '/rss.xml') {
      return new Response(rss(env, kok, await sonHaberler(env, 50)), { headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=300' } });
    }
    if (yol === '/robots.txt') return new Response(`User-agent: *\nAllow: /\nDisallow: /panel\nDisallow: /api/\nSitemap: ${kok}/sitemap.xml\n`, { headers: { 'content-type': 'text/plain' } });
    if (yol === '/sitemap.xml') {
      const l = await sonHaberler(env, 1000);
      const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${kok}/</loc></url>`
        + l.map((h) => `<url><loc>${kok}/haber/${h.id}</loc><lastmod>${kac(h.zaman)}</lastmod></url>`).join('') + '</urlset>';
      return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=600' } });
    }
    if (yol === '/api/haberler') {
      const { liste: l } = await haberler(env, { sayfa: sayfaNo(url) });
      return Response.json(l, { headers: { 'cache-control': 'public, max-age=120', 'access-control-allow-origin': '*' } });
    }
    return kabuk(env, { baslik: 'Sayfa bulunamadı', govde: '<p class="bos">Aradığınız sayfa bulunamadı. <a href="/">Ana sayfaya dön</a></p>', durum: 404 });
  },
};
