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
  'mouse', '\\bfare\\b', '(?<!turkce |tr |q |f )klavye', '(?<!us |uk |backlit |backlight )keyboard', 'kulaklık', 'kulaklik', 'headset', 'hoparlör', 'hoparlor', 'speaker', 'soğutucu', 'sogutucu', '\\bcooler\\b(?! ?master)',
  '\\bfan\\b', 'fanı', 'fani\\b', 'termal (macun|ped)', 'thermal (paste|pad|compound)', 'sleeve', '\\bskin\\b', 'yazıcı', 'yazici', 'printer', 'scanner', 'scanjet',
  '\\bbag\\b', 'backpack', 'case for', 'pc case (?!.*tower)', 'carry case', 'dock', '\\bhub\\b', '\\bkvm\\b', '\\bmount\\b', 'temizle', 'cleaning', '\\bstand\\b', '\\bswitch\\b', 'socket', 'humidity', 'temperature', 'monitoring', 'protector', 'koruyucu', 'webcam', '^kamera', '^camera', 'wacom', '(grafik|çizim|cizim|graphics?|drawing|pen) tablet', 'tutucu', 'holder', 'selfie', 'селфи', 'dect', 'telsiz', 'cordless', 'стационарен', 'ασύρματο τηλέφωνο',
  'smart ?watch', 'akıllı saat', 'akilli saat', '\\bwatch\\b', 'часовник', 'ρολόι', 'power ?bank', 'ekran koruyucu', 'screen protector', 'aksesuar', 'аксесоар', 'αξεσουάρ', 'stylus', '\\bpen\\b', 'писалка',
  'bruder', 'oyuncak', 'играчка', 'παιχνίδι', '\\btoys?\\b', 'моя първи', 'water ?blocks?', 'su bloğu', 'su blogu', '^водно охлаждане', 'υδρόψυξη',
  'чанта', 'раница', 'калъф', 'протектор', 'кабел', 'зарядно', 'мишка', 'клавиатура', 'слушалки', '^охладител', '^вентилатор', 'стойка', 'почист', 'принтер', 'тонер', '^камера',
  'θήκη', 'τσάντα', 'καλώδιο', 'φορτιστ', 'ποντίκι', 'πληκτρολόγιο', 'ακουστικά', 'ψύκτ', '^ανεμιστήρ', 'βάση', 'αριθμομηχαν', 'εκτυπωτ', 'αισθητηρ', '^κάμερα',
  'бюро', 'архивна', 'поставка', 'филтър', 'конвертор', 'суич', 'надграждане', 'сървър', 'кутия (m\\.2|\\d\\.5)',
  'housing', 'enclosure', 'mounting', 'converter', 'card reader', 'reader', 'light bar', 'messenger', 'laptopwear', 'hardcase', 'hard case', 'smart fold', '\\bcover\\b', 'folio', 'shelf', 'barebone', 'server', 'power supp(ly)? unit', 'car notebook',
  'chanta', 'ranica', 'byuro', 'arhivna', 'kalaf', 'kabel', 'zaryadno', 'mishka', 'klaviatura', 'slushalki', '^ohladitel', '^ventilator', 'stoyka', 'pochist',
  'thiki', 'tsanta', 'kalodio', 'pontiki', 'pliktrologio', 'akoustika', 'basi', 'arithmomixan', 'refurbished', 'yenilenmiş', 'outlet',
  // Araç multimedya ekranları ve hoparlörleri ("MULTIMEDIA TABLET FOR VW POLO", "ΗΧΕΙΑ ΑΥΤΟΚΙΝΗΤΟΥ"), stüdyo hoparlörleri ("ΗΧΕΙΑ MONITOR")
  'multimedia tablet', '\\bmod\\. \\d{4}', 'carplay', 'android auto', 'mirroring', 'αυτοκιν', 'autokinit', 'ηχει', 'ixeia', 'ηχοσυστ',
  // Bilgisayar olmayan cihazlar ve sıvı soğutma parçaları
  '\\bnas\\b', 'android ?box', 'tv ?box', 'blu ?ray', 'recorder', 'backplate', 'xspc', 'raystorm', 'aqua computer', 'creality', 'ender 3', '3d (printer|yazıcı)',
  'express card', '\\bgrip\\b', '\\blens\\b',
  // USB bellek, hafıza kartı, monitör kolu, disk kutusu (RAM / monitör / disk sanılmasın)
  '\\bflash\\b', 'usb bellek', 'micro ?sd', '\\bsd ?kart', 'hafıza kartı', 'hafiza karti', 'memory card', 'карта памет', 'karta pamet', 'κάρτα μνήμης', 'karta mnimis',
  'monitor arm', 'monitör kolu', 'monitor kolu', 'kutusu\\b',
]);

