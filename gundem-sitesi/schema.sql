-- Gündem botu D1 şeması. Worker ilk çalışmada kendisi kurar; tekrar çalıştırmak güvenlidir.

CREATE TABLE IF NOT EXISTS haberler (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  baslik        TEXT NOT NULL,
  ozet          TEXT,
  imza          TEXT NOT NULL,            -- tekrar ayıklama için başlık kelime kümesi
  kaynaklar     TEXT NOT NULL,            -- JSON: [{ id, ad, url, baslik }] ilk haberi veren önce
  kaynak_sayisi INTEGER NOT NULL DEFAULT 1,
  yayin         TEXT,                     -- ilk kaynağın yayın zamanı
  ilk_gorulme   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  metin         TEXT,                     -- sosyal medya metninin gövdesi (kaynak satırı ayrıca eklenir)
  metin_turu    TEXT                      -- 'ai' ya da 'sablon'
);
CREATE INDEX IF NOT EXISTS haberler_zaman ON haberler(ilk_gorulme);

-- Daha önce işlenen haber bağlantıları (aynı haber ikinci kez sayılmasın)
CREATE TABLE IF NOT EXISTS gorulen (
  url   TEXT PRIMARY KEY,
  zaman TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS kaynak_durum (
  id           TEXT PRIMARY KEY,
  son_cekim    TEXT,
  son_basari   TEXT,
  haber_sayisi INTEGER,
  hata         TEXT
);

-- Platform başına paylaşım kaydı (aynı haber aynı platformda iki kez paylaşılmaz)
CREATE TABLE IF NOT EXISTS paylasimlar (
  haber_id INTEGER NOT NULL,
  platform TEXT NOT NULL,
  durum    TEXT NOT NULL,                 -- 'paylasildi' ya da 'hata'
  hata     TEXT,
  zaman    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (haber_id, platform)
);

-- Kısa video kaydı (src/video.js). Her haberden en fazla bir video ya da görsel; dosya KV'de (VIDEO) 48 saat durur.
CREATE TABLE IF NOT EXISTS videolar (
  haber_id INTEGER PRIMARY KEY,
  durum    TEXT NOT NULL,                 -- 'uretiliyor', 'yuklendi' ya da 'hata'
  dosya    INTEGER NOT NULL DEFAULT 0,    -- 1: dosya yüklendi
  hata     TEXT,
  zaman    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  tur      TEXT NOT NULL DEFAULT 'video'  -- 'video' (Reels/Shorts) ya da 'foto' (Instagram görsel gönderisi)
);
-- Eski kurulumlar için bir kez: ALTER TABLE videolar ADD COLUMN tur TEXT NOT NULL DEFAULT 'video';

-- Haber görselleri: 'wiki' (Wikimedia Commons serbest lisanslı fotoğraf, url = küçük resim adresi),
-- 'ai' (yapay zekâ ile üretilmiş temsili görsel, GORSEL KV'de g/<id>.jpg), 'yok' (bulunamadı, SVG kapak kullanılır)
CREATE TABLE IF NOT EXISTS gorseller (
  haber_id INTEGER PRIMARY KEY,
  tur      TEXT NOT NULL,
  url      TEXT,
  atif     TEXT,
  zaman    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Haber içeriği: kaynak haberden yapay zekâyla yeniden yazılmış 3-5 paragraflık metin
-- tur: 'ai' (metin yazıldı) | 'yok' (kaynak okunamadı, bilgi yetersiz; uydurma metin yazılmaz)
CREATE TABLE IF NOT EXISTS icerikler (
  haber_id       INTEGER PRIMARY KEY,
  tur            TEXT NOT NULL,
  metin          TEXT,
  kaynak_uzunluk INTEGER,
  zaman          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
