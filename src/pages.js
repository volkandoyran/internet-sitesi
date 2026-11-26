// Sunucuda oluşturulan sayfalar (Google'ın okuyabilmesi için tam HTML):
//   /eslesen        birden fazla ülkede satılan, ülkeler arası karşılaştırılabilen ürünler
//   /ozellikler     tüm laptop ve masaüstü bilgisayarların teknik özellik listesi
//   /urun/<id>-<ad> tek ürün: teknik özellikler, ülkelere göre fiyatlar, mağaza bağlantıları
//   /sitemap.xml    Google için site haritası (ürün sayfaları dahil)
import { loadProducts, rateFor, productById, similarTo } from './api.js';
import { computerSpecs } from '../lib/pcspecs.js';

export const SITE = 'https://ucfiyat.vitrin-web.workers.dev';
const COUNTRIES = [['TR', 'Türkiye'], ['GR', 'Yunanistan'], ['BG', 'Bulgaristan']];
const COUNTRY = Object.fromEntries(COUNTRIES);
const SECTION = { laptop: 'Bilgisayarlar', desktop: 'Bilgisayarlar', part: 'Bilgisayar parçaları', phone: 'Telefonlar', tablet: 'Tabletler' };
const BOLUM = { laptop: 'bilgisayar', desktop: 'bilgisayar', part: 'parca', phone: 'telefon', tablet: 'tablet' };
const TYPE = { laptop: 'Laptop', desktop: 'Masaüstü', part: 'Parça', phone: 'Telefon', tablet: 'Tablet' };
const CATEGORY = { 'laptop-batarya': 'Laptop bataryası', 'laptop-adaptor': 'Laptop adaptörü', 'laptop-ekran': 'Laptop ekranı', 'laptop-klavye': 'Laptop klavyesi', 'laptop-fan': 'Laptop fanı', cpu: 'İşlemci', gpu: 'Ekran kartı', ram: 'RAM', ssd: 'SSD', hdd: 'Sabit disk', anakart: 'Anakart', psu: 'Güç kaynağı', kasa: 'Kasa', monitor: 'Monitör' };
const low = (t) => String(t || '').replace(/İ/g, 'i').toLowerCase().replace(/ı/g, 'i');
// JAR gibi mağazalar tüm özellikleri ada yazıyor: listede ilk virgüle kadar olan kısım gösterilir
const GENERIC = /^(лаптоп|laptop|notebook|all in one компютър|all in one|настолен компютър|мини настолен компютър|мини компютър|геймърски компютър|компютър|φορητοσ υπολογιστησ|desktop)\s+/i;
export const shortName = (n) => String(n || '').split(/,\s/)[0].trim().slice(0, 140);
const sortKey = (p) => low(shortName(p.name).replace(GENERIC, ''));
const isPc = (p) => p.type === 'laptop' || p.type === 'desktop';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (v) => (v == null ? '–' : new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v));
// Fiyat: euro yazılır, sayfa betiği seçilen para birimine çevirir
const money = (v) => `<span class="m" data-eur="${v ?? ''}">${eur(v)}</span>`;
const storage = (gb) => (gb >= 1000 ? `${+(gb / (gb % 1024 === 0 ? 1024 : 1000)).toFixed(1)} TB` : `${gb} GB`);
// İkonlar: sayfadaki SVG kümesinden (public/index.html ile aynı küme; birinde değişirse diğerinde de değiştirin)
const ic = (name) => `<svg class="ic" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const SPRITE = `
  <svg width="0" height="0" style="position:absolute" aria-hidden="true">
    <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></symbol>
    <symbol id="i-ext" viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8"/></symbol>
    <symbol id="i-down" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></symbol>
    <symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></symbol>
    <symbol id="i-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></symbol>
    <symbol id="i-sliders" viewBox="0 0 24 24"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></symbol>
    <symbol id="i-check" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></symbol>
    <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></symbol>
    <symbol id="i-store" viewBox="0 0 24 24"><path d="M4 10v9.5h16V10M3.5 10 5 4.5h14l1.5 5.5zM10 19.5v-5h4v5"/></symbol>
    <symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z"/></symbol>
    <symbol id="i-box" viewBox="0 0 24 24"><path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4zM3.5 7.5 12 11.5l8.5-4M12 11.5v9"/></symbol>
    <symbol id="i-alert" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5M12 16.5v.01"/></symbol>
    <symbol id="i-img" viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="m3.5 16 5-5 4 4 2.5-2.5 5.5 5.5"/></symbol>
  </svg>`;
// Ürün görseli; yüklenemezse arkadaki yer tutucu ikon görünür (public/ui.js thumb() ile aynı)
const thumb = (src, cls = 'thumb') => `<span class="${cls}">${ic('img')}${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="88" height="88">` : ''}</span>`;
// "x saat önce" (sunucu saatine göre; sayfa 5 dakika önbellekte kalabilir)
function ago(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const min = Math.round((Date.now() - t) / 60000);
  const rtf = new Intl.RelativeTimeFormat('tr', { numeric: 'auto' });
  if (min < 1) return 'az önce';
  if (min < 60) return rtf.format(-min, 'minute');
  if (min < 48 * 60) return rtf.format(-Math.round(min / 60), 'hour');
  return rtf.format(-Math.round(min / 1440), 'day');
}

// Adres için okunur ad: Kiril ve Yunan harfleri Latin harfe çevrilir
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sht', ъ: 'a', ь: 'y', ю: 'yu', я: 'ya',
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
  ı: 'i', ş: 's', ğ: 'g', ç: 'c', ö: 'o', ü: 'u' };
