const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Şifre tarayıcıda saklanmaz: girişte bir kez gönderilir, sunucu HttpOnly oturum çerezi verir (12 saat).
// Eski sürümün sessionStorage'a yazdığı şifre silinir.
try { sessionStorage.removeItem('adm'); } catch {}
let retailers = [];
let settings = {};

async function api(path, method = 'GET', body) {
  const r = await fetch('/api/admin/' + path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'content-type': 'application/json' } : {},
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
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  try {
    const r = await fetch('/api/admin/login', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: e.target.pw.value }) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { $('#login-err').textContent = data.error || 'Giriş yapılamadı.'; return; }
    e.target.reset();
    start();
  } catch { $('#login-err').textContent = 'Bağlantı hatası. Tekrar deneyin.'; } finally { btn.disabled = false; }
});
$('#logout').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
  showLogin();
});

document.querySelectorAll('[role=tab]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('[role=tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  document.querySelectorAll('#app > section').forEach((s) => (s.hidden = s.id !== 'tab-' + b.dataset.tab));
}));

async function start() {
  $('#login').hidden = true; $('#app').hidden = false; $('#logout').hidden = false;
  [retailers, settings] = await Promise.all([api('retailers'), api('settings')]);
  renderRetailers(); renderAds(); renderScraper(); await renderProducts();
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
        <div class="row" style="margin-top:10px"><button class="btn ghost" type="button" data-act="history">Fiyat geçmişini göster</button></div>
        <div class="hist"></div>
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
  // onclick: liste her yenilendiğinde yeni dinleyici eklenmesin (yoksa tek tıkla iki kayıt/silme olur)
  el.onclick = async (e) => {
    const act = e.target.dataset.act; if (!act) return;
    if (act === 'del-product') {
      const d = e.target.closest('details');
      if (!confirm('Bu ürün ve tüm fiyatları silinsin mi?')) return;
      await api('products/' + d.dataset.id, 'DELETE'); toast('Ürün silindi'); d.remove();
    }
    if (act === 'history') {
      const d = e.target.closest('details');
      const box = d.querySelector('.hist');
      const h = await api('history/' + d.dataset.id);
      box.innerHTML = historyTable(h);
      return;
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
  };
  // Satıcı değişince para birimini ona göre ayarla
  el.querySelectorAll('select[name=retailer_id]').forEach((s) => s.addEventListener('change', () => {
    const r = retailers.find((x) => x.id === s.value);
    s.closest('tr').querySelector('[name=currency]').value = r ? r.currency : 'EUR';
  }));
  // Yalnızca yeni satırlar: kayıtlı tekliflerin para birimi değiştirilmez
  el.querySelectorAll('tr[data-id=""] select[name=retailer_id]').forEach((s) => s.dispatchEvent(new Event('change')));
}

const when = (t) => (t ? new Date(t).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const money = (v, c) => (v == null ? '—' : `${(+v).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${c === 'TRY' ? '₺' : c === 'EUR' || !c ? '€' : c}`);

// Fiyatın kaynağı ve güvenilirliği: doğrulanmamış fiyat sitede gösterilmez, bekleyen fiyat bir sonraki taramayı bekler
const SOURCES = { jsonld: 'JSON-LD', meta: 'meta etiketi', html: 'sayfa HTML', selector: 'CSS seçici' };
function trust(o) {
  const src = o.source ? (SOURCES[o.source.replace('+render', '')] || o.source) + (o.source.includes('+render') ? ' (Playwright)' : '') : 'eski kayıt';
  const pill = o.verified === 0 ? '<span class="pill warn">Doğrulanmadı</span><div class="err">sitede gösterilmiyor</div>'
    : o.pending_price != null ? `<span class="pill warn">Bekliyor: ${money(o.pending_price, o.currency)}</span>`
    : o.confidence != null ? `<span class="pill ${o.confidence >= 75 ? 'ok' : ''}">%${o.confidence}</span>` : '';
  return `${pill}<div class="muted">${esc(src)}${o.gtin ? ` · barkod ${esc(o.gtin)}` : ''}${o.sku ? ` · SKU ${esc(o.sku)}` : ''}</div>`;
}

// Fiyat değişim geçmişi: yalnızca fiyatın değiştiği anlar kaydedilir
function historyTable({ offers, history }) {
  if (!offers.length) return '<p class="muted">Bu ürünün mağaza bağlantısı yok.</p>';
  const byOffer = new Map(offers.map((o) => [o.id, o]));
  return `<div class="scroll" style="margin-top:10px"><table><thead><tr><th>Mağaza</th><th>Güncel</th><th>Eski fiyat</th><th>Güvenilirlik</th><th>Son kontrol</th></tr></thead><tbody>
    ${offers.map((o) => `<tr><td><a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.country)} · ${esc(o.retailer)}</a></td>
      <td>${money(o.price, o.currency)}${o.in_stock === 0 ? ' <span class="muted">stokta yok</span>' : ''}</td>
      <td>${o.old_price ? `<s>${money(o.old_price, o.currency)}</s> <span class="muted">−%${Math.round((1 - o.price / o.old_price) * 100)}</span>` : '—'}</td>
      <td>${trust(o)}</td>
      <td class="muted">${when(o.checked_at || o.updated_at)}${o.next_check_at ? `<br>sonraki: ${when(o.next_check_at)}` : ''}${o.last_error ? `<div class="err">${esc(o.last_error)}</div>` : ''}</td></tr>`).join('')}
    </tbody></table></div>
    <h4 style="margin:14px 0 4px;font-size:14px">Fiyat değişimleri (${history.length})</h4>
    ${history.length ? `<div class="scroll"><table><thead><tr><th>Tarih</th><th>Mağaza</th><th>Fiyat</th><th>€</th></tr></thead><tbody>
      ${history.map((h) => { const o = byOffer.get(h.offer_id) || {}; return `<tr><td>${when(h.at.includes('T') ? h.at : h.at.replace(' ', 'T') + 'Z')}</td><td>${esc(o.retailer || '')}</td><td>${h.price != null ? money(h.price, h.currency) : '—'}</td><td>${money(h.price_eur, 'EUR')}</td></tr>`; }).join('')}
    </tbody></table></div>` : '<p class="muted">Henüz kayıt yok.</p>'}`;
}

