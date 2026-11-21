// Bilgisayar (laptop ve masaüstü) teknik özellikleri.
// Kaynaklar, öncelik sırasıyla: mağaza ürün sayfasındaki özellik tablosu (tarayıcı okur),
// veritabanı sütunları (işlemci, RAM, depolama...) ve ürün adı.
// Hiçbir özellik elle girilmez; bulunamayan satır sayfada gösterilmez.

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ς/g, 'σ').replace(/\s+/g, ' ').trim();

// Özellik tablosundaki etiketler (TR, EN, BG, EL). Sıra önemli: ilk eşleşen anahtar alınır.
const LABELS = [
  ['cpu', /^(процесор( модел)?|processor( model| type)?|cpu( model)?|islemci( modeli)?|επεξεργαστησ|μοντελο επεξεργαστη)$/],
  ['cpu_series', /^(процесор серия|processor (series|family)|islemci (serisi|ailesi)|σειρα επεξεργαστη)$/],
  ['cores', /^(брой ядра|cores|number of cores|cekirdek( sayisi)?|πυρηνεσ|αριθμοσ πυρηνων)$/],
  ['cpu_clock', /^(тактова честота|честота на процесора|clock speed|processor speed|islemci hizi|συχνοτητα( επεξεργαστη)?)$/],
  ['gpu', /^(видеокарта( модел)?|графична карта|graphics( card)?|gpu|video card|ekran karti( modeli)?|κάρτα γραφικων|καρτα γραφικων)$/],
  ['ram', /^(ram|оперативна памет|памет|ram памет|memory|ram( size| capacity)|ram bellek|bellek( kapasitesi)?|sistem bellegi|μνημη( ram)?)$/],
  ['ram_type', /^(тип памет|тип на паметта|memory type|ram type|bellek tipi|ram tipi|τυποσ μνημησ)$/],
  ['storage', /^(ssd|ssd капацитет|твърд диск|диск|storage|storage capacity|ssd capacity|depolama|ssd kapasitesi|disk kapasitesi|αποθηκευτικοσ χωροσ|χωρητικοτητα( δισκου)?|δισκοσ)$/],
  ['hdd', /^(hdd|hdd капацитет|hdd kapasitesi)$/],
  ['screen', /^(диагонал( на дисплея)?( \(inch\))?|размер на екрана|екран|screen( size)?|display( size)?|ekran( boyutu)?|μεγεθοσ οθονησ|οθονη)$/],
  ['resolution', /^(резолюция|разделителна способност|resolution|cozunurluk|ekran cozunurlugu|αναλυση( οθονησ)?)$/],
  ['refresh', /^(опреснение на дисплея|честота на опресняване|refresh rate|yenileme hizi|ρυθμοσ ανανεωσησ|μεγιστοσ ρυθμοσ ανανεωσησ)$/],
  ['panel', /^(тип на дисплея|матрица|тип матрица|panel( type)?|display type|panel tipi|ekran (tipi|teknolojisi)|τυποσ οθονησ)$/],
  ['os', /^(операционна система|os|operating system|isletim sistemi|λειτουργικο( συστημα)?)$/],
  ['battery', /^(батерия|battery|batarya|pil( kapasitesi)?|μπαταρια)$/],
  ['ports', /^(портове|интерфейси|ports|interfaces|baglanti( noktalari)?|portlar|θυρεσ)$/],
  ['wifi', /^(wi-?fi|безжична (връзка|мрежа)|wireless|kablosuz( baglanti)?|ασυρματη συνδεση)$/],
  ['weight', /^(тегло|weight|agirlik|βαροσ)$/],
  ['color', /^(цвят|colou?r|renk|χρωμα)$/],
  ['keyboard', /^(клавиатура|keyboard|klavye|πληκτρολογιο)$/],
  ['model', /^(модел|model|model (code|number)|part number|mpn|μοντελο|κωδικοσ κατασκευαστη)$/],
  ['warranty', /^(гаранция|warranty|garanti( suresi)?|εγγυηση)$/],
];

// "Vii. Няма" gibi sıralama ekleri ve "yok" anlamındaki kelimeler
const NONE = /^(няма|нема|без|none|no|yok|χωρισ|δεν (υπαρχει|διαθετει)|-|n\/a)$/i;
const UPPER = /^(rtx|gtx|rx|gb|tb|mb|ssd|hdd|ddr\d|lpddr\d\w*|gddr\d\w*|usb|hdmi|fhd|qhd|uhd|wuxga|wqxga|ips|oled|amoled|led|lcd|va|tn|amd|cpu|gpu|rj-45|dp|wqhd|nvidia|ai|hx|hs|lan|bt)$/i;

