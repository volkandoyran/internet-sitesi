// Kısa dikey haber videoları (YouTube Shorts, Instagram Reels).
// Video, ücretsiz GitHub Actions içinde üretilir (gundem-sitesi/video/uret.py: Piper seslendirme +
// FFmpeg). Bu modül o işe sıradaki uygun haberi verir, biten videoyu R2'de saklayıp herkese açık
// sunar (Instagram videoyu bu adresten çeker) ve platform sonuçlarını `paylasimlar` tablosuna yazar.
// Onay beklenmez; onun yerine kurallar: en az iki kaynak, hassas konular hariç, günlük sınır, acil durdurma.

const SAAT = 3600e3;
const sayi = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);

export const videoAyarlari = (env) => ({
  gunluk: sayi(env.VIDEO_GUNLUK, 4),          // 24 saatte en fazla video
  saat: sayi(env.VIDEO_SAAT, 8),              // bundan eski haberden video yapılmaz
  enAzKaynak: sayi(env.VIDEO_EN_AZ_KAYNAK, 2),
  saklaSaat: sayi(env.VIDEO_SAKLA_SAAT, 48),  // R2'deki dosya bu süre sonra silinir
});

// Videoya çevrilmeyen konular (haber sitede kalır). Yanlış ya da hassas haberin onaysız videoya
// dönüşüp hesabı riske atmaması için bilinçli olarak geniş tutuldu.
const HASSAS = [
  // siyaset
  'seçim', 'secim', 'cumhurbaşkan', 'bakan', 'milletvekil', 'meclis', 'parti', 'chp', 'akp', 'ak parti', 'mhp', 'dem parti',
  'iyi parti', 'muhalefet', 'iktidar', 'erdoğan', 'özgür özel', 'bahçeli', 'imamoğlu', 'kılıçdaroğlu', 'darbe', 'protesto', 'terör',
  'election', 'president', 'minister', 'parliament', 'trump', 'putin', 'netanyahu',
  // sağlık
  'hastalık', 'kanser', 'virüs', 'salgın', 'aşısı', 'aşılama', 'ilaç', 'tedavi', 'covid', 'grip',
  // suç ve yargı
  'cinayet', 'öldür', 'gözaltı', 'tutukla', 'operasyon', 'şüpheli', 'sanık', 'mahkeme', 'dava', 'savcı', 'iddianame',
  'tecavüz', 'istismar', 'taciz', 'saldırı', 'bıçak', 'silah', 'uyuşturucu', 'intihar', 'cesed', 'ceset',
];

