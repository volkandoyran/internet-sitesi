# Üçfiyat

Türkiye, Yunanistan ve Bulgaristan'da hem internet sitesi hem fiziksel mağazası olan satıcılardaki laptop, masaüstü ve bilgisayar parçası fiyatlarını yan yana gösteren site.

- Model adıyla ya da özellik + bütçe ile arama (ör. `i7 16gb rtx 4060`, en fazla 1000 €)
- Aranan model yoksa en yakın özellikteki ürünleri önerir
- Ürünler mağazalardan otomatik gelir: katalog tarayıcısı mağazaların site haritalarından laptop, masaüstü ve parçaları bulur, fiyatlarını günde 4 kez günceller. Aynı model farklı mağazalardaysa üretici parça koduyla eşleştirilip yan yana gösterilir
- Türk lirası fiyatlar ECB kuruyla euroya çevrilir
- `/eslesen`: birden fazla ülkede satılan ürünler, ülkelere göre fiyat ve en ucuz ülke
- `/ozellikler`: tüm laptop ve masaüstü bilgisayarların teknik özellik listesi; `/urun/<id>-<ad>`: tek ürün sayfası (özellikler, tüm mağazalar, "Mağazada gör" bağlantıları). Özellikler mağaza sayfasındaki özellik tablosundan (tarayıcı fiyatı okurken aynı sayfadan, ek istek olmadan) ve ürün adından otomatik çıkarılır (`lib/pcspecs.js`)
- `/sitemap.xml` Worker tarafından üretilir; ürün sayfalarını da içerir
- Site satış yapmaz: her sayfanın üstündeki bilgi bandı ve fiyat bağlantılarının yanındaki notlar bunu belirtir
- `/admin` adresinde yönetim paneli: ürün, satıcı bağlantısı, elle fiyat, satıcı açma/kapama, reklam kodları
- Hazır reklam alanları (üst, liste içi, alt, `<head>` kodu ve `ads.txt`)

