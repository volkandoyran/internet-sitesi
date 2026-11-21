# Üçfiyat

Türkiye, Yunanistan ve Bulgaristan'da hem internet sitesi hem fiziksel mağazası olan satıcılardaki laptop, masaüstü ve bilgisayar parçası fiyatlarını yan yana gösteren site.

- Model adıyla ya da özellik + bütçe ile arama (ör. `i7 16gb rtx 4060`, en fazla 1000 €)
- Aranan model yoksa en yakın özellikteki ürünleri önerir
- Ürünler mağazalardan otomatik gelir: katalog tarayıcısı mağazaların site haritalarından laptop, masaüstü ve parçaları bulur, fiyatlarını günde 4 kez günceller. Aynı model farklı mağazalardaysa üretici parça koduyla eşleştirilip yan yana gösterilir
- Türk lirası fiyatlar ECB kuruyla euroya çevrilir
- `/admin` adresinde yönetim paneli: ürün, satıcı bağlantısı, elle fiyat, satıcı açma/kapama, reklam kodları
- Hazır reklam alanları (üst, liste içi, alt, `<head>` kodu ve `ads.txt`)

Tamamen ücretsiz katmanlarda çalışır: Cloudflare Workers (site + API, statik dosyalar dahil, GitHub'dan otomatik yayın), Cloudflare D1 (veritabanı), GitHub Actions (testler, katalog tarama ve fiyat çekme).

## Kurulum (bir kez)

Site, Cloudflare'in GitHub bağlantısıyla (Workers Builds) yayınlanır: `main` dalına her gönderimde Cloudflare siteyi kendisi derleyip yayınlar. İlk yayında D1 veritabanı otomatik oluşturulur, tablolar ve 20 satıcı ilk ziyarette otomatik kurulur.

1. **Cloudflare'de admin şifresi:** Cloudflare paneli → *Workers & Pages → internet-sitesi → Settings → Variables and Secrets → Add*. Tür **Secret**, ad `ADMIN_PASSWORD`, değer olarak uzun ve tahmin edilemez bir şifre girin.
2. **GitHub'da fiyat çekici ayarları:** bu depoda *Settings → Secrets and variables → Actions*:
   - *Secrets* sekmesi → `ADMIN_PASSWORD` = 1. adımdaki şifrenin aynısı
   - *Variables* sekmesi → `SITE_URL` = sitenin adresi (ör. `https://internet-sitesi.<hesabınız>.workers.dev`, Cloudflare panelinde Worker sayfasının üstünde yazar)

Worker adı `wrangler.jsonc` içindeki `name` ile Cloudflare panelindeki Worker adı aynı olmalıdır (`internet-sitesi`). Kendi alan adınızı *Settings → Domains & Routes* bölümünden bağlayabilirsiniz; o zaman `SITE_URL`'yi de güncelleyin.

## Günlük kullanım

1. `https://<siteniz>/admin` adresine girip şifreyle giriş yapın.
2. Otomatik taranan mağazalar (`scraper/stores.mjs`: PcKolik, e-shop.gr, JAR Computers, Technomarket) için hiçbir şey yapmanız gerekmez; yeni ürünler her çalıştırmada eklenir. Hemen taramak için *Actions → Fiyatları güncelle → Run workflow*.
3. Taranmayan bir mağazadaki ürünü göstermek için ürünü açıp o satıcının **ürün sayfası bağlantısını** elle ekleyebilirsiniz.
4. Bir satıcı otomatik çekmeye izin vermiyorsa (hata sütununda "bot koruması" yazar) **Elle** kutusunu işaretleyip fiyatı kendiniz girin ya da satıcıyı kapatın.
5. Yeni mağazayı otomatik taramaya eklemek için `scraper/stores.mjs` dosyasına site haritası adresini ve bağlantı filtresini yazın.

## Reklam eklemek

Admin → **Reklamlar** sekmesi. Örneğin Google AdSense için:
- AdSense'in verdiği `<script …adsbygoogle…>` satırını **Sayfa başı kodu** alanına,
- reklam birimi kodlarını **Üst / Liste içi / Alt** alanlarına,
- `google.com, pub-…, DIRECT, …` satırını **ads.txt** alanına yapıştırın.

Boş bırakılan alanlar sitede görünmez.

## Bilinmesi gerekenler

- **Bot koruması:** MediaMarkt, Public, Kotsovolos gibi büyük siteler otomatik istekleri engelleyebilir. Hangi satıcının çalıştığını admin panelindeki hata sütunu ve Actions kayıtları gösterir.
- **Firecrawl:** Engelleyen mağazalar (`scraper/stores.mjs` içindeki `FC_STORES`) Firecrawl ile taranır. Anahtar Cloudflare Worker'da `FIRECRAWL_API_KEY` gizli ayarıdır; tarayıcı ona `/api/admin/firecrawl` üzerinden ulaşır. Her çalıştırmada harcanacak en fazla kredi D1 `settings` tablosundaki `firecrawl_limit` (varsayılan 8, ücretsiz plan için) ya da elle çalıştırmadaki `firecrawl_limit` girdisiyle belirlenir. Gizlenmiş bir mağazadan ürün gelmeye başlayınca mağaza sitede yeniden görünür.
- **Güncellik:** fiyatlar günde 4 kez çekilir. Her çalıştırmada mağaza başına en fazla 400 yeni ürün sayfası açılır; büyük kataloglar birkaç çalıştırmada tamamlanır. 14 günden uzun süredir güncellenemeyen fiyat sitede gösterilmez (elle girilenler hariç).
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
| `scraper/katalog.mjs` | Otomatik katalog tarayıcısı (site haritası → ürün sayfası → JSON-LD) |
| `scraper/stores.mjs` | Otomatik taranan mağazalar ve bağlantı filtreleri |
| `scraper/scrape.mjs` | Elle eklenen bağlantıların fiyat çekicisi |
| `schema.sql` | Veritabanı şeması ve 20 başlangıç satıcısı (Worker ilk istekte kendisi çalıştırır) |