// Sıra önemli: laptop ve masaüstü, içindeki işlemci adına takılmadan önce denenir; tablet telefondan önce (Galaxy Tab)
// Adında "laptop" yazmayan laptop serileri ("MSI Katana 15 ... RTX 4060" ekran kartı sanılıyordu)
const LAPTOP_SERIES = 'thinkpad|thinkbook|ideapad|yoga (slim|pro|\\d)|legion (5|7|9|pro|slim)|\\bloq \\d|vivobook|zenbook|expertbook|proart (p|px)\\d|tuf gaming [af]1[4-8]\\b|rog strix (g\\d|scar)|rog zephyrus (g|m|duo|s)?\\d|rog flow (x|z)\\d|strix (scar|g\\d)|matebook|magicbook|katana|cyborg|stealth \\d|raider|vector|\\bvictus\\b|omen (\\d|transcend|max)|pavilion (\\d|plus|aero|x360)|elitebook|probook|zbook|envy (\\d|x360)|spectre|inspiron \\d|latitude \\d|vostro \\d|\\bxps \\d|alienware (m|x)\\d|predator helios|nitro (v|\\d)|aspire (\\d|lite|go|vero)|swift (go|x|\\d)|galaxy book|surface (laptop|pro)';
const RULES = [
  ['laptop', null, re('laptop|notebook|macbook|dizüstü|dizustu|ultrabook|chromebook|лаптоп|φορητός υπολογιστής|φορητοσ υπολογιστησ|foritos ypologistis')],
  // Seri adı yalnızca monitör değilse ("HP OMEN 27qs Monitör" laptop sayılmasın)
  // Aynı seri adı monitör, anakart, güç kaynağı, ekran kartı, kasada da geçebilir ("ROG Strix B850-A anakart", "HP OMEN 27qs monitör")
  ['laptop', null, re('^(?!.*(monitor|монитор|οθονη|othoni|anakart|motherboard|mainboard|дънна|μητρικη|guc kaynagi|power supply|\\bpsu\\b|захранване|τροφοδοτικο|\\d{3,4} ?w\\b|ekran karti|graphics card|видео ?карта|καρτα γραφικων|\\bkasa|\\bcase\\b|кутия|tower)).*(' + LAPTOP_SERIES + ')')],
  ['tablet', null, re('\\btablet\\b|таблет|tablet|ipad|galaxy tab|\\btab [asm]\\d|matepad|redmi pad|xiaomi pad|poco pad|lenovo tab|\\bidea ?tab|honor pad|oneplus pad|tableti?\\b|tablety?')],
  ['phone', null, re('akıllı telefon|akilli telefon|cep telefonu|smartphone|смартфон|smartfon|мобилен телефон|mobilen telefon|(?<!αυτο)κινητό|(?<!auto)kinito|sim карти|dual sim|\\biphone\\b|galaxy [sazm]\\d|galaxy z (fold|flip)|redmi note|\\bredmi \\d|\\bpoco [xfmc]\\d|pixel \\d|nothing phone|motorola (moto|edge|razr)|\\bmoto [geg]\\d|realme|oppo (a|reno|find)|honor (magic|x\\d|\\d{3})|telefoni?\\b|^телефон')],
  ['desktop', null, re('masaüstü bilgisayar|masaustu bilgisayar|desktop (pc|computer|bilgisayar)|oem paket|hazır sistem|hazir sistem|gaming pc|oyun bilgisayarı|oyun bilgisayari|all in one|mini pc|настолен компютър|(?<!за )компютър(?![а-я])|nastolen|kompyut|kompiut|επιτραπέζιος υπολογιστής|υπολογιστής|ypologistis|\\bpc\\b.*(ryzen|core|rtx|ssd)|^desktop\\b|thinkcentre|prodesk|elitedesk|optiplex|ideacentre|expertcenter|\\bveriton\\b|mac mini|mac studio|\\bimac\\b')],
  ['part', 'anakart', re('anakart|motherboard|mainboard|дънна платка|danna platka|dunna|μητρική|mitriki')],
  ['part', 'gpu', re('ekran kartı|ekran karti|graphics card|video ?card|видео ?карта|videokart|κάρτα γραφικών|karta grafikon|^vga\\b|видеокарта|geforce|radeon rx|\\brtx ?\\d{4}\\b|\\bgtx ?\\d{3,4}\\b|\\brx ?\\d{4}\\b|\\barc [ab]\\d{3}\\b')],
  ['part', 'cpu', re('işlemci|islemci|processor|процесор|procesor|επεξεργαστ|epeksergast|\\bcpu\\b|ryzen ?[3579] ?\\d{4}|core ?i[3579][ ]\\d{4,5}|core ?ultra|\\b(i[3579] \\d{4,5}[a-z]*)\\b')],
  ['part', 'kasa', re('корпус|o11 dynamic|bilgisayar kasası|bilgisayar kasasi|\\bkasa\\b|\\bkasası\\b|pc case|midi tower|mid tower|full tower|high tower|кутия за компютър|компютърна кутия|кутия .*(atx|tower)|kutiya|^case .*tower|^case\\b')],
  ['part', 'ssd', re('\\bssd\\b|nvme|m\\.2 2280')],
  ['part', 'hdd', re('\\bhdd\\b|hard dis[kc]|sabit disk|твърд диск|tvard disk|σκληρός|skliros')],
  // Güç kaynağı: adaptörleri ayırmak için güç (W) ya da ATX/80 Plus gerekli
  ['part', 'psu', re('(güç kaynağı|guc kaynagi|power supply|\\bpsu\\b|захранване|zahranvane|τροφοδοτικό|trofodotiko).*(\\b([3-9]\\d\\d|1\\d\\d\\d) ?w|80 ?\\+|80 ?plus|\\batx\\b|modular|bronze|gold|platinum|titanium)|(\\b([3-9]\\d\\d|1\\d\\d\\d) ?w|80 ?\\+|80 ?plus|\\batx\\b|modular|bronze|gold|platinum|titanium).*(güç kaynağı|guc kaynagi|power supply|\\bpsu\\b|захранване|τροφοδοτικό)')],
  ['part', 'ram', re('\\bram\\b|ddr[345]|\\bdimm\\b|so ?dimm|bellek|памет|pamet|μνήμη|mnimi')],
  // Monitör: ekran boyutu ya da yenileme hızı da olmalı (ör. "humidity monitor" elensin)
  ['monitor', null, re('(monitör|monitor|монитор|οθόνη|othoni).*(\\d{2}(\\.\\d)?("|”|″| ?inç| ?inch|\\b)|\\d{2,3} ?hz|full hd|fhd|qhd|4k|uhd|ips|\\bva\\b|led)|(\\d{2}(\\.\\d)?("|”|″| ?inç| ?inch)|\\d{2,3} ?hz).*(monitör|monitor|монитор|οθόνη)')],
];

