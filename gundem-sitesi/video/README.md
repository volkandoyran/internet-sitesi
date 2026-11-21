# Kısa haber videoları (YouTube Shorts, Instagram Reels)

Günde 4 kez (Türkiye saatiyle 08:20, 12:20, 16:20, 20:20) GitHub Actions (`.github/workflows/gundem-video.yml`) gündem sitesinden sıradaki uygun haberi alır, 9:16 bir video üretir ve bağlı platformlarda **onay beklemeden** paylaşır. Her şey ücretsiz: seslendirme [Piper](https://github.com/rhasspy/piper) (açık kaynak Türkçe ses), görüntü FFmpeg, depolama Cloudflare Workers KV (ücretsiz, kart gerekmez).

## Hangi haberler videoya dönüşür (`src/video.js`)

- En az **2 farklı kaynakta** geçen, son 8 saatin haberleri; en çok kaynakta geçen önce.
- Siyaset, sağlık, suç ve yargı haberleri **videoya çevrilmez**, yalnızca sitede kalır.
- Her videonun sağ üst köşesinde hesabın logosu (`video/logo.png`) bulunur; logoyu değiştirmek için bu dosyayı değiştirmek yeterli.
- Videoda ve açıklamada bağlantı yok, yalnızca kaynak adı ("Kaynak: AA, NTV") ve "yapay zekâ ile seslendirildi" notu.
- 24 saatte en fazla `VIDEO_GUNLUK` (varsayılan 4) video, her haberden en fazla bir video.
- Acil durdurma: Worker'da `OTOMATIK_PAYLASIM` = `0` (Telegram ile birlikte videolar da durur).

## Instagram fotoğraf gönderileri

Videoların yanında günde 2 kez (10:50 ve 18:50) Instagram'a 1080x1350 haber kartı (görsel) atılır: başlık, kısa metin, kaynak adı ve sağ üstte logo. Görsel ve video aynı haberi tekrar etmez. Sayıyı `GORSEL_GUNLUK` (Worker değişkeni, varsayılan 2) belirler. Instagram bağlı değilken görseller de `/video/liste` sayfasında durur. Elle denemek için Actions > Gündem kısa videoları > Run workflow > `mod` = `foto`.

## Kurulum

Siteye bağlanmak için ayar gerekmez: iş akışı kimliğini GitHub'ın imzalı jetonuyla (OIDC) kanıtlar ve site yalnızca bu deponun `main` dalındaki `gundem-video.yml` iş akışını kabul eder. (İsteğe bağlı yedek: `VIDEO_ANAHTAR` gizli anahtarı hem Worker'da hem GitHub'da aynıysa o da kabul edilir.)

**Elle paylaşım:** hesaplar bağlanana kadar üretilen videolar https://gundem-sitesi.vitrin-web.workers.dev/video/liste sayfasında durur (48 saat). Telefondan izleyip indirebilir, açıklamayı tek dokunuşla kopyalayabilirsin.

1. **YouTube** (isteğe bağlı): Google Cloud Console'da proje açın, *YouTube Data API v3*'ü etkinleştirin, *OAuth client ID* (Desktop app) oluşturun. [OAuth Playground](https://developers.google.com/oauthplayground)'da sağ üstteki ayardan kendi client ID/secret'ınızı girip `https://www.googleapis.com/auth/youtube.upload` iznini onaylayın ve *refresh token* alın. GitHub gizli anahtarları: `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`. Not: OAuth uygulaması "Testing" durumundayken refresh token 7 günde biter; uygulamayı *In production* yapın.
2. **Instagram** (isteğe bağlı): Instagram hesabını Profesyonel (İçerik Üreticisi/İşletme) yapın. Meta for Developers'da uygulama açıp *Instagram API with Instagram Login* ekleyin, `instagram_business_content_publish` iznini verin ve uzun ömürlü erişim anahtarı alın. GitHub gizli anahtarları: `IG_USER_ID`, `IG_ACCESS_TOKEN`; bu giriş türünde ayrıca *Variables* altına `IG_GRAPH` = `https://graph.instagram.com/v23.0` ekleyin (Facebook sayfası üzerinden bağlıysanız gerekmez). Uzun ömürlü anahtar 60 günde bir yenilenmeli.
3. **TikTok:** TikTok'un uygulama denetimi bitene kadar API ile paylaşım herkese görünmez. Denetim sonrası eklenecek.

Platform bağlı değilse o platform atlanır; video yine üretilip sitede `/video/<id>.mp4` adresinde 48 saat durur. Sonuçlar `/panel` sayfasındaki paylaşım durumunda görünür.

## Deneme

GitHub → *Actions → Gündem kısa videoları → Run workflow*, `kuru` = `1`: siteye bağlanmadan örnek haberle video üretir; çıktı çalışmanın *Artifacts* bölümündedir. Yerelde: `KURU=1 python3 gundem-sitesi/video/uret.py` (Piper yoksa sessiz video).