export function slug(name) {
  return String(name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x00-\x7f]/g, (c) => TR[c] ?? ' ')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, '') || 'urun';
}
export const productPath = (p) => `/urun/${p.id}-${slug(p.name)}`;

// Aynı Worker örneği art arda gelen sayfa isteklerinde veritabanını yeniden okumasın (D1 ücretsiz okuma sınırı)
let memo = null;
async function data(env) {
  if (memo && Date.now() - memo.at < 5 * 60e3) return memo;
  const [all, rate] = await Promise.all([loadProducts(env), rateFor(env, 'TRY')]);
  memo = { at: Date.now(), all, rate };
  return memo;
}

// Ülke başına en ucuz (stoktaki önce) teklif
function perCountry(p) {
  const out = {};
  for (const o of p.offers) {
    const cur = out[o.country];
    const better = !cur || (cur.in_stock === 0 && o.in_stock !== 0) || ((cur.in_stock === 0) === (o.in_stock === 0) && o.price_eur < cur.price_eur);
    if (better) out[o.country] = o;
  }
  return out;
}

// En ucuz ülke: stokta olan ülkeler arasından seçilir (stokta olmayan ucuz fiyat "en ucuz" sayılmaz).
// Hiçbir ülkede stok yoksa tüm fiyatlar karşılaştırılır.
export function cheapestOf(pc) {
  const cs = Object.keys(pc);
  const inStock = cs.filter((c) => pc[c].in_stock !== 0);
  const pool = inStock.length ? inStock : cs;
  const vals = pool.map((c) => pc[c].price_eur);
  const min = Math.min(...vals);
  return { cheapest: pool.find((c) => pc[c].price_eur === min), min, max: Math.max(...vals), pool };
}

function chips(p) {
  if (isPc(p)) {
    const sp = Object.fromEntries(computerSpecs(p).map((x) => [x.key, x.value]));
    return [TYPE[p.type], sp.cpu, sp.gpu, sp.ram && `${sp.ram} RAM`, sp.storage, sp.screen].filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join('');
  }
  return [TYPE[p.type] && p.type !== 'part' ? TYPE[p.type] : CATEGORY[p.category] || p.category, p.cpu, p.gpu, p.ram_gb && `${p.ram_gb} GB RAM`, p.storage_gb && storage(p.storage_gb), p.screen_in && `${p.screen_in}"`]
    .filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join('');
}

