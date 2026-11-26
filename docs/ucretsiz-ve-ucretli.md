# Ücretsiz plan ve ileride ücretliye geçiş

Üçfiyat bugün **0 TL** ile çalışır. Hiçbir hizmete kart bağlamak gerekmez. Bu sayfa, hangi ücretsiz sınırın içinde kalındığını, sınıra yaklaşınca nasıl anlaşılacağını ve site para kazanmaya başlayınca hangi sırayla ücretli plana geçileceğini anlatır.

Fiyatlar Kasım 2026'da hizmetlerin kendi sayfalarından alınmıştır; geçmeden önce bağlantıdan kontrol edin.

## Şu an kullanılan ücretsiz hizmetler

| Hizmet | Ne için | Ücretsiz sınır | Sınır aşılırsa |
| --- | --- | --- | --- |
| Cloudflare Workers (Free) | Site ve API | Günde 100.000 istek, istek başına 10 ms işlemci süresi. CSS/JS/görsel dosyaları sayılmaz. | O gün yeni istekler hata verir, ertesi gün 03:00'te (TR saati) sıfırlanır. |
| Cloudflare D1 (Free) | Veritabanı | Günde 5 milyon satır okuma, 100.000 satır yazma, toplam 5 GB, veritabanı başına 500 MB | Sorgular o gün hata verir, site ürün gösteremez. |
| Workers Builds | GitHub'dan otomatik yayın | Ücretsiz planda aylık derleme dakikası yeterli | Yayın beklemeye girer, site eski sürümle çalışmaya devam eder. |
| GitHub Actions | Testler ve saatlik veri toplama (zamanı gelen mağazalar) | Depo herkese açık olduğu için sınırsız ve ücretsiz | Depo gizli yapılırsa ayda 2.000 dakika sınırı gelir; fiyat çekme bunu aşabilir. **Depoyu herkese açık bırakın.** |
| Google AdSense | Reklam geliri | Ücretsiz, gelir getirir | — |

Kart bağlanmadığı sürece hiçbir hizmet para çekemez; en kötü durumda site o gün yavaşlar ya da hata verir.

## Sınıra yaklaşıldığını nasıl anlarım?

- **Cloudflare paneli → Workers & Pages → ucfiyat → Metrics:** günlük istek sayısı. Düzenli olarak 70.000'in üstündeyse geçiş zamanı yaklaşıyor.
- **Cloudflare paneli → Storage & Databases → D1 → ucfiyat-db → Metrics:** günlük okunan satır. Sitede her arama ürün ve fiyat tablolarının tamamını okur; katalog büyüdükçe bu sayı hızla artar. Günde 3 milyonu geçiyorsa geçiş zamanı yaklaşıyor.
- **Admin → Veri toplama:** mağaza başına son başarılı / son hata zamanı, engellenen (duraklatılan) mağazalar.

## Para kazanınca geçiş sırası

Her adım yalnızca gerektiğinde yapılır. Kod değişikliği gerekmez; hepsi panelden açılır.

1. **Cloudflare Workers Paid — ayda 5 $ (en az).** İlk ve en önemli adım. Workers, D1, KV ve günlük kayıtları birlikte büyütür:
   - Workers: ayda 10 milyon istek dahil, istek başına 30 saniyeye kadar işlemci süresi
   - D1: ayda 25 milyar satır okuma, 50 milyon satır yazma, 5 GB depolama dahil
   - Geçiş: Cloudflare paneli → *Workers & Pages → Plans → Workers Paid*. Aynı ekranda **harcama sınırı (spending limit)** koyun; böylece dahil kullanımın üstünde sürpriz fatura çıkmaz.
   - Fiyat sayfası: https://developers.cloudflare.com/workers/platform/pricing/
2. **Kendi alan adı — yılda yaklaşık 10–15 $.** `ucfiyat.<hesap>.workers.dev` yerine akılda kalan bir adres. Cloudflare Registrar maliyet fiyatına satar. Bağladıktan sonra `src/pages.js` içindeki `SITE` sabitini, `public/index.html` içindeki `og:url` adresini ve GitHub'daki `SITE_URL` değişkenini güncelleyin.
3. **Bot korumalı mağazalar.** Ücretli scraping servisi kullanılmaz (26 Kasım 2026'da Firecrawl kaldırıldı). Bu mağazalar için doğru yol mağazanın ortaklık (affiliate) programı ya da ürün veri akışıdır (feed); bulunursa panelden adaptör ayarı olarak eklenir.
4. **GitHub ücretli plan gerekmez.** Depo herkese açık kaldıkça Actions ücretsizdir.

## Geçmeden önce yapılabilecek ücretsiz iyileştirmeler

Trafik artıp sınıra yaklaşıldığında, para harcamadan önce şunlar denenebilir:

- Arama ve ürün sayfası yanıtlarını Cloudflare önbelleğinde birkaç dakika tutmak: aynı aramalar D1'e tekrar gitmez.
- Aramada tüm tabloyu okumak yerine yalnızca ilgili türdeki ürünleri okumak.
- Fiyat çekme sıklığını günde 4'ten 2'ye indirmek (`.github/workflows/scrape.yml` içindeki `cron` satırı): D1 yazmaları yarıya iner.
