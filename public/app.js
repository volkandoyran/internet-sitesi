import { esc, ic, thumb, ago } from './ui.js';

const $ = (s, el = document) => el.querySelector(s);
const COUNTRIES = [['TR', 'Türkiye'], ['GR', 'Yunanistan'], ['BG', 'Bulgaristan']];
const COUNTRY = Object.fromEntries(COUNTRIES);
let currency = 'EUR';
let rateTRY = null;
let lastData = null;
try { currency = localStorage.getItem('cur') || 'EUR'; } catch {}

function money(eur) {
  if (eur == null) return '–';
  if (currency === 'TRY' && rateTRY) return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(eur * rateTRY);
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(eur);
}
// Katalog 1 TB'yi 1000 GB olarak saklar (elle girilenler 1024 olabilir)
const storage = (gb) => (gb >= 1000 ? `${+(gb / (gb % 1024 === 0 ? 1024 : 1000)).toFixed(1)} TB` : `${gb} GB`);
const CATEGORY = { 'laptop-batarya': 'Laptop bataryası', 'laptop-adaptor': 'Laptop adaptörü', 'laptop-ekran': 'Laptop ekranı', 'laptop-klavye': 'Laptop klavyesi', 'laptop-fan': 'Laptop fanı', cpu: 'İşlemci', gpu: 'Ekran kartı', ram: 'RAM', ssd: 'SSD', hdd: 'Sabit disk', anakart: 'Anakart', psu: 'Güç kaynağı', kasa: 'Kasa', monitor: 'Monitör' };
function specChips(p) {
  return [p.cpu, p.gpu, p.ram_gb && `${p.ram_gb} GB RAM`, p.storage_gb && storage(p.storage_gb),
    p.screen_in && `${p.screen_in}"`, CATEGORY[p.category] || p.category].filter(Boolean).map((t) => `<span title="${esc(t)}">${esc(t)}</span>`).join('');
}

// Ürün sayfası adresi (sunucudaki slug() ile aynı kural)
const TRL = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sht', ъ: 'a', ь: 'y', ю: 'yu', я: 'ya',
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
  ı: 'i', ş: 's', ğ: 'g', ç: 'c', ö: 'o', ü: 'u' };
const slug = (name) => String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x00-\x7f]/g, (c) => TRL[c] ?? ' ')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, '') || 'urun';
const productUrl = (p) => `/urun/${p.id}-${slug(p.name)}`;

// Ülke başına en ucuz teklif (stokta olan önce)
function perCountry(p) {
  return COUNTRIES.map(([cc]) => {
    const list = p.offers.filter((o) => o.country === cc);
    return list.find((o) => o.in_stock !== 0) || list[0] || null;
  });
}
// "En ucuz" yalnızca stokta olan ülkeler arasından seçilir (hiçbirinde stok yoksa hepsinden)
function cheapestOf(pc) {
  const inStock = pc.filter((o) => o && o.in_stock !== 0);
  const pool = inStock.length ? inStock : pc.filter(Boolean);
  return pool.reduce((a, o) => (!a || o.price_eur < a.price_eur ? o : a), null);
}

// Üç ülke fiyat şeridi; satır mağazanın ürün sayfasına gider
function lanes(p) {
  const pc = perCountry(p);
  const prices = pc.filter(Boolean).map((o) => o.price_eur);
  const max = Math.max(...prices, 1);
  const cheapest = cheapestOf(pc);
  return pc.map((o, i) => {
    const [cc, label] = COUNTRIES[i];
    const code = `<span class="cc" title="${label}" aria-label="${label}">${cc}</span>`;
    if (!o) return `<div class="lane ${cc} none">${code}<div class="bar"><div class="txt">Bu ülkede satıcı yok</div></div></div>`;
    const best = prices.length > 1 && o === cheapest;
    const oos = o.in_stock === 0;
    const inner = `<div class="fill" style="width:${Math.round((o.price_eur / max) * 100)}%"></div>
      <div class="txt"><span class="price">${money(o.price_eur)}</span>${best ? '<span class="best-tag">En ucuz</span>' : ''}${oos ? '<span class="oos-tag">Stokta yok</span>' : ''}<span class="shop">${esc(o.retailer)}</span>${o.url ? ic('ext') : ''}</div>`;
    return `<div class="lane ${cc}${best ? ' best' : ''}${oos ? ' oos' : ''}">${code}${o.url
      ? `<a class="bar" href="${esc(o.url)}" target="_blank" rel="nofollow noopener" aria-label="${label}: ${money(o.price_eur)}, ${esc(o.retailer)}${best ? ', en ucuz' : ''}${oos ? ', stokta yok' : ''}. Mağaza sitesinde aç (yeni sekme)">${inner}</a>`
      : `<div class="bar">${inner}</div>`}</div>`;
  }).join('');
}

