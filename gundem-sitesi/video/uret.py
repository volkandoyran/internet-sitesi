#!/usr/bin/env python3
"""Gündem sitesinden sıradaki haberi alır, 9:16 kısa video üretir ve onay beklemeden paylaşır.

Ücretsiz çalışır (GitHub Actions): seslendirme Piper (açık kaynak, Türkçe ses), görüntü FFmpeg.
Haber metni sitedeki botun kendi cümleleridir; videoda ve açıklamada yalnızca kaynak adı geçer.

Ortam değişkenleri
  GUNDEM_URL, VIDEO_ANAHTAR      gündem sitesi adresi ve video anahtarı (zorunlu, KURU=1 hariç)
  PIPER_MODEL                    Türkçe Piper ses modeli (.onnx)
  YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN   YouTube (girilmişse Shorts yüklenir)
  IG_USER_ID, IG_ACCESS_TOKEN    Instagram profesyonel hesap (girilmişse Reels paylaşılır)
  KURU=1                         deneme: siteye bağlanmaz, örnek haberle yalnızca video üretir
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

G, Y = 1080, 1920
FONT = 'DejaVu Sans'
CIKTI = os.environ.get('CIKTI', 'video.mp4')

ORNEK = {
    'id': 0,
    'baslik': "İstanbul'da hafta sonu sağanak yağış bekleniyor",
    'seslendirme': "İstanbul'da hafta sonu sağanak yağış bekleniyor. Meteoroloji, cumartesi öğleden sonra başlayacak yağışın "
                   "pazar sabahına kadar aralıklarla süreceğini açıkladı. Kaynak: Anadolu Ajansı, NTV.",
    'kaynak': 'Kaynak: Anadolu Ajansı, NTV',
    'videoBasligi': "İstanbul'da hafta sonu sağanak yağış bekleniyor #Shorts",
    'aciklama': 'Deneme videosu.',
}


def log(*a):
    print(*a, flush=True)


def istek(url, *, method='GET', veri=None, basliklar=None, json_veri=None, zaman=60):
    b = dict(basliklar or {})
    if json_veri is not None:
        veri = json.dumps(json_veri).encode()
        b['content-type'] = 'application/json'
    r = urllib.request.Request(url, data=veri, method=method, headers=b)
    try:
        with urllib.request.urlopen(r, timeout=zaman) as y:
            govde = y.read()
            return y.status, dict(y.headers), govde
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def jsonla(govde):
    try:
        return json.loads(govde or b'{}')
    except ValueError:
        return {'ham': govde[:300].decode('utf-8', 'replace')}


# ---------- site ----------

def site(yol, **kw):
    b = {'x-video-anahtar': os.environ['VIDEO_ANAHTAR'], **kw.pop('basliklar', {})}
    return istek(os.environ['GUNDEM_URL'].rstrip('/') + yol, basliklar=b, **kw)


def sonuc_bildir(haber_id, platform, hata=None):
    try:
        site(f'/api/video/{haber_id}/sonuc', method='POST', json_veri={'platform': platform, 'hata': hata})
    except Exception as e:  # bildirim hatası paylaşımı bozmasın
        log('Sonuç bildirilemedi:', e)


# ---------- ses ----------

def sure(dosya):
    c = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dosya],
                       capture_output=True, text=True, check=True)
    return float(c.stdout.strip())


def seslendir(metin, dosya):
    model = os.environ.get('PIPER_MODEL')
    if model and shutil.which('piper'):
        subprocess.run(['piper', '--model', model, '--output_file', dosya, '--sentence_silence', '0.35'],
                       input=metin.encode(), check=True)
        return
    if os.environ.get('KURU') != '1':
        raise RuntimeError('Piper ya da PIPER_MODEL bulunamadı')
    # Yerel deneme: Piper yoksa metin uzunluğunda sessiz ses
    sn = max(6, len(metin) / 14)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=22050:cl=mono', '-t', f'{sn:.2f}', dosya], check=True)


# ---------- altyazı ----------

def parcala(metin, en_fazla=5):
    """Seslendirmeyi ekranda gösterilecek kısa parçalara böler (cümle sonunda yeni parça)."""
    parcalar, simdi = [], []
    for k in metin.split():
        simdi.append(k)
        if len(simdi) >= en_fazla or re.search(r'[.!?…:;]$', k):
            parcalar.append(' '.join(simdi))
            simdi = []
    if simdi:
        parcalar.append(' '.join(simdi))
    return parcalar


def zamanla(parcalar, toplam, bas=0.15):
    """Parçalara, uzunluklarıyla orantılı süre verir (cümle sonu duraklaması dahil)."""
    agirlik = [len(p) + (10 if re.search(r'[.!?…]$', p) else 3) for p in parcalar]
    birim = (toplam - bas) / sum(agirlik)
    t, liste = bas, []
    for p, a in zip(parcalar, agirlik):
        liste.append((t, t + a * birim, p))
        t += a * birim
    return liste


def ass_kac(s):
    return s.replace('\\', '\\\\').replace('{', '(').replace('}', ')').replace('\n', ' ')


def zaman_ass(t):
    s = max(0.0, t)
    return f'{int(s // 3600)}:{int(s % 3600 // 60):02d}:{s % 60:05.2f}'


def kaydir(metin, en_fazla):
    satirlar, simdi = [], ''
    for k in metin.split():
        if simdi and len(simdi) + 1 + len(k) > en_fazla:
            satirlar.append(simdi)
            simdi = k
        else:
            simdi = f'{simdi} {k}'.strip()
    if simdi:
        satirlar.append(simdi)
    return satirlar


def ass_yaz(haber, toplam, dosya):
    baslik = kaydir(haber['baslik'], 24)[:5]
    son = zaman_ass(toplam + 1)
    satirlar = [
        '[Script Info]', 'ScriptType: v4.00+', f'PlayResX: {G}', f'PlayResY: {Y}', 'WrapStyle: 2', 'ScaledBorderAndShadow: yes', '',
        '[V4+ Styles]',
        'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, '
        'StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
        f'Style: Etiket,{FONT},46,&H00FFFFFF,&H00FFFFFF,&H002A2AD9,&H002A2AD9,1,0,0,0,100,100,4,0,3,18,0,7,90,90,0,1',
        f'Style: Baslik,{FONT},70,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,7,90,90,0,1',
        f'Style: Altyazi,{FONT},84,&H0033D6FF,&H00FFFFFF,&H00000000,&H96000000,1,0,0,0,100,100,0,0,1,6,2,5,80,80,0,1',
        f'Style: Kaynak,{FONT},42,&H00B8B8B8,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,1,90,90,0,1',
        '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
        f'Dialogue: 0,0:00:00.00,{son},Etiket,,0,0,0,,{{\\pos(90,230)}}GÜNDEM',
        f'Dialogue: 0,0:00:00.00,{son},Baslik,,0,0,0,,{{\\pos(90,330)}}' + '\\N'.join(ass_kac(s) for s in baslik),
        f'Dialogue: 0,0:00:00.00,{son},Kaynak,,0,0,0,,{{\\pos(90,1760)}}' + ass_kac(haber['kaynak']),
    ]
    for bas, bit, p in zamanla(parcala(haber['seslendirme']), toplam):
        metin = '\\N'.join(ass_kac(s) for s in kaydir(p, 18))
        satirlar.append(f'Dialogue: 1,{zaman_ass(bas)},{zaman_ass(bit)},Altyazi,,0,0,0,,{{\\pos({G // 2},1150)}}{metin}')
    with open(dosya, 'w', encoding='utf-8') as f:
        f.write('\n'.join(satirlar) + '\n')


def video_uret(haber, klasor):
    ses = os.path.join(klasor, 'ses.wav')
    seslendir(haber['seslendirme'], ses)
    toplam = sure(ses) + 0.6
    alt = os.path.join(klasor, 'alt.ass')
    ass_yaz(haber, toplam, alt)
    arka = f'gradients=s={G}x{Y}:c0=0x0b1220:c1=0x1d2a44:x0=0:y0=0:x1=0:y1={Y}:speed=0.0001:r=30:d={toplam:.2f}'
    cizim = (f'drawbox=x=90:y=1700:w={G - 180}:h=2:color=0x3a4a66:t=fill,ass={alt}')
    subprocess.run([
        'ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', arka, '-i', ses,
        '-vf', cizim, '-af', 'apad,aresample=44100', '-t', f'{toplam:.2f}',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-r', '30',
        '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', CIKTI,
    ], check=True)
    log(f'Video hazır: {CIKTI} ({toplam:.1f} sn, {os.path.getsize(CIKTI) / 1e6:.1f} MB)')


# ---------- platformlar ----------

def youtube_yukle(haber, dosya):
    s, _, g = istek('https://oauth2.googleapis.com/token', method='POST', veri=urllib.parse.urlencode({
        'client_id': os.environ['YT_CLIENT_ID'], 'client_secret': os.environ['YT_CLIENT_SECRET'],
        'refresh_token': os.environ['YT_REFRESH_TOKEN'], 'grant_type': 'refresh_token'}).encode(),
        basliklar={'content-type': 'application/x-www-form-urlencoded'})
    if s != 200:
        raise RuntimeError(f'YouTube giriş: {jsonla(g)}')
    token = jsonla(g)['access_token']
    meta = {
        'snippet': {'title': haber['videoBasligi'][:100], 'description': haber['aciklama'][:4900], 'categoryId': '25',
                    'defaultLanguage': 'tr', 'defaultAudioLanguage': 'tr', 'tags': ['haber', 'gündem']},
        'status': {'privacyStatus': 'public', 'selfDeclaredMadeForKids': False, 'containsSyntheticMedia': True},
    }
    boyut = os.path.getsize(dosya)
    s, b, g = istek('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
                    method='POST', json_veri=meta, basliklar={'authorization': f'Bearer {token}', 'x-upload-content-type': 'video/mp4',
                                                               'x-upload-content-length': str(boyut)})
    adres = {k.lower(): v for k, v in b.items()}.get('location')
    if s != 200 or not adres:
        raise RuntimeError(f'YouTube yükleme başlatılamadı: {s} {jsonla(g)}')
    with open(dosya, 'rb') as f:
        s, _, g = istek(adres, method='PUT', veri=f.read(), basliklar={'authorization': f'Bearer {token}', 'content-type': 'video/mp4'}, zaman=600)
    if s not in (200, 201):
        raise RuntimeError(f'YouTube yükleme: {s} {jsonla(g)}')
    log('YouTube: https://youtube.com/shorts/' + jsonla(g).get('id', '?'))


def instagram_paylas(haber, video_url):
    host = os.environ.get('IG_GRAPH', 'https://graph.facebook.com/v23.0')
    kul, tok = os.environ['IG_USER_ID'], os.environ['IG_ACCESS_TOKEN']
    s, _, g = istek(f'{host}/{kul}/media', method='POST', veri=urllib.parse.urlencode({
        'media_type': 'REELS', 'video_url': video_url, 'caption': haber['aciklama'][:2100], 'share_to_feed': 'true',
        'access_token': tok}).encode(), basliklar={'content-type': 'application/x-www-form-urlencoded'})
    kap = jsonla(g).get('id')
    if s != 200 or not kap:
        raise RuntimeError(f'Instagram kapsayıcı: {jsonla(g)}')
    for _ in range(40):  # en fazla ~10 dakika işlenmesini bekle
        time.sleep(15)
        _, _, g = istek(f'{host}/{kap}?fields=status_code,status&access_token={urllib.parse.quote(tok)}')
        d = jsonla(g)
        if d.get('status_code') == 'FINISHED':
            break
        if d.get('status_code') in ('ERROR', 'EXPIRED'):
            raise RuntimeError(f"Instagram işleme: {d.get('status')}")
    else:
        raise RuntimeError('Instagram işleme zaman aşımı')
    s, _, g = istek(f'{host}/{kul}/media_publish', method='POST', veri=urllib.parse.urlencode({
        'creation_id': kap, 'access_token': tok}).encode(), basliklar={'content-type': 'application/x-www-form-urlencoded'})
    if s != 200:
        raise RuntimeError(f'Instagram yayın: {jsonla(g)}')
    log('Instagram: paylaşıldı', jsonla(g).get('id'))


def main():
    kuru = os.environ.get('KURU') == '1'
    if kuru:
        haber = ORNEK
    else:
        if not os.environ.get('GUNDEM_URL') or not os.environ.get('VIDEO_ANAHTAR'):
            log('GUNDEM_URL / VIDEO_ANAHTAR girilmemiş; video otomasyonu henüz kurulmadı.')
            return 0
        s, _, g = site('/api/video/sira', method='POST')
        d = jsonla(g)
        if s != 200:
            log('Sıra alınamadı:', s, d)
            return 1
        if not d.get('haber'):
            log('Video yok:', d.get('neden'))
            return 0
        haber = d['haber']
    log('Haber:', haber['baslik'])

    with tempfile.TemporaryDirectory() as k:
        try:
            video_uret(haber, k)
        except Exception as e:
            if not kuru:
                sonuc_bildir(haber['id'], 'uretim', str(e))
            raise
    if kuru:
        return 0

    with open(CIKTI, 'rb') as f:
        s, _, g = site(f"/api/video/{haber['id']}/dosya", method='PUT', veri=f.read(),
                       basliklar={'content-type': 'video/mp4'}, zaman=300)
    if s != 200:
        sonuc_bildir(haber['id'], 'uretim', f'yükleme: {s} {jsonla(g)}')
        log('Video siteye yüklenemedi:', s, jsonla(g))
        return 1
    video_url = jsonla(g)['url']
    log('Video adresi:', video_url)

    hatali = 0
    platformlar = [
        ('youtube', all(os.environ.get(x) for x in ('YT_CLIENT_ID', 'YT_CLIENT_SECRET', 'YT_REFRESH_TOKEN')), lambda: youtube_yukle(haber, CIKTI)),
        ('instagram', all(os.environ.get(x) for x in ('IG_USER_ID', 'IG_ACCESS_TOKEN')), lambda: instagram_paylas(haber, video_url)),
    ]
    for ad, aktif, gonder in platformlar:
        if not aktif:
            log(f'{ad}: bağlı değil, atlandı')
            continue
        try:
            gonder()
            sonuc_bildir(haber['id'], ad)
        except Exception as e:
            hatali += 1
            log(f'{ad} hatası:', e)
            sonuc_bildir(haber['id'], ad, str(e))
    return 1 if hatali else 0


if __name__ == '__main__':
    sys.exit(main())