// Adın tamamında aranan kalıplar (virgülden sonra gelen "za M.2 SSD" gibi)
const EXCLUDE_FULL = re(['кутия[^,]*,? за (m\\.2|2\\.5|3\\.5|ssd|hdd)']);

// Ad aksesuar ya da bilgisayar dışı ürün gibi görünüyor mu.
// Uzun adlarda (JAR: "Ürün türü Marka Model, özellikler, ...") yalnızca ilk virgüle kadarki kısım denetlenir;
// "klavye ve mouse dahil", "M.2 socket" gibi özellikler ürünü elemesin.
export const isExcluded = (name) => {
  const s = fold(name);
  const head = s.split(/,\s/)[0];
  return EXCLUDE.test(head) || EXCLUDE_FULL.test(s);
};

// Ürün adından { type, category } ya da bilgisayar ürünü değilse null
// Laptop yedek parçaları: "X için batarya", "Notebook adaptörü 65W", "Klavye Lenovo IdeaPad ..." gibi.
// Aksesuar elemesinden önce denenir; parça kelimesi adın başında ya da sonunda olmalı ya da ad "için/for/за/για" içermeli.
const LAPTOP_WORD = re('laptop|notebook|dizüstü|dizustu|macbook|thinkpad|ideapad|vivobook|zenbook|pavilion|inspiron|latitude|aspire|лаптоп|φορητ');
const LAPTOP_PARTS = [
  ['ram', re('so ?dimm|(notebook|laptop) (ram|bellek)|памет за лаптоп|μνήμη (για )?laptop')],
  ['laptop-batarya', re('batarya|bataryası|\\bpil\\b|battery|батерия|μπαταρία|mpataria')],
  ['laptop-adaptor', re('adaptör|adaptor|adapter|şarj aleti|sarj aleti|charger|зарядно|захранване за лаптоп|φορτιστ|τροφοδοτικό')],
  ['laptop-ekran', re('\\bekran(ı|i)?\\b(?! kart)|lcd panel|\\bpanel\\b|\\bscreen\\b|дисплей|матрица|οθόνη')],
  ['laptop-klavye', re('klavye|keyboard|клавиатура|πληκτρολόγιο')],
  ['laptop-fan', re('\\bfan(ı|i)?\\b|cpu cooler|вентилатор|ανεμιστήρ')],
];
const LAPTOP_PART_HINT = re('için|icin|uyumlu|\\bfor\\b|compatible|replacement|за |για ');
const NOT_PART = re('çanta|canta|kılıf|kilif|\\bbag\\b|sleeve|backpack|stand|standı|\\bpad\\b|soğutucu pad|cooling pad|βάση|стойка|поставка|чанта|τσάντα|power ?bank|car |araç|arac|usb ?c hub|dock');
function laptopPart(s) {
  if (!LAPTOP_WORD.test(s) || NOT_PART.test(s)) return null;
  for (const [category, rx] of LAPTOP_PARTS) {
    const m = s.match(rx);
    if (m && (category === 'ram' || m.index < 12 || m.index + m[0].length >= s.length - 1 || LAPTOP_PART_HINT.test(s))) return { type: 'part', category };
  }
  return null;
}