const latest = (offers) => offers.map((o) => o.updated_at).filter(Boolean).sort().pop();

function card(p) {
  const countries = new Set(p.offers.map((o) => o.country)).size;
  const upd = ago(latest(p.offers));
  const li = document.createElement('li');
  li.className = 'item';
  li.innerHTML = `${thumb(p.image)}
    <div class="info">
      <a class="name" href="${productUrl(p)}" title="${esc(p.name)}">${esc(p.name)}</a>
      <p class="specs">${specChips(p)}</p>
      <p class="meta"><span>${ic('store')}${p.offers.length} mağaza</span><span>${ic('globe')}${countries} ülke</span>${upd ? `<span>${ic('clock')}${upd}</span>` : ''}</p>
    </div>
    <div class="lanes">${lanes(p)}</div>
    <button class="toggle" type="button" aria-expanded="false"><span>${p.offers.length > 1 ? `Tüm mağaza fiyatları (${p.offers.length})` : 'Ayrıntılar ve benzer ürünler'}</span>${ic('down')}</button>
    <div class="detail" hidden></div>`;
  const btn = $('.toggle', li);
  btn.addEventListener('click', () => toggleDetail(li, p, btn));
  return li;
}

function renderList(el, items, adEvery = 0) {
  el.innerHTML = '';
  items.forEach((p, i) => {
    el.appendChild(card(p));
    if (adEvery && (i + 1) % adEvery === 0 && i < items.length - 1 && ads.ad_inline) {
      const ad = document.createElement('li');
      ad.className = 'ad-slot';
      placeAd(ad, ads.ad_inline);
      el.appendChild(ad);
    }
  });
}

function offerRow(o, best) {
  const oos = o.in_stock === 0;
  const local = o.currency === 'TRY' ? `<small>${esc(new Intl.NumberFormat('tr-TR').format(o.price))} ₺</small>` : '';
  const upd = ago(o.updated_at);
  return `<li class="offer${best ? ' best' : ''}${oos ? ' out' : ''}">
    <span class="cc ${o.country}" title="${COUNTRY[o.country]}" aria-label="${COUNTRY[o.country]}">${esc(o.country)}</span>
    <span class="offer-shop"><b>${esc(o.retailer)}</b><small>${oos ? '<span class="stock no">Stokta yok</span>' : `<span class="stock">${ic('check')}Stokta</span>`}${upd ? ` · ${upd} güncellendi` : ''}</small></span>
    <span class="offer-price"><span class="price">${money(o.price_eur)}</span>${local}</span>
    ${o.url ? `<a class="go" href="${esc(o.url)}" target="_blank" rel="nofollow noopener" aria-label="${esc(o.retailer)} sitesinde gör (yeni sekme)">Mağazada gör ${ic('ext')}</a>` : '<span></span>'}
  </li>`;
}

async function toggleDetail(li, p, btn) {
  const box = $('.detail', li);
  const open = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', String(!open));
  box.hidden = open;
  if (open || box.dataset.loaded) return;
  box.innerHTML = '<p class="muted" role="status">Mağaza fiyatları yükleniyor…</p>';
  const r = await fetch(`/api/products/${p.id}`).then((r) => r.json()).catch(() => null);
  if (!r || r.error) { box.innerHTML = `<p class="muted" role="alert">Mağaza fiyatları yüklenemedi. Bağlantınızı kontrol edip tekrar açın.</p>`; return; }
  box.dataset.loaded = '1';
  const offers = [...r.product.offers].sort((a, b) => (a.in_stock === 0) - (b.in_stock === 0) || a.price_eur - b.price_eur);
  const multi = new Set(offers.map((o) => o.country)).size > 1 || offers.length > 1;
  const isPc = ['laptop', 'desktop'].includes(r.product.type);
  const sim = r.similar.map((s) => `<a href="${productUrl(s)}">${thumb(s.image)}<span class="mini-txt"><span>${esc(s.name)}</span><small><b>${money(s.best?.price_eur)}</b> · ${esc(s.best?.retailer || '')}</small></span></a>`).join('');
  box.innerHTML = `${offers.length ? `<ul class="offer-list">${offers.map((o, i) => offerRow(o, multi && i === 0 && o.in_stock !== 0)).join('')}</ul>` : '<p class="muted">Henüz fiyat yok.</p>'}
    <div class="detail-links"><a class="more" href="${productUrl(r.product)}">${isPc ? 'Teknik özellikler ve ürün sayfası' : 'Ürün sayfası'}${ic('down')}</a></div>
    ${sim ? `<h3 class="sub" style="font-size:16px;margin:16px 0 0">Benzer özellikte</h3><div class="mini">${sim}</div>` : ''}`;
}