Tamamen ücretsiz katmanlarda çalışır: Cloudflare Workers (site + API, statik dosyalar dahil, GitHub'dan otomatik yayın), Cloudflare D1 (veritabanı), GitHub Actions (testler, katalog tarama ve fiyat çekme).

Şu an 0 TL'ye çalışır. Ücretsiz sınırlar, sınıra yaklaşıldığının nasıl anlaşılacağı ve para kazanılınca hangi sırayla ücretli plana geçileceği: [docs/ucretsiz-ve-ucretli.md](docs/ucretsiz-ve-ucretli.md).

## Kurulum (bir kez)

Site, Cloudflare'in GitHub bağlantısıyla (Workers Builds) yayınlanır: `main` dalına her gönderimde Cloudflare siteyi kendisi derleyip yayınlar. İlk yayında D1 veritabanı otomatik oluşturulur, tablolar ve 20 satıcı ilk ziyarette otomatik kurulur.

1. **Cloudflare'de admin şifresi:** Cloudflare paneli → *Workers & Pages → ucfiyat → Settings → Variables and Secrets → Add*. Tür **Secret**, ad `ADMIN_PASSWORD`, değer olarak uzun ve tahmin edilemez bir şifre girin.
2. **GitHub'da fiyat çekici ayarları:** bu depoda *Settings → Secrets and variables → Actions*:
   - *Secrets* sekmesi → `ADMIN_PASSWORD` = 1. adımdaki şifrenin aynısı
   - *Variables* sekmesi → `SITE_URL` = sitenin adresi (ör. `https://ucfiyat.<hesabınız>.workers.dev`, Cloudflare panelinde Worker sayfasının üstünde yazar)

Worker adı `wrangler.jsonc` içindeki `name` ile Cloudflare panelindeki Worker adı aynı olmalıdır (`ucfiyat`). Kendi alan adınızı *Settings → Domains & Routes* bölümünden bağlayabilirsiniz; o zaman `SITE_URL`'yi de güncelleyin.

## Günlük kullanım

1. `https://<siteniz>/admin` adresine girip şifreyle giriş yapın.
2. Mağazalar için hiçbir şey yapmanız gerekmez; yeni ürünler ve fiyatlar otomatik gelir. Durumu ve sıklığı *Veri toplama* sekmesinden izleyip değiştirebilirsiniz; hemen taramak için **Şimdi çalıştır**.
3. Taranmayan bir mağazadaki ürünü göstermek için ürünü açıp o satıcının **ürün sayfası bağlantısını** elle ekleyebilirsiniz.
4. Bir satıcı otomatik çekmeye izin vermiyorsa (hata sütununda "bot koruması" yazar) **Elle** kutusunu işaretleyip fiyatı kendiniz girin ya da satıcıyı kapatın.
5. Yeni mağaza: *Veri toplama → Mağaza ekle* (kod gerekmez, bkz. *Veri toplama motoru*).

## Veri toplama motoru

GitHub Actions'ta (`.github/workflows/scrape.yml`) **saatte bir** uyanır, siteden plan alır (`/api/admin/scraper/plan`) ve yalnızca zamanı gelen mağazaları tarar. Zamanı gelen yoksa iş ~20 saniyede biter. Depo herkese açık olduğu için Actions dakikaları ücretsizdir.

| Dosya | Görevi |
| --- | --- |
| `scraper/katalog.mjs` | Motor: plan → site haritası → ürün sayfaları → siteye gönder → tarama raporu → eşleştirme |
| `scraper/motor/http.mjs` | Ağ katmanı: robots.txt, mağaza başına bekleme, 2 kez tekrar deneme, 403/429/CAPTCHA algılama, site haritası önbelleği (ETag), Playwright |
| `scraper/stores.mjs` | Mağaza adaptörleri (site haritası, bağlantı filtresi, sıralama) ve panelden gelen ayarla birleştirme (`adapterFor`) |
| `scraper/extract.mjs` | Ortak çıkarım: önce schema.org Product/Offer JSON-LD, yoksa meta etiketleri, HTML kalıpları ve CSS seçicileri (cheerio) |
| `scraper/plan.mjs` | İş akışının ilk adımı: zamanı gelen mağaza var mı, Playwright gerekecek mi |
| `scraper/scrape.mjs` | Site haritası olmayan mağazalara elle eklenmiş bağlantıların fiyatları |

Toplanan alanlar: ad, açıklama, güncel fiyat, eski fiyat (indirim oranı panelde hesaplanır), para birimi, stok, görsel, marka, mağaza kategorisi, ürün bağlantısı, mağaza ve son kontrol zamanı. Sayfada olmayan alan boş (NULL) kalır, uydurulmaz.

Kurallar:
- **Benzersizlik:** aynı mağaza + aynı ürün bağlantısı tek kayıttır; tekrar eklenmez, güncellenir.
- **Fiyat geçmişi:** yalnızca mağazanın fiyatı değişince yeni satır yazılır (kur oynaması sayılmaz). Fiyat değişmediyse yalnızca son kontrol zamanı güncellenir.
- **robots.txt** kurallarına uyulur; istekler arasında mağaza başına bekleme vardır (`delayMs`, robots.txt `Crawl-delay` daha büyükse o).
- **403 / 429 / CAPTCHA / bot doğrulama sayfası:** mağaza o turda bırakılır ve duraklatılır (24 saat, art arda engelde 48, 72 ... en çok 7 gün). Engel aşılmaya çalışılmaz (proxy, IP değiştirme, CAPTCHA çözümü yok). Panelden "Duraklatmayı kaldır" ile erken denenebilir.
- Bir mağazanın hatası diğerlerini durdurmaz; her mağazanın sonucu panelde *Veri toplama → Son çalıştırmalar* tablosunda görünür.
- **Playwright** yalnızca adaptöründe `render: true` olan mağazalarda (şu an Technopolis) ve yalnızca o turda böyle bir mağaza varsa kurulur; görsel, font, video, stil ve reklam/analitik istekleri engellenir.

Admin → **Veri toplama** sekmesi: mağazalar, toplayıcı aktif/pasif, ürün ve fiyat sayısı, son başarılı / son hata zamanı ve mesajı, tarama sıklığı (1-48 saat), **Şimdi çalıştır**, mağaza ekleme ve düzenleme (adaptör ayarı JSON), son çalıştırmalar. Ürünler sekmesinde her ürünün **fiyat geçmişi**.

Yeni mağaza eklemek için kod gerekmez: panelde *Mağaza ekle*. Ayar boş bırakılırsa site haritası robots.txt'den bulunur ve ürün sayfalarında JSON-LD okunur. JSON-LD yoksa seçiciler girilir:

```json
{ "urlPattern": "/urun/", "selectors": { "price": ".fiyat", "old_price": ".eski-fiyat", "image": "img.ana@src", "out_of_stock": ".tukendi" }, "delayMs": 1500 }
```

Geçerli ayarlar: `sitemaps`, `robotsSitemaps`, `urlPattern`, `render`, `selectors` (`name`, `price`, `old_price`, `brand`, `image`, `description`, `store_category`, `in_stock`, `out_of_stock`), `currency`, `newLimit`, `refreshLimit`, `delayMs`.

**Şimdi çalıştır** mağazayı sıraya alır; en geç bir saat içinde taranır. Hemen başlaması istenirse (isteğe bağlı): GitHub'da yalnızca bu depoya *Actions: Read and write* izni olan ince ayarlı bir jeton (fine-grained token) oluşturup Cloudflare'de Worker gizli ayarı `GITHUB_TOKEN` olarak ekleyin. Elle deneme: *Actions → Fiyatları güncelle → Run workflow* (`magaza`, `kuru=1` siteye yazmadan dener, `ornek` sayfa sınırı).

Yerelde deneme (siteye yazmadan): `KURU=1 MAGAZA=pckolik ORNEK=5 node scraper/katalog.mjs`

## Reklam eklemek

Admin → **Reklamlar** sekmesi. Örneğin Google AdSense için:
- AdSense'in verdiği `<script …adsbygoogle…>` satırını **Sayfa başı kodu** alanına,
- reklam birimi kodlarını **Üst / Liste içi / Alt** alanlarına,
- `google.com, pub-…, DIRECT, …` satırını **ads.txt** alanına yapıştırın.

Boş bırakılan alanlar sitede görünmez.

## Bilinmesi gerekenler

- **Bot koruması:** MediaMarkt, Public, Kotsovolos gibi büyük siteler otomatik istekleri engelleyebilir. Hangi satıcının çalıştığını admin panelindeki hata sütunu ve Actions kayıtları gösterir.
- **Veri toplama motoru (ücretsiz, kendi kodumuz):** ücretli scraping servisi, yapay zekâ ya da API anahtarı kullanılmaz (Firecrawl 26 Kasım 2026'da kaldırıldı). Ayrıntılar aşağıda, *Veri toplama motoru* bölümünde.
- **Güncellik:** her mağaza varsayılan olarak 6 saatte bir taranır (panelden değiştirilebilir). Her çalıştırmada mağaza başına en fazla 400 yeni ürün sayfası açılır; büyük kataloglar birkaç çalıştırmada tamamlanır. 14 günden uzun süredir güncellenemeyen fiyat sitede gösterilmez (elle girilenler hariç).
- **Kullanım koşulları:** bazı satıcıların koşulları otomatik veri çekmeyi yasaklayabilir. Site büyürse satıcıların ortaklık (affiliate) programları ve ürün veri akışları daha güvenli bir kaynaktır.
- **Ücretsiz katman sınırları:** Workers günde 100.000 istek (yalnızca ana sayfa ve API sayılır; CSS/JS dosyaları sınırsız ve ücretsiz), D1 günde 5 milyon satır okuma ve 5 GB depolama. GitHub Actions herkese açık depolarda ücretsizdir.

## Yerelde çalıştırma

```bash
npm install
echo "ADMIN_PASSWORD=yerel-sifre" > .dev.vars
npm run dev      # http://localhost:8787
npm test
```

## Yapı

| Yol | İçerik |
| --- | --- |
| `public/` | Site (HTML/CSS/JS) ve `public/admin/` yönetim paneli |
| `src/worker.js` | Giriş noktası: API yönlendirmesi, `ads.txt`, reklam `<head>` kodu |
| `src/api.js` | API: arama, ürün ayrıntısı, admin işlemleri |
| `wrangler.jsonc` | Cloudflare Worker ayarları |
| `lib/specs.js` | İşlemci/ekran kartı puanları, benzer ürün hesabı |
| `lib/catalog.js` | Ürün adından tür/kategori, özellik ve mağazalar arası eşleştirme anahtarı |
| `scraper/katalog.mjs` | Veri toplama motoru (site haritası → ürün sayfası → JSON-LD / seçiciler) |
| `scraper/motor/http.mjs` | Ağ katmanı: robots.txt, bekleme, tekrar deneme, engel algılama, önbellek, Playwright |
| `scraper/stores.mjs` | Otomatik taranan mağazalar ve bağlantı filtreleri |
| `scraper/scrape.mjs` | Elle eklenen bağlantıların fiyat çekicisi |
| `gundem-sitesi/` | Ayrı site ve Worker: gündem haber sitesi ve sosyal medya otomasyonu (bkz. `gundem-sitesi/README.md`) |
| `schema.sql` | Veritabanı şeması ve 20 başlangıç satıcısı (Worker ilk istekte kendisi çalıştırır) |
