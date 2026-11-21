// Gündem botu: Türkçe haber RSS kaynaklarını yarım saatte bir toplar, tekrarları ayıklar,
// her haber için kaynaklı kısa sosyal medya metni yazar ve (platform bağlıysa) otomatik paylaşır.
import SCHEMA from '../schema.sql';
import { topla } from './bot.js';
import { listeSayfasi, kaynakSayfasi } from './sayfa.js';
import { paylasimMetni } from './metin.js';

let hazir = null;
function semaKur(env) {
  hazir ||= env.DB.batch(SCHEMA.replace(/--[^\n]*/g, '').split(';').map((x) => x.trim()).filter(Boolean).map((q) => env.DB.prepare(q)))
    .catch((e) => { hazir = null; throw e; });
  return hazir;
}

const json = (v, s = 200) => new Response(JSON.stringify(v, null, 2), { status: s, headers: { 'content-type': 'application/json; charset=utf-8' } });

// Sabit sürede karşılaştırma
async function sifreDogru(env, verilen) {
  if (!env.ADMIN_PASSWORD || !verilen) return false;
  const h = async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([h(env.ADMIN_PASSWORD), h(verilen)]);
  return a.every((x, i) => x === b[i]);
}

export default {
  async fetch(request, env) {
    await semaKur(env);
    const url = new URL(request.url);
    const yol = url.pathname.replace(/\/+$/, '') || '/';
    if (yol === '/') return listeSayfasi(env, url);
    if (yol === '/kaynaklar') return kaynakSayfasi(env);
    if (yol === '/api/haberler') {
      const { results } = await env.DB.prepare('SELECT * FROM haberler WHERE metin IS NOT NULL ORDER BY ilk_gorulme DESC LIMIT 200').all();
      return json(results.map((r) => {
        const h = { ...r, kaynaklar: JSON.parse(r.kaynaklar), imza: undefined };
        return { ...h, paylasim_metni: paylasimMetni(h) };
      }));
    }
    // Elle çalıştırma: curl -X POST -H "x-admin-sifre: ..." https://<bot>/api/calistir
    if (yol === '/api/calistir' && request.method === 'POST') {
      if (!(await sifreDogru(env, request.headers.get('x-admin-sifre')))) return json({ hata: 'yetkisiz' }, 401);
      return json(await topla(env));
    }
    return new Response('Bulunamadı', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    await semaKur(env);
    const r = await topla(env, event.scheduledTime);
    console.log(JSON.stringify({ gundemBotu: r }));
  },
};