// ---------- Veri toplama ----------
const dur = (s) => !s ? '—' : s < 60 ? s + ' sn' : s < 3600 ? Math.round(s / 60) + ' dk' : (s / 3600).toFixed(1) + ' sa';
const INTERVALS = [1, 2, 3, 4, 6, 8, 12, 24, 48];
function storeState(r, now) {
  if (!r.scrape) return ['off', 'Pasif'];
  if (r.paused_until && r.paused_until > now) return ['warn', 'Duraklatıldı'];
  if (r.run_requested) return ['', 'Sırada'];
  if (r.last_error_at && (!r.last_ok_at || r.last_error_at > r.last_ok_at)) return ['warn', 'Hata'];
  if (r.last_ok_at) return ['ok', 'Çalışıyor'];
  return ['', 'Henüz çalışmadı'];
}
async function renderScraper() {
  const el = $('#tab-scraper');
  let st;
  try { st = await api('scraper/status'); } catch { el.innerHTML = '<p class="err">Veri toplama durumu alınamadı.</p>'; return; }
  const rs = st.retailers;
  const sum = (k) => rs.reduce((n, r) => n + (r[k] || 0), 0);
  const lastOk = rs.map((r) => r.last_ok_at).filter(Boolean).sort().pop();
  const lastErr = rs.map((r) => r.last_error_at).filter(Boolean).sort().pop();
  el.innerHTML = `
    <div class="stats">
      <div class="stat"><b>${rs.length}</b><span>mağaza</span></div>
      <div class="stat"><b>${rs.filter((r) => r.scrape).length}</b><span>aktif toplayıcı</span></div>
      <div class="stat"><b>${rs.filter((r) => r.paused_until && r.paused_until > st.now).length}</b><span>duraklatılmış (engel)</span></div>
      <div class="stat"><b>${sum('offers').toLocaleString('tr-TR')}</b><span>toplanan fiyat</span></div>
      <div class="stat"><b>${(sum('unverified') + sum('pending')).toLocaleString('tr-TR')}</b><span>şüpheli fiyat (doğrulama bekliyor)</span></div>
      <div class="stat"><b>${sum('with_gtin').toLocaleString('tr-TR')}</b><span>barkodlu fiyat</span></div>
      <div class="stat"><b style="font-size:17px">${when(lastOk)}</b><span>son başarılı toplama</span></div>
      <div class="stat"><b style="font-size:17px">${when(lastErr)}</b><span>son hata</span></div>
    </div>
    <div class="box"><div class="row" style="justify-content:space-between">
      <p class="muted" style="margin:0;max-width:62ch">Toplayıcı kendi kodumuzla GitHub Actions'ta saatte bir uyanır ve yalnızca zamanı gelen mağazaları tarar. Ücretli servis kullanılmaz. Önce schema.org JSON-LD okunur, yoksa sayfa HTML'i ve aşağıdaki seçiciler. robots.txt'ye uyulur; 403/429/CAPTCHA gelirse mağaza duraklatılır, engel aşılmaya çalışılmaz. ${st.github ? '“Şimdi çalıştır” taramayı hemen başlatır.' : '“Şimdi çalıştır” mağazayı sıraya alır; en geç bir saat içinde taranır.'}</p>
      <button class="btn" type="button" data-act="run-all">Hepsini şimdi çalıştır</button></div></div>
    <div class="stores">${rs.map((r) => storeCard(r, st.now)).join('')}</div>
    <form id="new-store" class="box"><h3 style="margin:0 0 10px;font-size:16px">Mağaza ekle</h3><div class="grid">
      <label class="f">Kısa kimlik (ör. hepsiburada)<input name="id" required pattern="[a-z0-9-]+"></label>
      <label class="f">Adı<input name="name" required></label>
      <label class="f">Ülke<select name="country"><option>TR</option><option>GR</option><option>BG</option></select></label>
      <label class="f">Site adresi<input name="site" type="url" placeholder="https://" required></label>
      <label class="f">Tarama sıklığı<select name="interval_hours">${INTERVALS.map((h) => `<option value="${h}" ${h === 6 ? 'selected' : ''}>${h} saatte bir</option>`).join('')}</select></label></div>
      <label class="f" style="margin-top:10px">Adaptör ayarı (isteğe bağlı, JSON)<textarea name="config" spellcheck="false" placeholder='{"urlPattern": "/urun/", "selectors": {"price": ".fiyat", "old_price": ".eski-fiyat"}}'></textarea>
        <span class="muted" style="font-weight:400">Boş bırakılırsa site haritası robots.txt'den bulunur ve ürün sayfalarında JSON-LD okunur. Ayarlar: sitemaps, urlPattern, selectors (name, price, old_price, image@src, description, brand, in_stock, out_of_stock), render (JavaScript gerekiyorsa true), delayMs.</span></label>
      <div class="row" style="margin-top:12px"><button class="btn" type="submit">Mağazayı ekle</button></div></form>
    <div class="box"><h3 style="margin:0 0 8px;font-size:16px">Son çalıştırmalar</h3><div class="scroll"><table>
      <thead><tr><th>Zaman</th><th>Mağaza</th><th>Sonuç</th><th>Sayfa</th><th>İstek</th><th>Süre</th><th>Yeni</th><th>Fiyatı değişen</th><th>Aynı</th><th>Şüpheli</th><th>Hata</th></tr></thead><tbody>
      ${st.runs.map((x) => `<tr><td>${when(x.finished_at || x.started_at)}</td><td>${esc(x.retailer_id)}</td>
        <td>${x.ok ? '<span class="pill ok">Başarılı</span>' : x.blocked ? '<span class="pill warn">Engellendi</span>' : '<span class="pill warn">Hata</span>'}${x.message ? `<div class="${x.ok ? 'muted' : 'err'}">${esc(x.message)}</div>` : ''}</td>
        <td>${x.pages}</td><td>${x.requests ?? '—'}</td><td>${dur(x.duration_s)}</td><td>${x.added}</td><td>${x.changed}</td><td>${x.unchanged}</td><td>${x.suspicious || 0}</td><td>${x.errors}</td></tr>`).join('') || '<tr><td colspan="11" class="muted">Henüz kayıt yok. İlk saatlik turdan sonra görünür.</td></tr>'}
      </tbody></table></div></div>`;

  el.onclick = async (e) => {
    const act = e.target.dataset.act; if (!act) return;
    const card = e.target.closest('[data-store]');
    if (act === 'run-all' || act === 'run') {
      e.target.disabled = true;
      const r = await api('scraper/run/' + (act === 'run' ? card.dataset.store : 'all'), 'POST', {});
      toast(r.started ? 'Tarama başlatıldı' : r.note || 'Sıraya alındı: en geç bir saat içinde taranacak');
      return renderScraper();
    }
    if (act === 'resume') { await api('retailers/' + card.dataset.store, 'PUT', storeBody(card, { resume: true })); toast('Duraklatma kaldırıldı'); return renderScraper(); }
  };
  el.querySelectorAll('[data-store] input[type=checkbox], [data-store] select[name=interval_hours]').forEach((i) => i.addEventListener('change', async () => {
    await api('retailers/' + i.closest('[data-store]').dataset.store, 'PUT', storeBody(i.closest('[data-store]')));
    toast('Kaydedildi');
  }));
  el.querySelectorAll('form.store-edit').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const card = f.closest('[data-store]');
    await api('retailers/' + card.dataset.store, 'PUT', storeBody(card, { name: f.name.value.trim(), site: f.site.value.trim(), config: f.config.value.trim() }));
    toast('Mağaza kaydedildi'); renderScraper();
  }));
  $('#new-store').addEventListener('submit', async (e) => {
    e.preventDefault();
    await api('retailers', 'POST', Object.fromEntries(new FormData(e.target)));
    retailers = await api('retailers'); renderRetailers(); renderScraper(); toast('Mağaza eklendi');
  });
}
function storeBody(card, extra = {}) {
  return { active: card.querySelector('[name=active]').checked, scrape: card.querySelector('[name=scrape]').checked,
    interval_hours: +card.querySelector('[name=interval_hours]').value, ...extra };
}
function storeCard(r, now) {
  const [cls, label] = storeState(r, now);
  const paused = r.paused_until && r.paused_until > now;
  return `<div class="box store" data-store="${esc(r.id)}">
    <h3><span>${esc(r.country)} · <a href="${esc(r.site)}" target="_blank" rel="noopener">${esc(r.name)}</a></span><span class="pill ${cls}">${label}</span></h3>
    <dl class="kv">
      <dt>Ürün / fiyat</dt><dd>${(r.products || 0).toLocaleString('tr-TR')} ürün · ${(r.offers || 0).toLocaleString('tr-TR')} fiyat${r.errors ? ` · <span class="err">${r.errors} hatalı bağlantı</span>` : ''}</dd>
      ${r.offers ? `<dt>Güvenilirlik</dt><dd>${r.confidence != null ? `ortalama %${r.confidence}` : '—'}${r.with_gtin ? ` · ${r.with_gtin} barkodlu` : ''}${r.unverified || r.pending ? ` · <span class="err">${(r.unverified || 0) + (r.pending || 0)} şüpheli</span>` : ''}</dd>` : ''}
      <dt>Son başarılı</dt><dd>${when(r.last_ok_at)}</dd>
      <dt>Son hata</dt><dd>${when(r.last_error_at)}${r.last_error ? `<div class="err">${esc(r.last_error)}</div>` : ''}</dd>
      ${paused ? `<dt>Bekleme</dt><dd>${when(r.paused_until)} tarihine kadar</dd>` : ''}
      <dt>Yöntem</dt><dd>${r.config?.render ? 'Playwright (JavaScript)' : 'HTTP + JSON-LD'} · kimlik: UcfiyatBot${r.config?.selectors ? ' + CSS seçiciler' : ''}</dd>
    </dl>
    <div class="row">
      <label class="muted"><input type="checkbox" name="scrape" ${r.scrape ? 'checked' : ''} style="width:auto"> Toplayıcı aktif</label>
      <label class="muted"><input type="checkbox" name="active" ${r.active ? 'checked' : ''} style="width:auto"> Sitede göster</label>
      <select name="interval_hours" aria-label="Tarama sıklığı">${INTERVALS.map((h) => `<option value="${h}" ${h === (r.interval_hours || 6) ? 'selected' : ''}>${h} saatte bir</option>`).join('')}</select>
    </div>
    <div class="row"><button class="btn" type="button" data-act="run" ${r.scrape ? '' : 'disabled'}>Şimdi çalıştır</button>${paused ? '<button class="btn ghost" type="button" data-act="resume">Duraklatmayı kaldır</button>' : ''}</div>
    <details><summary class="muted" style="cursor:pointer">Düzenle</summary><form class="store-edit panel" style="margin-top:8px">
      <label class="f">Adı<input name="name" value="${esc(r.name)}"></label>
      <label class="f">Site adresi<input name="site" type="url" value="${esc(r.site)}"></label>
      <label class="f">Adaptör ayarı (JSON, boş = varsayılan)<textarea name="config" spellcheck="false">${esc(r.config ? JSON.stringify(r.config, null, 1) : '')}</textarea></label>
      <div class="row"><button class="btn" type="submit">Kaydet</button></div></form></details>
  </div>`;
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

// Açık oturum varsa doğrudan panele geç; yoksa (401) giriş formu gösterilir
fetch('/api/admin/check', { credentials: 'same-origin' }).then((r) => (r.ok ? start() : showLogin())).catch(() => showLogin('Bağlantı hatası.'));
