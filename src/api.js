// API. env.DB = D1, env.ADMIN_PASSWORD = gizli anahtar.
import { cpuScore, gpuScore, parseQuery, distance } from '../lib/specs.js';
import { cleanSpecs } from '../lib/pcspecs.js';

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
    if (parts[0] === 'retailers') return json(await publicRetailers(env));
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
// Herkese açık liste: tarayıcı ayarları ve hata mesajları gösterilmez
const publicRetailers = async (env) =>
  (await env.DB.prepare('SELECT id, name, country, site, currency, active FROM retailers ORDER BY country, name').all()).results;

async function ads(env) {
  const rows = (await env.DB.prepare(
    `SELECT key, value FROM settings WHERE key IN (${AD_KEYS.map(() => '?').join(',')})`
  ).bind(...AD_KEYS).all()).results;
  return Object.fromEntries(rows.map((r) => [r.key, r.value || '']));
}

// Ürünleri, aktif satıcılardaki teklifleriyle birlikte getir
export async function loadProducts(env, where = '', binds = []) {
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

export async function rateFor(env, currency) {
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

  // Fiyat çekicinin toplu sonucu: { rates: {TRY: 50.1}, results: [{id, price, currency, in_stock, old_price, error}] }
  // Fiyat değişmediyse yalnızca kontrol zamanı yazılır; geçmişe yeni satır eklenmez.
  if (res === 'prices' && method === 'POST') {
    const stmts = [];
    for (const [cur, rate] of Object.entries(body.rates || {})) {
      if (rate > 0) stmts.push(env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind('rate_' + cur, String(rate)));
    }
    const now = new Date().toISOString();
    let ok = 0, changed = 0;
    const results = (body.results || []).slice(0, 200);
    const ids = results.map((r) => +r.id).filter(Number.isInteger);
    const prev = new Map();
    for (let i = 0; i < ids.length; i += 90) {
      const part = ids.slice(i, i + 90);
      const rows = (await env.DB.prepare(`SELECT id, price, currency FROM offers WHERE id IN (${part.map(() => '?').join(',')})`).bind(...part).all()).results;
      for (const r of rows) prev.set(r.id, r);
    }
    for (const r of results) {
      if (r.error || !(r.price > 0)) {
        stmts.push(env.DB.prepare('UPDATE offers SET last_error = ?, checked_at = ? WHERE id = ? AND manual = 0').bind(String(r.error || 'Fiyat bulunamadı').slice(0, 300), now, r.id));
        continue;
      }
      const rate = r.currency === 'EUR' ? 1 : (body.rates || {})[r.currency] || (await rateFor(env, r.currency));
      if (!rate) continue;
      const eur = Math.round((r.price / rate) * 100) / 100;
      const old = r.old_price > r.price ? +r.old_price : null;
      stmts.push(env.DB.prepare(
        `UPDATE offers SET price = ?, currency = ?, price_eur = ?, in_stock = ?, old_price = ?, last_error = NULL, updated_at = ?, checked_at = ? WHERE id = ? AND manual = 0`
      ).bind(r.price, r.currency, eur, r.in_stock === false ? 0 : 1, old, now, now, r.id));
      if (priceChanged(prev.get(+r.id), r.price, r.currency)) {
        stmts.push(env.DB.prepare('INSERT INTO price_history (offer_id, price_eur, price, currency) VALUES (?, ?, ?, ?)').bind(r.id, eur, r.price, r.currency));
        changed++;
      }
      ok++;
    }
    for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
    return json({ ok: true, updated: ok, changed });
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

  // Veri toplama motoru (scraper/): plan, rapor, durum, elle çalıştırma
  if (res === 'scraper') return await scraperApi(parts.slice(1), method, body, env);

  // Bir ürünün tüm mağaza fiyatları ve fiyat değişim geçmişi
  if (res === 'history' && method === 'GET') {
    const offers = (await env.DB.prepare(
      `SELECT o.id, o.retailer_id, r.name AS retailer, r.country, o.url, o.price, o.currency, o.price_eur, o.old_price,
              o.in_stock, o.updated_at, o.checked_at, o.last_error FROM offers o JOIN retailers r ON r.id = o.retailer_id WHERE o.product_id = ?`
    ).bind(id).all()).results;
    const history = (await env.DB.prepare(
      `SELECT h.offer_id, h.price_eur, h.price, h.currency, h.at FROM price_history h JOIN offers o ON o.id = h.offer_id
        WHERE o.product_id = ? ORDER BY h.at DESC LIMIT 300`
    ).bind(id).all()).results;
    return json({ offers, history });
  }

  if (res === 'retailers') {
    if (method === 'GET') return json(await retailers(env));
    if (method === 'PUT') {
      // Eski panel yalnızca active/scrape gönderir; diğer alanlar gönderildiyse güncellenir
      const sets = ['active = ?', 'scrape = ?'];
      const vals = [body.active ? 1 : 0, body.scrape ? 1 : 0];
      if (body.interval_hours != null) {
        const h = Math.round(+body.interval_hours);
        if (!(h >= 1 && h <= 168)) return fail('Tarama sıklığı 1-168 saat arasında olmalı.');
        sets.push('interval_hours = ?'); vals.push(h);
      }
      if ('config' in body) {
        const c = checkConfig(body.config);
        if (c.error) return fail(c.error);
        sets.push('config = ?'); vals.push(c.value);
      }
      if (body.name) { sets.push('name = ?'); vals.push(String(body.name).slice(0, 80)); }
      if (body.site != null) {
        if (body.site && !/^https?:\/\//.test(body.site)) return fail('Site adresi http:// ya da https:// ile başlamalı.');
        sets.push('site = ?'); vals.push(String(body.site));
      }
      if (body.resume) { sets.push('paused_until = NULL', 'fail_count = 0'); }
      await env.DB.prepare(`UPDATE retailers SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, parts[1]).run();
      return json({ ok: true });
    }
    if (method === 'POST') {
      if (!body.id || !/^[a-z0-9-]{2,40}$/.test(body.id) || !body.name || !['TR', 'GR', 'BG'].includes(body.country)) return fail('Satıcı kimliği (küçük harf, rakam, tire), adı ve ülkesi (TR/GR/BG) zorunlu.');
      if (body.site && !/^https?:\/\//.test(body.site)) return fail('Site adresi http:// ya da https:// ile başlamalı.');
      const c = checkConfig(body.config);
      if (c.error) return fail(c.error);
      await env.DB.prepare('INSERT INTO retailers (id, name, country, site, currency, config, interval_hours) VALUES (?,?,?,?,?,?,?)')
        .bind(body.id, body.name, body.country, body.site || '', body.country === 'TR' ? 'TRY' : 'EUR', c.value, Math.min(168, Math.max(1, Math.round(+body.interval_hours || 6)))).run();
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
    // Benzersizlik: aynı mağaza + aynı ürün bağlantısı tek teklif (yeniden eklenmez, güncellenir)
    const offer = await env.DB.prepare('SELECT id, product_id, manual, price, currency FROM offers WHERE retailer_id = ? AND url = ?').bind(it.retailer_id, it.url).first();
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
      if (offer) await env.DB.prepare('UPDATE offers SET last_error = ?, checked_at = ? WHERE id = ? AND manual = 0').bind(String(it.error || 'Fiyat bulunamadı').slice(0, 300), now, offer.id).run();
      out.errors++;
      continue;
    }
    // Sayfada para birimi yazmıyorsa mağazanınki kullanılır (TR mağazası fiyatı euro sanılmasın)
    const currency = it.currency || currencyOf.get(it.retailer_id) || 'EUR';
    const rate = currency === 'EUR' ? 1 : (body.rates || {})[currency] || (await rateFor(env, currency));
    if (!rate) { out.errors++; continue; }
    const eur = Math.round((it.price / rate) * 100) / 100;
    const oldPrice = it.old_price > it.price ? +it.old_price : null;
    const storeCat = it.store_category ? String(it.store_category).slice(0, 200) : null;
    if (offer) {
      if (offer.manual) continue;
      // Fiyat değişmediyse geçmişe satır yazılmaz; yalnızca kontrol zamanı ve stok güncellenir
      const moved = priceChanged(offer, it.price, currency);
      await env.DB.batch([
        env.DB.prepare('UPDATE offers SET price = ?, currency = ?, price_eur = ?, in_stock = ?, old_price = ?, store_category = COALESCE(?, store_category), last_error = NULL, updated_at = ?, checked_at = ? WHERE id = ?')
          .bind(it.price, currency, eur, it.in_stock === false ? 0 : 1, oldPrice, storeCat, now, now, offer.id),
        ...(moved ? [env.DB.prepare('INSERT INTO price_history (offer_id, price_eur, price, currency) VALUES (?, ?, ?, ?)').bind(offer.id, eur, it.price, currency)] : []),
        // Sınıflandırma/özellik kuralları düzeltildiyse eski kayıt da düzelsin
        // (ör. "DESKTOP ... CORE I5" işlemci sanılmıştı, "RTX 4070 8GB" RAM 8 GB sanılmıştı)
        ...(it.type ? [refreshProduct(env, offer.product_id, it)] : []),
      ]);
      out.updated++;
      if (moved) out.changed = (out.changed || 0) + 1; else out.unchanged = (out.unchanged || 0) + 1;
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
      const sp = cleanSpecs(it.specs);
      p.specs = sp ? JSON.stringify(sp) : null;
      p.description = cleanText(it.description, 1000);
      // Not: dıştaki "keys" (eşleştirme anahtarları) ile karışmasın; aynı ad 22 Kasım'da tüm yeni ürün kayıtlarını durdurmuştu
      const cols = Object.keys(p).filter((k) => p[k] != null);
      const row = await env.DB.prepare(`INSERT INTO products (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')}) RETURNING id`)
        .bind(...cols.map((k) => p[k])).first();
      productId = row.id;
    }
    const row = await env.DB.prepare(
      `INSERT INTO offers (product_id, retailer_id, url, price, currency, price_eur, in_stock, manual, updated_at, checked_at, old_price, store_category)
       VALUES (?,?,?,?,?,?,?,0,?,?,?,?) RETURNING id`
    ).bind(productId, it.retailer_id, it.url, it.price, currency, eur, it.in_stock === false ? 0 : 1, now, now, oldPrice, storeCat).first();
    await env.DB.prepare('INSERT INTO price_history (offer_id, price_eur, price, currency) VALUES (?, ?, ?, ?)').bind(row.id, eur, it.price, currency).run();
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
  // Mağaza sayfasındaki teknik özellikler mevcut olanlarla birleştirilir (aynı ürün birden çok mağazadan gelebilir)
  const sp = cleanSpecs(it.specs);
  return env.DB.prepare(`UPDATE products SET type = ?, category = ?, ${cols.map((c) => `${c} = COALESCE(?, ${c})`).join(', ')},
      specs = CASE WHEN ? IS NULL THEN specs ELSE json_patch(COALESCE(specs, '{}'), ?) END,
      description = COALESCE(description, ?) WHERE id = ?`)
    .bind(it.type, it.category || null, ...cols.map((c) => p[c] ?? null), sp ? JSON.stringify(sp) : null, sp ? JSON.stringify(sp) : null,
      cleanText(it.description, 1000), id);
}

const cleanText = (v, max) => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, max) : null);

// Mağazanın kendi para birimindeki fiyat değişti mi? (kur oynaması fiyat değişimi sayılmaz)
export function priceChanged(prev, price, currency) {
  if (!prev || prev.price == null) return true;
  if ((prev.currency || null) !== (currency || null)) return true;
  return Math.abs(+prev.price - +price) >= 0.005;
}

// Mağaza adaptör ayarı (admin panelinden). Boş bırakılabilir. Örnek:
// {"sitemaps":["https://site/sitemap.xml"],"robotsSitemaps":true,"urlPattern":"/urun/","render":false,
//  "selectors":{"name":"h1","price":".price","old_price":".old-price","in_stock":".stock","image":"img.main@src"}}
const CONFIG_KEYS = ['sitemaps', 'robotsSitemaps', 'urlPattern', 'render', 'selectors', 'currency', 'newLimit', 'refreshLimit', 'delayMs'];
export function checkConfig(raw) {
  if (raw == null || raw === '' || (typeof raw === 'string' && !raw.trim())) return { value: null };
  let c;
  try { c = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return { error: 'Adaptör ayarı geçerli JSON değil.' }; }
  if (!c || typeof c !== 'object' || Array.isArray(c)) return { error: 'Adaptör ayarı bir JSON nesnesi olmalı.' };
  const extra = Object.keys(c).filter((k) => !CONFIG_KEYS.includes(k));
  if (extra.length) return { error: 'Bilinmeyen ayar: ' + extra.join(', ') + '. Geçerli: ' + CONFIG_KEYS.join(', ') };
  if (c.sitemaps && (!Array.isArray(c.sitemaps) || c.sitemaps.some((u) => !/^https?:\/\//.test(u)))) return { error: 'sitemaps, http(s) adreslerinden oluşan bir liste olmalı.' };
  if (c.urlPattern) { try { new RegExp(c.urlPattern); } catch { return { error: 'urlPattern geçerli bir düzenli ifade değil.' }; } }
  if (c.selectors && (typeof c.selectors !== 'object' || Array.isArray(c.selectors))) return { error: 'selectors bir nesne olmalı.' };
  const value = JSON.stringify(c);
  if (value.length > 4000) return { error: 'Adaptör ayarı çok uzun.' };
  return { value };
}

// ---------- Veri toplama motoru ----------
const RUN_FIELDS = ['pages', 'added', 'changed', 'unchanged', 'errors'];
async function scraperApi(parts, method, body, env) {
  const [what, arg] = parts;
  const now = new Date();
  const iso = now.toISOString();
  // GitHub Actions saatte bir sorar: hangi mağazaların zamanı geldi?
  if (what === 'plan' && method === 'GET') {
    const rows = await retailers(env);
    const plan = rows.map((r) => {
      const paused = r.paused_until && r.paused_until > iso;
      const next = r.last_run_at ? Date.parse(r.last_run_at) + (r.interval_hours || 6) * 3600e3 - 10 * 60e3 : 0; // 10 dk tolerans
      const due = !!r.scrape && !paused && (r.run_requested === 1 || !Number.isFinite(next) || next <= now.getTime());
      return { id: r.id, name: r.name, country: r.country, site: r.site, currency: r.currency, active: r.active, scrape: r.scrape,
        interval_hours: r.interval_hours, config: r.config ? JSON.parse(r.config) : null, paused_until: paused ? r.paused_until : null,
        run_requested: r.run_requested === 1, last_run_at: r.last_run_at, due };
    });
    return json({ now: iso, retailers: plan });
  }
  // Tarama sonucu: { runs: [{retailer_id, started_at, finished_at, ok, blocked, pause_hours, message, pages, added, changed, unchanged, errors}] }
  if (what === 'report' && method === 'POST') {
    const known = new Set((await retailers(env)).map((r) => r.id));
    const stmts = [];
    for (const r of (body.runs || []).slice(0, 40)) {
      if (!known.has(r.retailer_id)) continue;
      const n = RUN_FIELDS.map((k) => Math.max(0, Math.round(+r[k] || 0)));
      const msg = r.message ? String(r.message).slice(0, 500) : null;
      const at = r.finished_at || iso;
      stmts.push(env.DB.prepare(`INSERT INTO scrape_runs (retailer_id, started_at, finished_at, ok, blocked, ${RUN_FIELDS.join(', ')}, message) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(r.retailer_id, r.started_at || iso, at, r.ok ? 1 : 0, r.blocked ? 1 : 0, ...n, msg));
      if (r.ok) {
        stmts.push(env.DB.prepare('UPDATE retailers SET last_run_at = ?, last_ok_at = ?, run_requested = 0, fail_count = 0, paused_until = NULL WHERE id = ?').bind(at, at, r.retailer_id));
      } else {
        // Engel (403/429/CAPTCHA): mağaza duraklatılır; art arda engelde bekleme uzar (24 saat, 48, ... en çok 7 gün)
        const hours = r.blocked ? Math.min(168, Math.max(1, +r.pause_hours || 24)) : 0;
        stmts.push(env.DB.prepare(`UPDATE retailers SET last_run_at = ?, last_error_at = ?, last_error = ?, run_requested = 0, fail_count = fail_count + 1,
            paused_until = CASE WHEN ? > 0 THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+' || MIN(168, ? * (fail_count + 1)) || ' hours') ELSE paused_until END WHERE id = ?`)
          .bind(at, at, msg || 'Bilinmeyen hata', hours, hours, r.retailer_id));
      }
    }
    // 60 günden eski tarama kayıtları silinir (yalnızca özet tablo; ürün ve fiyat verisine dokunulmaz)
    stmts.push(env.DB.prepare("DELETE FROM scrape_runs WHERE started_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-60 days')"));
    await env.DB.batch(stmts);
    return json({ ok: true, saved: stmts.length - 1 });
  }
  // Panel: mağaza durumu, ürün sayıları ve son çalıştırmalar
  if (what === 'status' && method === 'GET') {
    const [rows, counts, runs] = await Promise.all([
      retailers(env),
      env.DB.prepare(`SELECT retailer_id, COUNT(*) AS offers, COUNT(DISTINCT product_id) AS products, SUM(last_error IS NOT NULL) AS errors,
          MAX(checked_at) AS last_checked FROM offers GROUP BY retailer_id`).all(),
      env.DB.prepare('SELECT * FROM scrape_runs ORDER BY id DESC LIMIT 60').all(),
    ]);
    const by = new Map(counts.results.map((c) => [c.retailer_id, c]));
    return json({
      now: iso,
      github: !!env.GITHUB_TOKEN,
      retailers: rows.map((r) => ({ ...r, config: r.config ? JSON.parse(r.config) : null, ...(by.get(r.id) || { offers: 0, products: 0, errors: 0 }) })),
      runs: runs.results,
    });
  }
  // "Şimdi çalıştır": mağaza bir sonraki saatlik turda taranır. GITHUB_TOKEN ayarlıysa tarama hemen başlatılır.
  if (what === 'run' && method === 'POST') {
    const id = arg && arg !== 'all' ? arg : null;
    const r = await env.DB.prepare(`UPDATE retailers SET run_requested = 1, paused_until = NULL WHERE scrape = 1 ${id ? 'AND id = ?' : ''}`).bind(...(id ? [id] : [])).run();
    let started = false, note = null;
    if (env.GITHUB_TOKEN) {
      const repo = env.GITHUB_REPO || 'volkandoyran/internet-sitesi';
      const g = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/scrape.yml/dispatches`, {
        method: 'POST',
        headers: { authorization: 'Bearer ' + env.GITHUB_TOKEN, accept: 'application/vnd.github+json', 'user-agent': 'ucfiyat-admin', 'content-type': 'application/json' },
        body: JSON.stringify({ ref: 'main', inputs: id ? { magaza: id } : {} }),
      });
      started = g.status === 204;
      if (!started) note = 'GitHub tetiklenemedi (' + g.status + '); bir sonraki saatlik turda çalışacak.';
    }
    return json({ ok: true, queued: r.meta?.changes ?? null, started, note });
  }
  return fail('Bulunamadı', 404);
}

async function loadAllAdmin(env) {
  const products = (await env.DB.prepare('SELECT * FROM products ORDER BY id DESC').all()).results;
  const offers = (await env.DB.prepare(
    `SELECT o.*, r.name AS retailer, r.country FROM offers o JOIN retailers r ON r.id = o.retailer_id ORDER BY r.country, r.name`
  ).all()).results;
  return products.map((p) => ({ ...p, offers: offers.filter((o) => o.product_id === p.id) }));
}
