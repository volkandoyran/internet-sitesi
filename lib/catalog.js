// Otomatik katalog yardımcıları: ürün adından tür/kategori, özellikler ve
// mağazalar arası eşleştirme anahtarı çıkarır. Türkçe, Yunanca, Bulgarca ve
// İngilizce ürün adlarını (ve URL'lerdeki Latin harfli hallerini) tanır.

// Karşılaştırma için: küçük harf, aksanlar atılır (Yunanca büyük harfler aksansız yazılıyor: ΟΘΟΝΗ = οθόνη)
const strip = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ς/g, 'σ');
const fold = (s) => strip(s).replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ').trim();
const re = (parts) => new RegExp(strip(Array.isArray(parts) ? parts.join('|') : parts), 'i');

// Bilgisayar ürünü olmayan ya da aksesuar olanlar (önce bunlar elenir)
const EXCLUDE = re([
  'kılıf', 'kilif', 'çanta', 'canta', 'adaptör', 'adapter', 'kablo', 'cable', 'şarj', 'sarj', 'charger', 'toner', 'kartuş', 'kartus', 'cartridge', 'ctrg',
  'mouse', '\\bfare\\b', 'klavye', 'keyboard', 'kulaklık', 'kulaklik', 'headset', 'hoparlör', 'hoparlor', 'speaker', 'soğutucu', 'sogutucu', '\\bcooler\\b(?! ?master)',
  '\\bfan\\b', 'fanı', 'fani\\b', 'termal (macun|ped)', 'thermal (paste|pad|compound)', 'sleeve', '\\bskin\\b', 'yazıcı', 'yazici', 'printer', 'scanner', 'scanjet',
  '\\bbag\\b', 'backpack', 'case for', 'pc case (?!.*tower)', 'carry case', 'dock', '\\bhub\\b', '\\bkvm\\b', '\\bmount\\b', 'temizle', 'cleaning', '\\bstand\\b', '\\bswitch\\b', 'socket', 'humidity', 'temperature', 'monitoring', 'protector', 'koruyucu', 'webcam', '^kamera', '^camera', 'wacom', '(grafik|çizim|cizim|graphics?|drawing|pen) tablet', 'tutucu', 'holder', 'selfie', 'селфи', 'dect', 'telsiz', 'cordless', 'стационарен', 'ασύρματο τηλέφωνο',
  'smart ?watch', 'akıllı saat', 'akilli saat', '\\bwatch\\b', 'часовник', 'ρολόι', 'power ?bank', 'ekran koruyucu', 'screen protector', 'aksesuar', 'аксесоар', 'αξεσουάρ', 'stylus', '\\bpen\\b', 'писалка',
  'bruder', 'oyuncak', 'играчка', 'παιχνίδι', '\\btoys?\\b', 'моя първи', 'water ?blocks?', 'su bloğu', 'su blogu', '^водно охлаждане', 'υδρόψυξη',
  'чанта', 'раница', 'калъф', 'протектор', 'кабел', 'зарядно', 'мишка', 'клавиатура', 'слушалки', '^охладител', '^вентилатор', 'стойка', 'почист', 'принтер', 'тонер', '^камера',
  'θήκη', 'τσάντα', 'καλώδιο', 'φορτιστ', 'ποντίκι', 'πληκτρολόγιο', 'ακουστικά', 'ψύκτ', '^ανεμιστήρ', 'βάση', 'αριθμομηχαν', 'εκτυπωτ', 'αισθητηρ', '^κάμερα',
  'бюро', 'архивна', 'поставка', 'филтър', 'конвертор', 'суич', 'надграждане', 'сървър', 'кутия[^,]*,? за (m\\.2|2\\.5|3\\.5|ssd|hdd)', 'кутия (m\\.2|\\d\\.5)',
  'housing', 'enclosure', 'mounting', 'converter', 'card reader', 'reader', 'light bar', 'messenger', 'laptopwear', 'hardcase', 'hard case', 'smart fold', '\\bcover\\b', 'folio', 'shelf', 'barebone', 'server', 'power supp(ly)? unit', 'car notebook',
  'chanta', 'ranica', 'byuro', 'arhivna', 'kalaf', 'kabel', 'zaryadno', 'mishka', 'klaviatura', 'slushalki', '^ohladitel', '^ventilator', 'stoyka', 'pochist',
  'thiki', 'tsanta', 'kalodio', 'pontiki', 'pliktrologio', 'akoustika', 'basi', 'arithmomixan', 'refurbished', 'yenilenmiş', 'outlet',
]);

