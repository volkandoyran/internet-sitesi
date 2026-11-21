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
  'nastolni-kompiutri': { type: 'desktop', category: null }, 'nastolni-kompyutri': { type: 'desktop', category: null }, kompiutri: { type: 'desktop', category: null } };

const jarCode = (u) => (u.match(/-prod-([a-z]+)/) || [])[1] || '';
const JAR_PC = /^(cpup|nb|ntb|lap|ssd|hddi|hddn|vga|gpu|mem|ddr|mb|mbd|mon|psu|pws|casep|pc|desk|dt|aio|wks)/;
const JAR_SKIP = /^(acc|bro|brb|casa|casea|caseh|cab|ups|tel|tab|prn|toner|ink|kbd|mou|hds|spk|cam|net|sw)/;

export const STORES = {
  pckolik: {
    // Mağaza yalnızca bilgisayar ve parça satıyor: tüm ürün haritası
    sitemaps: ['https://pckolik.com.tr/sitemap-products.xml'],
    accept: (u) => u.includes('/urun/') && classify(slugText(u)) !== null,
  },
  'eshop-gr': {
    sitemaps: Array.from({ length: 16 }, (_, i) => `https://www.e-shop.gr/sitemap_products.phtml?page=${i + 1}`),
    // PER = bilgisayar ve çevre birimleri bölümü
    accept: (u) => /-p-PER\.\d+/.test(u) && classify(slugText(u)) !== null,
    order: newestFirst,
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
    order: (a, b) => JAR_PC.test(jarCode(b)) - JAR_PC.test(jarCode(a)),
  },
  technomarket: {
    sitemaps: [0, 1, 2, 3].map((i) => `https://www.technomarket.bg/sitemap/${i}.xml`),
    accept: (u) => new URL(u).pathname.split('/')[1] in TM_KIND,
    order: newestFirst,
    kind: (u) => TM_KIND[new URL(u).pathname.split('/')[1]],
  },
};