const storeLink = (o, label = 'Mağazada gör') => (o && o.url
  ? `<a class="go" href="${esc(o.url)}" target="_blank" rel="nofollow noopener" aria-label="${esc(o.retailer)} sitesinde gör (yeni sekme)">${label} ${ic('ext')}</a>`
  : '');

// Üç ülke fiyat şeridi; her satır mağazanın ürün sayfasına gider
function lanes(p) {
  const pc = perCountry(p);
  const prices = Object.values(pc).map((o) => o.price_eur);
  const max = Math.max(...prices, 1);
  const { cheapest } = cheapestOf(pc);
  return COUNTRIES.map(([cc, label]) => {
    const o = pc[cc];
    const code = `<span class="cc" title="${label}" aria-label="${label}">${cc}</span>`;
    if (!o) return `<div class="lane ${cc} none">${code}<div class="bar"><div class="txt">Bu ülkede satıcı yok</div></div></div>`;
    const best = prices.length > 1 && cc === cheapest;
    const oos = o.in_stock === 0;
    const inner = `<div class="fill" style="width:${Math.round((o.price_eur / max) * 100)}%"></div>
      <div class="txt"><span class="price">${money(o.price_eur)}</span>${best ? '<span class="best-tag">En ucuz</span>' : ''}${oos ? '<span class="oos-tag">Stokta yok</span>' : ''}<span class="shop">${esc(o.retailer)}</span>${o.url ? ic('ext') : ''}</div>`;
    return `<div class="lane ${cc}${best ? ' best' : ''}${oos ? ' oos' : ''}">${code}${o.url
      ? `<a class="bar" href="${esc(o.url)}" target="_blank" rel="nofollow noopener" aria-label="${label}: ${eur(o.price_eur)}, ${esc(o.retailer)}${best ? ', en ucuz' : ''}${oos ? ', stokta yok' : ''}. Mağaza sitesinde aç (yeni sekme)">${inner}</a>`
      : `<div class="bar">${inner}</div>`}</div>`;
  }).join('');
}

