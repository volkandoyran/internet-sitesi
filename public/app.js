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
// Katalog 1 TB'yi 1000 GB olarak saklar (elle girilenler 1024 olabilir)
const storage = (gb) => (gb >= 1000 ? `${+(gb / (gb % 1024 === 0 ? 1024 : 1000)).toFixed(1)} TB` : `${gb} GB`);
const CATEGORY = { 'laptop-batarya': 'Laptop bataryası', 'laptop-adaptor': 'Laptop adaptörü', 'laptop-ekran': 'Laptop ekranı', 'laptop-klavye': 'Laptop klavyesi', 'laptop-fan': 'Laptop fanı', cpu: 'İşlemci', gpu: 'Ekran kartı', ram: 'RAM', ssd: 'SSD', hdd: 'Sabit disk', anakart: 'Anakart', psu: 'Güç kaynağı', kasa: 'Kasa', monitor: 'Monitör' };
function specChips(p) {
  return [p.cpu, p.gpu, p.ram_gb && `${p.ram_gb} GB RAM`, p.storage_gb && storage(p.storage_gb),
    p.screen_in && `${p.screen_in}"`, CATEGORY[p.category] || p.category].filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join('');
}

// Ürün sayfası adresi (sunucudaki slug() ile aynı kural)
const TRL = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sht', ъ: 'a', ь: 'y', ю: 'yu', я: 'ya',
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
  ı: 'i', ş: 's', ğ: 'g', ç: 'c', ö: 'o', ü: 'u' };
const slug = (name) => String(name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x00-\x7f]/g, (c) => TRL[c] ?? ' ')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, '') || 'urun';
const productUrl = (p) => `/urun/${p.id}-${slug(p.name)}`;

// Ülke başına en ucuz teklif (stokta olan önce); satır mağazanın ürün sayfasına gider
function lanes(p) {
  const perCountry = COUNTRIES.map(([cc]) => {
    const list = p.offers.filter((o) => o.country === cc);
    return list.find((o) => o.in_stock !== 0) || list[0] || null;
  });
  const prices = perCountry.filter(Boolean).map((o) => o.price_eur);
  const max = Math.max(...prices, 1);
  const min = Math.min(...prices);
  return perCountry.map((o, i) => {
    const [cc, label] = COUNTRIES[i];
    if (!o) return `<div class="lane ${cc} none"><span class="cc" title="${label}">${cc}</span><div class="bar"><div class="txt">Bu ülkede satıcı yok</div></div></div>`;
    const best = prices.length > 1 && o.price_eur === min;
    const inner = `<div class="fill" style="width:${Math.round((o.price_eur / max) * 100)}%"></div>
      <div class="txt"><span class="price">${money(o.price_eur)}</span><span class="shop">${best ? 'En ucuz · ' : ''}${esc(o.retailer)}${o.url ? ' <span aria-hidden="true">↗</span>' : ''}</span></div>`;
    return `<div class="lane ${cc}${best ? ' best' : ''}"><span class="cc" title="${label}">${cc}</span>${o.url
      ? `<a class="bar" href="${esc(o.url)}" target="_blank" rel="nofollow noopener" aria-label="${label}: ${esc(o.retailer)} sitesinde gör (yeni sekme)">${inner}</a>`
      : `<div class="bar">${inner}</div>`}</div>`;
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
      <td>${esc(o.country)}</td><td>${esc(o.retailer)}</td>
      <td class="num ${o.in_stock === 0 ? 'out' : ''}">${money(o.price_eur)}</td>
      <td>${o.currency === 'TRY' ? esc(new Intl.NumberFormat('tr-TR').format(o.price)) + ' ₺' : ''}</td>
      <td>${o.in_stock === 0 ? 'Stokta yok' : 'Stokta'}</td>
      <td>${o.updated_at ? new Date(o.updated_at).toLocaleDateString('tr-TR') : ''}</td>
      <td class="act">${o.url ? `<a class="go" href="${esc(o.url)}" target="_blank" rel="nofollow noopener" title="${esc(o.retailer)} sitesinde aç (yeni sekme)">Mağazada gör <span aria-hidden="true">↗</span></a>` : ''}</td></tr>`).join('');
  const isPc = ['laptop', 'desktop'].includes(r.product.type);
  const sim = r.similar.map((s) => `<button type="button" data-id="${s.id}">${esc(s.name)}<br><b>${money(s.best?.price_eur)}</b> · ${esc(s.best?.retailer || '')}</button>`).join('');
  box.innerHTML = `<table class="offers"><thead><tr><th>Ülke</th><th>Satıcı</th><th>Fiyat</th><th>Yerel</th><th>Durum</th><th>Güncelleme</th><th><span class="sr">Bağlantı</span></th></tr></thead><tbody>${rows || '<tr><td colspan="7">Henüz fiyat yok.</td></tr>'}</tbody></table>
    <p class="redirect-note">"Mağazada gör" sizi ürünü satan mağazanın sitesine götürür. Üçfiyat satış yapmaz.</p>
    <p><a class="more" href="${productUrl(r.product)}">${isPc ? 'Teknik özellikler ve ürün sayfası' : 'Ürün sayfası'} →</a></p>
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
  // Bütçenin para birimi adreste her zaman yazılır: paylaşılan bağlantı başka para birimi seçmiş kişide yanlış okunmasın
  if (params.get('budget')) params.set('cur', currency);
  history.replaceState(null, '', params.toString() ? `?${params}` : '/');
  params.delete('cur');
  // Bütçe ₺ girildiyse euroya çevir; kur bilinmiyorsa ₺ tutarı euro sanılmasın diye bütçe gönderilmez
  if (params.get('budget') && currency === 'TRY') {
    if (rateTRY) params.set('budget', String(Math.round(+params.get('budget') / rateTRY)));
    else params.delete('budget');
  }
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
// Adreste bütçe varsa para birimi adresten gelir (yoksa euro), kişinin kayıtlı seçimi değil
if (init.get('budget')) currency = init.get('cur') === 'TRY' ? 'TRY' : 'EUR';
else if (init.get('cur') === 'TRY') currency = 'TRY';
if (narrow && ![...init.keys()].some((k) => !['q', 'cur', 'bolum', 'type'].includes(k))) $('.filter-box').open = false;
// Telefonda arama yapınca klavyeyi kapat ve sonuçlara kaydır
$('#search').addEventListener('submit', () => {
  if (!narrow) return;
  $('#q').blur();
  setTimeout(() => $('#note').hidden ? $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' }) : $('#note').scrollIntoView({ behavior: 'smooth' }), 300);
});
loadAds().then(search).then(() => setCurrency(currency));
