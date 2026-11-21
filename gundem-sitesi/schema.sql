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