// Ortak sayfa iskeleti: üst menü, "satış yapmıyoruz" bandı, para birimi düğmesi
export function layout({ title, description, path, body, active, jsonld, rate }) {
  const url = SITE + path;
  const links = [['/', 'Fiyat ara', 'ara'], ['/eslesen', 'Eşleşen modeller', 'eslesen'], ['/ozellikler', 'Teknik özellikler', 'ozellikler']];
  const nav = links.map(([href, label, key]) => `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  const footNav = links.map(([href, label]) => `<a href="${href}">${label}</a>`).join('');
  const logo = `<a class="logo" href="/" aria-label="Üçfiyat ana sayfa"><span class="logo-mark" aria-hidden="true"><i class="tr"></i><i class="gr"></i><i class="bg"></i></span>Üçfiyat</a>`;
  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#f3f5f8" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#10161d" media="(prefers-color-scheme: dark)">
  <meta name="format-detection" content="telephone=no">
  <link rel="icon" href="/icon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/icon-180.png">
  <link rel="manifest" href="/manifest.webmanifest">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${esc(url)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Üçfiyat">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(url)}">
  <meta property="og:image" content="${SITE}/icon-512.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@87.5..112.5,400..800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/style.css">
  ${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body data-rate="${rate || ''}">${SPRITE}
  <a class="skip" href="#main">İçeriğe geç</a>
  ${NOTICE}
  <header class="top">
    ${logo}
    <nav class="site-nav" id="site-nav" aria-label="Sayfalar">${nav}</nav>
    <div class="cur" role="group" aria-label="Para birimi">
      <button type="button" data-cur="EUR" aria-pressed="true" aria-label="Euro">€</button>
      <button type="button" data-cur="TRY" aria-pressed="false" aria-label="Türk lirası">₺</button>
    </div>
    <button class="menu-btn" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Menüyü aç">
      <svg class="ic i-open" aria-hidden="true"><use href="#i-menu"/></svg><svg class="ic i-close" aria-hidden="true"><use href="#i-x"/></svg>
    </button>
  </header>
  <main id="main" class="page">
${body}
  </main>
  <footer class="foot">
    <div class="foot-in">
      <div>
        ${logo}
        <p><b>Üçfiyat satış yapmaz.</b> "Mağazada gör" bağlantıları sizi ürünü satan mağazanın sitesine götürür; satın alma, ödeme ve teslimat o mağaza ile aranızdadır.</p>
        <p>Fiyatlar ve özellikler mağaza sitelerinden otomatik alınır; satın almadan önce mağazanın sitesinden kontrol edin. <span id="rate"></span></p>
      </div>
      <nav class="foot-nav" aria-label="Alt menü">${footNav}</nav>
    </div>
  </footer>
  <script type="module" src="/sayfa.js"></script>
</body>
</html>`;
}

export const NOTICE = `<div class="notice" role="note"><b>Üçfiyat satış yapmaz.</b> Yalnızca fiyatları karşılaştırır; ürünü almak için mağazanın kendi sitesine yönlendirilirsiniz.</div>`;

const html = (s, status = 200) => new Response(s, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, max-age=300' } });

// ---------- Eşleşen modeller ----------
export async function matchedPage(env) {
  const { all, rate } = await data(env);
  const rows = all.map((p) => {
    const pc = perCountry(p);
    const cs = Object.keys(pc);
    if (cs.length < 2) return null;
    // Tasarruf yalnızca stokta olan ülkeler arasında hesaplanır
    const { cheapest, min, max } = cheapestOf(pc);
    return { p, pc, cheapest, min, max, save: max - min, pct: max ? Math.round(((max - min) / max) * 100) : 0 };
  }).filter(Boolean).sort((a, b) => b.pct - a.pct || b.save - a.save);

  // Bölümler: bilgisayarlar, parçalar, ekipman (monitör), telefonlar, tabletler; her birinde alt türler
  const GROUPS = [['bilgisayar', 'Bilgisayarlar'], ['parca', 'Parçalar'], ['ekipman', 'Ekipman'], ['telefon', 'Telefonlar'], ['tablet', 'Tabletler']];
  const group = (p) => (isPc(p) ? 'bilgisayar' : p.type === 'part' ? (p.category === 'monitor' ? 'ekipman' : 'parca') : p.type === 'phone' ? 'telefon' : 'tablet');
  const sub = (p) => (isPc(p) ? p.type : p.type === 'part' ? p.category || 'diger' : '');
  const SUB = { laptop: 'Laptop', desktop: 'Masaüstü', ...CATEGORY, monitor: 'Monitör', diger: 'Diğer' };
  const byGroup = Object.fromEntries(GROUPS.map(([k]) => [k, rows.filter((r) => group(r.p) === k)]));
  const tabs = [['', 'Hepsi', rows.length], ...GROUPS.map(([k, l]) => [k, l, byGroup[k].length])]
    .map(([k, l, n], i) => `<button type="button" data-filter="${k}" aria-pressed="${i === 0}"${n ? '' : ' disabled'}>${l} <small>${n}</small></button>`).join('');
  // Alt tür düğmeleri (yalnızca seçili bölümde görünür)
  const subs = GROUPS.map(([k]) => {
    const c = {};
    for (const r of byGroup[k]) { const t = sub(r.p); if (t) c[t] = (c[t] || 0) + 1; }
    const list = Object.entries(c).sort((a, b) => b[1] - a[1]);
    if (list.length < 2) return '';
    return `<div class="subtabs" data-for="${k}" role="group" aria-label="Tür" hidden><button type="button" data-sub="" aria-pressed="true">Tümü <small>${byGroup[k].length}</small></button>${
      list.map(([t, n]) => `<button type="button" data-sub="${t}" aria-pressed="false">${esc(SUB[t] || t)} <small>${n}</small></button>`).join('')}</div>`;
  }).join('');
  const card = ({ p, pc, cheapest, save, pct }) => `
    <li class="item match" data-sub="${sub(p)}">
      ${thumb(p.image)}
      <div class="info">
        <a class="name" href="${productPath(p)}" title="${esc(p.name)}">${esc(shortName(p.name))}</a>
        <p class="specs">${chips(p)}</p>
        <p class="verdict">En ucuz ülke: <b class="cc-${cheapest}">${COUNTRY[cheapest]}</b>${save >= 1 ? ` <span class="saving">%${pct} daha ucuz · ${money(save)} fark</span>` : ' · fiyatlar aynı'}</p>
      </div>
      <div class="lanes">${lanes(p)}</div>
      <div class="acts">${storeLink(pc[cheapest], `${esc(pc[cheapest].retailer)} sitesinde gör`)}<a class="more" href="${productPath(p)}">${isPc(p) ? 'Özellikler ve tüm fiyatlar' : 'Tüm fiyatlar'}${ic('down')}</a></div>
    </li>`;
  const sections = GROUPS.filter(([k]) => byGroup[k].length).map(([k, l]) => `
    <section class="group" data-bolum="${k}" aria-labelledby="g-${k}">
      <h2 class="sub" id="g-${k}">${l} <small>${byGroup[k].length}</small></h2>
      <ol class="results">${byGroup[k].map(card).join('')}</ol>
    </section>`).join('');
  const body = `
    <section class="intro intro-sm">
      <h1>Eşleşen modeller</h1>
      <p>Aynı ürünün birden fazla ülkede satıldığı modeller, en büyük fiyat farkı en üstte. Fiyat satırına dokununca mağazanın ürün sayfası yeni sekmede açılır.</p>
    </section>
    <div class="tabs filter-tabs match-tabs" role="group" aria-label="Bölüme göre süz">${tabs}</div>
    ${subs}
    <p class="count" id="count" aria-live="polite"></p>
    ${rows.length ? `<div id="list">${sections}</div>` : '<p class="empty">Şu anda birden fazla ülkede eşleşen ürün yok. Mağazalar tarandıkça bu liste kendiliğinden dolar.</p>'}`;
  return html(layout({
    title: 'Eşleşen modeller · Aynı ürünün Türkiye, Yunanistan ve Bulgaristan fiyatları · Üçfiyat',
    description: `Birden fazla ülkede satılan ${rows.length} ürünün Türkiye, Yunanistan ve Bulgaristan fiyatları yan yana; en ucuz ülke işaretli.`,
    path: '/eslesen', active: 'eslesen', body, rate,
  }));
}

// ---------- Teknik özellikler listesi ----------
export async function specsListPage(env) {
  const { all, rate } = await data(env);
  const pcs = all.filter(isPc).sort((a, b) => sortKey(a).localeCompare(sortKey(b), 'tr'));
  const get = (sp, k) => (sp.find((x) => x.key === k) || {}).value || '';
  const rows = pcs.map((p) => {
    const sp = computerSpecs(p);
    const cells = [['İşlemci', get(sp, 'cpu')], ['RAM', get(sp, 'ram')], ['Depolama', get(sp, 'storage')], ['Ekran kartı', get(sp, 'gpu')], ['Ekran', [get(sp, 'screen'), get(sp, 'resolution')].filter(Boolean).join(' · ')], ['İşletim sistemi', get(sp, 'os')]];
    const countries = Object.keys(perCountry(p));
    return `<tr data-type="${p.type}" data-price="${p.best?.price_eur ?? ''}" data-q="${esc(low(p.name + ' ' + (p.brand || '') + ' ' + sp.map((x) => x.value).join(' ')))}">
      <th scope="row"><a href="${productPath(p)}" title="${esc(p.name)}">${esc(shortName(p.name))}</a><small>${TYPE[p.type]} · ${countries.join(', ')}</small></th>
      ${cells.map(([l, v]) => `<td data-label="${l}">${v ? esc(v) : '<span class="na">–</span>'}</td>`).join('')}
      <td data-label="En düşük" class="num">${money(p.best?.price_eur)}<small>${esc(p.best?.retailer || '')}</small></td>
    </tr>`;
  }).join('');
  const body = `
    <section class="intro intro-sm">
      <h1>Bilgisayar teknik özellikleri</h1>
      <p>Fiyatı bulunan ${pcs.length} laptop ve masaüstü bilgisayarın özellikleri tek tabloda. Özellikler mağaza sayfalarından otomatik çıkarılır; ayrıntılar için modelin adına dokunun.</p>
    </section>
    <div class="spec-tools">
      <div class="tabs filter-tabs" role="group" aria-label="Türe göre süz">
        <button type="button" data-type="" aria-pressed="true">Hepsi <small>${pcs.length}</small></button>
        <button type="button" data-type="laptop" aria-pressed="false">Laptop <small>${pcs.filter((p) => p.type === 'laptop').length}</small></button>
        <button type="button" data-type="desktop" aria-pressed="false">Masaüstü <small>${pcs.filter((p) => p.type === 'desktop').length}</small></button>
      </div>
      <div class="q"><div class="q-field">${ic('search')}<label for="sq" class="sr">Modellerde ara</label><input id="sq" type="search" enterkeyhint="search" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Modellerde ara: ThinkPad, i7, 32 GB, RTX 4060"></div></div>
      <label class="sort">Sırala <select id="sort"><option value="name">Ada göre</option><option value="price">Fiyat (artan)</option><option value="price-desc">Fiyat (azalan)</option></select></label>
    </div>
    <p class="count" id="count" aria-live="polite"></p>
    <div class="spec-wrap"><table class="spec-list" id="specs">
      <thead><tr><th scope="col">Model</th><th scope="col">İşlemci</th><th scope="col">RAM</th><th scope="col">Depolama</th><th scope="col">Ekran kartı</th><th scope="col">Ekran</th><th scope="col">İşletim sistemi</th><th scope="col">En düşük fiyat</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  return html(layout({
    title: 'Laptop ve masaüstü bilgisayar teknik özellikleri · Üçfiyat',
    description: `${pcs.length} laptop ve masaüstü bilgisayarın işlemci, RAM, depolama, ekran kartı ve ekran özellikleri ile Türkiye, Yunanistan, Bulgaristan fiyatları.`,
    path: '/ozellikler', active: 'ozellikler', body, rate,
  }));
}

// ---------- Ürün sayfası ----------
export async function productPage(env, idPart, origin = SITE) {
  const id = parseInt(idPart, 10);
  // Tek ürün kimlikle okunur; tüm katalog yüklenmez
  const [p, rate] = await Promise.all([Number.isSafeInteger(id) && id > 0 ? productById(env, id) : null, rateFor(env, 'TRY')]);
  if (!p) {
    return html(layout({
      title: 'Ürün bulunamadı · Üçfiyat', description: 'Bu ürün artık listelenmiyor.', path: '/urun/' + encodeURIComponent(idPart), rate,
      body: `<section class="intro intro-sm"><h1>Ürün bulunamadı</h1><p>Bu ürün artık hiçbir mağazada listelenmiyor ya da başka bir kayıtla birleştirildi.</p></section><p><a class="btn-link" href="/">Fiyat aramaya dön</a> · <a href="/ozellikler">Teknik özellikler</a> · <a href="/eslesen">Eşleşen modeller</a></p>`,
    }), 404);
  }
  const want = productPath(p);
  if (`/urun/${idPart}` !== want) return Response.redirect(new URL(want, origin).toString(), 301);

  const pc = perCountry(p);
  const cs = Object.keys(pc);
  const { cheapest, min, max } = cheapestOf(pc);
  const spec = isPc(p) ? computerSpecs(p) : [
    p.brand && { label: 'Marka', value: p.brand }, p.category && { label: 'Tür', value: CATEGORY[p.category] || p.category },
    p.cpu && { label: 'İşlemci', value: p.cpu }, p.gpu && { label: 'Ekran kartı', value: p.gpu }, p.ram_gb && { label: 'RAM', value: `${p.ram_gb} GB` },
    p.storage_gb && { label: 'Depolama', value: storage(p.storage_gb) }, p.screen_in && { label: 'Ekran', value: `${p.screen_in}"` },
  ].filter(Boolean);
  // Tüm mağazalar: stoktakiler önce, fiyata göre; en ucuz stoktaki teklif işaretli
  const sortedOffers = [...p.offers].sort((x, y) => (x.in_stock === 0) - (y.in_stock === 0) || x.price_eur - y.price_eur);
  const top = sortedOffers[0];
  const offers = sortedOffers.map((o, i) => {
    const oos = o.in_stock === 0;
    const best = sortedOffers.length > 1 && i === 0 && !oos;
    const upd = ago(o.updated_at);
    return `<li class="offer${best ? ' best' : ''}${oos ? ' out' : ''}">
      <span class="cc ${o.country}" title="${COUNTRY[o.country]}" aria-label="${COUNTRY[o.country]}">${o.country}</span>
      <span class="offer-shop"><b>${esc(o.retailer)}</b><small>${oos ? '<span class="stock no">Stokta yok</span>' : `<span class="stock">${ic('check')}Stokta</span>`}${upd ? ` · ${upd} güncellendi` : ''}</small></span>
      <span class="offer-price"><span class="price">${money(o.price_eur)}</span>${o.currency === 'TRY' ? `<small>${esc(new Intl.NumberFormat('tr-TR').format(o.price))} ₺</small>` : ''}</span>
      ${storeLink(o) || '<span></span>'}
    </li>`;
  }).join('');
  const lastUpd = p.offers.map((o) => o.updated_at).filter(Boolean).sort().pop();
  const similar = (await similarTo(env, p, 6)).map((x) =>
      `<a href="${productPath(x)}">${thumb(x.image)}<span class="mini-txt"><span>${esc(shortName(x.name))}</span><small><b>${money(x.best?.price_eur)}</b> · ${esc(x.best?.retailer || '')}</small></span></a>`).join('');
  const crumbs = `<nav class="crumbs" aria-label="Konum"><a href="/">Ana sayfa</a><span aria-hidden="true">/</span><a href="/?bolum=${BOLUM[p.type]}">${SECTION[p.type]}</a>${isPc(p) ? '<span aria-hidden="true">/</span><a href="/ozellikler">Teknik özellikler</a>' : ''}</nav>`;
  const img = `<span class="p-noimg">${ic('img')}${p.image ? `<img src="${esc(p.image)}" alt="${esc(shortName(p.name))}" referrerpolicy="no-referrer" width="168" height="168">` : ''}</span>`;
  const body = `
    ${crumbs}
    <section class="product">
      <div class="p-top">
        <div class="p-head">
          ${img}
          <div>
            <h1 class="p-name">${esc(shortName(p.name))}</h1>
            ${shortName(p.name) !== p.name.trim() ? `<p class="muted full-name">Mağazadaki adı: ${esc(p.name)}</p>` : ''}
            <p class="specs">${chips(p)}</p>
            ${cs.length > 1 ? `<p class="verdict">En ucuz ülke: <b class="cc-${cheapest}">${COUNTRY[cheapest]}</b>${max - min >= 1 ? ` <span class="saving">en pahalı ülkeye göre ${money(max - min)} ucuz</span>` : ''}</p>` : `<p class="verdict">Şu an yalnızca ${COUNTRY[cs[0]]} mağazalarında listeleniyor.</p>`}
          </div>
        </div>
        <aside class="buy" aria-label="En düşük fiyat">
          <p class="buy-label">En düşük fiyat${top && top.in_stock === 0 ? ' (stokta yok)' : ''}</p>
          <p class="buy-price"><span class="price">${money(top?.price_eur)}</span></p>
          <p class="buy-where"><span class="cc ${top.country}">${top.country}</span>${esc(top.retailer)}, ${COUNTRY[top.country]}</p>
          ${storeLink(top, `${esc(top.retailer)} sitesinde gör`)}
          ${lastUpd ? `<p class="buy-fine">${ic('clock')}Fiyat ${ago(lastUpd)} güncellendi</p>` : ''}
        </aside>
      </div>
      <h2 class="sub">Ülkelere göre en düşük fiyat</h2>
      <div class="lanes big">${lanes(p)}</div>
      <h2 class="sub">Tüm mağazalar <small>${p.offers.length}</small></h2>
      <ul class="offer-list">${offers}</ul>
      <p class="redirect-note">"Mağazada gör" ürünü satan mağazanın sitesini yeni sekmede açar. Üçfiyat satış yapmaz; satın alma mağazanın kendi sitesinde yapılır.</p>
      ${spec.length ? `<h2 class="sub">Teknik özellikler</h2>
      <table class="spec-table"><tbody>${spec.map((s) => `<tr><th scope="row">${esc(s.label)}</th><td>${esc(s.value)}</td></tr>`).join('')}</tbody></table>
      <p class="muted">Özellikler mağaza sayfalarından ve ürün adından otomatik çıkarılır; hata olabilir. Satın almadan önce mağaza sayfasındaki bilgileri kontrol edin.</p>` : ''}
      ${similar ? `<h2 class="sub">Benzer özellikteki ürünler</h2><div class="mini">${similar}</div>` : ''}
    </section>`;
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Product', name: p.name, ...(p.brand ? { brand: { '@type': 'Brand', name: p.brand } } : {}),
    ...(p.image ? { image: p.image } : {}),
    offers: { '@type': 'AggregateOffer', priceCurrency: 'EUR', lowPrice: min, highPrice: Math.max(...p.offers.map((o) => o.price_eur)), offerCount: p.offers.length },
  };
  const what = isPc(p) ? 'teknik özellikleri ve ' : '';
  return html(layout({
    title: `${shortName(p.name)} ${isPc(p) ? 'özellikleri ve ' : ''}fiyatı · Üçfiyat`,
    description: `${p.name}: ${what}Türkiye, Yunanistan ve Bulgaristan'daki mağaza fiyatları. En düşük ${eur(min)}.`,
    path: want, active: isPc(p) ? 'ozellikler' : cs.length > 1 ? 'eslesen' : '', body, rate, jsonld,
  }));
}

// ---------- Site haritası ----------
export async function sitemap(env) {
  const { all } = await data(env);
  const fixed = ['/', '/?bolum=parca', '/?bolum=telefon', '/?bolum=tablet', '/eslesen', '/ozellikler'];
  // Ürün sayfaları: tüm bilgisayarlar ve birden fazla ülkede satılan ürünler
  const prods = all.filter((p) => isPc(p) || Object.keys(perCountry(p)).length > 1);
  const day = (p) => (p.offers.map((o) => o.updated_at).filter(Boolean).sort().pop() || '').slice(0, 10);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${fixed.map((u) => `  <url><loc>${esc(SITE + u)}</loc><changefreq>daily</changefreq></url>`).join('\n')}
${prods.map((p) => `  <url><loc>${esc(SITE + productPath(p))}</loc>${day(p) ? `<lastmod>${day(p)}</lastmod>` : ''}<changefreq>daily</changefreq></url>`).join('\n')}
</urlset>`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'private, max-age=3600' } });
}
