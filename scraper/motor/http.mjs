// Kendi veri toplama motorumuzun ağ katmanı. Ücretli servis kullanmaz.
// - robots.txt kurallarına uyar (User-agent: * grubu; Allow/Disallow, * ve $ desenleri, Crawl-delay)
// - aynı siteye istekler arasında bekler (mağaza ayarı ya da Crawl-delay, hangisi büyükse)
// - ağ hatası / 5xx: sınırlı tekrar (2 kez, artan bekleme)
// - 403 / 429 / CAPTCHA / bot doğrulama sayfası: EngelHatasi fırlatır; motor o mağazayı durdurur ve duraklatır.
//   Engel aşılmaya çalışılmaz (başka IP, proxy, tarayıcı taklidi ya da CAPTCHA çözümü yoktur).
// - site haritaları diskte önbelleğe alınır (ETag / Last-Modified ile koşullu istek; GitHub Actions cache ile kalıcı)
// - Playwright yalnızca "render" işaretli mağazalarda, görsel/font/video/stil dosyaları indirilmeden kullanılır.
import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

// Dürüst bot kimliği: tarayıcı taklidi yapılmaz; mağaza robots.txt'de "UcfiyatBot" adıyla bizi ayrıca sınırlayabilir.
export const BOT = 'UcfiyatBot';
export const UA = `${BOT}/1.0 (+https://github.com/volkandoyran/internet-sitesi; price comparison)`;
const HEADERS = { 'user-agent': UA, 'accept-language': 'tr,el;q=0.8,bg;q=0.7,en;q=0.5', accept: 'text/html,application/xhtml+xml,application/xml' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Üstel geri çekilme + rastgele sapma: 1. tekrar ~2 sn, 2. ~4 sn, 3. ~8 sn (en çok 60 sn)
export const backoff = (attempt, base = 2000, rnd = Math.random()) => Math.min(60000, base * 2 ** (attempt - 1)) + Math.round(rnd * 1000);

export class EngelHatasi extends Error {
  constructor(message, status) { super(message); this.name = 'EngelHatasi'; this.status = status; }
}
export class RobotsHatasi extends Error {
  constructor(url) { super('robots.txt izin vermiyor'); this.name = 'RobotsHatasi'; this.url = url; }
}

// Bot doğrulama / CAPTCHA sayfası mı? (200 dönse bile ürün yerine bu sayfa gelebilir)
export function isChallenge(html) {
  const head = String(html || '').slice(0, 20000);
  return /cf-chl-|challenge-platform|cf_chl_opt|<title>\s*Just a moment|Attention Required! \| Cloudflare|g-recaptcha|h-captcha|hcaptcha\.com|captcha-delivery\.com|px-captcha|_Incapsula_Resource|Pardon Our Interruption|Access Denied<\/title>|Request unsuccessful\. Incapsula/i.test(head);
}

// ---------- robots.txt ----------
export function parseRobots(txt) {
  const groups = [];
  let cur = null, lastWasAgent = false;
  for (const raw of String(txt || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) { cur = { agents: [], rules: [], delay: null }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === 'allow' || key === 'disallow') { if (val || key === 'allow') cur.rules.push({ allow: key === 'allow', path: val }); }
    else if (key === 'crawl-delay' && +val > 0) cur.delay = +val;
  }
  // Önce bize özel grup (UcfiyatBot), yoksa herkes için olan (*) grup geçerlidir
  const g = groups.find((x) => x.agents.some((a) => a.startsWith(BOT.toLowerCase())))
    || groups.find((x) => x.agents.includes('*')) || { rules: [], delay: null };
  return { rules: g.rules.filter((r) => r.path), delay: g.delay };
}
const ruleRe = (p) => new RegExp('^' + p.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$|\$$/, '$'));
export function robotsAllows(robots, url) {
  if (!robots || !robots.rules.length) return true;
  const u = new URL(url);
  const path = u.pathname + u.search;
  let best = null;
  for (const r of robots.rules) {
    if (ruleRe(r.path).test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow;
}

// ---------- Getirici ----------
export class Getirici {
  constructor({ cacheDir = '.cache/scraper', delayMs = 700, log = console.log } = {}) {
    this.cacheDir = cacheDir;
    this.delayMs = delayMs;
    this.log = log;
    this.robots = new Map();   // origin -> {rules, delay}
    this.lastAt = new Map();   // host -> son istek zamanı
    this.seen = new Set();     // bu çalıştırmada açılan ürün sayfaları (aynı URL iki kez çekilmez)
    this.stats = { requests: 0, retries: 0, cacheHits: 0, notModified: 0, rendered: 0 };
    this.byHost = new Map(); // host -> istek sayısı (mağaza başına ölçüm)
    this.browser = null;
    this.renderLock = Promise.resolve();
  }

  async robotsFor(url) {
    const origin = new URL(url).origin;
    if (!this.robots.has(origin)) {
      let parsed = { rules: [], delay: null };
      try {
        const r = await this.raw(origin + '/robots.txt', { timeout: 20000, retries: 1, robots: false });
        if (r.status === 200) parsed = parseRobots(r.text);
        // 401/403 robots.txt: site tamamen kapalı sayılır; 404: kural yok
        else if (r.status === 401 || r.status === 403) parsed = { rules: [{ allow: false, path: '/' }], delay: null, blocked: true };
      } catch (e) { this.log(`  robots.txt okunamadı (${origin}): ${e.message}`); }
      this.robots.set(origin, parsed);
    }
    return this.robots.get(origin);
  }

  async waitTurn(url, minDelay) {
    const host = new URL(url).host;
    const robots = this.robots.get(new URL(url).origin);
    const gap = Math.max(minDelay ?? this.delayMs, robots?.delay ? Math.min(robots.delay, 10) * 1000 : 0) + Math.random() * 400;
    const wait = (this.lastAt.get(host) || 0) + gap - Date.now();
    this.lastAt.set(host, Date.now() + Math.max(0, wait));
    if (wait > 0) await sleep(wait);
  }

  count(url) {
    this.stats.requests++;
    const h = new URL(url).host.replace(/^www\./, '');
    this.byHost.set(h, (this.byHost.get(h) || 0) + 1);
  }
  requestsFor(site) {
    try { return this.byHost.get(new URL(site).host.replace(/^www\./, '')) || 0; } catch { return 0; }
  }

  // Düşük seviye istek: durum kodu ve metin döner (403/429'u hata saymaz; karar çağırana kalır)
  async raw(url, { timeout = 30000, retries = 2, headers = {}, delay, robots = true } = {}) {
    if (robots) {
      const rb = await this.robotsFor(url);
      if (!robotsAllows(rb, url)) throw new RobotsHatasi(url);
    }
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt) { this.stats.retries++; await sleep(backoff(attempt)); }
      await this.waitTurn(url, delay);
      try {
        this.count(url);
        const r = await fetch(url, { headers: { ...HEADERS, ...headers }, redirect: 'follow', signal: AbortSignal.timeout(timeout) });
        if (r.status >= 500 && r.status !== 503 && attempt < retries) { lastErr = new Error(`HTTP ${r.status}`); continue; }
        const text = r.status === 304 ? '' : await decode(r);
        if (r.status === 503 && !isChallenge(text) && attempt < retries) { lastErr = new Error('HTTP 503'); continue; }
        return { status: r.status, text, headers: r.headers, url: r.url };
      } catch (e) {
        lastErr = e.name === 'TimeoutError' ? new Error('zaman aşımı') : e;
      }
    }
    throw lastErr;
  }

  // Ürün sayfası ya da robots dışı her sayfa: 200 değilse ya da engel sayfasıysa hata
  async page(url, opts = {}) {
    const r = await this.raw(url, opts);
    if (r.status === 403 || r.status === 429 || r.status === 401 || isChallenge(r.text)) {
      throw new EngelHatasi(`HTTP ${r.status}${isChallenge(r.text) ? ' (bot doğrulama / CAPTCHA sayfası)' : ' (erişim engellendi)'}`, r.status);
    }
    if (r.status === 503) throw new EngelHatasi('HTTP 503 (site geçici olarak isteği reddetti)', 503);
    if (r.status === 404 || r.status === 410) { const e = new Error(`HTTP ${r.status} (ürün sayfası kaldırılmış)`); e.gone = true; throw e; }
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    return r.text;
  }

  // Site haritası: diskte önbellek. 12 saatten yeniyse hiç istek atılmaz; değilse koşullu istek (304 = değişmemiş).
  async sitemap(url, { maxAgeH = 12, timeout = 90000 } = {}) {
    const key = createHash('sha1').update(url).digest('hex');
    const file = join(this.cacheDir, key + '.json');
    let cached = null;
    try { cached = JSON.parse(await readFile(file, 'utf8')); } catch {}
    if (cached && Date.now() - cached.at < maxAgeH * 3600e3) { this.stats.cacheHits++; return cached.text; }
    const headers = {};
    if (cached?.etag) headers['if-none-match'] = cached.etag;
    if (cached?.modified) headers['if-modified-since'] = cached.modified;
    const r = await this.raw(url, { timeout, headers });
    if (r.status === 304 && cached) {
      this.stats.notModified++;
      await this.save(file, { ...cached, at: Date.now() });
      return cached.text;
    }
    if (r.status === 403 || r.status === 429 || isChallenge(r.text)) throw new EngelHatasi(`Site haritası: HTTP ${r.status}${isChallenge(r.text) ? ' (bot doğrulama)' : ''}`, r.status);
    if (r.status !== 200) throw new Error(`Site haritası HTTP ${r.status}`);
    await this.save(file, { url, at: Date.now(), etag: r.headers.get('etag'), modified: r.headers.get('last-modified'), text: r.text });
    return r.text;
  }

  async save(file, data) {
    try { await mkdir(this.cacheDir, { recursive: true }); await writeFile(file, JSON.stringify(data)); } catch {}
  }

  // JavaScript ile yüklenen sayfalar: Playwright (yalnızca render işaretli mağazalarda). Aynı anda tek sayfa açılır.
  async render(url, { timeout = 45000, delay } = {}) {
    const rb = await this.robotsFor(url);
    if (!robotsAllows(rb, url)) throw new RobotsHatasi(url);
    const run = async () => {
      await this.waitTurn(url, delay);
      if (!this.browser) {
        let chromium;
        try { ({ chromium } = await import('playwright')); } catch { throw new Error('Playwright kurulu değil (iş akışı yalnızca gereken mağaza varsa kurar)'); }
        this.browser = await chromium.launch({ args: ['--disable-dev-shm-usage', '--no-sandbox'] });
        this.ctx = await this.browser.newContext({ userAgent: UA, locale: 'tr-TR', javaScriptEnabled: true });
        // Gereksiz kaynaklar indirilmez: görsel, video, font, stil, reklam/analitik
        await this.ctx.route('**/*', (route) => {
          const req = route.request();
          if (['image', 'media', 'font', 'stylesheet'].includes(req.resourceType())) return route.abort();
          if (/google-analytics|googletagmanager|doubleclick|facebook\.net|hotjar|criteo|adservice|yandex/.test(req.url())) return route.abort();
          return route.continue();
        });
      }
      const page = await this.ctx.newPage();
      try {
        this.stats.rendered++; this.count(url);
        const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
        const status = resp ? resp.status() : 0;
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
        const html = await page.content();
        if (status === 403 || status === 429 || isChallenge(html)) throw new EngelHatasi(`HTTP ${status}${isChallenge(html) ? ' (bot doğrulama / CAPTCHA sayfası)' : ' (erişim engellendi)'}`, status);
        if (status === 404 || status === 410) { const e = new Error(`HTTP ${status} (ürün sayfası kaldırılmış)`); e.gone = true; throw e; }
        if (status && status !== 200) throw new Error(`HTTP ${status}`);
        return html;
      } finally { await page.close().catch(() => {}); }
    };
    const p = this.renderLock.then(run, run);
    this.renderLock = p.catch(() => {});
    return p;
  }

  async close() { if (this.browser) await this.browser.close().catch(() => {}); }
}

async function decode(r) {
  let buf = Buffer.from(await r.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) { try { buf = gunzipSync(buf); } catch {} }
  // Karakter kodlaması: başlıktan ya da <meta charset> etiketinden (e-shop.gr ISO-8859-7 kullanıyor)
  const head = buf.subarray(0, 3000).toString('latin1');
  const cs = ((r.headers.get('content-type') || '').match(/charset=([\w-]+)/i) || head.match(/charset=["']?([\w-]+)/i) || [])[1] || 'utf-8';
  try { return new TextDecoder(cs.toLowerCase()).decode(buf); } catch { return buf.toString('utf8'); }
}
