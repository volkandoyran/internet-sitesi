# Gündem botu

Türkçe haber RSS kaynaklarından gündemi yarım saatte bir toplayan, aynı olayı anlatan haberleri tek haberde birleştiren ve her haber için kaynağı belirtilmiş kısa bir sosyal medya metni yazan Cloudflare Worker. Siteden (`ucfiyat`) ayrı bir Worker'dır; siteyi etkilemez.

- **Liste:** `https://gundem-botu.<hesabınız>.workers.dev/` toplanan haberler ve paylaşıma hazır metinler ("Kopyala" düğmesiyle). `/?cok=1` yalnızca birden çok kaynağın verdiği haberler, `/kaynaklar` her kaynağın son çekim durumu, `/api/haberler` aynı liste JSON olarak.
- **Tekrar ayıklama:** aynı bağlantı ikinci kez alınmaz; başlıkları büyük ölçüde örtüşen haberler (`src/ayikla.js`) tek haberde toplanır, diğer kaynaklar haberin altında listelenir. Kaynak sayısı gündem göstergesidir: çok kaynaklı haberler önce metin alır ve önce paylaşılır.
- **Metin:** gövdeyi Workers AI (Llama 3.3 70B) yalnızca başlık ve özetteki bilgilerle yazar; yorum, bağlantı ve kaynak adı yazmasına izin verilmez. Kaynak satırı ve bağlantı her zaman kodla eklenir. Model kotası dolarsa ya da hata verirse başlık + özetin ilk cümlesinden şablon metin kullanılır.
- **Telif:** haber metni kopyalanmaz; yalnızca başlık ve RSS özetinden kısa, kendi cümlelerimizle bir metin ve asıl habere bağlantı paylaşılır.

## Ücretsiz katman

Tamamen ücretsiz planlarda çalışır: Workers (günde 48 zamanlanmış çalışma), D1 (`gundem-db`), Workers AI (günde 10.000 nöron; bot çalışma başına en fazla 8 metin yazar, günde yaklaşık 5.000 nöron). Kota için ayarlar `wrangler.jsonc` içindeki `vars` ile değiştirilebilir: `AI_LIMIT`, `PAYLASIM_LIMIT`, `YENI_HABER_SAAT`, `SAKLA_GUN`.

## Otomatik paylaşım

Paylaşım altyapısı hazırdır ama **şu an kapalıdır**, çünkü hiçbir platform bağlı değil. Bir platformun gizli ayarları girildiği anda bot her çalışmada en çok konuşulan son 6 saatlik haberlerden platform başına 2 tanesini onay beklemeden paylaşır, her haberi her platformda bir kez.

- **Telegram:** BotFather'dan bot oluşturun, botu kanalınıza yönetici yapın; Cloudflare → *Workers & Pages → gundem-botu → Settings → Variables and Secrets* altına `TELEGRAM_BOT_TOKEN` ve `TELEGRAM_CHAT_ID` (ör. `@kanaladi`) gizli ayarlarını ekleyin.
- Yeni platform (X, Instagram…) eklemek için `src/paylas.js` içindeki listeye bir bağdaştırıcı yazmak yeterli.
- Acil durdurma: `OTOMATIK_PAYLASIM` değişkenini `0` yapın.

## Elle çalıştırma

`ADMIN_PASSWORD` gizli ayarını ekledikten sonra:

```bash
curl -X POST -H "x-admin-sifre: <şifre>" https://gundem-botu.<hesabınız>.workers.dev/api/calistir
```

## Yayın

`npx wrangler deploy -c haber-botu/wrangler.jsonc`. GitHub'dan otomatik yayın için Cloudflare panelinde yeni bir Worker'ı bu depoya bağlayıp *Root directory* olarak `haber-botu` seçin (Worker adı `gundem-botu`). Kaynak eklemek için `src/kaynaklar.js`.
