// Tüm sayfalarda ortak arayüz parçaları: mobil menü, ikonlar, görsel kutusu, "x saat önce" yazısı.
// app.js (ana sayfa) ve sayfa.js (sunucuda oluşan sayfalar) bu dosyayı içe aktarır.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Sayfadaki SVG ikon kümesinden bir ikon (bkz. index.html ve src/pages.js içindeki <svg> sprite)
export const ic = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

// Ürün görseli; yer tutucu ikon görselin arkasında durur, görsel yüklenemezse kaldırılır ve ikon görünür.
// alt metni boş: ürün adı hemen yanında yazılı, ekran okuyucu aynı adı iki kez okumasın.
export function thumb(src, cls = 'thumb') {
  return `<span class="${cls}">${ic('img')}${src
    ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="88" height="88">`
    : ''}</span>`;
}

// Fiyat güncelliği: "12 dakika önce", "3 saat önce", "2 gün önce"
const rtf = typeof Intl.RelativeTimeFormat === 'function' ? new Intl.RelativeTimeFormat('tr', { numeric: 'auto' }) : null;
export function ago(iso) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const min = Math.round((Date.now() - t) / 60000);
  if (!rtf) return new Date(t).toLocaleDateString('tr-TR');
  if (min < 1) return 'az önce';
  if (min < 60) return rtf.format(-min, 'minute');
  if (min < 48 * 60) return rtf.format(-Math.round(min / 60), 'hour');
  return rtf.format(-Math.round(min / 1440), 'day');
}

// Mobil menü: düğme sayfa bağlantılarını açar/kapatır; Escape, dışarı dokunma ve bağlantı seçimi kapatır
const btn = document.querySelector('.menu-btn');
const nav = document.getElementById('site-nav');
if (btn && nav) {
  const set = (open) => { btn.setAttribute('aria-expanded', String(open)); nav.classList.toggle('open', open); btn.setAttribute('aria-label', open ? 'Menüyü kapat' : 'Menüyü aç'); };
  btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') { set(false); btn.focus(); } });
  document.addEventListener('click', (e) => { if (!e.target.closest('.top')) set(false); });
  matchMedia('(min-width: 761px)').addEventListener('change', (m) => { if (m.matches) set(false); });
}

// Yüklenemeyen ürün görseli kaldırılır, arkasındaki ikon görünür. (Satır içi onerror yerine: güvenlik başlığı
// CSP satır içi betiklere izin vermez.) Betik yüklenmeden önce hata vermiş görseller de bir kez taranır.
document.addEventListener('error', (e) => { if (e.target instanceof HTMLImageElement) e.target.remove(); }, true);
const kirikGorseller = () => document.querySelectorAll('img').forEach((im) => { if (im.complete && !im.naturalWidth && im.getAttribute('src')) im.remove(); });
if (document.readyState === 'complete') kirikGorseller(); else addEventListener('load', kirikGorseller);