const kucuk = (s) => String(s || '').toLocaleLowerCase('tr-TR');
const kelimeVar = (metin, k) => new RegExp(`(^|[^\\p{L}])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(metin);

export function hassasMi(h) {
  const t = kucuk(`${h.baslik} ${h.metin || ''}`);
  return HASSAS.some((k) => kelimeVar(t, kucuk(k)));
}

const kaynakListesi = (h) => (Array.isArray(h.kaynaklar) ? h.kaynaklar : JSON.parse(h.kaynaklar || '[]'));
export const kaynakAdlari = (h) => [...new Set(kaynakListesi(h).map((k) => k.ad))].slice(0, 3);

export function videoyaUygun(h, a = { enAzKaynak: 2 }) {
  if (!h.metin) return false;
  if (kaynakAdlari(h).length < a.enAzKaynak) return false;
  return !hassasMi(h);
}

const hashtagsiz = (s) => String(s || '').replace(/#[\p{L}\p{N}_]+/gu, '').replace(/\s+/g, ' ').trim();
const nokta = (s) => (/[.!?…]$/.test(s) ? s : `${s}.`);

// Seslendirilecek metin: başlık, botun yazdığı kısa metin, kaynak adları (bağlantı yok)
export function seslendirme(h) {
  const govde = hashtagsiz(h.metin).replace(/…$/, '.');
  const bas = h.baslik.trim();
  const parca = [nokta(bas)];
  if (govde && !kucuk(govde).startsWith(kucuk(bas).slice(0, 40))) parca.push(nokta(govde));
  parca.push(`Kaynak: ${kaynakAdlari(h).join(', ')}.`);
  return parca.join(' ');
}

export function videoBasligi(h) {
  const b = h.baslik.trim();
  return (b.length > 90 ? `${b.slice(0, 89).replace(/\s+\S*$/, '')}…` : b) + ' #Shorts';
}

// Platform açıklaması: metin + kaynak adları + yapay zekâ notu. Bağlantı yok.
export function videoAciklamasi(h) {
  const etiketler = (String(h.metin || '').match(/#[\p{L}\p{N}_]+/gu) || []).slice(0, 2);
  return [
    nokta(hashtagsiz(h.metin) || h.baslik),
    `Kaynak: ${kaynakAdlari(h).join(', ')}`,
    'Bu video yapay zekâ ile seslendirildi.',
    [...new Set(['#haber', '#gündem', ...etiketler])].join(' '),
  ].join('\n\n');
}

async function anahtarDogru(env, verilen) {
  if (!env.VIDEO_ANAHTAR || !verilen) return false;
  const h = async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([h(env.VIDEO_ANAHTAR), h(verilen)]);
  return a.every((x, i) => x === b[i]);
}

const iso = (ms) => new Date(ms).toISOString();

// Eski video dosyalarını R2'den sil (kayıt kalır, aynı haberden ikinci video yapılmaz)
async function temizle(env, a, simdi) {
  const eski = (await env.DB.prepare("SELECT haber_id FROM videolar WHERE dosya = 1 AND zaman < ?")
    .bind(iso(simdi - a.saklaSaat * SAAT)).all()).results;
  if (!eski.length || !env.VIDEO) return;
  await env.VIDEO.delete(eski.map((r) => `${r.haber_id}.mp4`));
  await env.DB.batch(eski.map((r) => env.DB.prepare('UPDATE videolar SET dosya = 0 WHERE haber_id = ?').bind(r.haber_id)));
}

async function siradaki(env, simdi = Date.now()) {
  const a = videoAyarlari(env);
  await temizle(env, a, simdi);
  if (env.OTOMATIK_PAYLASIM === '0') return { neden: 'otomatik paylaşım kapalı (OTOMATIK_PAYLASIM=0)' };
  const bugun = (await env.DB.prepare("SELECT COUNT(*) AS n FROM videolar WHERE zaman >= ? AND durum != 'hata'")
    .bind(iso(simdi - 24 * SAAT)).first()).n;
  if (bugun >= a.gunluk) return { neden: `günlük sınır doldu (${bugun}/${a.gunluk})` };
  const adaylar = (await env.DB.prepare(`SELECT h.* FROM haberler h WHERE h.metin IS NOT NULL AND h.ilk_gorulme >= ?
    AND h.kaynak_sayisi >= ? AND NOT EXISTS (SELECT 1 FROM videolar v WHERE v.haber_id = h.id)
    ORDER BY h.kaynak_sayisi DESC, h.ilk_gorulme DESC LIMIT 40`).bind(iso(simdi - a.saat * SAAT), a.enAzKaynak).all()).results;
  const h = adaylar.find((x) => videoyaUygun(x, a));
  if (!h) return { neden: 'uygun haber yok' };
  await env.DB.prepare("INSERT INTO videolar (haber_id, durum, zaman) VALUES (?, 'uretiliyor', ?)").bind(h.id, iso(simdi)).run();
  return {
    haber: {
      id: h.id,
      baslik: h.baslik,
      seslendirme: seslendirme(h),
      kaynak: `Kaynak: ${kaynakAdlari(h).join(', ')}`,
      videoBasligi: videoBasligi(h),
      aciklama: videoAciklamasi(h),
    },
  };
}

const PLATFORM = new Set(['youtube', 'instagram', 'tiktok']);

// /api/video/* ve /video/<id>.mp4 isteklerini karşılar; başka yolsa null döner.
export async function videoIstek(req, env, yol) {
  const dosya = yol.match(/^\/video\/(\d+)\.mp4$/);
  if (dosya && (req.method === 'GET' || req.method === 'HEAD')) {
    if (!env.VIDEO) return new Response('Video deposu bağlı değil', { status: 404 });
    const o = await env.VIDEO.get(`${dosya[1]}.mp4`, { range: req.headers });
    if (!o) return new Response('Bulunamadı', { status: 404 });
    const h = new Headers({ 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=3600', etag: o.httpEtag });
    if (req.headers.has('range') && o.range && 'offset' in o.range) {
      const bas = o.range.offset, son = bas + (o.range.length ?? o.size - bas) - 1;
      h.set('content-range', `bytes ${bas}-${son}/${o.size}`);
      h.set('content-length', String(son - bas + 1));
      return new Response(req.method === 'HEAD' ? null : o.body, { status: 206, headers: h });
    }
    h.set('content-length', String(o.size));
    return new Response(req.method === 'HEAD' ? null : o.body, { headers: h });
  }
  if (!yol.startsWith('/api/video')) return null;
  if (!(await anahtarDogru(env, req.headers.get('x-video-anahtar')))) return Response.json({ hata: 'yetkisiz' }, { status: 401 });

  if (yol === '/api/video/sira' && req.method === 'POST') return Response.json(await siradaki(env));

  const yukle = yol.match(/^\/api\/video\/(\d+)\/dosya$/);
  if (yukle && req.method === 'PUT') {
    if (!env.VIDEO) return Response.json({ hata: 'VIDEO (R2) bağlı değil' }, { status: 500 });
    const id = Number(yukle[1]);
    const v = await env.DB.prepare('SELECT haber_id FROM videolar WHERE haber_id = ?').bind(id).first();
    if (!v) return Response.json({ hata: 'bu haber için video işi yok' }, { status: 404 });
    const boyut = Number(req.headers.get('content-length') || 0);
    if (!boyut || boyut > 95e6) return Response.json({ hata: 'dosya boyutu geçersiz' }, { status: 413 });
    await env.VIDEO.put(`${id}.mp4`, req.body, { httpMetadata: { contentType: 'video/mp4' } });
    await env.DB.prepare("UPDATE videolar SET durum = 'yuklendi', dosya = 1 WHERE haber_id = ?").bind(id).run();
    return Response.json({ url: `${new URL(req.url).origin}/video/${id}.mp4` });
  }

  const sonuc = yol.match(/^\/api\/video\/(\d+)\/sonuc$/);
  if (sonuc && req.method === 'POST') {
    const id = Number(sonuc[1]);
    const b = await req.json().catch(() => ({}));
    if (b.platform === 'uretim') {
      // Üretim başarısız: kayıt 'hata' olur, haber bir daha denenmez
      await env.DB.prepare("UPDATE videolar SET durum = 'hata', hata = ? WHERE haber_id = ?").bind(String(b.hata || '').slice(0, 500), id).run();
      return Response.json({ tamam: true });
    }
    if (!PLATFORM.has(b.platform)) return Response.json({ hata: 'platform geçersiz' }, { status: 400 });
    const hata = b.hata ? String(b.hata).slice(0, 500) : null;
    await env.DB.prepare('INSERT OR REPLACE INTO paylasimlar (haber_id, platform, durum, hata, zaman) VALUES (?, ?, ?, ?, ?)')
      .bind(id, b.platform, hata ? 'hata' : 'paylasildi', hata, iso(Date.now())).run();
    return Response.json({ tamam: true });
  }
  return Response.json({ hata: 'bulunamadı' }, { status: 404 });
}
