// Haberler için otomatik kapak görseli (SVG). Telif riski olmaması için haber sitelerinin
// fotoğrafları kullanılmaz; kapak, başlık + kaynak adı + site logosundan kodla üretilir.
import { kac } from './sayfa.js';

// Koyu, okunaklı arka plan renkleri (beyaz yazıyla yeterli kontrast)
const PALET = [
  ['#7a1712', '#c0261c'], ['#0f3d5e', '#1d6fa3'], ['#1f4d2b', '#2f7d45'], ['#4a2366', '#7b3fa8'],
  ['#5c3a0a', '#a0650f'], ['#143f45', '#1f7a83'], ['#3a3a44', '#5f5f6e'], ['#5e1739', '#9c2a5f'],
];

// Konuya göre renk: bazı anahtar kelimeler sabit renk alır, kalanlar id'ye göre dağılır
const KONU = [
  [/ekonomi|faiz|enflasyon|borsa|dolar|merkez bankas|piyasa|zam/i, 4],
  [/deprem|yangın|sel|kaza|fırtına|sağanak|afet/i, 0],
  [/maç|lig|futbol|basketbol|gol|şampiyon|milli takım/i, 2],
  [/seçim|meclis|bakan|cumhurbaşkan|parti|tbmm/i, 1],
  [/savaş|saldırı|ateşkes|ordu|füze|asker/i, 7],
  [/sağlık|hastane|virüs|aşı|ilaç/i, 5],
];

export function renk(h) {
  const m = KONU.find(([r]) => r.test(h.baslik || ''));
  return PALET[m ? m[1] : Math.abs(Number(h.id) || 0) % PALET.length];
}

// Başlığı satırlara böler (yaklaşık karakter genişliğiyle), en fazla `enCok` satır
export function satirla(metin, genislik, enCok) {
  const kelimeler = String(metin || '').replace(/\s+/g, ' ').trim().split(' ');
  const satirlar = [];
  let s = '';
  for (const k of kelimeler) {
    if (!s) s = k;
    else if ((s + ' ' + k).length <= genislik) s += ' ' + k;
    else { satirlar.push(s); s = k; }
  }
  if (s) satirlar.push(s);
  if (satirlar.length > enCok) {
    const kes = satirlar.slice(0, enCok);
    kes[enCok - 1] = kes[enCok - 1].replace(/[\s,;:.-]*$/, '') + '…';
    return kes;
  }
  return satirlar;
}

export function kapakSvg(h) {
  const [koyu, acik] = renk(h);
  const uzun = (h.baslik || '').length;
  const boy = uzun > 90 ? 54 : uzun > 55 ? 62 : 72;
  const satirlar = satirla(h.baslik, Math.floor(1040 / (boy * 0.52)), 4);
  const satirAra = Math.round(boy * 1.18);
  const ustY = 315 - ((satirlar.length - 1) * satirAra) / 2 + boy * 0.35;
  const kaynak = (h.kaynaklar || []).map((k) => k.ad).slice(0, 2).join(' · ');
  const etiket = h.yabanci ? 'DÜNYA · ÇEVİRİ' : (h.kaynak_sayisi > 1 ? `${h.kaynak_sayisi} KAYNAKTA` : 'GÜNDEM');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630" role="img" aria-label="${kac(h.baslik)}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${acik}"/><stop offset="1" stop-color="${koyu}"/></linearGradient>
<pattern id="p" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.6" fill="#fff" fill-opacity=".07"/></pattern></defs>
<rect width="1200" height="630" fill="url(#g)"/><rect width="1200" height="630" fill="url(#p)"/>
<circle cx="1110" cy="-40" r="260" fill="#fff" fill-opacity=".06"/><circle cx="-60" cy="660" r="220" fill="#000" fill-opacity=".10"/>
<g font-family="Georgia,'Times New Roman',serif" fill="#fff">
<rect x="80" y="64" width="${etiket.length * 13 + 36}" height="40" rx="20" fill="#fff" fill-opacity=".16"/>
<text x="98" y="91" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" font-size="20" font-weight="700" letter-spacing="2">${kac(etiket)}</text>
<text font-size="${boy}" font-weight="700">${satirlar.map((s, i) => `<tspan x="80" y="${Math.round(ustY + i * satirAra)}">${kac(s)}</tspan>`).join('')}</text>
<rect x="80" y="520" width="1040" height="2" fill="#fff" fill-opacity=".35"/>
<text x="80" y="570" font-size="34" font-weight="800">Gündem <tspan fill="#ffd7d2">Özeti</tspan></text>
<text x="1120" y="568" text-anchor="end" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" font-size="22" fill-opacity=".85">${kaynak ? `Kaynak: ${kac(kaynak)}` : ''}</text>
</g></svg>`;
}