// Yükleniyor görünümü: kart iskeletleri
const skeleton = (n) => Array.from({ length: n }, () => '<li class="skel" aria-hidden="true"><i class="s-img"></i><span class="s-txt"><i></i><i></i><i></i></span><span class="s-lanes"><i></i><i></i><i></i></span></li>').join('');

function emptyState(kind) {
  const t = {
    none: ['box', 'Bu aramaya uyan ürün yok', 'Daha kısa bir model adı yazmayı, filtreleri gevşetmeyi ya da bütçeyi artırmayı deneyin.', true],
    error: ['alert', 'Sonuçlar yüklenemedi', 'Bağlantınızı kontrol edip tekrar deneyin.', false],
  }[kind];
  return `<li class="empty${kind === 'error' ? ' err' : ''}">${ic(t[0])}<h3>${t[1]}</h3><p>${t[2]}</p>${t[3]
    ? '<button type="button" class="btn ghost" data-act="reset">Aramayı ve filtreleri temizle</button>'
    : '<button type="button" class="btn ghost" data-act="retry">Tekrar dene</button>'}</li>`;
}

let searchSeq = 0;
async function search() {
  const seq = ++searchSeq;
  const fd = new FormData($('#search'));
  const params = new URLSearchParams();
  for (const [k, v] of fd) if (v) params.set(k, v);
  // Bütçenin para birimi adreste her zaman yazılır: paylaşılan bağlantı başka para birimi seçmiş kişide yanlış okunmasın
  if (params.get('budget')) params.set('cur', currency);
  if ($('#sort').value) params.set('sirala', $('#sort').value);
  history.replaceState(null, '', params.toString() ? `?${params}` : '/');
  params.delete('cur');
  params.delete('sirala');
  // Bütçe ₺ girildiyse euroya çevir; kur bilinmiyorsa ₺ tutarı euro sanılmasın diye bütçe gönderilmez
  if (params.get('budget') && currency === 'TRY') {
    if (rateTRY) params.set('budget', String(Math.round(+params.get('budget') / rateTRY)));
    else params.delete('budget');
  }
  updateFilterCount();
  $('#results').innerHTML = skeleton(3);
  $('#results').setAttribute('aria-busy', 'true');
  $('#res-count').textContent = 'Aranıyor…';
  $('#note').hidden = true;
  $('#similar-wrap').hidden = true;
  const data = await fetch(`/api/products?${params}`).then((r) => r.json()).catch(() => null);
  if (seq !== searchSeq) return; // daha yeni bir arama başladı
  $('#results').setAttribute('aria-busy', 'false');
  if (!data || data.error) { lastData = null; $('#results').innerHTML = emptyState('error'); $('#res-count').textContent = ''; return; }
  lastData = data;
  if (data.rate_TRY) rateTRY = data.rate_TRY;
  // Hızlı arama markaları: bölümün filtresiz ilk listesindeki gerçek markalardan
  const bolum = $('#search').elements.bolum.value;
  if (![...params.keys()].some((k) => k !== 'bolum' && k !== 'type') && !brandsBy[bolum]) brandsBy[bolum] = topBrands(data.results);
  draw();
}

// Sıralama sunucudan gelen listeyi değiştirmez, yalnızca gösterim sırasını değiştirir
function sorted(list) {
  const s = $('#sort').value;
  if (!s) return list;
  if (s === 'price-desc') return [...list].reverse();
  const nC = (p) => new Set(p.offers.map((o) => o.country)).size;
  const gap = (p) => { const v = perCountry(p).filter(Boolean).map((o) => o.price_eur); return v.length > 1 ? Math.max(...v) - Math.min(...v) : -1; };
  if (s === 'countries') return [...list].sort((a, b) => nC(b) - nC(a));
  if (s === 'gap') return [...list].sort((a, b) => gap(b) - gap(a));
  return list;
}

