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

// Bot korumasıyla GitHub'ı engelleyen mağazalar: sayfalar Firecrawl üzerinden alınır (site/api/admin/firecrawl).
// Ürün bağlantıları Firecrawl "map" ile, aranan kelimeye göre bulunur (her çağrı 1 kredi).
// product: ürün sayfası bağlantısı deseni (bilinmiyorsa addan karar verilir).
const SEARCH = {
  TR: ['laptop', 'telefon', 'tablet', 'ekran-karti', 'islemci', 'monitor', 'masaustu'],
  GR: ['laptop', 'kinita', 'tablet', 'kartes-grafikon', 'epexergastes', 'othones', 'smartphone'],
  BG: ['laptop', 'smartfon', 'tablet', 'videokarti', 'procesori', 'monitori', 'kompyutri'],
};
const fc = (country, site, product) => ({ firecrawl: true, country, site, product, search: SEARCH[country], currency: country === 'TR' ? 'TRY' : 'EUR' });
export const FC_STORES = {
  vatan: fc('TR', 'https://www.vatanbilgisayar.com', /\.html$/),
  teknosa: fc('TR', 'https://www.teknosa.com', /-p-\d+/),
  'mediamarkt-tr': fc('TR', 'https://www.mediamarkt.com.tr', /\/product\//),
  itopya: fc('TR', 'https://www.itopya.com'),
  incehesap: fc('TR', 'https://www.incehesap.com', /-fiyati-\d+/),
  sinerji: fc('TR', 'https://www.sinerji.gen.tr', /-p-\d+/),
  plaisio: fc('GR', 'https://www.plaisio.gr'),
  kotsovolos: fc('GR', 'https://www.kotsovolos.gr'),
  public: fc('GR', 'https://www.public.gr', /\/product\//),
  'mediamarkt-gr': fc('GR', 'https://www.mediamarkt.gr', /\/product\//),
  cosmodata: fc('GR', 'https://www.cosmodata.gr'),
  technopolis: fc('BG', 'https://www.technopolis.bg', /\/p\/\d+/),
  ardes: fc('BG', 'https://ardes.bg', /\/product\//),
  'desktop-bg': fc('BG', 'https://desktop.bg'),
  'laptop-bg': fc('BG', 'https://www.laptop.bg'),
  plasico: fc('BG', 'https://plasico.bg'),
};
for (const cfg of Object.values(FC_STORES)) {
  cfg.accept = (u) => {
    if (!u.startsWith(cfg.site) || /\.(jpe?g|png|webp|pdf|xml)(\?|$)/i.test(u)) return false;
    if (cfg.product && !cfg.product.test(u)) return false;
    return classify(slugText(u)) !== null;
  };
}
