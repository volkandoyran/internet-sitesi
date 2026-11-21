# Gündem sitesi (otomasyonun merkezi)

Sosyal medya ve gündem otomasyonunun tek merkezi. Fiyat karşılaştırma sitesinden (`ucfiyat`) tamamen ayrı bir Cloudflare Worker'dır (`gundem-sitesi`); onu etkilemez. Planlanan diğer otomasyon parçaları (video, kendi içerik üretimi, platform paylaşımları) da buraya eklenecek.

## Ne yapar

1. **Gündem botu (yarım saatte bir):** Türkçe haber sitelerinin herkese açık RSS akışlarını toplar (`src/kaynaklar.js`), aynı olayı anlatan haberleri tek haberde birleştirir (`src/ayikla.js`), her haber için kaynaklı kısa bir metin yazar (`src/metin.js`, Workers AI; kota dolarsa şablon) ve bağlı platformlarda onay beklemeden paylaşır (`src/paylas.js`).
   **Yabancı basın:** `dil` alanı olan kaynakların (BBC News, The Guardian, Al Jazeera, DW News, NPR) en önemli haberleri (en çok kaynakta geçen, en yeni) Türkçe başlık ve metinle çevrilir. Çalışma başına en fazla `YABANCI_LIMIT` (varsayılan 2) çeviri yapılır ve bu sayı `AI_LIMIT` içinden düşer, yani ücretsiz yapay zekâ kotası artmaz. 6 saat içinde çevrilemeyen yabancı haber hiç yayınlanmaz; İngilizce metin asla yayınlanmaz.
2. **Görseller:** haberde adı geçen kişinin Wikipedia'daki serbest lisanslı (Wikimedia Commons) fotoğrafı, fotoğrafçı ve lisans atfıyla; kişi yoksa yapay zekâyla üretilmiş, "temsili görsel" olarak etiketlenen bir görsel (gerçek kişi çizilmez). İkisi de yoksa başlıklı SVG kapak. Haber sitelerinin fotoğrafları kullanılmaz. Ayarlar: `GORSEL_LIMIT` (çalışma başına 6 haber), `GORSEL_AI_LIMIT` (çalışma başına 1 yapay zekâ görseli, ~50 nöron). Yapay zekâ görselleri `GORSEL` KV'de 8 gün tutulur.
3. **Herkese açık haber sitesi:** `/` son haberler, arama ve son 24 saatin öne çıkanları; `/cok-konusulan` birden çok kaynakta geçenler; `/haber/<id>` haber sayfası ve kaynak adları; `/hakkinda`; `/rss.xml`, `/sitemap.xml`, `/robots.txt`; `/api/haberler` JSON.
4. **Panel:** `/panel` paylaşıma hazır metinler ("Kopyala" düğmesi) ve paylaşım durumu, `/panel/kaynaklar` her kaynağın son çekim durumu. Arama motorlarına kapalıdır.

**Telif:** haber metinleri ve görseller kopyalanmaz. Yalnızca başlık, botun kendi cümleleriyle yazdığı kısa özet ve haberin alındığı yerin adı gösterilir/paylaşılır (bağlantı verilmez).

## Ücretsiz katman

Tamamen ücretsiz planlarda çalışır: Workers (günde 48 zamanlanmış çalışma, günde 100.000 istek), D1 (`gundem-db`), Workers AI (günde 10.000 nöron; bot çalışma başına en fazla 8 metin yazar, günde yaklaşık 5.000 nöron). Ayarlar `wrangler.jsonc` içindeki `vars` ile: `AI_LIMIT`, `YABANCI_LIMIT`, `YABANCI_SAAT`, `PAYLASIM_LIMIT`, `YENI_HABER_SAAT`, `SAKLA_GUN`, `SITE_ADI`, `SITE_ACIKLAMA`.

## Otomatik paylaşım

Altyapı hazır, **şu an kapalı** çünkü hiçbir platform bağlı değil. Bir platformun gizli ayarları girildiği anda bot her çalışmada en çok konuşulan son 6 saatlik haberlerden platform başına 2 tanesini onay beklemeden paylaşır, her haberi her platformda bir kez.

- **Telegram:** BotFather'dan bot oluşturun, kanalınıza yönetici yapın; Cloudflare → *Workers & Pages → gundem-sitesi → Settings → Variables and Secrets* altına `TELEGRAM_BOT_TOKEN` ve `TELEGRAM_CHAT_ID` (ör. `@kanaladi`) ekleyin.
- Yeni platform eklemek için `src/paylas.js` içindeki listeye bir bağdaştırıcı yazmak yeterli.
- **Kısa videolar (YouTube Shorts, Instagram Reels):** ücretsiz GitHub Actions ile üretilip onaysız paylaşılır; kurulum `video/README.md`.
- Acil durdurma: `OTOMATIK_PAYLASIM` değişkenini `0` yapın (videolar da durur).

## Elle çalıştırma

`ADMIN_PASSWORD` gizli ayarını ekledikten sonra:

```bash
curl -X POST -H "x-admin-sifre: <şifre>" https://gundem-sitesi.<hesabınız>.workers.dev/api/calistir
```

## Yayın

`npx wrangler deploy -c gundem-sitesi/wrangler.jsonc`. GitHub'dan otomatik yayın için Cloudflare panelinde Worker'ı bu depoya bağlayıp *Root directory* olarak `gundem-sitesi` seçin. Yerelde denemek: `npx wrangler dev -c gundem-sitesi/wrangler.jsonc`.

## Google'da çıkmak (Search Console)

Site Google için hazır: `/sitemap.xml` (son 1000 haber), `/robots.txt`, her sayfada açıklama ve Open Graph etiketleri, haber sayfalarında `NewsArticle` yapısal verisi.

Kayıt (bir kez, ücretsiz):

1. https://search.google.com/search-console → *Mülk ekle* → **URL öneki** → `https://gundem-sitesi.vitrin-web.workers.dev/`
2. Doğrulama yöntemi olarak **HTML etiketi**ni seçin; `content="..."` içindeki kodu kopyalayın.
3. Cloudflare → *Workers & Pages → gundem-sitesi → Settings → Variables and Secrets* → `GOOGLE_DOGRULAMA` adlı düz metin değişkeni olarak yapıştırın (ya da HTML dosyası yöntemi için dosya adını `GOOGLE_DOGRULAMA_DOSYA` olarak, ör. `google1234abcd.html`). Kaydedince site etiketi kendisi ekler.
4. Search Console'da *Doğrula*'ya basın, sonra *Site haritaları* → `sitemap.xml` gönderin.