function draw() {
  const d = lastData; if (!d) return;
  const note = $('#note');
  // "Benzer ürünler gösteriliyor" notu yalnızca gerçekten benzer ürün varsa görünür
  note.hidden = !d.note || (!d.results.length && !d.similar.length);
  note.innerHTML = d.note ? `${ic('alert')}<span>${esc(d.note)}</span>` : '';
  const sec = SECTIONS[$('#search').elements.bolum.value];
  const q = $('#q').value.trim();
  $('#res-title').textContent = q ? `"${q}" için sonuçlar` : sec.title;
  const n = d.results.length;
  $('#res-count').textContent = n ? (n >= 60 ? 'İlk 60 ürün gösteriliyor; aramayı daraltabilirsiniz' : `${n} ürün`) : d.similar.length ? 'Birebir eşleşme yok' : '';
  if (n) renderList($('#results'), sorted(d.results), 4);
  else $('#results').innerHTML = d.similar.length ? '' : emptyState('none');
  $('#similar-wrap').hidden = !d.similar.length;
  renderList($('#similar'), sorted(d.similar));
  $('#rate').textContent = rateTRY ? `Kullanılan kur: 1 € = ${rateTRY.toFixed(2)} ₺.` : '';
  drawQuick();
}

// Hızlı arama: bölümdeki ürünlerde en sık geçen markalar (gerçek veriden; en az 2 ürünü olan)
const brandsBy = {};
const brandName = (b) => String(b || '').trim().replace(/\s+/g, ' ');
function topBrands(list) {
  const c = new Map();
  for (const p of list) { const b = brandName(p.brand); if (b && b.length <= 24) c.set(b.toUpperCase(), (c.get(b.toUpperCase()) || 0) + 1); }
  return [...c].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([b]) => b);
}
const pretty = (b) => (b.length <= 3 ? b : b.toLocaleLowerCase('tr').replace(/(^|\s)\S/g, (m) => m.toLocaleUpperCase('tr')));
function drawQuick() {
  const box = $('#quick');
  const list = brandsBy[$('#search').elements.bolum.value] || [];
  box.hidden = !list.length;
  const q = $('#q').value.trim().toUpperCase();
  box.innerHTML = list.length ? `<span class="quick-label">Markalar</span>${list.map((b) => `<button type="button" class="chip" data-q="${esc(b)}" aria-pressed="${q === b}">${esc(pretty(b))}</button>`).join('')}` : '';
}
$('#quick').addEventListener('click', (e) => {
  const b = e.target.closest('[data-q]');
  if (!b) return;
  $('#q').value = b.getAttribute('aria-pressed') === 'true' ? '' : pretty(b.dataset.q);
  search();
});

function setCurrency(c) {
  const prev = currency;
  currency = c === 'TRY' && !rateTRY ? 'EUR' : c;
  // Girilmiş bütçe yeni para birimine çevrilir (30.000 ₺ -> yaklaşık 540 €), sonuçlar aynı kalır
  const b = $('#search').elements.budget;
  if (b.value && prev !== currency && rateTRY) b.value = String(Math.round(currency === 'TRY' ? +b.value * rateTRY : +b.value / rateTRY));
  if (b.value) { const u = new URLSearchParams(location.search); u.set('budget', b.value); u.set('cur', currency); history.replaceState(null, '', `?${u}`); }
  try { localStorage.setItem('cur', currency); } catch {}
  document.querySelectorAll('.cur button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cur === currency)));
  document.querySelectorAll('.cur-sign').forEach((b) => (b.textContent = currency === 'TRY' ? '₺' : '€'));
  draw();
}

// Reklam alanları: admin panelinden girilen HTML/betik buraya yerleşir
let ads = {};
function placeAd(el, html) {
  el.hidden = false;
  const range = document.createRange();
  range.selectNode(el);
  el.appendChild(range.createContextualFragment(html)); // <script> etiketlerinin çalışması için
}
async function loadAds() {
  ads = await fetch('/api/ads').then((r) => r.json()).catch(() => ({}));
  if (ads.rate_TRY) rateTRY = ads.rate_TRY;
  document.querySelectorAll('body > .ad-slot').forEach((el) => { if (ads[el.dataset.slot]) placeAd(el, ads[el.dataset.slot]); });
}

// Bölümler: bilgisayarlar, masaüstü parçaları, telefon ve tablet. Her bölüm kendi tür listesini ve filtrelerini gösterir.
const SECTIONS = {
  bilgisayar: { group: 'computer', what: 'bilgisayar', title: 'Bilgisayarlar', types: [['', 'Laptop ve masaüstü'], ['laptop', 'Laptop'], ['desktop', 'Masaüstü']],
    placeholder: 'ThinkPad E14, MacBook Air M3 ya da i7 16gb rtx 4060' },
  parca: { group: 'part', what: 'parça', title: 'Bilgisayar parçaları', types: [['part', 'Parça']], placeholder: 'RTX 5070, Ryzen 7 7800X3D, ThinkPad T14 batarya' },
  telefon: { group: 'device', what: 'telefon', title: 'Telefonlar', types: [['phone', 'Telefon']], placeholder: 'iPhone 16, Galaxy A17, Redmi Note 14' },
  tablet: { group: 'device', what: 'tablet', title: 'Tabletler', types: [['tablet', 'Tablet']], placeholder: 'iPad Air, Galaxy Tab S10, Lenovo Tab' },
};
function syncFilters() {
  const group = SECTIONS[$('#search').elements.bolum.value].group;
  document.querySelectorAll('.filters [data-for]').forEach((el) => {
    const show = el.dataset.for.split(' ').includes(group);
    el.hidden = !show;
    if (!show && el.querySelector('select') && el.querySelector('select').name !== 'type') el.querySelector('select').value = '';
  });
}
function setSection(name, keepType) {
  const sec = SECTIONS[name] || SECTIONS.bilgisayar;
  const f = $('#search').elements;
  f.bolum.value = SECTIONS[name] ? name : 'bilgisayar';
  const prev = f.type.value;
  f.type.innerHTML = sec.types.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  if (keepType && sec.types.some(([v]) => v === prev)) f.type.value = prev;
  $('#q').placeholder = `ör. ${sec.placeholder}`;
  $('#what').textContent = sec.what;
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.bolum === f.bolum.value)));
  syncFilters();
  drawQuick();
}

