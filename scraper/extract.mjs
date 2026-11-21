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
  } else if (lastDot > -1 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ''); // 1.299 ve 12.999 (TR/GR binlik; fiyatta 3 ondalık hane olmaz)
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

const decodeEntities = (s) => String(s || '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).trim();

function jsonLdProduct(html) {
  for (const [, txt] of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try { data = JSON.parse(txt.trim().replace(/[\u0000-\u001f]+/g, ' ')); } catch { continue; }
    for (const n of walk(data)) if (isType(n, 'product')) return n;
  }
  return null;
}

// Ürün sayfasından katalog için gereken her şey: ad, marka, parça kodu, görsel, fiyat
export function extractProduct(html, fallbackCurrency) {
  const ld = jsonLdProduct(html) || {};
  const first = (v) => (Array.isArray(v) ? v[0] : v);
  const name = decodeEntities(ld.name || meta(html, 'og:title') || (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]?.replace(/<[^>]+>/g, '') || (html.match(/<title>([^<]*)/i) || [])[1]);
  const brand = decodeEntities(typeof ld.brand === 'string' ? ld.brand : ld.brand?.name || meta(html, 'product:brand') || '');
  const mpn = ld.mpn || ld.model?.toString?.().match(/^[A-Z0-9-]{6,}$/)?.[0] || null;
  const img = first(ld.image);
  const image = (typeof img === 'string' ? img : img?.url) || meta(html, 'og:image') || null;
  let found = extractPrice(html, fallbackCurrency);
  if (!found) {
    // <span itemprop="price">309.90</span> ya da gizli fiyat alanı
    // Technopolis (Angular): <span class="price-value">178.90</span>; "Запитване/Inquiry" düğmesi = satışta değil
    const m = html.match(/itemprop=["']price["'][^>]*>\s*([\d.,]+)\s*</i) || html.match(/id=["']price_current["'][^>]*value=["']([\d.,]+)["']/i)
      || html.match(/class=["'][^"']*\bprice-value\b[^"']*["'][^>]*>\s*([\d][\d.,\s]*?)\s*</i);
    const price = m && parseNumber(m[1]);
    const inquiry = />\s*(Запитване|Inquiry)\s*</i.test(html) && !/button-buy/i.test(html);
    if (price) found = { price, currency: meta(html, 'priceCurrency') || fallbackCurrency, in_stock: !inquiry };
  }
  if (!name || !found) return null;
  return { name: name.slice(0, 300), brand: brand || null, mpn, image, ...found };
}

// Ürün sayfasındaki özellik tablosundan (etiket, değer) çiftleri:
// <tr><td|th>Etiket</td><td>Değer</td></tr>, <dt>/<dd>, JSON-LD additionalProperty.
// Filtre menüleri gibi çok bağlantılı hücreler (e-shop.gr) atlanır.
export function extractSpecPairs(html) {
  const pairs = [];
  const text = (h) => decodeEntities(String(h).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  for (const [, row] of String(html).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row.matchAll(/<t([hd])[^>]*>([\s\S]*?)<\/t\1>/gi)].map((m) => m[2]);
    if (cells.length !== 2) continue;
    if ((cells[1].match(/<a\b/gi) || []).length > 2) continue;
    const l = text(cells[0]), v = text(cells[1]);
    if (l && v && l.length <= 60 && v.length <= 400) pairs.push([l, v]);
  }
  for (const [, dl] of String(html).matchAll(/<dl[^>]*>([\s\S]*?)<\/dl>/gi)) {
    for (const m of dl.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi)) {
      const l = text(m[1]), v = text(m[2]);
      if (l && v && l.length <= 60 && v.length <= 400) pairs.push([l, v]);
    }
  }
  const ld = jsonLdProduct(html);
  for (const p of [].concat(ld?.additionalProperty || [])) if (p && p.name && p.value != null) pairs.push([String(p.name), String(p.value)]);
  return pairs;
}
