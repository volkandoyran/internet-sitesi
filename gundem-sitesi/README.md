# Gündem sitesi (otomasyonun merkezi)

Sosyal medya ve gündem otomasyonunun tek merkezi. Fiyat karşılaştırma sitesinden (`ucfiyat`) tamamen ayrı bir Cloudflare Worker'dır (`gundem-sitesi`); onu etkilemez. Planlanan diğer otomasyon parçaları (video, kendi içerik üretimi, platform paylaşımları) da buraya eklenecek.

## Ne yapar

1. **Gündem botu (yarım saatte bir):** Türkçe haber sitelerinin herkese açık RSS akışlarını toplar (`src/kaynaklar.js`), aynı olayı anlatan haberleri tek haberde birleştirir (`src/ayikla.js`), her haber için kaynaklı kısa bir metin yazar (`src/metin.js`, Workers AI; kota dolarsa şablon) ve bağlı platformlarda onay beklemeden paylaşır (`src/paylas.js`).
2. **Herkese açık haber sitesi:** `/` son haberler, arama ve son 24 saatin öne çıkanları; `/cok-konusulan` birden çok kaynakta geçenler; `/haber/<id>` haber sayfası ve kaynak bağlantıları; `/hakkinda`; `/rss.xml`, `/sitemap.xml`, `/robots.txt`; `/api/haberler` JSON.
3. **Panel:** `/panel` paylaşıma hazır metinler ("Kopyala" düğmesi) ve paylaşım durumu, `/panel/kaynaklar` her kaynağın son çekim durumu. Arama motorlarına kapalıdır.

**Telif:** haber metinleri ve görseller kopyalanmaz. Yalnızca başlık, botun kendi cümleleriyle yazdığı kısa özet ve asıl habere bağlantı gösterilir/paylaşılır.

## Ücretsiz katman

Tamamen ücretsiz planlarda çalışır: Workers (günde 48 zamanlanmış çalışma, günde 100.000 istek), D1 (`gundem-db`), Workers AI (günde 10.000 nöron; bot çalışma başına en fazla 8 metin yazar, günde yaklaşık 5.000 nöron). Ayarlar `wrangler.jsonc` içindeki `vars` ile: `AI_LIMIT`, `PAYLASIM_LIMIT`, `YENI_HABER_SAAT`, `SAKLA_GUN`, `SITE_ADI`, `SITE_ACIKLAMA`.

## Otomatik paylaşım

Altyapı hazır, **şu an kapalı** çünkü hiçbir platform bağlı değil. Bir platformun gizli ayarları girildiği anda bot her çalışmada en çok konuşulan son 6 saatlik haberlerden platform başına 2 tanesini onay beklemeden paylaşır, her haberi her platformda bir kez.

- **Telegram:** BotFather'dan bot oluşturun, kanalınıza yönetici yapın; Cloudflare → *Workers & Pages → gundem-sitesi → Settings → Variables and Secrets* altına `TELEGRAM_BOT_TOKEN` ve `TELEGRAM_CHAT_ID` (ör. `@kanaladi`) ekleyin.
- Yeni platform eklemek için `src/paylas.js` içindeki listeye bir bağdaştırıcı yazmak yeterli.
- Acil durdurma: `OTOMATIK_PAYLASIM` değişkenini `0` yapın.

## Elle çalıştırma

`ADMIN_PASSWORD` gizli ayarını ekledikten sonra:

```bash
curl -X POST -H "x-admin-sifre: <şifre>" https://gundem-sitesi.<hesabınız>.workers.dev/api/calistir
```

## Yayın

`npx wrangler deploy -c gundem-sitesi/wrangler.jsonc`. GitHub'dan otomatik yayın için Cloudflare panelinde Worker'ı bu depoya bağlayıp *Root directory* olarak `gundem-sitesi` seçin. Yerelde denemek: `npx wrangler dev -c gundem-sitesi/wrangler.jsonc`.