// Hazır sistem: işlemci modeli + RAM boyutu + depolama boyutu birlikte geçiyorsa parça değil bilgisayardır
// ("HP Pro 400 G9 i7-13700 16GB 512GB SSD Masaüstü PC" işlemci, "... 1TB SSD 8GB RTX 4060" ekran kartı sanılıyordu)
const SYSTEM_CPU = /\bi[3579][ -]?\d{4,5}|ryzen ?[3579] ?(pro )?\d{4}|core ?ultra ?[3579]|\bapple m\d/;
const SYSTEM_PC = re('masaüstü pc|masaustu pc|\\bpc\\b|tower|desktop|компютър|υπολογιστ');
function looksLikeSystem(s) {
  if (!SYSTEM_CPU.test(s)) return false;
  const ram = /\b(4|8|12|16|24|32|48|64|96|128) ?gb\b(?! ?(gddr|vram))/.test(s);
  const disk = /\b(128|240|250|256|480|500|512|960|1000|1024|2048) ?gb\b|\b[1-8] ?tb\b/.test(s);
  return ram && disk || SYSTEM_PC.test(s) && (ram || disk);
}

export function classify(name) {
  const s = fold(name);
  if (!s) return null;
  const lp = laptopPart(s);
  if (lp) return lp;
  if (isExcluded(name)) return null;
  for (const [type, category, rx] of RULES) {
    if (!rx.test(s)) continue;
    if (type === 'part' && ['cpu', 'gpu', 'ram', 'anakart', 'ssd', 'hdd'].includes(category) && looksLikeSystem(s)) return { type: 'desktop', category: null };
    return type === 'monitor' ? { type: 'part', category: 'monitor' } : { type, category };
  }
  return null;
}

