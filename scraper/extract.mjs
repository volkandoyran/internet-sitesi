// HTML'den fiyat çıkarma. Önce schema.org JSON-LD (çoğu e-ticaret sitesi kullanır),
// sonra meta etiketleri, sonra itemprop="price" denenir.

export function parseNumber(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return raw;
  let s = String(raw).replace(/[^\d.,]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // Hangisi sondaysa ondalık ayırıcıdır: 1.234,56 ya da 1,234.56
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    // 1,234 (binlik) ya da 12,99 (ondalık)
    s = /,\d{3}$/.test(s) && s.length > 4 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (lastDot > -1 && /\.\d{3}$/.test(s) && (s.match(/\./g).length > 1 || s.length > 5)) {
    s = s.replace(/\./g, ''); // 12.999 (TR binlik)
  }
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function* walk(node) {
  if (Array.isArray(node)) for (const n of node) yield* walk(n);
  else if (node && typeof node === 'object') {
    yield node;
    for (const v of Object.values(node)) if (v && typeof v === 'object') yield* walk(v);
  }
}

const isType = (n, t) => [].concat(n['@type'] || []).some((x) => String(x).toLowerCase() === t);

function fromJsonLd(html) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [, txt] of blocks) {
    let data;
    try { data = JSON.parse(txt.trim().replace(/[\u0000-\u001f]+/g, ' ')); } catch { continue; }
    for (const n of walk(data)) {
      if (!isType(n, 'product') && !isType(n, 'productgroup')) continue;
      for (const off of walk(n.offers || [])) {
        const price = parseNumber(off.price ?? off.lowPrice ?? off.priceSpecification?.price);
        if (price) {
          const avail = String(off.availability || '');
          return { price, currency: off.priceCurrency || null, in_stock: !/OutOfStock|SoldOut|Discontinued/i.test(avail) };
        }
      }
    }
  }
  return null;
}

function meta(html, name) {
  const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${name}["'][^>]*>`, 'i');
  const tag = html.match(re);
  if (!tag) return null;
  const c = tag[0].match(/content=["']([^"']*)["']/i);
  return c ? c[1] : null;
}

export function extractPrice(html, fallbackCurrency) {
  const ld = fromJsonLd(html);
  if (ld) return ld;
  const price = parseNumber(meta(html, 'product:price:amount') || meta(html, 'og:price:amount') || meta(html, 'price'));
  if (price) return { price, currency: meta(html, 'product:price:currency') || meta(html, 'og:price:currency') || meta(html, 'priceCurrency') || fallbackCurrency, in_stock: true };
  const ip = html.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i) || html.match(/content=["']([^"']+)["'][^>]*itemprop=["']price["']/i);
  if (ip && parseNumber(ip[1])) return { price: parseNumber(ip[1]), currency: fallbackCurrency, in_stock: true };
  return null;
}