// Sıra önemli: laptop ve masaüstü, içindeki işlemci adına takılmadan önce denenir; tablet telefondan önce (Galaxy Tab)
const RULES = [
  ['laptop', null, re('laptop|notebook|macbook|dizüstü|dizustu|ultrabook|chromebook|лаптоп|φορητός υπολογιστής|φορητοσ υπολογιστησ|foritos ypologistis')],
  ['tablet', null, re('\\btablet\\b|таблет|tablet|ipad|galaxy tab|\\btab [asm]\\d|matepad|redmi pad|xiaomi pad|poco pad|lenovo tab|\\bidea ?tab|honor pad|oneplus pad|tableti?\\b|tablety?')],
  ['phone', null, re('akıllı telefon|akilli telefon|cep telefonu|smartphone|смартфон|smartfon|мобилен телефон|mobilen telefon|κινητό|kinito|\\biphone\\b|galaxy [sazm]\\d|galaxy z (fold|flip)|redmi note|\\bredmi \\d|\\bpoco [xfmc]\\d|pixel \\d|nothing phone|motorola (moto|edge|razr)|\\bmoto [geg]\\d|realme|oppo (a|reno|find)|honor (magic|x\\d|\\d{3})|telefoni?\\b|^телефон')],
  ['desktop', null, re('masaüstü bilgisayar|masaustu bilgisayar|desktop (pc|computer|bilgisayar)|oem paket|hazır sistem|hazir sistem|gaming pc|oyun bilgisayarı|oyun bilgisayari|all in one|mini pc|настолен компютър|(?<!за )компютър(?![а-я])|nastolen|kompyut|kompiut|επιτραπέζιος υπολογιστής|υπολογιστής|ypologistis|\\bpc\\b.*(ryzen|core|rtx|ssd)')],
  ['part', 'anakart', re('anakart|motherboard|mainboard|дънна платка|danna platka|dunna|μητρική|mitriki')],
  ['part', 'gpu', re('ekran kartı|ekran karti|graphics card|video ?card|видео ?карта|videokart|κάρτα γραφικών|karta grafikon|^vga\\b|видеокарта|geforce|radeon rx|\\brtx ?\\d{4}\\b|\\bgtx ?\\d{3,4}\\b|\\brx ?\\d{4}\\b|\\barc [ab]\\d{3}\\b')],
  ['part', 'cpu', re('işlemci|islemci|processor|процесор|procesor|επεξεργαστ|epeksergast|\\bcpu\\b|ryzen ?[3579] ?\\d{4}|core ?i[3579][ ]\\d{4,5}|core ?ultra|\\b(i[3579] \\d{4,5}[a-z]*)\\b')],
  ['part', 'kasa', re('bilgisayar kasası|bilgisayar kasasi|\\bkasa\\b|\\bkasası\\b|pc case|midi tower|mid tower|full tower|high tower|кутия за компютър|компютърна кутия|кутия .*(atx|tower)|kutiya|^case .*tower|^case\\b')],
  ['part', 'ssd', re('\\bssd\\b|nvme|m\\.2 2280')],
  ['part', 'hdd', re('\\bhdd\\b|hard dis[kc]|sabit disk|твърд диск|tvard disk|σκληρός|skliros')],
  // Güç kaynağı: adaptörleri ayırmak için güç (W) ya da ATX/80 Plus gerekli
  ['part', 'psu', re('(güç kaynağı|guc kaynagi|power supply|\\bpsu\\b|захранване|zahranvane|τροφοδοτικό|trofodotiko).*(\\b([3-9]\\d\\d|1\\d\\d\\d) ?w|80 ?\\+|80 ?plus|\\batx\\b|modular|bronze|gold|platinum|titanium)|(\\b([3-9]\\d\\d|1\\d\\d\\d) ?w|80 ?\\+|80 ?plus|\\batx\\b|modular|bronze|gold|platinum|titanium).*(güç kaynağı|guc kaynagi|power supply|\\bpsu\\b|захранване|τροφοδοτικό)')],
  ['part', 'ram', re('\\bram\\b|ddr[345]|\\bdimm\\b|so ?dimm|bellek|памет|pamet|μνήμη|mnimi')],
  // Monitör: ekran boyutu ya da yenileme hızı da olmalı (ör. "humidity monitor" elensin)
  ['monitor', null, re('(monitör|monitor|монитор|οθόνη|othoni).*(\\d{2}(\\.\\d)?("|”|″| ?inç| ?inch|\\b)|\\d{2,3} ?hz|full hd|fhd|qhd|4k|uhd|ips|\\bva\\b|led)|(\\d{2}(\\.\\d)?("|”|″)|\\d{2,3} ?hz).*(monitör|monitor|монитор|οθόνη)')],
];