export function tidy(v) {
  let s = String(v ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ').trim().replace(/^[ivx]{1,5}\.\s+/i, '');
  if (!s) return '';
  if (NONE.test(fold(s))) return 'Yok';
  // Technomarket "Geforce Rtx 5050 8Gb", "I5-13450Hx" gibi her kelimeyi büyük harfle başlatıyor
  s = s.split(' ').map((w) => {
    const m = w.match(/^([(]?)(.*?)([),.;:]?)$/);
    const core = m[2];
    if (UPPER.test(core)) return m[1] + (/^hz$/i.test(core) ? 'Hz' : core.toUpperCase()) + m[3];
    if (/^\d+(gb|tb|mb)$/i.test(core)) return m[1] + core.replace(/(gb|tb|mb)$/i, (u) => ' ' + u.toUpperCase()) + m[3];
    if (/^\d+(hz|ghz|mhz|wh|w|kg|nits)$/i.test(core)) return m[1] + core.replace(/[a-z]+$/i, (u) => ({ hz: ' Hz', ghz: ' GHz', mhz: ' MHz', wh: ' Wh', w: ' W', kg: ' kg', nits: ' nit' }[u.toLowerCase()])) + m[3];
    if (/^i[3579]-\d{4,5}\w*$/i.test(core)) return m[1] + 'i' + core.slice(1).toUpperCase() + m[3];
    if (/^geforce$/i.test(core)) return m[1] + 'GeForce' + m[3];
    if (/^nvme$/i.test(core)) return m[1] + 'NVMe' + m[3];
    return w;
  }).join(' ');
  return s.slice(0, 220);
}

// Sayfadaki (etiket, değer) çiftlerinden özellikler
export function specsFromPairs(pairs) {
  const out = {};
  for (const [label, value] of pairs) {
    const l = fold(String(label).replace(/[:：]\s*$/, '').replace(/\s*\((inch|in|")\)\s*$/i, ' (inch)'));
    if (!l || l.length > 45) continue;
    const hit = LABELS.find(([, rx]) => rx.test(l) || rx.test(l.replace(/ \(inch\)$/, '')));
    if (!hit) continue;
    const v = tidy(value);
    if (!v || v.length < 1) continue;
    if (!(hit[0] in out)) out[hit[0]] = v;
  }
  if (out.cpu_series && !out.cpu) out.cpu = out.cpu_series;
  delete out.cpu_series;
  if (out.hdd === 'Yok') delete out.hdd;
  if (out.storage === 'Yok') delete out.storage;
  return out;
}

// Sayfadan gelen özellik nesnesini doğrular (API'ye gelen veri)
const KEYS = new Set(LABELS.map(([k]) => k).filter((k) => k !== 'cpu_series'));
export function cleanSpecs(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (KEYS.has(k) && typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, 220);
  return Object.keys(out).length ? out : null;
}

const CORE_WORDS = { двуядрен: 2, четириядрен: 4, шестядрен: 6, осемядрен: 8, десетядрен: 10, дванадесетядрен: 12, четиринадесетядрен: 14, петнадесетядрен: 15, шестнадесетядрен: 16, осемнадесетядрен: 18, двадесетядрен: 20, двадесетичетириядрен: 24 };

// Ürün adından ek özellikler: işletim sistemi, çözünürlük, panel, yenileme hızı, RAM türü, ağırlık...
export function specsFromComputerName(name) {
  const s = String(name || '').replace(/ /g, ' ');
  const f = fold(s);
  const out = {};
  // İşletim sistemi
  if (/\bw(in(dows)?)?\s?11\s?p(ro)?\b|windows 11 pro|\bw11p\b/i.test(s)) out.os = 'Windows 11 Pro';
  else if (/\bw(in(dows)?)?\s?11\s?h(ome)?\b|windows 11 home|\bw11h\b/i.test(s)) out.os = 'Windows 11 Home';
  else if (/\bw(in(dows)?)?\s?11\b|windows 11|\bw11\w?\b/i.test(s)) out.os = 'Windows 11';
  else if (/windows 10|\bw(in)?10/i.test(s)) out.os = 'Windows 10';
  else if (/free\s?dos|\bdos\b/i.test(s)) out.os = 'FreeDOS (işletim sistemi yok)';
  else if (/\bno\s?os\b|без (ос|операционна)|χωρισ λειτουργικο|\bnos\b|isletim sistemi yok/i.test(f)) out.os = 'Yok';
  else if (/linux|ubuntu/i.test(s)) out.os = 'Linux';
  else if (/chrome ?os|chromebook/i.test(s)) out.os = 'ChromeOS';
  else if (/macos|macbook|\bimac\b|mac mini|mac studio/i.test(s)) out.os = 'macOS';
  // Ekran çözünürlüğü
  const px = s.match(/\b(\d{4})\s?[x×]\s?(\d{3,4})\b/);
  if (px) out.resolution = `${px[1]} × ${px[2]}`;
  else if (/\bwuxga\b/i.test(s)) out.resolution = 'WUXGA (1920 × 1200)';
  else if (/\bwqxga\b/i.test(s)) out.resolution = 'WQXGA (2560 × 1600)';
  else if (/\b(fhd\+|full hd\+)/i.test(s)) out.resolution = 'Full HD+ (1920 × 1200)';
  else if (/\b(fhd|full ?hd|1080p)\b/i.test(s)) out.resolution = 'Full HD (1920 × 1080)';
  else if (/\b(wqhd|qhd\+?|2\.5k|1440p)\b/i.test(s)) out.resolution = 'QHD (2560 × 1440/1600)';
  else if (/\b(2\.8k|3k|3\.2k)\b/i.test(s)) out.resolution = (s.match(/\b(2\.8k|3k|3\.2k)\b/i)[1]).toUpperCase();
  else if (/\b(4\.5k|5k)\b/i.test(s)) out.resolution = (s.match(/\b(4\.5k|5k)\b/i)[1]).toUpperCase();
  else if (/\b(uhd|4k)\b/i.test(s)) out.resolution = '4K UHD (3840 × 2160)';
  // Panel
  if (/\bmini ?led\b/i.test(s)) out.panel = 'Mini LED';
  else if (/\b(oled|proled)\b/i.test(s)) out.panel = 'OLED';
  else if (/liquid retina xdr/i.test(s)) out.panel = 'Liquid Retina XDR';
  else if (/retina/i.test(s)) out.panel = 'Retina';
  else if (/\bips\b/i.test(s)) out.panel = 'IPS';
  else if (/\bva\b/.test(s)) out.panel = 'VA';
  const hz = s.match(/\b(\d{2,3})\s?hz\b/i);
  if (hz && +hz[1] >= 60 && +hz[1] <= 540) out.refresh = `${hz[1]} Hz`;
  const rt = s.match(/\b(lpddr\d\w?|ddr\d)\b/i);
  if (rt) out.ram_type = rt[1].toUpperCase();
  const st = s.match(/\b(nvme|ssd|emmc|hdd)\b/i);
  if (st) out.storage_type = st[1].toUpperCase() === 'NVME' ? 'NVMe SSD' : st[1].toUpperCase().replace('EMMC', 'eMMC');
  const kg = s.match(/\b(\d(?:[.,]\d{1,3})?)\s?kg\b/i);
  if (kg) out.weight = `${kg[1].replace('.', ',')} kg`;
  for (const [w, n] of Object.entries(CORE_WORDS)) if (f.includes(w)) { out.cores = `${n} çekirdek`; break; }
  const clk = s.match(/\b(\d\.\d{1,2})\s?\/\s?(\d\.\d{1,2})\s?ghz/i);
  if (clk) out.cpu_clock = `${clk[1].replace('.', ',')}–${clk[2].replace('.', ',')} GHz`;
  // Ekran boyutu: "16 (40.64cm)", "MACBOOK AIR 13.6", "MACBOOK PRO 14"
  const cm = s.match(/\b(\d{2}(?:[.,]\d{1,2})?)\s*\(\s*\d{2}[.,]\d{1,2}\s?cm\)/i);
  const mac = s.match(/macbook\s+(?:air|pro|neo)?\s*(?:proled\s+)?(1[3-6](?:[.,]\d)?)\b/i);
  if (cm) out.screen = `${cm[1].replace(',', '.')}"`;
  else if (mac) out.screen = `${mac[1].replace(',', '.')}"`;
  const vram = s.match(/\b(?:rtx|gtx|rx)\s?\d{4}\s?(?:ti|super|xt)?\s?(\d{1,2})\s?gb\b/i);
  if (vram) out.vram = `${vram[1]} GB`;
  const usb = s.match(/\b(\d)x\s?(thunderbolt \d|usb[^,]{0,20})/gi);
  if (usb) out.ports = usb.map((x) => x.trim()).join(', ');
  if (/touch|dokunmatik|сензорен|αφη/i.test(f)) out.touch = 'Var';
  if (/\bus kbd\b|\bus keyboard\b/i.test(s)) out.keyboard = 'ABD İngilizce (US)';
  return out;
}

const storage = (gb) => (gb >= 1000 ? `${+(gb / (gb % 1024 === 0 ? 1024 : 1000)).toFixed(1)} TB` : `${gb} GB`);

const COLORS = { сив: 'Gri', черен: 'Siyah', бял: 'Beyaz', сребрист: 'Gümüş', син: 'Mavi', зелен: 'Yeşil', червен: 'Kırmızı', златист: 'Altın',
  μαυρο: 'Siyah', ασημι: 'Gümüş', γκρι: 'Gri', λευκο: 'Beyaz', μπλε: 'Mavi', black: 'Siyah', silver: 'Gümüş', grey: 'Gri', gray: 'Gri', white: 'Beyaz', blue: 'Mavi' };
const KEYBOARDS = { кирилизирана: 'Kiril harfli (Bulgarca)', ελληνικο: 'Yunanca', 'us': 'ABD İngilizce (US)' };

// Görüntülenecek özellik listesi: [{ key, label, value }]
export const SPEC_ROWS = [
  ['brand', 'Marka'], ['model', 'Model kodu'], ['cpu', 'İşlemci'], ['cores', 'Çekirdek'], ['cpu_clock', 'İşlemci hızı'],
  ['gpu', 'Ekran kartı'], ['ram', 'RAM'], ['ram_type', 'RAM türü'], ['storage', 'Depolama'], ['hdd', 'Sabit disk'],
  ['screen', 'Ekran boyutu'], ['resolution', 'Çözünürlük'], ['panel', 'Panel'], ['refresh', 'Yenileme hızı'], ['touch', 'Dokunmatik ekran'],
  ['os', 'İşletim sistemi'], ['battery', 'Batarya'], ['weight', 'Ağırlık'], ['ports', 'Bağlantılar'], ['wifi', 'Kablosuz'],
  ['keyboard', 'Klavye'], ['color', 'Renk'], ['warranty', 'Garanti'],
];

// Ürün kaydı (+ isteğe bağlı sayfa özellikleri) -> görüntülenecek özellikler
export function computerSpecs(p) {
  let page = {};
  try { page = typeof p.specs === 'string' ? JSON.parse(p.specs) || {} : p.specs || {}; } catch {}
  const nm = specsFromComputerName(p.name);
  const s = { ...nm };
  if (p.brand) s.brand = p.brand;
  if (p.cpu) s.cpu = p.cpu;
  if (p.gpu) s.gpu = p.gpu + (nm.vram && !/\d\s?gb/i.test(p.gpu) ? ` (${nm.vram})` : '');
  if (p.ram_gb) s.ram = `${p.ram_gb} GB`;
  if (p.storage_gb) s.storage = storage(p.storage_gb) + (nm.storage_type ? ` ${nm.storage_type}` : '');
  if (p.screen_in) s.screen = `${p.screen_in}"`;
  for (const [k, v] of Object.entries(page)) if (v) s[k] = v;
  // Sayfa değerlerini okunur hale getir
  if (s.color) s.color = COLORS[fold(s.color)] || s.color;
  if (s.keyboard) s.keyboard = KEYBOARDS[fold(s.keyboard)] || s.keyboard;
  if (s.os === 'Yok') s.os = 'Yok (yüklü değil)';
  if (s.cores && /^\d+\s*(core)?$/i.test(s.cores)) s.cores = `${parseInt(s.cores, 10)} çekirdek`;
  if (s.screen && /^\d{2}(\.\d{1,2})?\s*"?$/.test(s.screen)) s.screen = s.screen.replace(/\s*"?$/, '"');
  if (s.model && p.brand && fold(s.model) === fold(p.brand)) delete s.model;
  return SPEC_ROWS.filter(([k]) => s[k]).map(([key, label]) => ({ key, label, value: s[key] }));
}

// Sayfa özelliklerinden arama sütunları (RAM, depolama, ekran...) için sayılar
export function columnsFromSpecs(sp = {}) {
  const out = {};
  const ram = String(sp.ram || '').match(/^(\d{1,3})\s?gb/i);
  if (ram && +ram[1] >= 2 && +ram[1] <= 256) out.ram_gb = +ram[1];
  const st = String(sp.storage || '').match(/(\d+(?:[.,]\d+)?)\s?(tb|gb)/i);
  if (st) out.storage_gb = Math.round(parseFloat(st[1].replace(',', '.')) * (/tb/i.test(st[2]) ? 1000 : 1));
  const scr = String(sp.screen || '').match(/(\d{2}(?:[.,]\d{1,2})?)/);
  if (scr) { const v = parseFloat(scr[1].replace(',', '.')); if (v >= 10 && v <= 40) out.screen_in = v; }
  if (sp.cpu && /\d/.test(sp.cpu) && sp.cpu.length < 60) out.cpu = sp.cpu;
  if (sp.gpu && /\d/.test(sp.gpu) && sp.gpu.length < 60) out.gpu = sp.gpu;
  return out;
}
