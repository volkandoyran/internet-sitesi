# Üçfiyat

Türkiye, Yunanistan ve Bulgaristan'da hem internet sitesi hem fiziksel mağazası olan satıcılardaki laptop, masaüstü ve bilgisayar parçası fiyatlarını yan yana gösteren site.

- Model adıyla ya da özellik + bütçe ile arama (ör. `i7 16gb rtx 4060`, en fazla 1000 €)
- Aranan model yoksa en yakın özellikteki ürünleri önerir
- Fiyatlar her gün otomatik güncellenir, Türk lirası fiyatlar ECB kuruyla euroya çevrilir
- `/admin` adresinde yönetim paneli: ürün, satıcı bağlantısı, elle fiyat, satıcı açma/kapama, reklam kodları
- Hazır reklam alanları (üst, liste içi, alt, `<head>` kodu ve `ads.txt`)

Tamamen ücretsiz katmanlarda çalışır: Cloudflare Pages (site + API), Cloudflare D1 (veritabanı), GitHub Actions (yayınlama ve günlük fiyat çekme).

## Kurulum (bir kez)

1. **Cloudflare hesap kimliği:** [dash.cloudflare.com](https://dash.cloudflare.com) → sağ alttaki *Account ID* değerini kopyalayın.
2. **Cloudflare API anahtarı:** *My Profile → API Tokens → Create Token → Create Custom Token*. İzinler:
   - Account → **Cloudflare Pages** → Edit
   - Account → **D1** → Edit
3. **GitHub gizli anahtarları:** bu depoda *Settings → Secrets and variables → Actions → New repository secret*:
   - `CLOUDFLARE_ACCOUNT_ID` = 1. adımdaki kimlik
   - `CLOUDFLARE_API_TOKEN` = 2. adımdaki anahtar
   - `ADMIN_PASSWORD` = yönetim paneli şifresi (uzun ve tahmin edilemez olsun)
4. *Actions → Siteyi yayınla → Run workflow*. İş bitince site `https://ucfiyat.pages.dev` adresinde açılır. Veritabanı ve Pages projesi ilk çalıştırmada otomatik oluşturulur.
5. Adres farklı çıkarsa (isim alınmışsa Cloudflare sonuna ek koyar) *Settings → Secrets and variables → Actions → Variables* altında `SITE_URL` değişkenine gerçek adresi yazın. Proje adını değiştirmek isterseniz `PROJECT_NAME` değişkenini kullanın.

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
- **Ücretsiz katman sınırları:** Cloudflare Pages/Workers günde 100.000 istek, D1 günde 5 milyon okuma ve 5 GB depolama. GitHub Actions herkese açık depolarda ücretsizdir.

## Yerelde çalıştırma

```bash
npm install
echo "ADMIN_PASSWORD=yerel-sifre" > .dev.vars
npm run dev      # http://localhost:8788
npm test
```

## Yapı

| Yol | İçerik |
| --- | --- |
| `public/` | Site (HTML/CSS/JS) ve `public/admin/` yönetim paneli |
| `functions/api/[[path]].js` | API: arama, ürün ayrıntısı, admin işlemleri |
| `functions/_middleware.js` | Reklam `<head>` kodunu sayfalara ekler |
| `lib/specs.js` | İşlemci/ekran kartı puanları, benzer ürün hesabı |
| `scraper/` | Günlük fiyat çekici (JSON-LD ve meta etiketlerinden fiyat okur) |
| `schema.sql` | Veritabanı şeması ve 15 başlangıç satıcısı |
