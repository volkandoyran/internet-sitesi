const $ = (s, el = document) => el.querySelector(s);
const COUNTRIES = [['TR', 'Türkiye'], ['GR', 'Yunanistan'], ['BG', 'Bulgaristan']];
let currency = 'EUR';
let rateTRY = null;
let lastData = null;
try { currency = localStorage.getItem('cur') || 'EUR'; } catch {}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function money(eur) {
  if (eur == null) return '–';
  if (currency === 'TRY' && rateTRY) return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(eur * rateTRY);
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(eur);
}
const storage = (gb) => (gb >= 1024 ? `${+(gb / 1024).toFixed(1)} TB` : `${gb} GB`);
const CATEGORY = { 'laptop-batarya': 'Laptop bataryası', 'laptop-adaptor': 'Laptop adaptörü', 'laptop-ekran': 'Laptop ekranı', 'laptop-klavye': 'Laptop klavyesi', 'laptop-fan': 'Laptop fanı', cpu: 'İşlemci', gpu: 'Ekran kartı', ram: 'RAM', ssd: 'SSD', hdd: 'Sabit disk', anakart: 'Anakart', psu: 'Güç kaynağı', kasa: 'Kasa', monitor: 'Monitör' };
function specChips(p) {
  return [p.cpu, p.gpu, p.ram_gb && `${p.ram_gb} GB RAM`, p.storage_gb && storage(p.storage_gb),
    p.screen_in && `${p.screen_in}"`, CATEGORY[p.category] || p.category].filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join('');
}

function lanes(p) {
  const perCountry = COUNTRIES.map(([cc]) => p.offers.find((o) => o.country === cc) || null);
  const prices = perCountry.filter(Boolean).map((o) => o.price_eur);
  const max = Math.max(...prices, 1);
  const min = Math.min(...prices);
  return perCountry.map((o, i) => {
    const [cc, label] = COUNTRIES[i];
    if (!o) return `<div class="lane ${cc} none"><span class="cc" title="${label}">${cc}</span><div class="bar"><div class="txt">Bu ülkede satıcı yok</div></div></div>`;
    const best = prices.length > 1 && o.price_eur === min;
    return `<div class="lane ${cc}${best ? ' best' : ''}"><span class="cc" title="${label}">${cc}</span>
      <div class="bar"><div class="fill" style="width:${Math.round((o.price_eur / max) * 100)}%"></div>
      <div class="txt"><span class="price">${money(o.price_eur)}</span><span class="shop">${best ? 'En ucuz · ' : ''}${esc(o.retailer)}</span></div></div></div>`;
  }).join('');
}

function renderList(el, items, adEvery = 0) {
  el.innerHTML = '';
  const tpl = $('#row');
  items.forEach((p, i) => {
    const li = tpl.content.firstElementChild.cloneNode(true);
    $('.name', li).textContent = p.name;
    $('.specs', li).innerHTML = specChips(p);
    $('.lanes', li).innerHTML = lanes(p);
    const head = $('.head', li);
    head.addEventListener('click', () => toggleDetail(li, p, head));
    el.appendChild(li);
    if (adEvery && (i + 1) % adEvery === 0 && i < items.length - 1 && ads.ad_inline) {
      const ad = document.createElement('li');
      ad.className = 'ad-slot';
      placeAd(ad, ads.ad_inline);
      el.appendChild(ad);
    }
  });
}

async function toggleDetail(li, p, head) {
  const box = $('.detail', li);
  const open = head.getAttribute('aria-expanded') === 'true';
  head.setAttribute('aria-expanded', String(!open));
  box.hidden = open;
  if (open || box.dataset.loaded) return;
  box.textContent = 'Yükleniyor…';
  const r = await fetch(`/api/products/${p.id}`).then((r) => r.json()).catch(() => null);
  if (!r || r.error) { box.textContent = 'Ayrıntılar yüklenemedi. Sayfayı yenileyip tekrar deneyin.'; return; }
  box.dataset.loaded = '1';
  const rows = r.product.offers.map((o) => `<tr>
      <td>${esc(o.country)}</td><td>${o.url ? `<a href="${esc(o.url)}" target="_blank" rel="nofollow noopener sponsored">${esc(o.retailer)}</a>` : esc(o.retailer)}</td>
      <td class="num ${o.in_stock === 0 ? 'out' : ''}">${money(o.price_eur)}</td>
      <td>${o.currency === 'TRY' ? esc(new Intl.NumberFormat('tr-TR').format(o.price)) + ' ₺' : ''}</td>
      <td>${o.in_stock === 0 ? 'Stokta yok' : 'Stokta'}</td>
      <td>${o.updated_at ? new Date(o.updated_at).toLocaleDateString('tr-TR') : ''}</td></tr>`).join('');
  const sim = r.similar.map((s) => `<button type="button" data-id="${s.id}">${esc(s.name)}<br><b>${money(s.best?.price_eur)}</b> · ${esc(s.best?.retailer || '')}</button>`).join('');
  box.innerHTML = `<table class="offers"><thead><tr><th>Ülke</th><th>Satıcı</th><th>Fiyat</th><th>Yerel</th><th>Durum</th><th>Güncelleme</th></tr></thead><tbody>${rows || '<tr><td colspan="6">Henüz fiyat yok.</td></tr>'}</tbody></table>
    ${sim ? `<h3 class="sub" style="font-size:16px;margin:16px 0 0">Benzer özellikte</h3><div class="mini">${sim}</div>` : ''}`;
  box.querySelectorAll('.mini button').forEach((b) => b.addEventListener('click', () => {
    $('#q').value = r.similar.find((s) => s.id === +b.dataset.id).name;
    $('#search').requestSubmit();
  }));
}

