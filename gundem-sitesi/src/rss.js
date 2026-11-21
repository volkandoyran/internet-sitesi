// Bağımlılıksız RSS 2.0 / RDF / Atom ayrıştırıcı. Workers'ta DOMParser olmadığı için
// düzenli ifadelerle yalnızca gereken alanları (başlık, bağlantı, özet, tarih) okur.

const VARLIK = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function varlikCoz(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, k) => {
    if (k[0] === '#') {
      const n = k[1] === 'x' || k[1] === 'X' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return VARLIK[k.toLowerCase()] ?? m;
  });
}

// HTML etiketlerini atıp düz metin yapar
export function duzMetin(s) {
  if (!s) return '';
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  s = varlikCoz(s); // bazı kaynaklar HTML'i kaçışlı (&lt;p&gt;) gönderir
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
  return varlikCoz(s).replace(/\s+/g, ' ').trim();
}

function etiket(blok, ad) {
  const m = blok.match(new RegExp(`<${ad}(?:\\s[^>]*)?>([\\s\\S]*?)</${ad}>`, 'i'));
  return m ? m[1] : '';
}

function bag(blok) {
  // Atom: <link rel="alternate" href="..."/>; RSS: <link>...</link>
  const atom = [...blok.matchAll(/<link\b([^>]*?)\/?>/gi)]
    .map((m) => m[1])
    .find((a) => /href=/.test(a) && (!/rel=/.test(a) || /rel=["']alternate["']/.test(a)));
  if (atom) return varlikCoz(atom.match(/href=["']([^"']+)["']/)[1]);
  const l = duzMetin(etiket(blok, 'link'));
  if (l) return l;
  const g = duzMetin(etiket(blok, 'guid'));
  return /^https?:\/\//.test(g) ? g : '';
}

function tarih(blok) {
  for (const ad of ['pubDate', 'dc:date', 'published', 'updated', 'a10:updated']) {
    const v = duzMetin(etiket(blok, ad));
    if (!v) continue;
    const t = Date.parse(v);
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  return null;
}

// XML metninden { baslik, url, ozet, yayin } listesi döner
export function rssAyristir(xml) {
  const bloklar = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  const out = [];
  for (const b of bloklar) {
    const baslik = duzMetin(etiket(b, 'title'));
    const url = bag(b).trim();
    if (!baslik || !/^https?:\/\//.test(url)) continue;
    const ozet = duzMetin(etiket(b, 'description') || etiket(b, 'summary') || etiket(b, 'content'));
    out.push({ baslik, url, ozet: ozet.slice(0, 600), yayin: tarih(b) });
  }
  return out;
}

// Yanıtı doğru karakter kümesiyle çözer (bazı Türk siteleri hâlâ ISO-8859-9 / windows-1254 kullanır)
export function xmlCoz(buf, contentType = '') {
  const bas = String.fromCharCode(...new Uint8Array(buf).subarray(0, 200));
  const cs = (contentType.match(/charset=([\w-]+)/i) || bas.match(/encoding=["']([\w-]+)["']/i) || [])[1];
  if (cs && !/utf-?8/i.test(cs)) {
    try { return new TextDecoder(cs).decode(buf); } catch { /* desteklenmiyorsa utf-8 dene */ }
  }
  return new TextDecoder('utf-8').decode(buf);
}