const RAM_SIZES = new Set([4, 8, 12, 16, 18, 24, 32, 36, 48, 64, 96, 128]);

// Ürün adından özellikler (yaklaşık; bulunamayanlar boş kalır)
export function specsFromName(name, kind = {}) {
  const s = String(name || '').replace(/ /g, ' ');
  const out = {};
  const cpu = s.match(/(intel\s+)?core\s+(ultra\s+)?[3579]\s*-?\s*\d{3,5}[a-z]{0,3}|core\s+i[3579]\s*-?\s*\d{4,5}[a-z]{0,3}|\bi[3579]-\d{4,5}[a-z]{0,3}|ryzen\s+(ai\s+)?(max\+?\s+)?\d\s+(pro\s+)?\d{3,4}[a-z0-9]{0,4}|apple\s+m\d(\s+(pro|max))?|\bm[1-5](\s+(pro|max))?\b|snapdragon\s+x\s*(elite|plus)?/i);
  // Parçalarda işlemci bilgisi yalnızca işlemcinin kendisinde tutulur ("M.2" yuvası Apple M2 sanılmasın)
  if (cpu && !(kind.type === 'part' && kind.category !== 'cpu')) out.cpu = cpu[0].replace(/\s+/g, ' ').trim();
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
    // "8GB 256GB" ya da "256GB 8GB": iki boyut varsa küçük olan (≤24) RAM, büyük olan depolama
    if (!out.ram_gb) {
      const all = [...s.matchAll(/(\d{1,4})\s?(gb|tb)\b/gi)].map((m) => +m[1] * (/tb/i.test(m[2]) ? 1000 : 1));
      const small = all.filter((n) => n <= 24), big = all.filter((n) => n >= 32);
      if (small.length && big.length) { out.ram_gb = Math.min(...small); out.storage_gb = Math.max(...big); }
    }
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
  // Bilgisayarlarda "SSD" yazmadan verilen depolama: "16GB 1TB", "32GB/2TB", "16GB 512GB"
  if (!out.storage_gb && ['laptop', 'desktop'].includes(kind.type)) {
    const t = s.match(/\b(\d(?:[.,]\d)?)\s?tb\b/i);
    const g = s.match(/\b(128|256|512)\s?gb\b/i);
    if (t) out.storage_gb = Math.round(parseFloat(t[1].replace(',', '.')) * 1000); else if (g) out.storage_gb = +g[1];
  }
  if (kind.type !== 'part' || kind.category === 'ram') {
    // Önce "16GB DDR5" / "16GB RAM" gibi açıkça bellek olan; yoksa ekran kartı belleği ("RTX 4070 8GB") olmayan ilk boyut
    const explicit = s.match(/\b(\d{1,3})\s?gb\s*(?:ram|lpddr|ddr|unified|bellek|памет|μνήμη)/i);
    if (explicit && RAM_SIZES.has(+explicit[1])) out.ram_gb = +explicit[1];
    else for (const m of s.matchAll(/(\d{1,3})\s?gb(?!\s*(?:pcie\s*)?(?:ssd|nvme|hdd|emmc|ufs|gddr|vram))/gi)) {
      const before = s.slice(Math.max(0, m.index - 18), m.index);
      if (/(rtx|gtx|rx|radeon|geforce|arc)\s*[a-z]?\d{3,4}\s*(ti|super|xt)?\s*$/i.test(before)) continue;
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
    if (isSpecKey(t)) continue;
    if (t.replace(/-/g, '').length < 8) continue;
    const k = norm(t);
    if (k) return k;
  }
  return null;
}

// ---------- Mağazalar ve ülkeler arası eşleştirme anahtarları ----------
// Aynı ürün farklı mağazalarda farklı adla geçer; ortak bir anahtar bulunursa teklifler tek üründe toplanır.
// Bir ürünün birden fazla anahtarı olabilir: üretici kodu, bölge eki atılmış kod, işlemci modeli,
// telefon/tablet modeli + depolama, ekran kartı markası + serisi + yonga + bellek.

// Hız ve ölçü değerleri model kodu değildir: "7000-7000MB/s" -> 70007000MBS, "1600-3500MB/s" -> 16003500MB.
// Bunlar anahtar sayılınca aynı hızdaki farklı kapasiteli SSD'ler (2 TB ve 4 TB KC3000) tek ürüne birleşiyordu.
const MEASURE = /^\d+(KB|MB|GB|TB)(PS|S)?$|^\d+(MTS?|MHZ|GHZ|RPM|NM|NITS|HZ|W|MS|MM)$/;
export const isSpecKey = (k) => MEASURE.test(String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, ''));
const SPEC_TOKEN = /^(\d+(GB|TB|MB|MHZ|GHZ|HZ|W|MM|CM|NITS|MS|BIT|K|P|INC|INCH))$|^(DDR|GDDR|LPDDR|PCIE|USB|GEN|WIFI|HDMI|RTX|GTX|RX|ARC|M2|NVME|SATA|ATX|MATX|EATX|ITX|WUXGA|FHD|QHD|UHD|OLED|IPS|W11|WIN)/;
// Bölgeye göre değişen ekler: Lenovo (21QG000U + GM/BM/TX), Samsung monitör (LS27DM500E + UXEN/UXDU)
function normCode(raw) {
  const c = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^\d{2}[A-Z0-9]{6}[A-Z]{2}$/.test(c) && /[A-Z]/.test(c.slice(2, 8))) return 'LNV' + c.slice(0, 8);
  const sm = c.match(/^(L[SCU]\d{2}[A-Z0-9]{4,8}?)(E?UX[A-Z]{2,3}|XEN)$/);
  if (sm) return sm[1];
  return c;
}

