// Özellik yardımcıları: işlemci/ekran kartı için kaba bir 0-100 puanı ve
// serbest metinden (ör. "i7 16gb rtx 4060") özellik çıkarma.
// Puanlar karşılaştırma ve "benzer ürün" önerisi içindir, benchmark değildir.

// Intel model numarasından nesil: 13650 -> 13, 1335 -> 13 (U serisi), 8550 -> 8
const gen = (n) => (n.length === 5 || n[0] === '1' ? +n.slice(0, 2) : +n[0]);

const CPU_RULES = [
  [/apple\s*m(\d)\s*(max)/i, (m) => 70 + +m[1] * 6],
  [/apple\s*m(\d)\s*(pro)/i, (m) => 60 + +m[1] * 6],
  [/(?:apple|macbook)[^,]*?\bm(\d)\b/i, (m) => 45 + +m[1] * 6],
  [/ultra\s*9/i, () => 88],
  [/ultra\s*7/i, () => 78],
  [/ultra\s*5/i, () => 62],
  [/i9[- ](\d{4,5})/i, (m) => 70 + Math.min(gen(m[1]), 14) * 2],
  [/i7[- ](\d{4,5})/i, (m) => 52 + Math.min(gen(m[1]), 14) * 2],
  [/i5[- ](\d{4,5})/i, (m) => 36 + Math.min(gen(m[1]), 14) * 2],
  [/i3[- ](\d{4,5})/i, (m) => 20 + Math.min(gen(m[1]), 14) * 2],
  [/\bi9\b/i, () => 90], [/\bi7\b/i, () => 72], [/\bi5\b/i, () => 55], [/\bi3\b/i, () => 35],
  [/ryzen\s*ai\s*(max|9)/i, () => 88], [/ryzen\s*ai\s*7/i, () => 78], [/ryzen\s*ai\s*5/i, () => 64],
  [/ryzen\s*9\s*(\d)/i, (m) => 70 + +m[1] * 3],
  [/ryzen\s*7\s*(\d)/i, (m) => 56 + +m[1] * 3],
  [/ryzen\s*5\s*(\d)/i, (m) => 40 + +m[1] * 3],
  [/ryzen\s*3\s*(\d)/i, (m) => 24 + +m[1] * 3],
  [/ryzen\s*9/i, () => 88], [/ryzen\s*7/i, () => 74], [/ryzen\s*5/i, () => 58], [/ryzen\s*3/i, () => 40],
  [/snapdragon\s*x\s*elite/i, () => 74], [/snapdragon\s*x\s*plus/i, () => 64],
  [/celeron|pentium|athlon|\bn\d{3}\b/i, () => 12],
];

// Ekran kartı puanları (masaüstü/laptop sürümleri arasındaki fark yok sayılır)
const GPU_TABLE = {
  rtx: { 5050: 52, 5060: 62, 5070: 74, 5080: 88, 5090: 100, 4050: 50, 4060: 58, 4070: 68, 4080: 84, 4090: 96,
    3050: 40, 3060: 50, 3070: 60, 3080: 72, 3090: 80, 2050: 30, 2060: 40, 2070: 46, 2080: 52 },
  gtx: { 1630: 20, 1650: 30, 1660: 36, 1050: 18, 1060: 26, 1070: 32, 1080: 38 },
  rx: { 9060: 60, 9070: 74, 7600: 52, 7700: 62, 7800: 68, 7900: 82, 6500: 30, 6600: 46, 6700: 54, 6800: 64, 6900: 70 },
};
const GPU_RULES = [
  [/\b(rtx|gtx|rx)\s*(\d{4})/i, (m) => GPU_TABLE[m[1].toLowerCase()][m[2].slice(0, 3) + '0'] ?? 40],
  [/arc\s*b\d{3}/i, () => 46], [/arc\s*a7\d0/i, () => 40], [/arc/i, () => 18],
  [/apple|m\d\s*(pro|max)?\s*gpu/i, () => 30],
  [/radeon|iris|uhd|intel\s*graphics|integrated|dahili|paylaşımlı/i, () => 12],
];

function score(text, rules) {
  if (!text) return null;
  for (const [re, fn] of rules) {
    const m = String(text).match(re);
    if (m) return Math.max(0, Math.min(100, Math.round(fn(m))));
  }
  return null;
}

export const cpuScore = (t) => score(t, CPU_RULES);
export const gpuScore = (t) => score(t, GPU_RULES);

// Serbest aramadan özellik çıkar: "i7 16gb 1tb rtx 4060 laptop"
export function parseQuery(q) {
  const s = String(q || '');
  const out = {};
  const ram = s.match(/(\d{1,3})\s*gb\s*(ram|ddr\d?)?/i);
  if (ram && +ram[1] <= 256) out.ram_gb = +ram[1];
  const tb = s.match(/(\d)\s*tb/i);
  const gb = s.match(/(\d{3,4})\s*gb\s*(ssd|nvme|hdd)/i);
  if (tb) out.storage_gb = +tb[1] * 1024; else if (gb) out.storage_gb = +gb[1];
  const c = cpuScore(s); if (c != null && !/^(rtx|gtx|rx)/i.test(s.trim())) out.cpu_score = c;
  const g = gpuScore(s); if (g != null && g > 12) out.gpu_score = g;
  if (/laptop|notebook|dizüstü/i.test(s)) out.type = 'laptop';
  if (/masaüstü|desktop|\bpc\b|oyun bilgisayarı/i.test(s)) out.type = 'desktop';
  if (/telefon|iphone|smartphone|galaxy [sazm]\d|redmi|pixel \d/i.test(s)) out.type = 'phone';
  if (/tablet|ipad|galaxy tab/i.test(s)) out.type = 'tablet';
  return out;
}

// İki ürün arasındaki özellik farkı (küçük = daha benzer)
export function distance(a, b) {
  let d = 0;
  const lg = (x) => Math.log2(Math.max(1, x || 1));
  if (a.type !== b.type) d += 3;
  if (a.cpu_score != null && b.cpu_score != null) d += Math.abs(a.cpu_score - b.cpu_score) / 25;
  if (a.gpu_score != null && b.gpu_score != null) d += Math.abs(a.gpu_score - b.gpu_score) / 25;
  if (a.ram_gb && b.ram_gb) d += Math.abs(lg(a.ram_gb) - lg(b.ram_gb)) * 0.6;
  if (a.storage_gb && b.storage_gb) d += Math.abs(lg(a.storage_gb) - lg(b.storage_gb)) * 0.3;
  if (a.screen_in && b.screen_in) d += Math.abs(a.screen_in - b.screen_in) / 3;
  return d;
}
