-- D1 şeması. Tekrar çalıştırmak güvenlidir (IF NOT EXISTS / INSERT OR IGNORE).

CREATE TABLE IF NOT EXISTS retailers (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  country   TEXT NOT NULL CHECK (country IN ('TR','GR','BG')),
  site      TEXT NOT NULL,
  currency  TEXT NOT NULL,
  active    INTEGER NOT NULL DEFAULT 1,
  scrape    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  brand       TEXT,
  type        TEXT NOT NULL CHECK (type IN ('laptop','desktop','part')),
  category    TEXT,            -- parçalar için: cpu, gpu, ram, ssd, anakart, psu, monitor ...
  cpu         TEXT,
  cpu_score   INTEGER,         -- 0-100, boşsa isimden tahmin edilir
  gpu         TEXT,
  gpu_score   INTEGER,         -- 0-100
  ram_gb      INTEGER,
  storage_gb  INTEGER,
  screen_in   REAL,
  image       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS offers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  retailer_id TEXT NOT NULL REFERENCES retailers(id),
  url         TEXT,
  price       REAL,
  currency    TEXT,
  price_eur   REAL,
  in_stock    INTEGER,
  manual      INTEGER NOT NULL DEFAULT 0,  -- 1: fiyat elle girildi, otomatik güncellenmez
  last_error  TEXT,
  updated_at  TEXT
);
CREATE INDEX IF NOT EXISTS offers_product ON offers(product_id);

CREATE TABLE IF NOT EXISTS price_history (
  offer_id  INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  price_eur REAL NOT NULL,
  at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS history_offer ON price_history(offer_id);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

INSERT OR IGNORE INTO retailers (id, name, country, site, currency) VALUES
  ('vatan',        'Vatan Bilgisayar', 'TR', 'https://www.vatanbilgisayar.com', 'TRY'),
  ('teknosa',      'Teknosa',          'TR', 'https://www.teknosa.com',         'TRY'),
  ('mediamarkt-tr','MediaMarkt TR',    'TR', 'https://www.mediamarkt.com.tr',   'TRY'),
  ('itopya',       'İtopya',           'TR', 'https://www.itopya.com',          'TRY'),
  ('incehesap',    'İncehesap',        'TR', 'https://www.incehesap.com',       'TRY'),
  ('sinerji',      'Sinerji Bilgisayar','TR', 'https://www.sinerji.gen.tr',     'TRY'),
  ('pckolik',      'PcKolik',          'TR', 'https://pckolik.com.tr',          'TRY'),
  ('plaisio',      'Plaisio',          'GR', 'https://www.plaisio.gr',          'EUR'),
  ('kotsovolos',   'Kotsovolos',       'GR', 'https://www.kotsovolos.gr',       'EUR'),
  ('public',       'Public',           'GR', 'https://www.public.gr',           'EUR'),
  ('mediamarkt-gr','MediaMarkt GR',    'GR', 'https://www.mediamarkt.gr',       'EUR'),
  ('eshop-gr',     'e-shop.gr',        'GR', 'https://www.e-shop.gr',           'EUR'),
  ('cosmodata',    'Cosmodata',        'GR', 'https://www.cosmodata.gr',        'EUR'),
  ('technopolis',  'Technopolis',      'BG', 'https://www.technopolis.bg',      'EUR'),
  ('technomarket', 'Technomarket',     'BG', 'https://www.technomarket.bg',     'EUR'),
  ('ardes',        'Ardes.bg',         'BG', 'https://ardes.bg',                'EUR'),
  ('desktop-bg',   'Desktop.bg',       'BG', 'https://desktop.bg',              'EUR'),
  ('laptop-bg',    'Laptop.bg',        'BG', 'https://www.laptop.bg',           'EUR'),
  ('jarcomputers', 'JAR Computers',    'BG', 'https://www.jarcomputers.com',    'EUR'),
  ('plasico',      'Plasico',          'BG', 'https://plasico.bg',              'EUR');

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('rate_TRY', NULL),
  ('ad_top', ''),
  ('ad_inline', ''),
  ('ad_bottom', ''),
  ('ad_head', ''),
  ('ads_txt', '');