// Seçili filtre sayısı ("Filtreler 2")
const FILTERS = ['category', 'budget', 'ram', 'storage', 'cpu', 'gpu', 'country'];
function updateFilterCount() {
  const f = $('#search').elements;
  const n = FILTERS.filter((k) => f[k] && f[k].value && !f[k].closest('[hidden]')).length + (f.type.value && f.type.options.length > 1 ? 1 : 0);
  const el = $('#filter-count');
  el.hidden = !n;
  el.textContent = n;
  $('#clear').hidden = !n;
}
function clearFilters() {
  const f = $('#search').elements;
  FILTERS.forEach((k) => { if (f[k]) f[k].value = ''; });
  f.type.selectedIndex = 0;
}

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.bolum === $('#search').elements.bolum.value) return;
  $('#q').value = '';
  setSection(b.dataset.bolum);
  search();
}));
$('#search').addEventListener('submit', (e) => { e.preventDefault(); search(); });
$('#search').addEventListener('change', (e) => { if (e.target.tagName === 'SELECT') search(); });
$('#sort').addEventListener('change', () => {
  const u = new URLSearchParams(location.search);
  if ($('#sort').value) u.set('sirala', $('#sort').value); else u.delete('sirala');
  history.replaceState(null, '', u.toString() ? `?${u}` : '/');
  draw();
});
$('#clear').addEventListener('click', () => { clearFilters(); search(); });
$('#results').addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'reset') { $('#q').value = ''; clearFilters(); search(); $('#q').focus(); }
  if (act === 'retry') search();
});
document.querySelectorAll('.cur button').forEach((b) => b.addEventListener('click', () => setCurrency(b.dataset.cur)));

const narrow = matchMedia('(max-width: 720px)').matches;

// Adres çubuğundaki aramayı geri yükle
const init = new URLSearchParams(location.search);
const startType = init.get('type');
setSection(({ mobil: startType === 'tablet' ? 'tablet' : 'telefon' })[init.get('bolum')] || init.get('bolum') || ({ part: 'parca', phone: 'telefon', tablet: 'tablet' }[startType]) || 'bilgisayar');
for (const [k, v] of init) { const f = $('#search').elements[k]; if (f && k !== 'bolum') f.value = v; }
if (['price-desc', 'countries', 'gap'].includes(init.get('sirala'))) $('#sort').value = init.get('sirala');
// Adreste bütçe varsa para birimi adresten gelir (yoksa euro), kişinin kayıtlı seçimi değil
if (init.get('budget')) currency = init.get('cur') === 'TRY' ? 'TRY' : 'EUR';
else if (init.get('cur') === 'TRY') currency = 'TRY';
// Filtreler kapalı başlar (adreste seçili filtre varsa açık kalır): arama alanı sayfanın ana öğesi olsun
if (![...init.keys()].some((k) => !['q', 'cur', 'bolum', 'type', 'sirala'].includes(k))) $('.filter-box').open = false;
// Telefonda arama yapınca klavyeyi kapat ve sonuçlara kaydır
$('#search').addEventListener('submit', () => {
  if (!narrow) return;
  $('#q').blur();
  setTimeout(() => $('.res-bar').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }), 300);
});
loadAds().then(search).then(() => setCurrency(currency));
