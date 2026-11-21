// Ürünleri otomatik taranan mağazalar. Her mağaza için ürün bağlantılarının
// nereden bulunacağı (site haritası) ve hangilerinin bilgisayar ürünü olabileceği tanımlanır.
// Bağlantı filtresi yalnızca ön elemedir; asıl karar ürün adından verilir (lib/catalog.js).
import { classify } from '../lib/catalog.js';

const slugText = (u) => decodeURIComponent(new URL(u).pathname).replace(/[-_/.]+/g, ' ');

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
  },
  jarcomputers: {
    sitemapsFromRobots: 'https://www.jarcomputers.com/robots.txt',
    // Bağlantıdaki ürün kodu öneki kategoriyi gösterir (cpup = işlemci ...); bilinmeyenlerde ad denenir
    accept: (u) => {
      if (!u.includes('-prod-')) return false;
      const code = (u.match(/-prod-([a-z]+)/) || [])[1] || '';
      if (/^(cpup|nb|ntb|lap|ssd|hddi|hddn|vga|gpu|mem|ddr|mb|mbd|mon|psu|pws|casep|pc|desk|dt|aio|wks)/.test(code)) return true;
      return classify(slugText(u)) !== null;
    },
  },
  technomarket: {
    sitemaps: [0, 1, 2, 3].map((i) => `https://www.technomarket.bg/sitemap/${i}.xml`),
    accept: (u) => ['laptopi', 'monitori', 'nastolni-kompiutri', 'nastolni-kompyutri', 'kompiutri'].includes(new URL(u).pathname.split('/')[1]),
  },
};
