// Yönetim paneli (/panel): toplanan haberler ve paylaşıma hazır metinler (sunucuda üretilen tek HTML sayfa)
import { paylasimMetni } from './metin.js';
import { KAYNAKLAR } from './kaynaklar.js';
import { PLATFORMLAR, aktifPlatformlar } from './paylas.js';

const kac = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const saat = (iso) => iso ? new Date(iso).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

const STIL = `
:root{--bg:#f6f5f2;--kart:#fff;--yazi:#1d1d1f;--soluk:#6b6b70;--cizgi:#e4e2dc;--vurgu:#b4231b;--yesil:#1f7a3f;--sari:#8a6100}
@media (prefers-color-scheme:dark){:root{--bg:#141415;--kart:#1e1e20;--yazi:#ececee;--soluk:#9a9aa0;--cizgi:#303034;--vurgu:#ff6b5e;--yesil:#5ccf86;--sari:#e0b04a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--yazi);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:760px;margin:0 auto;padding:20px 16px 60px}
header h1{font-size:22px;margin:0 0 4px}header p{margin:0;color:var(--soluk);font-size:14px}
nav{display:flex;gap:14px;margin:14px 0 18px;font-size:14px;flex-wrap:wrap}nav a{color:var(--yazi)}nav a.on{font-weight:700;text-decoration:none}
.bant{border:1px solid var(--cizgi);background:var(--kart);border-radius:10px;padding:10px 12px;font-size:14px;margin-bottom:16px}
.kart{background:var(--kart);border:1px solid var(--cizgi);border-radius:12px;padding:14px;margin-bottom:12px}
.ust{display:flex;gap:8px;align-items:center;font-size:12.5px;color:var(--soluk);flex-wrap:wrap;margin-bottom:8px}
.rozet{border-radius:999px;padding:1px 8px;border:1px solid var(--cizgi);font-weight:600}
.rozet.cok{color:var(--vurgu);border-color:currentColor}.rozet.ok{color:var(--yesil);border-color:currentColor}.rozet.bek{color:var(--sari);border-color:currentColor}
pre{white-space:pre-wrap;word-break:break-word;margin:0;font:inherit;background:var(--bg);border-radius:8px;padding:10px 12px}
.alt{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-top:10px;font-size:13px;color:var(--soluk)}
.alt ul{margin:0;padding-left:18px}.alt a{color:inherit}
button{font:inherit;font-size:13px;border:1px solid var(--cizgi);background:var(--kart);color:var(--yazi);border-radius:8px;padding:5px 10px;cursor:pointer;white-space:nowrap}
table{width:100%;border-collapse:collapse;font-size:14px;background:var(--kart);border-radius:12px;overflow:hidden}
td,th{text-align:left;padding:8px 10px;border-bottom:1px solid var(--cizgi);vertical-align:top}.hata{color:var(--vurgu)}
.bos{color:var(--soluk);text-align:center;padding:40px 0}`;

function kabuk(baslik, secili, govde) {
  return new Response(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${kac(baslik)}</title><style>${STIL}</style></head><body><main>
<header><h1>Gündem paneli</h1><p>Türkçe haber kaynaklarından toplanan, tekrarları ayıklanmış gündem ve paylaşıma hazır kısa metinler.</p></header>
<nav><a href="/">← Siteye dön</a><a href="/panel" class="${secili === 'liste' ? 'on' : ''}">Haberler</a><a href="/panel?cok=1" class="${secili === 'cok' ? 'on' : ''}">Birden çok kaynakta</a><a href="/panel/kaynaklar" class="${secili === 'kaynak' ? 'on' : ''}">Kaynaklar</a></nav>
${govde}</main>
<script>document.addEventListener('click',e=>{const b=e.target.closest('button[data-kopya]');if(!b)return;
navigator.clipboard.writeText(document.getElementById(b.dataset.kopya).innerText).then(()=>{b.textContent='Kopyalandı';setTimeout(()=>b.textContent='Kopyala',1500)})})</script>
</body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function listeSayfasi(env, url) {
  const cok = url.searchParams.get('cok') === '1';
  const { results } = await env.DB.prepare(`SELECT h.*, (SELECT group_concat(platform || ':' || durum) FROM paylasimlar s WHERE s.haber_id = h.id) AS paylasim
    FROM haberler h WHERE h.metin IS NOT NULL ${cok ? 'AND h.kaynak_sayisi > 1' : ''} ORDER BY h.ilk_gorulme DESC, h.kaynak_sayisi DESC LIMIT 150`).all();
  const aktif = aktifPlatformlar(env);
  const bant = aktif.length
    ? `Otomatik paylaşım <b>açık</b>: ${aktif.map((p) => kac(p.ad)).join(', ')}. Bot her yarım saatte en çok konuşulan yeni haberleri onaysız paylaşır.`
    : `Otomatik paylaşım <b>kapalı</b>: henüz bir platform bağlanmadı, haberler yalnızca burada listeleniyor. Desteklenen: ${PLATFORMLAR.map((p) => kac(p.ad)).join(', ')}.`;
  const kartlar = results.map((r) => {
    const h = { ...r, kaynaklar: JSON.parse(r.kaynaklar) };
    const pay = (r.paylasim || '').split(',').filter(Boolean);
    const durum = pay.some((x) => x.endsWith(':paylasildi')) ? '<span class="rozet ok">Paylaşıldı</span>'
      : pay.length ? '<span class="rozet bek">Paylaşım hatası</span>'
      : aktif.length ? '<span class="rozet bek">Sırada</span>' : '';
    return `<article class="kart"><div class="ust"><span>${saat(h.ilk_gorulme)}</span>
${h.kaynak_sayisi > 1 ? `<span class="rozet cok">${h.kaynak_sayisi} kaynak</span>` : ''}
<span>${h.metin_turu === 'ai' ? 'Yapay zekâ metni' : 'Şablon metni'}</span>${durum}</div>
<pre id="m${h.id}">${kac(paylasimMetni(h))}</pre>
<div class="alt"><ul>${h.kaynaklar.map((k) => `<li><a href="${kac(k.url)}" rel="noopener" target="_blank">${kac(k.ad)}</a>: ${kac(k.baslik)}</li>`).join('')}</ul>
<button data-kopya="m${h.id}">Kopyala</button></div></article>`;
  }).join('');
  return kabuk('Gündem paneli', cok ? 'cok' : 'liste', `<div class="bant">${bant}</div>${kartlar || '<p class="bos">Henüz haber yok. İlk toplama birkaç dakika içinde çalışır.</p>'}`);
}

export async function kaynakSayfasi(env) {
  const d = Object.fromEntries((await env.DB.prepare('SELECT * FROM kaynak_durum').all()).results.map((r) => [r.id, r]));
  const satirlar = KAYNAKLAR.map((k) => {
    const s = d[k.id] || {};
    return `<tr><td><a href="${kac(k.url)}">${kac(k.ad)}</a></td><td>${saat(s.son_basari)}</td><td>${s.haber_sayisi ?? '—'}</td><td class="hata">${kac(s.hata || '')}</td></tr>`;
  }).join('');
  return kabuk('Kaynaklar · Gündem paneli', 'kaynak', `<table><thead><tr><th>Kaynak</th><th>Son başarılı çekim</th><th>Akıştaki haber</th><th>Hata</th></tr></thead><tbody>${satirlar}</tbody></table>`);
}