function codeKeys(name) {
  const out = [];
  const up = String(name || '').toUpperCase();
  for (const raw of up.split(/[\s,;()\[\]]+/)) {
    const t = raw.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, '');
    const c = t.replace(/[^A-Z0-9]/g, '');
    if (c.length < 7 || c.length > 22 || SPEC_TOKEN.test(c) || MEASURE.test(c)) continue;
    const digits = (c.match(/\d/g) || []).length, letters = c.length - digits;
    // Lenovo kodu 10 karakter; diğerleri en az 9 karakter, en az 3 rakam ve 2 harf
    if (/^\d{2}[A-Z0-9]{6}[A-Z]{2}$/.test(c) && letters >= 2) { out.push(normCode(c)); continue; }
    if (c.length >= 9 && digits >= 3 && letters >= 2) out.push(normCode(c));
  }
  // HP parça kodları 7 karakter: B9ZQ4ET, A37A4EA
  if (/\bHP\b|HEWLETT/.test(up)) for (const m of up.matchAll(/\b([A-Z0-9]{5}(?:EA|ET|EW|UA))\b/g)) if (/\d/.test(m[1])) out.push('HP' + m[1]);
  return out;
}

const PHONE_BRANDS = /^(APPLE|SAMSUNG|XIAOMI|REDMI|POCO|HUAWEI|HONOR|MOTOROLA|NOKIA|OPPO|REALME|VIVO|ONEPLUS|GOOGLE|NOTHING|SONY|TCL|ZTE|BLACKVIEW|DOOGEE|ULEFONE|LENOVO|ALCATEL|CUBOT|OUKITEL|INFINIX|TECNO|MEIZU|ASUS|FAIRPHONE|CAT|HMD|MYPHONE|PRITOM|XMART)$/;
const NOISE = /^(ΚΙΝΗΤΟ|KINHTO|ΚΙΝΗΤΌ|СМАРТФОН|ТАБЛЕТ|МОБИЛЕН|ТЕЛЕФОН|SMARTPHONE|TABLET|TAB?LET|AKILLI|TELEFON|TELEFONU|CEP|5G|4G|LTE|DS|DUAL|SIM|NFC|NB|ΤΑΜΠΛΕΤ|[A-Z]\d{3}[A-Z]?)$/;

