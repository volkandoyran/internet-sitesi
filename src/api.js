// API. env.DB = D1, env.ADMIN_PASSWORD = gizli anahtar.
import { cpuScore, gpuScore, parseQuery, distance } from '../lib/specs.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
const fail = (msg, status = 400) => json({ error: msg }, status);

const PRODUCT_FIELDS = ['name', 'brand', 'type', 'category', 'cpu', 'cpu_score', 'gpu', 'gpu_score',
  'ram_gb', 'storage_gb', 'screen_in', 'image'];
const AD_KEYS = ['ad_head', 'ad_top', 'ad_inline', 'ad_bottom', 'ads_txt'];

export async function handleApi(request, env, parts) {
  const url = new URL(request.url);
  const method = request.method;
  try {
    if (parts[0] === 'admin') {
      if (!(await isAdmin(request, env))) return fail('Yetkisiz. Admin şifresini kontrol edin.', 401);
      return await admin(parts.slice(1), method, request, env, url);
    }
    if (method !== 'GET') return fail('Desteklenmeyen istek', 405);
    if (parts[0] === 'products' && parts[1]) return await productDetail(env, +parts[1]);
    if (parts[0] === 'products') return await search(env, url.searchParams);
    if (parts[0] === 'retailers') return json(await retailers(env));
    if (parts[0] === 'ads') return json({ ...(await ads(env)), rate_TRY: await rateFor(env, 'TRY') });
    return fail('Bulunamadı', 404);
  } catch (e) {
    return fail('Sunucu hatası: ' + e.message, 500);
  }
}

