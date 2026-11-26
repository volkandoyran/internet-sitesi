-- D1 şeması. Tekrar çalıştırmak güvenlidir (IF NOT EXISTS / INSERT OR IGNORE).

CREATE TABLE IF NOT EXISTS retailers (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  country   TEXT NOT NULL CHECK (country IN ('TR','GR','BG')),
  site      TEXT NOT NULL,
  currency  TEXT NOT NULL,
  active    INTEGER NOT NULL DEFAULT 1,
  scrape    INTEGER NOT NULL DEFAULT 1,
  -- Veri toplama motoru (scraper/): sıklık, adaptör ayarı ve son durum
  interval_hours INTEGER NOT NULL DEFAULT 6,  -- kaç saatte bir taransın
  config        TEXT,             -- JSON: site haritaları, bağlantı deseni, CSS seçicileri, render (Playwright)
  run_requested INTEGER NOT NULL DEFAULT 0,  -- 1: panelden "Şimdi çalıştır" istendi
  last_run_at   TEXT,
  last_ok_at    TEXT,
  last_error_at TEXT,
  last_error    TEXT,
  paused_until  TEXT,             -- 403/429/CAPTCHA sonrası bekleme (engel aşılmaya çalışılmaz)
  fail_count    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  brand       TEXT,
  type        TEXT NOT NULL CHECK (type IN ('laptop','desktop','part','phone','tablet')),
  category    TEXT,            -- parçalar için: cpu, gpu, ram, ssd, anakart, psu, monitor ...
  cpu         TEXT,
  cpu_score   INTEGER,         -- 0-100, boşsa isimden tahmin edilir
  gpu         TEXT,
  gpu_score   INTEGER,         -- 0-100
  ram_gb      INTEGER,
  storage_gb  INTEGER,
  screen_in   REAL,
  image       TEXT,
  match_key   TEXT,            -- mağazalar arası eşleştirme: üretici parça kodu ya da model kodu
  mkeys       TEXT,            -- tüm eşleştirme anahtarları, boşlukla ayrılmış (" K1 K2 "); tarayıcı hesaplar
  specs       TEXT,            -- mağaza sayfasından okunan teknik özellikler (JSON); tarayıcı doldurur
  description TEXT,            -- mağaza sayfasındaki kısa açıklama (yoksa NULL)
  gtin        TEXT,            -- barkod (EAN/UPC, sağlama basamağı doğrulanmış); en güçlü eşleştirme anahtarı
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
  updated_at  TEXT,            -- son başarılı fiyat okuma
  old_price   REAL,            -- mağazanın gösterdiği indirim öncesi fiyat (yoksa NULL)
  store_category TEXT,         -- mağazanın kendi kategori yolu (breadcrumb)
  checked_at  TEXT,            -- son kontrol (fiyat değişmese de)
  gtin        TEXT,            -- mağaza sayfasındaki barkod
  sku         TEXT,            -- mağazanın kendi ürün kodu
  source      TEXT,            -- fiyatın okunduğu yer: jsonld | meta | html | selector (+render)
  confidence  INTEGER,         -- fiyat güvenilirliği 0-100
  verified    INTEGER NOT NULL DEFAULT 1,  -- 0: şüpheli fiyat, doğrulanana kadar sitede gösterilmez
  pending_price REAL,          -- şüpheli değişim: bir sonraki taramada aynı çıkarsa kabul edilir
  pending_at  TEXT,
  stable_count INTEGER NOT NULL DEFAULT 0, -- art arda değişmeden geçen kontrol sayısı
  next_check_at TEXT           -- değişim hızına göre bir sonraki kontrol zamanı
);
CREATE INDEX IF NOT EXISTS offers_product ON offers(product_id);
CREATE INDEX IF NOT EXISTS offers_url ON offers(retailer_id, url);
CREATE INDEX IF NOT EXISTS products_match ON products(match_key);
CREATE INDEX IF NOT EXISTS products_type ON products(type, category);
CREATE INDEX IF NOT EXISTS products_gtin ON products(gtin);

CREATE TABLE IF NOT EXISTS price_history (
  offer_id  INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  price_eur REAL NOT NULL,
  at        TEXT NOT NULL DEFAULT (datetime('now')),
  price     REAL,              -- mağazanın kendi para birimindeki fiyat
  currency  TEXT
);
CREATE INDEX IF NOT EXISTS history_offer ON price_history(offer_id);

-- Her mağaza taramasının özeti (admin "Veri toplama" sekmesi)
CREATE TABLE IF NOT EXISTS scrape_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  retailer_id TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  ok          INTEGER NOT NULL DEFAULT 0,
  blocked     INTEGER NOT NULL DEFAULT 0,
  pages       INTEGER NOT NULL DEFAULT 0,
  added       INTEGER NOT NULL DEFAULT 0,
  changed     INTEGER NOT NULL DEFAULT 0,
  unchanged   INTEGER NOT NULL DEFAULT 0,
  errors      INTEGER NOT NULL DEFAULT 0,
  message     TEXT,
  requests    INTEGER NOT NULL DEFAULT 0,  -- mağazaya giden istek sayısı (maliyet ölçümü)
  duration_s  INTEGER NOT NULL DEFAULT 0,
  suspicious  INTEGER NOT NULL DEFAULT 0   -- doğrulamaya alınan şüpheli fiyat sayısı
);
CREATE INDEX IF NOT EXISTS runs_retailer ON scrape_runs(retailer_id, started_at);

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
