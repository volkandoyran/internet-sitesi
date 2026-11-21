# Kısa haber videoları (YouTube Shorts, Instagram Reels)

Günde 4 kez (Türkiye saatiyle 08:20, 12:20, 16:20, 20:20) GitHub Actions (`.github/workflows/gundem-video.yml`) gündem sitesinden sıradaki uygun haberi alır, 9:16 bir video üretir ve bağlı platformlarda **onay beklemeden** paylaşır. Her şey ücretsiz: seslendirme [Piper](https://github.com/rhasspy/piper) (açık kaynak Türkçe ses), görüntü FFmpeg, depolama Cloudflare R2 (10 GB ücretsiz).

## Hangi haberler videoya dönüşür (`src/video.js`)

- En az **2 farklı kaynakta** geçen, son 8 saatin haberleri; en çok kaynakta geçen önce.
- Siyaset, sağlık, suç ve yargı haberleri **videoya çevrilmez**, yalnızca sitede kalır.
- Videoda ve açıklamada bağlantı yok, yalnızca kaynak adı ("Kaynak: AA, NTV") ve "yapay zekâ ile seslendirildi" notu.
- 24 saatte en fazla `VIDEO_GUNLUK` (varsayılan 4) video, her haberden en fazla bir video.
- Acil durdurma: Worker'da `OTOMATIK_PAYLASIM` = `0` (Telegram ile birlikte videolar da durur).

## Kurulum

1. **Video anahtarı:** uzun rastgele bir metin seçin. Cloudflare → *Workers & Pages → gundem-sitesi → Settings → Variables and Secrets* altına `VIDEO_ANAHTAR` olarak, GitHub deposunda *Settings → Secrets and variables → Actions* altına da aynı adla gizli anahtar (secret) olarak ekleyin.
2. **Site adresi:** aynı GitHub sayfasında *Variables* sekmesine `GUNDEM_URL` = `https://gundem-sitesi.vitrin-web.workers.dev` ekleyin.
3. **YouTube** (isteğe bağlı): Google Cloud Console'da proje açın, *YouTube Data API v3*'ü etkinleştirin, *OAuth client ID* (Desktop app) oluşturun. [OAuth Playground](https://developers.google.com/oauthplayground)'da sağ üstteki ayardan kendi client ID/secret'ınızı girip `https://www.googleapis.com/auth/youtube.upload` iznini onaylayın ve *refresh token* alın. GitHub gizli anahtarları: `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`. Not: OAuth uygulaması "Testing" durumundayken refresh token 7 günde biter; uygulamayı *In production* yapın.
4. **Instagram** (isteğe bağlı): Instagram hesabını Profesyonel (İçerik Üreticisi/İşletme) yapın. Meta for Developers'da uygulama açıp *Instagram API with Instagram Login* ekleyin, `instagram_business_content_publish` iznini verin ve uzun ömürlü erişim anahtarı alın. GitHub gizli anahtarları: `IG_USER_ID`, `IG_ACCESS_TOKEN`; bu giriş türünde ayrıca *Variables* altına `IG_GRAPH` = `https://graph.instagram.com/v23.0` ekleyin (Facebook sayfası üzerinden bağlıysanız gerekmez). Uzun ömürlü anahtar 60 günde bir yenilenmeli.
5. **TikTok:** TikTok'un uygulama denetimi bitene kadar API ile paylaşım herkese görünmez. Denetim sonrası eklenecek.

Platform bağlı değilse o platform atlanır; video yine üretilip sitede `/video/<id>.mp4` adresinde 48 saat durur. Sonuçlar `/panel` sayfasındaki paylaşım durumunda görünür.

## Deneme

GitHub → *Actions → Gündem kısa videoları → Run workflow*, `kuru` = `1`: siteye bağlanmadan örnek haberle video üretir; çıktı çalışmanın *Artifacts* bölümündedir. Yerelde: `KURU=1 python3 gundem-sitesi/video/uret.py` (Piper yoksa sessiz video).