// Şifre karşılaştırması: iki değer de SHA-256 ile sabit boyuta getirilip zamanlamadan bağımsız karşılaştırılır
async function isAdmin(request, env) {
  const pw = env.ADMIN_PASSWORD;
  if (!pw) return false;
  const got = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(got)),
    crypto.subtle.digest('SHA-256', enc.encode(pw)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

const retailers = async (env) =>
  (await env.DB.prepare('SELECT * FROM retailers ORDER BY country, name').all()).results;

async function ads(env) {
  const rows = (await env.DB.prepare(
    `SELECT key, value FROM settings WHERE key IN (${AD_KEYS.map(() => '?').join(',')})`
  ).bind(...AD_KEYS).all()).results;
  return Object.fromEntries(rows.map((r) => [r.key, r.value || '']));
}

// Ürünleri, aktif satıcılardaki teklifleriyle birlikte getir
async function loadProducts(env, where = '', binds = []) {
  const products = (await env.DB.prepare(`SELECT * FROM products ${where}`).bind(...binds).all()).results;
  if (!products.length) return [];
  const offers = (await env.DB.prepare(
    `SELECT o.id, o.product_id, o.retailer_id, o.url, o.price, o.currency, o.price_eur, o.in_stock,
            o.updated_at, r.name AS retailer, r.country
       FROM offers o JOIN retailers r ON r.id = o.retailer_id
      WHERE r.active = 1 AND o.price_eur IS NOT NULL
        AND (o.manual = 1 OR o.updated_at >= datetime('now', '-14 days'))`  // 2 haftadır güncellenmeyen fiyat gösterilmez
  ).all()).results;
  const byProduct = new Map();
  for (const o of offers) {
    if (!byProduct.has(o.product_id)) byProduct.set(o.product_id, []);
    byProduct.get(o.product_id).push(o);
  }
  return products.map((p) => {
    const list = (byProduct.get(p.id) || []).sort((a, b) => a.price_eur - b.price_eur);
    const inStock = list.filter((o) => o.in_stock !== 0);
    // Eski kayıtlarda puan boş kalmış olabilir (ör. işlemci "M3"): adından yeniden hesaplanır
    const cpu_score = p.cpu_score ?? (p.cpu ? cpuScore(p.cpu) : null);
    const gpu_score = p.gpu_score ?? (p.gpu ? gpuScore(p.gpu) : null);
    return { ...p, cpu_score, gpu_score, offers: list, best: (inStock[0] || list[0]) || null };
  }).filter((p) => p.offers.length); // fiyatı olmayan ürün sitede gösterilmez
}

async function search(env, sp) {
  const q = (sp.get('q') || '').trim();
  const filters = {
    type: sp.get('type') || null,
    category: sp.get('category') || null,
    budget: +sp.get('budget') || null,
    ram_gb: +sp.get('ram') || null,
    storage_gb: +sp.get('storage') || null,
    cpu_score: +sp.get('cpu') || null,
    gpu_score: +sp.get('gpu') || null,
    country: sp.get('country') || null,
  };
  // Metindeki özellikler (ör. "16gb rtx 4060") boş filtreleri doldurur
  const parsed = parseQuery(q);
  // Sitedeki bölüm seçiliyse metinden çıkan tür o bölümün dışına çıkamaz (bilgisayar bölümünde "iphone" telefon getirmez)
  const ALLOWED = { bilgisayar: ['laptop', 'desktop'], parca: [], telefon: ['phone'], tablet: ['tablet'], mobil: ['phone', 'tablet'] }[sp.get('bolum')];
  if (ALLOWED && parsed.type && !ALLOWED.includes(parsed.type)) delete parsed.type;
  // Telefon/tablet aramasında işlemci ve ekran kartı puanı yoktur: metinden çıkan puan filtre olmasın
  if (['phone', 'tablet'].includes(filters.type || parsed.type) || sp.get('bolum') === 'telefon' || sp.get('bolum') === 'tablet') { delete parsed.cpu_score; delete parsed.gpu_score; }
  for (const k of Object.keys(parsed)) if (!filters[k]) filters[k] = parsed[k];
  // Tür seçilmediyse yalnızca hazır bilgisayarlar (laptop ve masaüstü) aranır; "all" her şeyi getirir
  if (!filters.type) filters.type = 'computer';
  if (filters.type === 'all') filters.type = null;
  if (filters.type !== 'part') filters.category = null;
  const GROUPS = { computer: ['laptop', 'desktop'], mobile: ['phone', 'tablet'] };
  const typeOk = (p) => !filters.type || (GROUPS[filters.type] ? GROUPS[filters.type].includes(p.type) : p.type === filters.type);

  const all = await loadProducts(env);
  const priceIn = (p) => {
    const list = filters.country ? p.offers.filter((o) => o.country === filters.country) : p.offers;
    return list.length ? list[0].price_eur : null;
  };
  const specOk = (p) =>
    typeOk(p) &&
    (!filters.category || p.category === filters.category) &&
    (!filters.ram_gb || (p.ram_gb || 0) >= filters.ram_gb) &&
    // 1 TB bazı kayıtlarda 1000, bazılarında 1024 GB: küçük fark eşleşmeyi bozmasın
    (!filters.storage_gb || (p.storage_gb || 0) >= filters.storage_gb * 0.95) &&
    (!filters.cpu_score || (p.cpu_score ?? 0) >= filters.cpu_score) &&
    (!filters.gpu_score || (p.gpu_score ?? 0) >= filters.gpu_score);
  const budgetOk = (p) => !filters.budget || (priceIn(p) != null && priceIn(p) <= filters.budget);

  // Model adı eşleşmesi: tüm kelimeler isimde/markada/işlemcide geçmeli
  // Özellik kelimeleri (16gb, rtx, i7, laptop...) model adı eşleşmesinden çıkarılır
  // Model numaraları ("iphone 17", "rtx 5070") eşleşmede kalır; yalnızca özellik kelimesinin hemen arkasındaki sayı (ör. "ryzen 7") atlanır.
  const SPEC_WORD = /^(\d+(gb|tb)|gb|tb|ram|ssd|nvme|hdd|ddr\d?|(rtx|gtx|rx)\d{0,4}|i[3579](-\d+)?|ryzen|core|ultra|laptop|notebook|dizüstü|masaüstü|desktop|pc|telefon|tablet)$/;
  // Türkçe küçük harfe çevirme "MSI"yi "msı" yapıyordu; ı/İ farkı yok sayılır
  const low = (t) => String(t || '').replace(/İ/g, 'i').toLowerCase().replace(/ı/g, 'i');
  const raw = low(q).split(/\s+/).filter(Boolean);
  const words = raw.filter((w, i) => w.length > 1 && !SPEC_WORD.test(w) && !(/^\d{1,4}$/.test(w) && i > 0 && /^(ryzen|core|ultra|i[3579]|ram|ddr\d?|rtx|gtx|rx)$/.test(raw[i - 1])));
  const hay = (p) => low([p.name, p.brand, p.cpu, p.gpu].join(' '));
  // Sayılar tam sayı olarak aranır ("17" "170"e ya da "i7-1755"e takılmasın)
  const hit = (h, w) => (/^\d+$/.test(w) ? new RegExp(`(^|\\D)${w}(\\D|$)`).test(h) : h.includes(w));
  const nameHit = (p) => { const h = hay(p); return words.every((w) => hit(h, w)); };
  let exact = all.filter((p) => (!words.length || nameHit(p)) && specOk(p) && budgetOk(p));
  exact.sort((a, b) => (priceIn(a) ?? 1e12) - (priceIn(b) ?? 1e12));

  // Eşleşme yoksa: kelimelerin bir kısmını tutan veya istenen özelliğe en yakın ürünleri öner
  let similar = [];
  let note = null;
  if (!exact.length) {
    const partial = words.length
      ? all.filter((p) => words.some((w) => w.length > 2 && hit(hay(p), w)))
      : [];
    const anchor = partial[0] || { ...filters, type: GROUPS[filters.type] ? GROUPS[filters.type][0] : filters.type };
    similar = all
      .filter((p) => budgetOk(p) && typeOk(p) && (!filters.category || p.category === filters.category)
        && (!partial[0] || partial[0].type !== 'part' || p.category === partial[0].category))
      .map((p) => ({ p, d: distance(anchor, p) - (partial.includes(p) ? 1 : 0) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 12)
      .map((x) => x.p);
    note = q
      ? `"${q}" için birebir eşleşme bulunamadı. Benzer özellikteki ürünler gösteriliyor.`
      : 'Bu filtrelerle ürün bulunamadı. En yakın özellikteki ürünler gösteriliyor.';
  }
  return json({ filters, results: exact.slice(0, 60), similar, note, rate_TRY: await rateFor(env, 'TRY') });
}

async function productDetail(env, id) {
  const all = await loadProducts(env);
  const p = all.find((x) => x.id === id);
  if (!p) return fail('Ürün bulunamadı', 404);
  const similar = all
    .filter((x) => x.id !== id && x.type === p.type && (p.type !== 'part' || x.category === p.category) && x.offers.length)
    .map((x) => ({ x, d: distance(p, x) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 6)
    .map((s) => s.x);
  const history = (await env.DB.prepare(
    `SELECT h.offer_id, h.price_eur, h.at FROM price_history h
       JOIN offers o ON o.id = h.offer_id WHERE o.product_id = ? ORDER BY h.at`
  ).bind(id).all()).results;
  return json({ product: p, similar, history, rate_TRY: await rateFor(env, 'TRY') });
}

// ---------- Admin ----------

async function rateFor(env, currency) {
  if (!currency || currency === 'EUR') return 1;
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('rate_' + currency).first();
  return row && row.value ? +row.value : null; // 1 EUR = rate X
}

function cleanProduct(body) {
  const p = {};
  for (const f of PRODUCT_FIELDS) if (f in body) p[f] = body[f] === '' ? null : body[f];
  for (const f of ['cpu_score', 'gpu_score', 'ram_gb', 'storage_gb']) if (p[f] != null) p[f] = Math.round(+p[f]);
  if (p.screen_in != null) p.screen_in = +p.screen_in;
  if (p.cpu && p.cpu_score == null) p.cpu_score = cpuScore(p.cpu);
  if (p.gpu && p.gpu_score == null) p.gpu_score = gpuScore(p.gpu);
  return p;
}

async function admin(parts, method, request, env, url) {
  const body = ['POST', 'PUT'].includes(method) ? await request.json().catch(() => ({})) : null;
  const [res, id] = [parts[0], parts[1] ? +parts[1] : null];

  if (res === 'check') return json({ ok: true });

  if (res === 'products') {
    if (method === 'GET') return json(await loadAllAdmin(env));
    if (method === 'POST' || method === 'PUT') {
      const p = cleanProduct(body);
      if (method === 'POST') {
        if (!p.name || !p.type) return fail('Ürün adı ve türü zorunlu.');
        const keys = Object.keys(p);
        const r = await env.DB.prepare(
          `INSERT INTO products (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')}) RETURNING id`
        ).bind(...keys.map((k) => p[k])).first();
        return json({ id: r.id });
      }
      const keys = Object.keys(p);
      if (!keys.length) return fail('Değişiklik yok.');
      await env.DB.prepare(`UPDATE products SET ${keys.map((k) => k + ' = ?').join(', ')} WHERE id = ?`)
        .bind(...keys.map((k) => p[k]), id).run();
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM price_history WHERE offer_id IN (SELECT id FROM offers WHERE product_id = ?)').bind(id),
        env.DB.prepare('DELETE FROM offers WHERE product_id = ?').bind(id),
        env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id),
      ]);
      return json({ ok: true });
    }
  }

  if (res === 'offers') {
    if (method === 'GET') {
      // Fiyat çekici için: otomatik güncellenecek teklifler
      const rows = (await env.DB.prepare(
        `SELECT o.id, o.url, o.retailer_id, r.currency FROM offers o JOIN retailers r ON r.id = o.retailer_id
          WHERE o.manual = 0 AND o.url IS NOT NULL AND o.url != '' AND r.active = 1 AND r.scrape = 1`
      ).all()).results;
      return json(rows);
    }
    if (method === 'POST' || method === 'PUT') {
      if (body.url && !/^https?:\/\//i.test(body.url)) return fail('Ürün bağlantısı http:// ya da https:// ile başlamalı.');
      const r = await env.DB.prepare('SELECT currency FROM retailers WHERE id = ?').bind(body.retailer_id).first();
      if (method === 'POST' && !r) return fail('Satıcı bulunamadı.');
      const currency = body.currency || (r && r.currency) || 'EUR';
      const price = body.price === '' || body.price == null ? null : +body.price;
      const rate = await rateFor(env, currency);
      if (price != null && rate == null) return fail(`${currency} kuru henüz yok. Önce fiyat çekiciyi bir kez çalıştırın.`);
      const priceEur = price != null ? Math.round((price / rate) * 100) / 100 : null;
      const manual = body.manual ? 1 : 0;
      const now = new Date().toISOString();
      if (method === 'POST') {
        const row = await env.DB.prepare(
          `INSERT INTO offers (product_id, retailer_id, url, price, currency, price_eur, in_stock, manual, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?) RETURNING id`
        ).bind(body.product_id, body.retailer_id, body.url || null, price, currency, priceEur,
          body.in_stock === false ? 0 : 1, manual, price != null ? now : null).first();
        if (priceEur != null) await env.DB.prepare('INSERT INTO price_history (offer_id, price_eur) VALUES (?,?)').bind(row.id, priceEur).run();
        return json({ id: row.id });
      }
      await env.DB.prepare(
        `UPDATE offers SET url = ?, price = ?, currency = ?, price_eur = ?, in_stock = ?, manual = ?, updated_at = ? WHERE id = ?`
      ).bind(body.url || null, price, currency, priceEur, body.in_stock === false ? 0 : 1, manual, now, id).run();
      if (priceEur != null) await env.DB.prepare('INSERT INTO price_history (offer_id, price_eur) VALUES (?,?)').bind(id, priceEur).run();
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM price_history WHERE offer_id = ?').bind(id),
        env.DB.prepare('DELETE FROM offers WHERE id = ?').bind(id),
      ]);
      return json({ ok: true });
    }
  }

  // Fiyat çekicinin toplu sonucu: { rates: {TRY: 50.1}, results: [{id, price, currency, in_stock, error}] }
  if (res === 'prices' && method === 'POST') {
    const stmts = [];
    for (const [cur, rate] of Object.entries(body.rates || {})) {
      if (rate > 0) stmts.push(env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind('rate_' + cur, String(rate)));
    }
    const now = new Date().toISOString();
    let ok = 0;
    for (const r of body.results || []) {
      if (r.error || !(r.price > 0)) {
        stmts.push(env.DB.prepare('UPDATE offers SET last_error = ? WHERE id = ? AND manual = 0').bind(String(r.error || 'Fiyat bulunamadı').slice(0, 300), r.id));
        continue;
      }
      const rate = r.currency === 'EUR' ? 1 : (body.rates || {})[r.currency] || (await rateFor(env, r.currency));
      if (!rate) continue;
      const eur = Math.round((r.price / rate) * 100) / 100;
      stmts.push(env.DB.prepare(
        `UPDATE offers SET price = ?, currency = ?, price_eur = ?, in_stock = ?, last_error = NULL, updated_at = ? WHERE id = ? AND manual = 0`
      ).bind(r.price, r.currency, eur, r.in_stock === false ? 0 : 1, now, r.id));
      stmts.push(env.DB.prepare('INSERT INTO price_history (offer_id, price_eur) VALUES (?, ?)').bind(r.id, eur));
      ok++;
    }
    for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
    return json({ ok: true, updated: ok });
  }

  // Eşleştirici için ürün listesi (tarayıcı anahtarları hesaplayıp aynı ürünleri birleştirir)
  if (res === 'match' && method === 'GET') {
    const rows = (await env.DB.prepare(
      `SELECT p.id, p.name, p.brand, p.type, p.category, p.match_key, p.storage_gb, p.mkeys,
              (SELECT COUNT(*) FROM offers o WHERE o.product_id = p.id) AS n FROM products p`
    ).all()).results;
    return json(rows);
  }
  // { merges: [{ keep, drop: [id...] }], keys: [{ id, mkeys }] } — ücretsiz planda istek başına sorgu sınırı olduğu için küçük parçalar halinde
  if (res === 'match' && method === 'POST') {
    const ints = (a) => (Array.isArray(a) ? a.map((x) => +x).filter((x) => Number.isInteger(x) && x > 0) : []);
    const stmts = [];
    for (const m of body.merges || []) {
      const keep = +m.keep, drop = ints(m.drop).filter((x) => x !== keep).slice(0, 90);
      if (!Number.isInteger(keep) || !drop.length) continue;
      const q = drop.map(() => '?').join(',');
      stmts.push(env.DB.prepare(`UPDATE offers SET product_id = ? WHERE product_id IN (${q})`).bind(keep, ...drop));
      stmts.push(env.DB.prepare(`DELETE FROM products WHERE id IN (${q})`).bind(...drop));
    }
    const keys = (body.keys || []).filter((k) => Number.isInteger(+k.id) && typeof k.mkeys === 'string');
    for (let i = 0; i < keys.length; i += 33) {
      const part = keys.slice(i, i + 33);
      stmts.push(env.DB.prepare(`UPDATE products SET mkeys = CASE id ${part.map(() => 'WHEN ? THEN ?').join(' ')} END WHERE id IN (${part.map(() => '?').join(',')})`)
        .bind(...part.flatMap((k) => [+k.id, k.mkeys.slice(0, 500)]), ...part.map((k) => +k.id)));
    }
    if (stmts.length > 45) return fail('Tek istekte en fazla 45 sorgu: daha küçük parçalar gönderin.');
    if (stmts.length) await env.DB.batch(stmts);
    return json({ ok: true, queries: stmts.length });
  }

  if (res === 'catalog') {
    if (method === 'GET') {
      // Katalog tarayıcısı için: bilinen otomatik bağlantılar
      const rows = (await env.DB.prepare(
        `SELECT retailer_id, url, updated_at FROM offers WHERE manual = 0 AND url IS NOT NULL`
      ).all()).results;
      return json(rows);
    }
    if (method === 'POST') return json(await catalogUpsert(env, body));
  }

  // Fiyat çekici için Firecrawl köprüsü: mağaza GitHub'dan gelen isteği engellediğinde sayfa Firecrawl ile alınır.
  // Anahtar yalnızca Worker'da (FIRECRAWL_API_KEY gizli ayarı) durur.
  if (res === 'firecrawl' && method === 'GET') {
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'firecrawl_limit'").first();
    return json({ enabled: !!env.FIRECRAWL_API_KEY, limit: row ? +row.value : 8 });
  }
  if (res === 'firecrawl' && method === 'POST') {
    if (!env.FIRECRAWL_API_KEY) return fail('FIRECRAWL_API_KEY ayarlı değil', 501);
    if (!/^https?:\/\//.test(body.url || '')) return fail('url gerekli');
    const map = body.mode === 'map';
    const r = await fetch(`https://api.firecrawl.dev/v2/${map ? 'map' : 'scrape'}`, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + env.FIRECRAWL_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify(map
        ? { url: body.url, search: body.search || undefined, limit: Math.min(+body.limit || 5000, 5000), sitemap: 'include' }
        : { url: body.url, formats: ['rawHtml'], onlyMainContent: false, proxy: 'auto', maxAge: 6 * 3600 * 1000, timeout: 60000 }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.success === false) return json({ ok: false, status: r.status, error: String(d.error || d.message || r.status).slice(0, 300) }, 502);
    if (map) return json({ ok: true, links: (d.links || []).map((l) => (typeof l === 'string' ? l : l.url)).filter(Boolean) });
    return json({ ok: true, html: d.data?.rawHtml || '', status: d.data?.metadata?.statusCode || 200, credits: d.data?.metadata?.creditsUsed ?? null });
  }

  if (res === 'retailers') {
    if (method === 'GET') return json(await retailers(env));
    if (method === 'PUT') {
      await env.DB.prepare('UPDATE retailers SET active = ?, scrape = ? WHERE id = ?')
        .bind(body.active ? 1 : 0, body.scrape ? 1 : 0, parts[1]).run();
      return json({ ok: true });
    }
    if (method === 'POST') {
      if (!body.id || !body.name || !['TR', 'GR', 'BG'].includes(body.country)) return fail('Satıcı kimliği, adı ve ülkesi (TR/GR/BG) zorunlu.');
      await env.DB.prepare('INSERT INTO retailers (id, name, country, site, currency) VALUES (?,?,?,?,?)')
        .bind(body.id, body.name, body.country, body.site || '', body.country === 'TR' ? 'TRY' : 'EUR').run();
      return json({ ok: true });
    }
  }

  if (res === 'settings') {
    if (method === 'GET') {
      const rows = (await env.DB.prepare('SELECT key, value FROM settings').all()).results;
      return json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
    }
    if (method === 'PUT') {
      const stmts = AD_KEYS.filter((k) => k in body).map((k) =>
        env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(k, String(body[k] ?? '')));
      if (stmts.length) await env.DB.batch(stmts);
      return json({ ok: true });
    }
  }

  return fail('Bulunamadı', 404);
}

// Katalog tarayıcısından gelen ürünler: { rates, items: [{retailer_id, url, name, type, category, ..., match_key, price, currency, in_stock} | {retailer_id, url, error} | {retailer_id, url, gone}] }
// Aynı eşleştirme anahtarına sahip ürün varsa yeni teklif ona bağlanır; yoksa yeni ürün açılır.
async function catalogUpsert(env, body) {
  const items = (body.items || []).filter((i) => i && i.retailer_id && /^https?:\/\//.test(i.url || '')).slice(0, 12); // ücretsiz planda istek başına sorgu sınırı var
  const stmts = [];
  for (const [cur, rate] of Object.entries(body.rates || {})) {
    if (rate > 0) stmts.push(env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind('rate_' + cur, String(rate)));
  }
  if (stmts.length) await env.DB.batch(stmts.splice(0));
  const all = await retailers(env);
  const known = new Set(all.map((r) => r.id));
  const currencyOf = new Map(all.map((r) => [r.id, r.currency]));
  const hidden = new Set(all.filter((r) => !r.active).map((r) => r.id));
  const now = new Date().toISOString();
  const out = { added: 0, updated: 0, removed: 0, errors: 0, linked: 0 };
  for (const it of items) {
    if (!known.has(it.retailer_id)) continue;
    const offer = await env.DB.prepare('SELECT id, product_id, manual FROM offers WHERE retailer_id = ? AND url = ?').bind(it.retailer_id, it.url).first();
    if (it.gone) {
      if (offer && !offer.manual) {
        await env.DB.batch([
          env.DB.prepare('DELETE FROM price_history WHERE offer_id = ?').bind(offer.id),
          env.DB.prepare('DELETE FROM offers WHERE id = ?').bind(offer.id),
          env.DB.prepare('DELETE FROM products WHERE id = ? AND NOT EXISTS (SELECT 1 FROM offers WHERE product_id = ?)').bind(offer.product_id, offer.product_id),
        ]);
        out.removed++;
      }
      continue;
    }
    if (it.error || !(it.price > 0)) {
      if (offer) await env.DB.prepare('UPDATE offers SET last_error = ? WHERE id = ? AND manual = 0').bind(String(it.error || 'Fiyat bulunamadı').slice(0, 300), offer.id).run();
      out.errors++;
      continue;
    }
    // Sayfada para birimi yazmıyorsa mağazanınki kullanılır (TR mağazası fiyatı euro sanılmasın)
    const currency = it.currency || currencyOf.get(it.retailer_id) || 'EUR';
    const rate = currency === 'EUR' ? 1 : (body.rates || {})[currency] || (await rateFor(env, currency));
    if (!rate) { out.errors++; continue; }
    const eur = Math.round((it.price / rate) * 100) / 100;
    if (offer) {
      if (offer.manual) continue;
      await env.DB.batch([
        env.DB.prepare('UPDATE offers SET price = ?, currency = ?, price_eur = ?, in_stock = ?, last_error = NULL, updated_at = ? WHERE id = ?')
          .bind(it.price, currency, eur, it.in_stock === false ? 0 : 1, now, offer.id),
        env.DB.prepare('INSERT INTO price_history (offer_id, price_eur) VALUES (?, ?)').bind(offer.id, eur),
        // Sınıflandırma/özellik kuralları düzeltildiyse eski kayıt da düzelsin
        // (ör. "DESKTOP ... CORE I5" işlemci sanılmıştı, "RTX 4070 8GB" RAM 8 GB sanılmıştı)
        ...(it.type ? [refreshProduct(env, offer.product_id, it)] : []),
      ]);
      out.updated++;
      continue;
    }
    // Yeni bağlantı: aynı model başka mağazada/ülkede varsa ona bağla.
    // Önce tarayıcının hesapladığı anahtarlar (üretici kodu, model + depolama, işlemci modeli...), sonra eski match_key.
    let productId = null;
    const keys = (Array.isArray(it.keys) ? it.keys : []).filter((k) => typeof k === 'string' && /^[A-Z0-9:А-Я+]{3,80}$/.test(k)).slice(0, 6);
    if (keys.length) {
      const p = await env.DB.prepare(
        `SELECT id FROM products WHERE type = ? AND IFNULL(category, '') = IFNULL(?, '') AND (${keys.map(() => 'mkeys LIKE ?').join(' OR ')}) ORDER BY id LIMIT 1`
      ).bind(it.type, it.category || null, ...keys.map((k) => `% ${k} %`)).first();
      if (p) { productId = p.id; out.linked++; }
    }
    if (!productId && it.match_key) {
      const p = await env.DB.prepare('SELECT id FROM products WHERE match_key = ? AND type = ? LIMIT 1').bind(it.match_key, it.type).first();
      if (p) { productId = p.id; out.linked++; }
    }
    if (!productId) {
      const p = cleanProduct(it);
      p.match_key = it.match_key || null;
      p.mkeys = keys.length ? ` ${keys.join(' ')} ` : null;
      const keys = Object.keys(p).filter((k) => p[k] != null);
      const row = await env.DB.prepare(`INSERT INTO products (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')}) RETURNING id`)
        .bind(...keys.map((k) => p[k])).first();
      productId = row.id;
    }
    const row = await env.DB.prepare(
      `INSERT INTO offers (product_id, retailer_id, url, price, currency, price_eur, in_stock, manual, updated_at)
       VALUES (?,?,?,?,?,?,?,0,?) RETURNING id`
    ).bind(productId, it.retailer_id, it.url, it.price, currency, eur, it.in_stock === false ? 0 : 1, now).first();
    await env.DB.prepare('INSERT INTO price_history (offer_id, price_eur) VALUES (?, ?)').bind(row.id, eur).run();
    out.added++;
    // Engellendiği için gizlenen mağazadan ürün gelmeye başladıysa mağaza yeniden gösterilir
    if (hidden.has(it.retailer_id)) {
      await env.DB.prepare('UPDATE retailers SET active = 1 WHERE id = ?').bind(it.retailer_id).run();
      hidden.delete(it.retailer_id);
      out.unhidden = (out.unhidden || 0) + 1;
    }
  }
  return { ok: true, ...out };
}

function refreshProduct(env, id, it) {
  const p = cleanProduct(it);
  const cols = ['cpu', 'cpu_score', 'gpu', 'gpu_score', 'ram_gb', 'storage_gb', 'screen_in'];
  return env.DB.prepare(`UPDATE products SET type = ?, category = ?, ${cols.map((c) => `${c} = COALESCE(?, ${c})`).join(', ')} WHERE id = ?`)
    .bind(it.type, it.category || null, ...cols.map((c) => p[c] ?? null), id);
}

async function loadAllAdmin(env) {
  const products = (await env.DB.prepare('SELECT * FROM products ORDER BY id DESC').all()).results;
  const offers = (await env.DB.prepare(
    `SELECT o.*, r.name AS retailer, r.country FROM offers o JOIN retailers r ON r.id = o.retailer_id ORDER BY r.country, r.name`
  ).all()).results;
  return products.map((p) => ({ ...p, offers: offers.filter((o) => o.product_id === p.id) }));
}
