# Üçfiyat

Türkiye, Yunanistan ve Bulgaristan'da hem internet sitesi hem fiziksel mağazası olan satıcılardaki laptop, masaüstü ve bilgisayar parçası fiyatlarını yan yana gösteren site.

- Model adıyla ya da özellik + bütçe ile arama (ör. `i7 16gb rtx 4060`, en fazla 1000 €)
- Aranan model yoksa en yakın özellikteki ürünleri önerir
- Fiyatlar her gün otomatik güncellenir, Türk lirası fiyatlar ECB kuruyla euroya çevrilir
- `/admin` adresinde yönetim paneli: ürün, satıcı bağlantısı, elle fiyat, satıcı açma/kapama, reklam kodları
- Hazır reklam alanları (üst, liste içi, alt, `<head>` kodu ve `ads.txt`)

Tamamen ücretsiz katmanlarda çalışır: Cloudflare Workers (site + API, statik dosyalar dahil, GitHub'dan otomatik yayın), Cloudflare D1 (veritabanı), GitHub Actions (testler ve günlük fiyat çekme).

## Kurulum (bir kez)

Site, Cloudflare'in GitHub bağlantısıyla (Workers Builds) yayınlanır: `main` dalına her gönderimde Cloudflare siteyi kendisi derleyip yayınlar. İlk yayında D1 veritabanı otomatik oluşturulur, tablolar ve 15 satıcı ilk ziyarette otomatik kurulur.

1. **Cloudflare'de admin şifresi:** Cloudflare paneli → *Workers & Pages → internet-sitesi → Settings → Variables and Secrets → Add*. Tür **Secret**, ad `ADMIN_PASSWORD`, değer olarak uzun ve tahmin edilemez bir şifre girin.
2. **GitHub'da fiyat çekici ayarları:** bu depoda *Settings → Secrets and variables → Actions*:
   - *Secrets* sekmesi → `ADMIN_PASSWORD` = 1. adımdaki şifrenin aynısı
   - *Variables* sekmesi → `SITE_URL` = sitenin adresi (ör. `https://internet-sitesi.<hesabınız>.workers.dev`, Cloudflare panelinde Worker sayfasının üstünde yazar)

Worker adı `wrangler.jsonc` içindeki `name` ile Cloudflare panelindeki Worker adı aynı olmalıdır (`internet-sitesi`). Kendi alan adınızı *Settings → Domains & Routes* bölümünden bağlayabilirsiniz; o zaman `SITE_URL`'yi de güncelleyin.

## Günlük kullanım

1. `https://<siteniz>/admin` adresine girip şifreyle giriş yapın.
2. **Yeni ürün ekle:** tam model adı ve özellikleri. İşlemci ve ekran kartı puanı boş bırakılırsa adından otomatik hesaplanır.
3. Ürünü açıp her satıcı için **ürün sayfası bağlantısını** ekleyin. Fiyat her sabah 08:00'de otomatik çekilir. Hemen çekmek için *Actions → Fiyatları güncelle → Run workflow*.
4. Bir satıcı otomatik çekmeye izin vermiyorsa (hata sütununda "bot koruması engelledi" yazar) **Elle** kutusunu işaretleyip fiyatı kendiniz girin.

## Reklam eklemek

Admin → **Reklamlar** sekmesi. Örneğin Google AdSense için:
- AdSense'in verdiği `<script …adsbygoogle…>` satırını **Sayfa başı kodu** alanına,
- reklam birimi kodlarını **Üst / Liste içi / Alt** alanlarına,
- `google.com, pub-…, DIRECT, …` satırını **ads.txt** alanına yapıştırın.

Boş bırakılan alanlar sitede görünmez.

## Bilinmesi gerekenler

- **Bot koruması:** MediaMarkt, Public, Kotsovolos gibi büyük siteler otomatik istekleri engelleyebilir. Hangi satıcının çalıştığını admin panelindeki hata sütunu ve Actions kayıtları gösterir.
- **Güncellik:** fiyatlar günde bir kez çekilir. 14 günden uzun süredir güncellenemeyen fiyat sitede gösterilmez (elle girilenler hariç).
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
| `scraper/` | Günlük fiyat çekici (JSON-LD ve meta etiketlerinden fiyat okur) |
| `schema.sql` | Veritabanı şeması ve 15 başlangıç satıcısı (Worker ilk istekte kendisi çalıştırır) |
