// Sunucuda oluşturulan sayfalar (eşleşen modeller, teknik özellikler, ürün) için:
// para birimi düğmesi, bölüm/tür süzgeçleri, liste içinde arama ve sıralama.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const rate = +document.body.dataset.rate || null;
let currency = 'EUR';
try { currency = localStorage.getItem('cur') || 'EUR'; } catch {}

const fmt = (eur) => (currency === 'TRY' && rate
  ? new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(eur * rate)
  : new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(eur));

function setCurrency(c) {
  currency = c === 'TRY' && !rate ? 'EUR' : c;
  try { localStorage.setItem('cur', currency); } catch {}
  $$('.cur button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cur === currency)));
  $$('.m[data-eur]').forEach((el) => { if (el.dataset.eur !== '') el.textContent = fmt(+el.dataset.eur); });
  const r = $('#rate');
  if (r) r.textContent = rate ? `Kullanılan kur: 1 € = ${rate.toFixed(2)} ₺` : '';
}
$$('.cur button').forEach((b) => b.addEventListener('click', () => setCurrency(b.dataset.cur)));
setCurrency(currency);

// Eşleşen modeller: bölüm ve alt tür süzgeci (adres çubuğunda saklanır: ?bolum=parca&tur=gpu)
const list = $('#list');
if (list) {
  const params = new URLSearchParams(location.search);
  let bolum = params.get('bolum') || '';
  let tur = params.get('tur') || '';
  if (!$$('[data-filter]').some((b) => b.dataset.filter === bolum && !b.disabled)) { bolum = ''; tur = ''; }
  function apply() {
    $$('[data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === bolum)));
    $$('.subtabs').forEach((box) => {
      box.hidden = box.dataset.for !== bolum;
      const subs = $$('[data-sub]', box);
      if (!box.hidden && !subs.some((b) => b.dataset.sub === tur)) tur = '';
      subs.forEach((b) => b.setAttribute('aria-pressed', String(!box.hidden && b.dataset.sub === tur)));
    });
    let n = 0;
    $$('.group', list).forEach((g) => {
      const on = !bolum || g.dataset.bolum === bolum;
      g.hidden = !on;
      for (const li of g.querySelectorAll('li.item')) {
        const show = on && (!tur || li.dataset.sub === tur);
        li.hidden = !show;
        if (show) n++;
      }
    });
    $('#count').textContent = n + ' ürün gösteriliyor';
    const u = new URLSearchParams();
    if (bolum) u.set('bolum', bolum);
    if (bolum && tur) u.set('tur', tur);
    history.replaceState(null, '', u.toString() ? '?' + u : location.pathname);
  }
  $$('[data-filter]').forEach((b) => b.addEventListener('click', () => { bolum = b.dataset.filter; tur = ''; apply(); }));
  $$('.subtabs [data-sub]').forEach((b) => b.addEventListener('click', () => { tur = b.dataset.sub; apply(); }));
  apply();
}

// Teknik özellikler: tür süzgeci, arama, sıralama (adres çubuğunda saklanır, paylaşılabilir)
const table = $('#specs');
if (table) {
  const body = table.tBodies[0];
  const rows = [...body.rows];
  const tools = $('.spec-tools');
  const params = new URLSearchParams(location.search);
  let type = params.get('tur') || '';
  const q = $('#sq');
  const sort = $('#sort');
  q.value = params.get('q') || '';
  sort.value = params.get('sirala') || 'name';
  const low = (t) => String(t || '').replace(/İ/g, 'i').toLowerCase().replace(/ı/g, 'i');
  const price = (r) => (r.dataset.price === '' ? Infinity : +r.dataset.price);
  function apply() {
    const words = low(q.value).split(/\s+/).filter(Boolean);
    let n = 0;
    for (const r of rows) {
      const show = (!type || r.dataset.type === type) && words.every((w) => r.dataset.q.includes(w));
      r.hidden = !show;
      if (show) n++;
    }
    const s = sort.value;
    const ordered = s === 'name' ? rows : [...rows].sort((a, b) => (s === 'price' ? price(a) - price(b) : price(b) - price(a)));
    body.append(...ordered);
    $('#count').textContent = n ? `${n} model gösteriliyor` : 'Bu aramaya uyan model yok.';
    $$('[data-type]', tools).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === type)));
    const u = new URLSearchParams();
    if (type) u.set('tur', type);
    if (q.value.trim()) u.set('q', q.value.trim());
    if (s !== 'name') u.set('sirala', s);
    history.replaceState(null, '', u.toString() ? `?${u}` : location.pathname);
  }
  $$('[data-type]', tools).forEach((b) => b.addEventListener('click', () => { type = b.dataset.type; apply(); }));
  q.addEventListener('input', apply);
  sort.addEventListener('change', apply);
  apply();
}
