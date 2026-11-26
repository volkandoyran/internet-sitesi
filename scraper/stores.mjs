// Ürünleri otomatik taranan mağazalar. Her mağaza için ürün bağlantılarının
// nereden bulunacağı (site haritası) ve hangilerinin bilgisayar ürünü olabileceği tanımlanır.
// Bağlantı filtresi yalnızca ön elemedir; asıl karar ürün adından verilir (lib/catalog.js).
import { classify } from '../lib/catalog.js';

const slugText = (u) => decodeURIComponent(new URL(u).pathname).replace(/[-_/.]+/g, ' ');
// Bağlantının sonundaki ürün numarası; büyük olan daha yeni ürün (eski, satıştan kalkmış ürünler sona kalsın)
const lastNum = (u) => +((u.match(/(\d+)(?:\.html)?\/?$/) || [])[1] || 0);
const newestFirst = (a, b) => lastNum(b) - lastNum(a);

// Mağaza kategorisinden tür (addan anlaşılamazsa kullanılır)
const TM_KIND = { laptopi: { type: 'laptop', category: null }, monitori: { type: 'part', category: 'monitor' },
  telefoni: { type: 'phone', category: null }, tableti: { type: 'tablet', category: null },
  'nastolni-kompiutri': { type: 'desktop', category: null }, 'nastolni-kompyutri': { type: 'desktop', category: null }, kompiutri: { type: 'desktop', category: null } };

// Listeyi gruplara ayırıp sırayla birer tane alır (her turda her kategoriden biraz gelsin); grubu olmayanlar sona
function roundRobin(list, key) {
  const groups = new Map();
  const rest = [];
  for (const u of list) {
    const k = key(u);
    if (!k) { rest.push(u); continue; }
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(u);
  }
  const out = [];
  for (let i = 0; out.length < list.length - rest.length; i++) for (const g of groups.values()) if (g[i]) out.push(g[i]);
  return out.concat(rest);
}

const jarCode = (u) => (u.match(/-prod-([a-z]+)/) || [])[1] || '';
const JAR_PC = /^(tkgsm|tbl|cpup|nb|ntb|lap|ssd|hddi|hddn|vga|gpu|mem|ddr|mb|mbd|mon|psu|pws|casep|pc|desk|dt|aio|wks)/;
const JAR_SKIP = /^(acc|bro|brb|casa|casea|caseh|cab|ups|tel|tab|prn|toner|ink|kbd|mou|hds|spk|cam|net|sw)/;

export const STORES = {
  pckolik: {
    currency: 'TRY', // sayfada para birimi yazmazsa
    // Mağaza yalnızca bilgisayar ve parça satıyor: tüm ürün haritası
    sitemaps: ['https://pckolik.com.tr/sitemap-products.xml'],
    accept: (u) => u.includes('/urun/') && classify(slugText(u)) !== null,
  },
  'eshop-gr': {
    sitemaps: Array.from({ length: 16 }, (_, i) => `https://www.e-shop.gr/sitemap_products.phtml?page=${i + 1}`),
    // PER = bilgisayar ve çevre birimleri, TEL = telefon bölümü
    accept: (u) => /-p-(PER|TEL)\.\d+/.test(u) && classify(slugText(u)) !== null,
    order: newestFirst,
    arrange: (list) => roundRobin(list, (u) => (u.match(/-p-(PER|TEL)\./) || [])[1]),
  },
  jarcomputers: {
    sitemapsFromRobots: 'https://www.jarcomputers.com/robots.txt',
    // Bağlantıdaki ürün kodu öneki kategoriyi gösterir (cpup = işlemci, casep = kasa ...).
    // Bilinen bilgisayar önekleri önce taranır; aksesuar/mobilya önekleri hiç alınmaz; bilinmeyenlerde ad denenir.
    accept: (u) => {
      if (!u.includes('-prod-')) return false;
      const code = jarCode(u);
      if (JAR_SKIP.test(code)) return false;
      return JAR_PC.test(code) || classify(slugText(u)) !== null;
    },
    // Bilgisayar önekleri önce ve sırayla karışık (her turda kasa, laptop, telefon ... hepsinden biraz gelsin)
    arrange: (list) => roundRobin(list, (u) => (jarCode(u).match(JAR_PC) || [])[1]),
  },
  technomarket: {
    sitemaps: [0, 1, 2, 3].map((i) => `https://www.technomarket.bg/sitemap/${i}.xml`),
    accept: (u) => new URL(u).pathname.split('/')[1] in TM_KIND,
    order: newestFirst,
    kind: (u) => TM_KIND[new URL(u).pathname.split('/')[1]],
  },
};