function deviceKey(name, type, storage) {
  if (!storage) return null;
  let s = String(name || '').toUpperCase().split(/[(,]/)[0];
  s = s.replace(/WI-?FI/g, 'WIFI').replace(/CELLULAR/g, 'CELL').replace(/\+/g, 'PLUS');
  const toks = [];
  for (const t of s.split(/\s+/).filter(Boolean)) {
    if (/^\d+(\/\d+)?(GB|TB)$|^\d+GB\/\d+|^\d+\+\d+/.test(t)) break; // depolamadan sonrası renk ve ek bilgi
    if (PHONE_BRANDS.test(t) || NOISE.test(t)) continue;
    toks.push(t.replace(/[^A-Z0-9А-Я]/g, ''));
  }
  const model = toks.filter(Boolean).join('');
  return model.length >= 3 ? `${type === 'tablet' ? 'TAB' : 'PH'}:${model}:${storage}` : null;
}

const GPU_BRANDS = ['ASUS', 'MSI', 'GIGABYTE', 'PALIT', 'ZOTAC', 'SAPPHIRE', 'POWERCOLOR', 'XFX', 'PNY', 'INNO3D', 'GAINWARD', 'ASROCK', 'MANLI', 'BIOSTAR', 'KFA2', 'GALAX', 'ACER', 'SPARKLE'];
const GPU_SERIES = ['ROG ASTRAL', 'ASTRAL', 'ROG STRIX', 'STRIX', 'TUF', 'PRIME', 'PROART', 'DUAL', 'VENTUS 3X', 'VENTUS 2X', 'VENTUS', 'SHADOW 3X', 'SHADOW 2X', 'SHADOW', 'GAMING TRIO', 'SUPRIM', 'INSPIRE', 'GAMING X', 'EAGLE', 'WINDFORCE', 'AORUS MASTER', 'AORUS ELITE', 'AORUS', 'AERO', 'GAMING OC', 'NITRO', 'PULSE', 'PURE', 'HELLHOUND', 'RED DEVIL', 'REAPER', 'CHALLENGER', 'STEEL LEGEND', 'TAICHI', 'PHANTOM', 'SOLO', 'TWIN EDGE', 'TRINITY', 'AMP', 'INFINITY', 'JETSTREAM', 'GAMEROCK', 'STORMX', 'VERTO', 'EPIC-X', 'SWIFT', 'MERC', 'QICK', 'ICHILL', 'TWIN X2', 'X3'];
function gpuKey(name) {
  const s = ' ' + String(name || '').toUpperCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ') + ' ';
  const brand = GPU_BRANDS.find((b) => s.includes(' ' + b + ' '));
  const chip = s.match(/\b(RTX|GTX|RX|ARC)\s?([AB]?\d{3,4})\s?(TI SUPER|TI|SUPER|XTX|XT|GRE)?\b/);
  const mem = s.match(/\b(\d{1,2})\s?GB?\b/) || s.match(/\bO?(\d{1,2})G\b/);
  const series = GPU_SERIES.find((x) => s.includes(' ' + x + ' '));
  if (!brand || !chip || !series) return null;
  return `GPU:${brand}:${chip[1]}${chip[2]}${chip[3] ? chip[3].replace(' ', '') : ''}:${mem ? mem[1] : ''}:${series.replace(/\s/g, '')}`;
}

function cpuKey(name) {
  const s = String(name || '').toUpperCase();
  let m = s.match(/RYZEN\s?(\d)\s?(PRO\s)?(\d{4}[A-Z0-9]{0,4})/);
  if (m) return `CPU:R${m[1]}${m[2] ? 'PRO' : ''}${m[3]}`;
  m = s.match(/\b(I[3579])[-\s](\d{4,5}[A-Z]{0,3})\b/);
  if (m) return `CPU:${m[1]}${m[2]}`;
  m = s.match(/ULTRA\s?(\d)\s?(\d{3}[A-Z]{0,2})\b/);
  if (m) return `CPU:U${m[1]}${m[2]}`;
  return null;
}

// Ürünün tüm eşleştirme anahtarları (boş olabilir)
export function modelKeys({ name, type, category, match_key, mpn, brand, storage_gb, gtin } = {}) {
  const keys = new Set();
  // Barkod (EAN/UPC) en güçlü anahtar: aynı barkod = aynı ürün
  if (gtin && /^\d{8,14}$/.test(gtin)) keys.add('GTIN:' + gtin);
  const mk = match_key || matchKey({ mpn, name, brand });
  if (mk) keys.add(normCode(mk));
  if (!(type === 'part' && category === 'cpu')) for (const k of codeKeys(name)) keys.add(k);
  if (type === 'phone' || type === 'tablet') {
    const storage = storage_gb || specsFromName(name, { type }).storage_gb;
    const k = deviceKey(name, type, storage);
    if (k) keys.add(k);
  }
  if (type === 'part' && category === 'gpu') { const k = gpuKey(name); if (k) keys.add(k); }
  if (type === 'part' && category === 'cpu') { const k = cpuKey(name); if (k) keys.add(k); }
  return [...keys];
}

// Varyant koruması: aynı anahtarı paylaşsalar bile depolaması, RAM'i ya da fiyat düzeyi açıkça farklı olan
// ürünler birleştirilmez (ör. 256 GB ile 512 GB, 16 GB ile 32 GB RAM, ya da 3 katı fiyat farkı = farklı ürün/aksesuar).
// Bilinmeyen alan engel sayılmaz. Aynı barkod her zaman uyumludur (ama fiyat düzeyi yine kontrol edilir).
export function compatible(a, b) {
  if (!a || !b) return true;
  // Aynı barkod (GTIN) aynı üründür: fiyatı aykırıysa ürün yine bağlanır, fiyat ayrıca şüpheli işaretlenir
  if (a.gtin && b.gtin && a.gtin === b.gtin) return true;
  const diff = (x, y, tol) => x > 0 && y > 0 && Math.abs(x - y) / Math.max(x, y) > tol;
  if (diff(+a.storage_gb, +b.storage_gb, 0.1)) return false;
  if (diff(+a.ram_gb, +b.ram_gb, 0.1)) return false;
  // Fiyat düzeyi: diğerinin fiyat aralığının 3 katından fazla uzaksa farklı model/varyant sayılır
  const range = (x) => [+x.price_eur || 0, +(x.max_eur || x.price_eur) || 0];
  const [alo, ahi] = range(a), [blo, bhi] = range(b);
  if (alo > 0 && blo > 0 && (alo > bhi * 3 || blo > ahi * 3)) return false;
  return true;
}