// Ad aksesuar ya da bilgisayar dışı ürün gibi görünüyor mu
export const isExcluded = (name) => EXCLUDE.test(fold(name));

// Ürün adından { type, category } ya da bilgisayar ürünü değilse null
export function classify(name) {
  const s = fold(name);
  if (!s || EXCLUDE.test(s)) return null;
  for (const [type, category, rx] of RULES) {
    if (rx.test(s)) return type === 'monitor' ? { type: 'part', category: 'monitor' } : { type, category };
  }
  return null;
}

const RAM_SIZES = new Set([4, 8, 12, 16, 18, 24, 32, 36, 48, 64, 96, 128]);

// Ürün adından özellikler (yaklaşık; bulunamayanlar boş kalır)
export function specsFromName(name, kind = {}) {
  const s = String(name || '').replace(/ /g, ' ');
  const out = {};
  const cpu = s.match(/(intel\s+)?core\s+(ultra\s+)?[3579]\s*-?\s*\d{3,5}[a-z]{0,3}|core\s+i[3579]\s*-?\s*\d{4,5}[a-z]{0,3}|\bi[3579]-\d{4,5}[a-z]{0,3}|ryzen\s+(ai\s+)?(max\+?\s+)?\d\s+(pro\s+)?\d{3,4}[a-z0-9]{0,4}|apple\s+m\d(\s+(pro|max))?|\bm[1-5](\s+(pro|max))?\b|snapdragon\s+x\s*(elite|plus)?/i);
  if (cpu && kind.category !== 'gpu') out.cpu = cpu[0].replace(/\s+/g, ' ').trim();
  const gpu = s.match(/(geforce\s+)?rtx\s?\d{4}(\s?ti)?(\s?super)?|gtx\s?\d{3,4}(\s?ti)?|radeon\s+rx\s?\d{4}(\s?xt)?|\barc\s+[ab]\d{3}/i);
  if (gpu && kind.category !== 'cpu') out.gpu = gpu[0].replace(/\s+/g, ' ').trim();
  const sto = s.match(/(\d+(?:[.,]\d+)?)\s?(tb|gb)\s*(?:pcie\s*)?(?:ssd|nvme|m\.2|hdd|emmc|ufs)/i)
    || s.match(/(?:ssd|nvme)\s*(\d+(?:[.,]\d+)?)\s?(tb|gb)/i)
    || (['ssd', 'hdd'].includes(kind.category) && s.match(/(\d+(?:[.,]\d+)?)\s?(tb|gb)/i));
  if (sto) out.storage_gb = Math.round(parseFloat(sto[1].replace(',', '.')) * (/tb/i.test(sto[2]) ? 1000 : 1));
  if (kind.type === 'phone' || kind.type === 'tablet') {
    // "8/256GB", "8GB/256GB", "12+512", "256GB 8GB RAM", "RAM 8 GB"
    const pair = s.match(/\b(\d{1,2})\s?(?:gb)?\s?[/+]\s?(\d{2,4})\s?(gb|tb)?\b/i);
    if (pair && +pair[1] <= 24 && +pair[2] >= 16) { out.ram_gb = +pair[1]; out.storage_gb = +pair[2] * (/tb/i.test(pair[3] || '') ? 1000 : 1); }
    if (!out.ram_gb) { const r = s.match(/(\d{1,2})\s?gb\s?ram|ram:?\s?(\d{1,2})\s?gb/i); if (r) out.ram_gb = +(r[1] || r[2]); }
    if (!out.storage_gb) {
      const sizes = [...s.matchAll(/(\d{1,4})\s?(gb|tb)\b/gi)].map((m) => +m[1] * (/tb/i.test(m[2]) ? 1000 : 1)).filter((n) => n >= 16 && n !== out.ram_gb);
      if (sizes.length) out.storage_gb = Math.max(...sizes);
    }
    const scr = s.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s?(?:"|''|”|″|inç|inch|ιντσ|инча)/i);
    if (scr) { const v = parseFloat(scr[1].replace(',', '.')); if (v >= 4 && v <= 16) out.screen_in = v; }
    delete out.cpu; delete out.gpu;
    return out;
  }
  if (kind.type !== 'part' || kind.category === 'ram') {
    for (const m of s.matchAll(/(\d{1,3})\s?gb(?!\s*(?:pcie\s*)?(?:ssd|nvme|hdd|emmc|ufs|gddr|vram))/gi)) {
      if (RAM_SIZES.has(+m[1])) { out.ram_gb = +m[1]; break; }
    }
  }
  const scr = s.match(/(\d{2}(?:[.,]\d{1,2})?)\s?(?:"|''|”|″|inç|inch|ιντσ|инча|\s?in\b)/i);
  if (scr) {
    const v = parseFloat(scr[1].replace(',', '.'));
    if (v >= 10 && v <= 57) out.screen_in = v;
  }
  return out;
}

// Mağazalar arası eşleştirme anahtarı: üretici parça kodu (MPN) ya da addaki model kodu.
// Bölgeye göre değişen ekler atılır (AMD WOF/BOX/MPK, Apple ülke kodu).
export function matchKey({ mpn, name, brand } = {}) {
  const apple = /apple|macbook/i.test(`${brand} ${name}`);
  const norm = (code) => {
    let k = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (apple) { const a = k.match(/^(M[A-Z0-9]{4})[A-Z]{2}A$/); if (a) return 'APPLE' + a[1]; }
    k = k.replace(/(WOF|BOX|MPK|TRAY|BULK|OEM)$/, '');
    return k.length >= 6 && /\d/.test(k) && /[A-Z]/.test(k) || /^\d{9,}$/.test(k) ? k : null;
  };
  if (mpn) { const k = norm(mpn); if (k) return k; }
  const up = String(name || '').toUpperCase();
  const ap = up.match(/\bM[A-Z0-9]{4}[A-Z]{2}\/A\b/);
  if (ap) { const k = norm(ap[0]); if (k) return k; }
  // Tire içeren model kodları: MZ-V9P1T0BW, 100-100000910WOF, CMK32GX5M2B6000C36 değil (tire yok)
  for (const m of up.matchAll(/\b[A-Z0-9]{2,}(?:-[A-Z0-9]{2,})+\b/g)) {
    const t = m[0];
    if (/^(DDR\d|PCIE|USB|GEN\d|WI-?FI|TYPE|RTX|GTX|RX|M\.2|HDMI)/.test(t)) continue;
    if (t.replace(/-/g, '').length < 8) continue;
    const k = norm(t);
    if (k) return k;
  }
  return null;
}
