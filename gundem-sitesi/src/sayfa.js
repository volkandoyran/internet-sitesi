// Sunucuda üretilen HTML. Kaynak haberlerin metni kopyalanmaz: yalnızca başlık, botun yazdığı
// kısa özet ve haberin alındığı yerin adı gösterilir (bağlantı verilmez).

import { sehitMi } from './metin.js';

export const kac = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const TZ = 'Europe/Istanbul';
export function goreli(iso, simdi = Date.now()) {
  if (!iso) return '';
  const dk = Math.round((simdi - Date.parse(iso)) / 60000);
  if (dk < 1) return 'az önce';
  if (dk < 60) return `${dk} dk önce`;
  if (dk < 24 * 60) return `${Math.floor(dk / 60)} sa önce`;
  return new Date(iso).toLocaleString('tr-TR', { timeZone: TZ, day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}
const tamTarih = (iso) => iso ? new Date(iso).toLocaleString('tr-TR', { timeZone: TZ, dateStyle: 'long', timeStyle: 'short' }) : '';

// Metnin sonundaki hashtag'leri ayırır
export function metniAyir(metin) {
  const m = String(metin || '').trim();
  const etiket = (m.match(/(?:\s#[\p{L}\p{N}_]+)+$/u) || [''])[0];
  return { govde: m.slice(0, m.length - etiket.length).trim(), etiketler: etiket.trim().split(/\s+/).filter(Boolean) };
}

const STIL = `
:root{--bg:#faf9f6;--kart:#fff;--yazi:#16161a;--soluk:#62626a;--cizgi:#e6e3dc;--vurgu:#c0261c;--vurgu-ac:#fbe9e7}
@media (prefers-color-scheme:dark){:root{--bg:#121214;--kart:#1b1b1e;--yazi:#ececef;--soluk:#9d9da5;--cizgi:#2e2e33;--vurgu:#ff6a5c;--vurgu-ac:#3a1a17}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--yazi);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:inherit}.kap{max-width:820px;margin:0 auto;padding:0 16px}
.ust{border-bottom:3px solid var(--yazi);background:var(--kart)}
.ust .kap{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:14px;padding-bottom:12px;flex-wrap:wrap}
.logo{font:800 24px/1 Georgia,"Times New Roman",serif;text-decoration:none;letter-spacing:-.5px}.logo b{color:var(--vurgu)}
.tarih{color:var(--soluk);font-size:13px}
nav{display:flex;gap:4px;flex-wrap:wrap;padding:10px 0}
nav a{text-decoration:none;font-size:14px;font-weight:600;padding:6px 12px;border-radius:999px;color:var(--soluk)}
nav a.on{background:var(--yazi);color:var(--bg)}
form.ara{display:flex;gap:6px;margin:0 0 18px}form.ara input{flex:1;min-width:0;font:inherit;padding:9px 12px;border:1px solid var(--cizgi);border-radius:10px;background:var(--kart);color:var(--yazi)}
form.ara button,.sayfala a{font:inherit;font-size:14px;font-weight:600;padding:9px 14px;border-radius:10px;border:1px solid var(--cizgi);background:var(--kart);color:var(--yazi);text-decoration:none;cursor:pointer}
h2.bolum{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--vurgu);margin:22px 0 10px}
.one{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}
.one a{display:block;text-decoration:none;background:var(--vurgu-ac);border-radius:12px;padding:12px 14px}
.one a strong{display:block;font:700 16px/1.3 Georgia,serif;margin-bottom:6px}.one a span{font-size:12.5px;color:var(--soluk)}
article.haber{background:var(--kart);border:1px solid var(--cizgi);border-radius:14px;padding:16px;margin-bottom:12px;display:grid;grid-template-columns:200px 1fr;gap:16px;align-items:start}
.kapak img,.one img,.kapak-buyuk{display:block;width:100%;height:auto;aspect-ratio:1200/630;object-fit:cover;border-radius:10px;background:var(--cizgi)}
.one img{margin-bottom:10px;border-radius:8px}.kapak-buyuk{border-radius:14px;object-fit:cover}.kapak-fig{margin:6px 0 16px}.kapak-fig figcaption{font-size:12px;color:var(--soluk);margin-top:6px}
table.tum{width:100%;border-collapse:collapse;background:var(--kart);border:1px solid var(--cizgi);border-radius:14px;overflow:hidden;font-size:15px}
table.tum td{padding:9px 12px;border-bottom:1px solid var(--cizgi);vertical-align:top}table.tum td.saat{color:var(--soluk);white-space:nowrap;font-size:13px;width:1%}
table.tum td.k{color:var(--soluk);font-size:13px;white-space:nowrap;width:1%}table.tum a{text-decoration:none;font-weight:600}table.tum a:hover{text-decoration:underline}
table.tum tr.gun td{background:var(--bg);font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--vurgu)}
.filtre{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 14px;align-items:center}.filtre a{font-size:13px;font-weight:600;text-decoration:none;padding:5px 12px;border:1px solid var(--cizgi);border-radius:999px;color:var(--soluk)}.filtre a.on{color:var(--yazi);border-color:var(--yazi)}.filtre span{color:var(--soluk);font-size:13px;margin-left:auto}
@media (max-width:600px){table.tum td.k{display:none}article.haber{grid-template-columns:1fr;gap:12px}}
article.haber h3{font:700 19px/1.3 Georgia,"Times New Roman",serif;margin:0 0 6px}article.haber h3 a{text-decoration:none}
article.haber h3 a:hover{text-decoration:underline}
.meta{display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:13px;color:var(--soluk);margin-bottom:8px}
.rozet{color:var(--vurgu);border:1px solid currentColor;border-radius:999px;padding:0 8px;font-weight:700;font-size:12px}
p.ozet{margin:0 0 8px}.etiket{font-size:13px;color:var(--soluk);margin-right:6px}
.kaynak{font-size:13.5px;color:var(--soluk)}.kaynak b{color:var(--yazi)}.rozet.ceviri{color:var(--soluk)}.rozet.yas{color:var(--yazi);background:var(--cizgi);border-color:var(--yazi)}
.sayfala{display:flex;justify-content:space-between;margin:20px 0}
.bos{text-align:center;color:var(--soluk);padding:60px 0}
.detay h1{font:800 clamp(24px,5vw,34px)/1.2 Georgia,"Times New Roman",serif;margin:18px 0 10px}
.detay .ozet{font-size:18px}.detay .icerik p{font-size:18px;line-height:1.65;margin:0 0 14px}.detay ul{padding-left:20px}.detay li{margin:6px 0}
footer{border-top:1px solid var(--cizgi);margin-top:30px;padding:18px 0 40px;font-size:13px;color:var(--soluk)}`;

export function kabuk(env, { baslik, aciklama, secili = '', govde, kanonik, gorsel, makale, durum = 200 }) {
  const ad = env.SITE_ADI || 'Gündem Özeti';
  const tamBaslik = baslik ? `${baslik} · ${ad}` : `${ad} · Türkiye gündemi`;
  const acik = aciklama || env.SITE_ACIKLAMA || '';
  const bugun = new Date().toLocaleDateString('tr-TR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const sekme = (yol, ad2, k) => `<a href="${yol}" class="${secili === k ? 'on' : ''}">${ad2}</a>`;
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${kac(tamBaslik)}</title><meta name="description" content="${kac(acik)}">
<meta property="og:title" content="${kac(baslik || ad)}"><meta property="og:description" content="${kac(acik)}"><meta property="og:type" content="${makale ? 'article' : 'website'}">
<meta property="og:site_name" content="${kac(ad)}"><meta property="og:locale" content="tr_TR">${kanonik ? `<meta property="og:url" content="${kac(kanonik)}">` : ''}
${env.GOOGLE_DOGRULAMA ? `<meta name="google-site-verification" content="${kac(env.GOOGLE_DOGRULAMA)}">` : ''}
${makale ? `<script type="application/ld+json">${JSON.stringify(makale).replace(/</g, '\\u003c')}</script>` : ''}${gorsel ? `<meta property="og:image" content="${kac(gorsel)}"><meta name="twitter:card" content="summary_large_image">` : ''}
${kanonik ? `<link rel="canonical" href="${kac(kanonik)}">` : ''}
<link rel="alternate" type="application/rss+xml" title="${kac(ad)}" href="/rss.xml">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23c0261c'/%3E%3Ctext x='16' y='23' font-size='19' text-anchor='middle' fill='white' font-family='Georgia' font-weight='bold'%3EG%3C/text%3E%3C/svg%3E">
<style>${STIL}</style></head><body>
<header class="ust"><div class="kap"><a class="logo" href="/">${kac(ad.split(' ')[0])} <b>${kac(ad.split(' ').slice(1).join(' '))}</b></a><span class="tarih">${kac(bugun)}</span></div></header>
<div class="kap"><nav>${sekme('/', 'Son haberler', 'son')}${sekme('/cok-konusulan', 'Çok konuşulanlar', 'cok')}${sekme('/tum-haberler', 'Tüm haberler', 'tum')}${sekme('/hakkinda', 'Hakkında', 'hakkinda')}</nav>
<main>${govde}</main>
<footer>Özetler otomatik hazırlanır; haberlerin tamamı ve sorumluluğu ilgili kaynaklardadır. Her haberde haberin alındığı kaynak belirtilir. <a href="/rss.xml">RSS</a></footer></div>
</body></html>`;
  return new Response(html, { status: durum, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=120' } });
}

function kaynakSatiri(h) {
  if (!h.kaynaklar.length) return '';
  const ilk = h.kaynaklar.slice(0, 3).map((k) => `<b>${kac(k.ad)}</b>`).join(', ');
  const kalan = h.kaynaklar.length - 3;
  return `<div class="kaynak">Kaynak: ${ilk}${kalan > 0 ? ` ve ${kalan} kaynak daha` : ''}</div>`;
}

export function haberKarti(h, simdi) {
  const { govde, etiketler } = metniAyir(h.metin);
  return `<article class="haber"><a class="kapak" href="/haber/${h.id}" tabindex="-1" aria-hidden="true"><img src="/gorsel/${h.id}" alt="" loading="lazy" width="1200" height="630"></a><div class="icerik"><div class="meta"><time datetime="${kac(h.zaman)}">${kac(goreli(h.zaman, simdi))}</time>
${h.kaynak_sayisi > 1 ? `<span class="rozet">${h.kaynak_sayisi} kaynakta</span>` : ''}${h.yabanci ? '<span class="rozet ceviri">Yabancı basından çeviri</span>' : ''}${sehitMi(h) ? '<span class="rozet yas">Acı haber</span>' : ''}</div>
<h3><a href="/haber/${h.id}">${kac(h.baslik)}</a></h3>
${govde ? `<p class="ozet">${kac(govde)}</p>` : ''}
${etiketler.length ? `<div>${etiketler.map((e) => `<span class="etiket">${kac(e)}</span>`).join('')}</div>` : ''}
${kaynakSatiri(h)}</div></article>`;
}

export function liste(haberler, { bosMesaj = 'Henüz haber yok. Gündem botu her yarım saatte yeni haberleri toplar.' } = {}) {
  const simdi = Date.now();
  return haberler.length ? haberler.map((h) => haberKarti(h, simdi)).join('') : `<p class="bos">${kac(bosMesaj)}</p>`;
}

export function oneCikanBlok(haberler) {
  if (!haberler.length) return '';
  return `<h2 class="bolum">Son 24 saatin öne çıkanları</h2><div class="one">${haberler.map((h) =>
    `<a href="/haber/${h.id}"><img src="/gorsel/${h.id}" alt="" loading="lazy" width="1200" height="630"><strong>${kac(h.baslik)}</strong><span>${h.kaynak_sayisi} kaynakta · ${kac(goreli(h.zaman))}</span></a>`).join('')}</div>
<h2 class="bolum">Son haberler</h2>`;
}

export function aramaFormu(ara) {
  return `<form class="ara" action="/" method="get" role="search"><input type="search" name="q" value="${kac(ara)}" placeholder="Haberlerde ara" aria-label="Haberlerde ara"><button>Ara</button></form>`;
}

export function sayfalama(yol, sayfa, sonraki, ekParam = '') {
  if (sayfa <= 1 && !sonraki) return '';
  const link = (n) => `${yol}?sayfa=${n}${ekParam}`;
  return `<div class="sayfala">${sayfa > 1 ? `<a href="${link(sayfa - 1)}">← Daha yeni</a>` : '<span></span>'}${sonraki ? `<a href="${link(sayfa + 1)}">Daha eski →</a>` : ''}</div>`;
}

export function detayGovde(h, atif = null) {
  const { govde, etiketler } = metniAyir(h.metin);
  return `<div class="detay"><div class="meta"><time datetime="${kac(h.zaman)}">${kac(tamTarih(h.zaman))}</time>
${h.kaynak_sayisi > 1 ? `<span class="rozet">${h.kaynak_sayisi} kaynakta</span>` : ''}${h.yabanci ? '<span class="rozet ceviri">Yabancı basından çeviri</span>' : ''}${sehitMi(h) ? '<span class="rozet yas">Acı haber</span>' : ''}</div>
<h1>${kac(h.baslik)}</h1><figure class="kapak-fig"><img class="kapak-buyuk" src="/gorsel/${h.id}" alt="${kac(h.baslik)}" width="1200" height="630">${atif ? `<figcaption>${kac(atif)}</figcaption>` : ''}</figure>${h.icerik ? `<div class="icerik">${h.icerik.split(/\n\s*\n/).map((p) => `<p>${kac(p)}</p>`).join('')}</div>` : govde ? `<p class="ozet">${kac(govde)}</p>` : ''}
${etiketler.length ? `<div>${etiketler.map((e) => `<span class="etiket">${kac(e)}</span>`).join('')}</div>` : ''}
<h2 class="bolum">Kaynak</h2>
<ul>${h.kaynaklar.map((k) => `<li>${kac(k.ad)}${k.dil ? ' (Türkçe çeviri)' : ''}</li>`).join('')}</ul>
<p><a href="/">← Tüm haberler</a></p></div>`;
}

export const HAKKINDA = `<div class="detay"><h1>Hakkında</h1>
<p>Bu site Türkiye ve dünya gündemindeki haberleri tek yerde, kısa ve tarafsız özetlerle sunar. Haberler, haber sitelerinin herkese açık RSS akışlarından otomatik olarak toplanır; aynı olayı veren haberler birleştirilir ve kaç kaynakta geçtiği gösterilir. Yabancı basındaki önemli haberler Türkçeye çevrilerek eklenir.</p>
<p>Haber metinleri ve çeviriler, kaynak haberdeki bilgilerden yapay zekâ ile kendi cümlelerimizle yeniden yazılır; metne kaynakta olmayan bilgi eklenmez. Kaynak haberlerin metinleri ve fotoğrafları kopyalanmaz; her haberde haberin alındığı kaynak belirtilir.</p>
<p>Bir haberle ilgili düzeltme ya da kaldırma isteğiniz varsa lütfen ilgili kaynağa ve bize bildirin.</p></div>`;

// Google için haber yapısal verisi (NewsArticle)
export function haberSemasi(env, kok, h, foto) {
  return {
    '@context': 'https://schema.org', '@type': 'NewsArticle',
    headline: h.baslik.slice(0, 110), description: h.metin, inLanguage: 'tr',
    ...(h.icerik ? { articleBody: h.icerik } : {}),
    datePublished: h.zaman, dateModified: h.zaman, mainEntityOfPage: `${kok}/haber/${h.id}`,
    ...(foto ? { image: [`${kok}/gorsel/${h.id}.jpg`] } : {}),
    author: { '@type': 'Organization', name: env.SITE_ADI || 'Gündem Özeti', url: `${kok}/` },
    publisher: { '@type': 'Organization', name: env.SITE_ADI || 'Gündem Özeti', url: `${kok}/` },
    isBasedOn: h.kaynaklar.map((k) => ({ '@type': 'CreativeWork', publisher: { '@type': 'Organization', name: k.ad } })),
  };
}


// Tüm haberler: güne göre gruplanmış sade liste
export function tumListe(haberler) {
  if (!haberler.length) return '<p class="bos">Bu seçimde haber yok.</p>';
  const gunAdi = (iso) => new Date(iso).toLocaleDateString('tr-TR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
  const saatAdi = (iso) => new Date(iso).toLocaleTimeString('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  let son = '';
  const satirlar = haberler.map((h) => {
    const gun = gunAdi(h.zaman);
    const bas = gun !== son ? `<tr class="gun"><td colspan="3">${kac(gun)}</td></tr>` : '';
    son = gun;
    const etiket = sehitMi(h) ? ' · Acı haber' : h.yabanci ? ' · Dünya' : '';
    return `${bas}<tr><td class="saat">${kac(saatAdi(h.zaman))}</td><td><a href="/haber/${h.id}">${kac(h.baslik)}</a></td><td class="k">${kac(h.kaynaklar[0]?.ad || '')}${kac(etiket)}</td></tr>`;
  }).join('');
  return `<table class="tum"><tbody>${satirlar}</tbody></table>`;
}
