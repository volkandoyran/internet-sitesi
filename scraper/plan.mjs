// İş akışının ilk adımı: sitede zamanı gelen mağaza var mı, Playwright gerekecek mi?
// GITHUB_OUTPUT'a run=true|false ve render=true|false yazar. Zamanı gelen yoksa iş akışı ~20 saniyede biter.
import { appendFileSync } from 'node:fs';
import { adapterFor, STORES } from './stores.mjs';

const SITE = (process.env.SITE_URL || '').replace(/\/$/, '');
const only = process.env.MAGAZA;
let list = null;
try {
  const r = await fetch(`${SITE}/api/admin/scraper/plan`, { headers: { authorization: 'Bearer ' + (process.env.ADMIN_PASSWORD || '').trim() }, signal: AbortSignal.timeout(30000) });
  if (r.ok) list = (await r.json()).retailers;
  else console.log('Plan alınamadı:', r.status);
} catch (e) { console.log('Plan alınamadı:', e.message); }
if (!list) list = Object.keys(STORES).map((id) => ({ id, scrape: 1, due: true, site: STORES[id].site || '' }));
const todo = list.filter((r) => (only ? r.id === only : r.scrape && (r.due || process.env.HEPSI === '1')));
const render = todo.some((r) => adapterFor(r).render);
// Elle eklenen bağlantılar günde 4 kez (UTC 03, 09, 15, 21) ya da elle başlatınca kontrol edilir
const h = new Date().getUTCHours();
const manual = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' || [3, 9, 15, 21].includes(h);
console.log(`Zamanı gelen: ${todo.map((r) => r.id).join(', ') || 'yok'}${render ? ' · Playwright gerekli' : ''}`);
for (const r of list.filter((x) => x.paused_until)) console.log(`Duraklatılmış: ${r.id} (${r.paused_until} tarihine kadar)`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run=${todo.length > 0}\nrender=${render}\nmanual=${manual}\n`);