// Diğer mağazalar: site haritaları robots.txt'den bulunur, ürün bağlantısı deseni ve addan sınıflandırma ile seçilir.
// Bu mağazaların çoğu GitHub sunucularından gelen istekleri bot korumasıyla engelliyor (403 / doğrulama sayfası).
// Motor engeli aşmaya çalışmaz: mağaza duraklatılır, panelde "engellendi" görünür ve bekleme bitince yeniden denenir.
// (Önceden bu mağazalar ücretli Firecrawl ile alınıyordu; 26 Kasım 2026'da kaldırıldı.)
// product: ürün sayfası bağlantısı deseni (bilinmiyorsa yalnızca addan karar verilir).
const generic = (site, product, extra = {}) => ({ site, sitemapsFromRobots: site + '/robots.txt', product, newLimit: 150, refreshLimit: 300, delayMs: 1500, ...extra });
const OTHER = {
  vatan: generic('https://www.vatanbilgisayar.com', /\.html$/),
  teknosa: generic('https://www.teknosa.com', /-p-\d+/),
  'mediamarkt-tr': generic('https://www.mediamarkt.com.tr', /\/product\//),
  itopya: generic('https://www.itopya.com'),
  incehesap: generic('https://www.incehesap.com', /-fiyati-\d+/),
  sinerji: generic('https://www.sinerji.gen.tr', /-p-\d+/),
  plaisio: generic('https://www.plaisio.gr'),
  kotsovolos: generic('https://www.kotsovolos.gr'),
  public: generic('https://www.public.gr', /\/product\//),
  'mediamarkt-gr': generic('https://www.mediamarkt.gr', /\/product\//),
  cosmodata: generic('https://www.cosmodata.gr'),
  // Technopolis Angular ile çalışır: fiyat sayfa yüklendikten sonra gelir, Playwright gerekir
  technopolis: generic('https://www.technopolis.bg', /\/p\/\d+/, { render: true }),
  ardes: generic('https://ardes.bg', /\/product\//),
  'desktop-bg': generic('https://desktop.bg'),
  'laptop-bg': generic('https://www.laptop.bg'),
  plasico: generic('https://plasico.bg'),
};
for (const [id, cfg] of Object.entries(OTHER)) {
  cfg.accept = (u) => {
    if (!u.startsWith(cfg.site) || /\.(jpe?g|png|webp|pdf|xml)(\?|$)/i.test(u)) return false;
    if (cfg.product && !cfg.product.test(u)) return false;
    return classify(slugText(u)) !== null;
  };
  STORES[id] = cfg;
}

// Panelden girilen adaptör ayarı (retailers.config) koddaki tanımla birleştirilir; kodda olmayan yeni mağaza
// yalnızca bu ayarla da taranabilir. Ayar: { sitemaps, robotsSitemaps, urlPattern, render, selectors, currency, newLimit, refreshLimit, delayMs }
export function adapterFor(retailer) {
  const code = STORES[retailer.id] || {};
  const c = retailer.config || {};
  const cfg = { ...code };
  if (c.sitemaps?.length) cfg.sitemaps = c.sitemaps;
  if (c.robotsSitemaps || (!cfg.sitemaps && !cfg.sitemapsFromRobots && retailer.site)) {
    if (retailer.site) cfg.sitemapsFromRobots = retailer.site.replace(/\/$/, '') + '/robots.txt';
  }
  for (const k of ['render', 'selectors', 'newLimit', 'refreshLimit', 'delayMs']) if (c[k] != null) cfg[k] = c[k];
  cfg.currency = c.currency || code.currency || retailer.currency || 'EUR';
  if (c.urlPattern) {
    const re = new RegExp(c.urlPattern);
    const site = (retailer.site || '').replace(/\/$/, '');
    cfg.accept = (u) => (!site || u.startsWith(site)) && re.test(u) && !/\.(jpe?g|png|webp|pdf|xml)(\?|$)/i.test(u) && classify(slugText(u)) !== null;
  } else if (!cfg.accept) {
    const site = (retailer.site || '').replace(/\/$/, '');
    cfg.accept = (u) => (!site || u.startsWith(site)) && !/\.(jpe?g|png|webp|pdf|xml)(\?|$)/i.test(u) && classify(slugText(u)) !== null;
  }
  cfg.hasSource = !!(cfg.sitemaps?.length || cfg.sitemapsFromRobots);
  return cfg;
}
