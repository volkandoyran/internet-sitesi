const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let token = '';
try { token = sessionStorage.getItem('adm') || ''; } catch {}
let retailers = [];
let settings = {};

async function api(path, method = 'GET', body) {
  const r = await fetch('/api/admin/' + path, {
    method,
    headers: { authorization: 'Bearer ' + token, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({ error: 'Sunucudan geçersiz yanıt geldi.' }));
  if (r.status === 401) { showLogin('Oturum süresi doldu ya da şifre yanlış. Tekrar giriş yapın.'); throw new Error('401'); }
  if (!r.ok || data.error) { toast(data.error || 'İşlem başarısız.'); throw new Error(data.error); }
  return data;
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
}

function showLogin(err = '') {
  $('#login').hidden = false; $('#app').hidden = true; $('#logout').hidden = true;
  $('#login-err').textContent = err;
}
$('#login').addEventListener('submit', async (e) => {
  e.preventDefault();
  token = e.target.pw.value;
  try { await api('check'); } catch { return; }
  try { sessionStorage.setItem('adm', token); } catch {}
  start();
});
$('#logout').addEventListener('click', () => { token = ''; try { sessionStorage.removeItem('adm'); } catch {} showLogin(); });

document.querySelectorAll('[role=tab]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('[role=tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  document.querySelectorAll('#app > section').forEach((s) => (s.hidden = s.id !== 'tab-' + b.dataset.tab));
}));

async function start() {
  $('#login').hidden = true; $('#app').hidden = false; $('#logout').hidden = false;
  [retailers, settings] = await Promise.all([api('retailers'), api('settings')]);
  renderRetailers(); renderAds(); await renderProducts();
}

// ---------- Ürünler ----------
const FIELDS = [
  ['name', 'Ürün adı (tam model)', 'text'], ['brand', 'Marka', 'text'],
  ['type', 'Tür', 'type'], ['category', 'Parça kategorisi', 'text'],
  ['cpu', 'İşlemci', 'text'], ['cpu_score', 'İşlemci puanı (0-100, boş = otomatik)', 'number'],
  ['gpu', 'Ekran kartı', 'text'], ['gpu_score', 'Ekran kartı puanı (0-100, boş = otomatik)', 'number'],
  ['ram_gb', 'RAM (GB)', 'number'], ['storage_gb', 'Depolama (GB)', 'number'],
  ['screen_in', 'Ekran (inç)', 'number'], ['image', 'Görsel bağlantısı', 'text'],
];
function productForm(p = {}) {
  return `<div class="grid">${FIELDS.map(([k, label, t]) => t === 'type'
    ? `<label class="f">${label}<select name="${k}">${[['laptop', 'Laptop'], ['desktop', 'Masaüstü'], ['phone', 'Telefon'], ['tablet', 'Tablet'], ['part', 'Parça']].map(([v, l]) => `<option value="${v}" ${p[k] === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`
    : `<label class="f">${label}<input name="${k}" type="${t}" ${t === 'number' ? 'step="any"' : ''} value="${esc(p[k])}"></label>`).join('')}</div>`;
}
const formData = (el) => Object.fromEntries(FIELDS.map(([k]) => [k, el.querySelector(`[name=${k}]`).value.trim()]));

function retailerOptions(sel) {
  return retailers.map((r) => `<option value="${esc(r.id)}" ${r.id === sel ? 'selected' : ''}>${esc(r.country)} · ${esc(r.name)}</option>`).join('');
}
function offerRow(o, productId) {
  return `<tr data-id="${o.id || ''}" data-product="${productId}">
    <td><select name="retailer_id" ${o.id ? 'disabled' : ''}>${retailerOptions(o.retailer_id)}</select></td>
    <td><input name="url" type="url" placeholder="https://… ürün sayfası" value="${esc(o.url)}"></td>
    <td><input name="price" type="number" step="0.01" placeholder="otomatik" value="${esc(o.price)}"></td>
    <td><select name="currency"><option ${o.currency !== 'TRY' ? 'selected' : ''}>EUR</option><option ${o.currency === 'TRY' ? 'selected' : ''}>TRY</option></select></td>
    <td><label class="muted"><input type="checkbox" name="manual" ${o.manual ? 'checked' : ''} style="width:auto"> Elle</label>
        <label class="muted"><input type="checkbox" name="in_stock" ${o.in_stock !== 0 ? 'checked' : ''} style="width:auto"> Stokta</label></td>
    <td class="muted">${o.price_eur != null ? o.price_eur + ' €' : ''}<br>${o.updated_at ? new Date(o.updated_at).toLocaleString('tr-TR') : ''}${o.last_error ? `<div class="err">${esc(o.last_error)}</div>` : ''}</td>
    <td><div class="row"><button class="btn" data-act="save-offer" type="button">Kaydet</button>${o.id ? '<button class="btn ghost" data-act="del-offer" type="button">Sil</button>' : ''}</div></td>
  </tr>`;
}

async function renderProducts() {
  const products = await api('products');
  const el = $('#tab-products');
  const noPrice = products.filter((p) => !p.offers.some((o) => o.price_eur != null)).length;
  const errs = products.reduce((n, p) => n + p.offers.filter((o) => o.last_error).length, 0);
  el.innerHTML = `
    <p class="muted">${products.length} ürün · ${noPrice} üründe henüz fiyat yok · ${errs} bağlantıda fiyat çekme hatası · Kur: ${settings.rate_TRY ? `1 € = ${(+settings.rate_TRY).toFixed(2)} ₺` : 'henüz alınmadı'}</p>
    <details class="box p"><summary>Yeni ürün ekle</summary><form id="new-product">${productForm({ type: 'laptop' })}<div class="row" style="margin-top:12px"><button class="btn" type="submit">Ürünü ekle</button></div></form></details>
    <input id="filter" type="search" placeholder="Ürünlerde ara">
    <div id="plist" class="panel">${products.map((p) => `
      <details class="box p" data-id="${p.id}" data-name="${esc((p.name + ' ' + (p.brand || '')).toLowerCase())}">
        <summary>${esc(p.name)} <span class="muted">${p.offers.length} satıcı${p.offers.some((o) => o.last_error) ? ' · hata var' : ''}</span></summary>
        <form class="edit" style="margin-top:12px">${productForm(p)}
          <div class="row" style="margin-top:12px"><button class="btn" type="submit">Ürünü kaydet</button><button class="btn danger" type="button" data-act="del-product">Ürünü sil</button></div></form>
        <h3 style="font-size:15px;margin:18px 0 6px">Satıcı bağlantıları ve fiyatlar</h3>
        <p class="muted">Ürün sayfası bağlantısını ekleyin, fiyat her gün otomatik çekilir. Otomatik çekilemeyen satıcılar için “Elle” kutusunu işaretleyip fiyatı kendiniz girin.</p>
        <div class="scroll"><table><thead><tr><th>Satıcı</th><th>Bağlantı</th><th>Fiyat</th><th>Para</th><th></th><th>Son durum</th><th></th></tr></thead>
        <tbody>${p.offers.map((o) => offerRow(o, p.id)).join('')}${offerRow({}, p.id)}</tbody></table></div>
      </details>`).join('') || '<p class="muted">Henüz ürün yok. “Yeni ürün ekle” ile başlayın.</p>'}</div>`;

  $('#filter').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    el.querySelectorAll('#plist > details').forEach((d) => (d.hidden = q && !d.dataset.name.includes(q)));
  });
  $('#new-product').addEventListener('submit', async (e) => {
    e.preventDefault();
    await api('products', 'POST', formData(e.target));
    toast('Ürün eklendi'); renderProducts();
  });
  el.querySelectorAll('form.edit').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = f.closest('details').dataset.id;
    await api('products/' + id, 'PUT', formData(f));
    toast('Ürün kaydedildi');
  }));
  el.addEventListener('click', async (e) => {
    const act = e.target.dataset.act; if (!act) return;
    if (act === 'del-product') {
      const d = e.target.closest('details');
      if (!confirm('Bu ürün ve tüm fiyatları silinsin mi?')) return;
      await api('products/' + d.dataset.id, 'DELETE'); toast('Ürün silindi'); d.remove();
    }
    const tr = e.target.closest('tr');
    if (act === 'save-offer') {
      const v = (n) => tr.querySelector(`[name=${n}]`);
      const body = {
        product_id: +tr.dataset.product, retailer_id: v('retailer_id').value, url: v('url').value.trim(),
        price: v('price').value, currency: v('currency').value, manual: v('manual').checked, in_stock: v('in_stock').checked,
      };
      if (body.manual && body.price === '') return toast('Elle fiyat için fiyat girin.');
      await api('offers' + (tr.dataset.id ? '/' + tr.dataset.id : ''), tr.dataset.id ? 'PUT' : 'POST', body);
      toast('Fiyat kaydedildi'); renderProducts();
    }
    if (act === 'del-offer') {
      await api('offers/' + tr.dataset.id, 'DELETE'); toast('Bağlantı silindi'); tr.remove();
    }
  });
  // Satıcı değişince para birimini ona göre ayarla
  el.querySelectorAll('select[name=retailer_id]').forEach((s) => s.addEventListener('change', () => {
    const r = retailers.find((x) => x.id === s.value);
    s.closest('tr').querySelector('[name=currency]').value = r ? r.currency : 'EUR';
  }));
  el.querySelectorAll('tr:not([data-id=""]) select[name=retailer_id], tr[data-id=""] select[name=retailer_id]').forEach((s) => s.dispatchEvent(new Event('change')));
}

// ---------- Satıcılar ----------
function renderRetailers() {
  const el = $('#tab-retailers');
  el.innerHTML = `<div class="box scroll"><table><thead><tr><th>Ülke</th><th>Satıcı</th><th>Sitede göster</th><th>Fiyatı otomatik çek</th></tr></thead><tbody>
    ${retailers.map((r) => `<tr data-id="${esc(r.id)}"><td>${esc(r.country)}</td><td><a href="${esc(r.site)}" target="_blank" rel="noopener">${esc(r.name)}</a></td>
      <td><input type="checkbox" name="active" ${r.active ? 'checked' : ''} style="width:auto"></td>
      <td><input type="checkbox" name="scrape" ${r.scrape ? 'checked' : ''} style="width:auto"></td></tr>`).join('')}
    </tbody></table></div>
    <form id="new-retailer" class="box"><h3 style="margin:0 0 10px;font-size:16px">Satıcı ekle</h3><div class="grid">
      <label class="f">Kısa kimlik (ör. hepsiburada)<input name="id" required pattern="[a-z0-9-]+"></label>
      <label class="f">Adı<input name="name" required></label>
      <label class="f">Ülke<select name="country"><option>TR</option><option>GR</option><option>BG</option></select></label>
      <label class="f">Site adresi<input name="site" type="url" placeholder="https://"></label></div>
      <div class="row" style="margin-top:12px"><button class="btn" type="submit">Satıcıyı ekle</button></div></form>`;
  el.querySelectorAll('tbody input').forEach((i) => i.addEventListener('change', async () => {
    const tr = i.closest('tr');
    await api('retailers/' + tr.dataset.id, 'PUT', { active: tr.querySelector('[name=active]').checked, scrape: tr.querySelector('[name=scrape]').checked });
    toast('Satıcı güncellendi');
  }));
  $('#new-retailer').addEventListener('submit', async (e) => {
    e.preventDefault();
    await api('retailers', 'POST', Object.fromEntries(new FormData(e.target)));
    retailers = await api('retailers'); renderRetailers(); toast('Satıcı eklendi');
  });
}

// ---------- Reklamlar ----------
const AD_FIELDS = [
  ['ad_head', 'Sayfa başı kodu (<head>)', 'Google AdSense ya da analitik betiği. Tüm sayfaların <head> kısmına eklenir.'],
  ['ad_top', 'Üst reklam alanı', 'Arama kutusunun üstünde görünür.'],
  ['ad_inline', 'Liste içi reklam', 'Her 4 üründen sonra görünür.'],
  ['ad_bottom', 'Alt reklam alanı', 'Sonuçların altında görünür.'],
  ['ads_txt', 'ads.txt içeriği', 'AdSense hesabınızın verdiği satır, sitenizin /ads.txt adresinde yayınlanır.'],
];
function renderAds() {
  const el = $('#tab-ads');
  el.innerHTML = `<form id="ads" class="box panel">
    <p class="muted">Reklam ağının verdiği HTML kodunu ilgili alana yapıştırın. Boş bırakılan alan sitede görünmez.</p>
    ${AD_FIELDS.map(([k, l, h]) => `<label class="f">${esc(l)}<textarea name="${k}" spellcheck="false">${esc(settings[k] || '')}</textarea><span class="muted" style="font-weight:400">${esc(h)}</span></label>`).join('')}
    <div class="row"><button class="btn" type="submit">Reklamları kaydet</button></div></form>`;
  $('#ads').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    await api('settings', 'PUT', body); Object.assign(settings, body); toast('Reklamlar kaydedildi');
  });
}

if (token) api('check').then(start).catch(() => {}); else showLogin();
