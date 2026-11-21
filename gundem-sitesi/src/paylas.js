// Otomatik paylaşım altyapısı. Her platform bir bağdaştırıcıdır: `aktif(env)` gerekli gizli
// ayarlar girilmişse true döner, `gonder(env, metin, haber)` paylaşır. Hiçbir platform aktif
// değilse bot yalnızca listeyi doldurur. Yeni platform (X, Instagram…) eklemek için bu listeye
// bir bağdaştırıcı yazmak yeterli; bot zamanlanmış her çalışmada sıradaki haberleri onaysız paylaşır.

export const PLATFORMLAR = [
  {
    id: 'telegram',
    ad: 'Telegram',
    aktif: (env) => Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
    async gonder(env, metin) {
      const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: metin }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) throw new Error(`Telegram: ${j.description || r.status}`);
    },
  },
];

export const aktifPlatformlar = (env) =>
  env.OTOMATIK_PAYLASIM === '0' ? [] : PLATFORMLAR.filter((p) => p.aktif(env));