async function search() {
  const fd = new FormData($('#search'));
  const params = new URLSearchParams();
  for (const [k, v] of fd) if (v) params.set(k, v);
  if (params.get('budget') && currency === 'TRY') params.set('cur', 'TRY');
  history.replaceState(null, '', params.toString() ? `?${params}` : '/');
  // Bütçe ₺ girildiyse euroya çevir
  params.delete('cur');
  if (params.get('budget') && currency === 'TRY' && rateTRY) params.set('budget', String(Math.round(+params.get('budget') / rateTRY)));
  $('#results').innerHTML = '<li class="empty">Aranıyor…</li>';
  const data = await fetch(`/api/products?${params}`).then((r) => r.json()).catch(() => null);
  if (!data || data.error) { $('#results').innerHTML = '<li class="empty">Sonuçlar yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.</li>'; return; }
  lastData = data;
  if (data.rate_TRY) rateTRY = data.rate_TRY;
  draw();
}

function draw() {
  const d = lastData; if (!d) return;
  const note = $('#note');
  note.hidden = !d.note; note.textContent = d.note || '';
  if (d.results.length) renderList($('#results'), d.results, 4);
  else $('#results').innerHTML = d.similar.length ? '' : '<li class="empty">Henüz bu aramaya uyan ürün yok. Filtreleri gevşetmeyi ya da bütçeyi artırmayı deneyin.</li>';
  $('#similar-wrap').hidden = !d.similar.length;
  renderList($('#similar'), d.similar);
  $('#rate').textContent = rateTRY ? `Kullanılan kur: 1 € = ${rateTRY.toFixed(2)} ₺` : '';
}

function setCurrency(c) {
  currency = c === 'TRY' && !rateTRY ? 'EUR' : c;
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
  bilgisayar: { group: 'computer', what: 'bilgisayar', types: [['', 'Laptop ve masaüstü'], ['laptop', 'Laptop'], ['desktop', 'Masaüstü']],
    placeholder: 'ör. ThinkPad E14, MacBook Air M3 ya da “i7 16gb rtx 4060”' },
  parca: { group: 'part', what: 'parça', types: [['part', 'Parça']], placeholder: 'ör. RTX 5070, Ryzen 7 7800X3D, ThinkPad T14 batarya' },
  telefon: { group: 'device', what: 'telefon', types: [['phone', 'Telefon']], placeholder: 'ör. iPhone 16, Galaxy A17, Redmi Note 14' },
  tablet: { group: 'device', what: 'tablet', types: [['tablet', 'Tablet']], placeholder: 'ör. iPad Air, Galaxy Tab S10, Lenovo Tab' },
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
  $('#q').placeholder = sec.placeholder;
  $('#what').textContent = sec.what;
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.bolum === f.bolum.value)));
  syncFilters();
}
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.bolum === $('#search').elements.bolum.value) return;
  $('#q').value = '';
  setSection(b.dataset.bolum);
  search();
}));
$('#search').addEventListener('submit', (e) => { e.preventDefault(); search(); });
$('#search').addEventListener('change', (e) => { if (e.target.tagName === 'SELECT') search(); });
document.querySelectorAll('.cur button').forEach((b) => b.addEventListener('click', () => setCurrency(b.dataset.cur)));

// Telefonda filtreler kapalı başlar (seçili filtre varsa açık kalır)
const narrow = matchMedia('(max-width: 720px)').matches;

// Adres çubuğundaki aramayı geri yükle
const init = new URLSearchParams(location.search);
const startType = init.get('type');
setSection(({ mobil: startType === 'tablet' ? 'tablet' : 'telefon' })[init.get('bolum')] || init.get('bolum') || ({ part: 'parca', phone: 'telefon', tablet: 'tablet' }[startType]) || 'bilgisayar');
for (const [k, v] of init) { const f = $('#search').elements[k]; if (f && k !== 'bolum') f.value = v; }
if (init.get('cur') === 'TRY') currency = 'TRY';
if (narrow && ![...init.keys()].some((k) => !['q', 'cur', 'bolum', 'type'].includes(k))) $('.filter-box').open = false;
// Telefonda arama yapınca klavyeyi kapat ve sonuçlara kaydır
$('#search').addEventListener('submit', () => {
  if (!narrow) return;
  $('#q').blur();
  setTimeout(() => $('#note').hidden ? $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' }) : $('#note').scrollIntoView({ behavior: 'smooth' }), 300);
});
loadAds().then(search).then(() => setCurrency(currency));
