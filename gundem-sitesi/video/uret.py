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
# Hesabın logosu; her videonun sağ üst köşesine küçük olarak eklenir
LOGO = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logo.png')
MOD = os.environ.get('MOD') or 'video'   # 'video' (Shorts/Reels) ya da 'foto' (Instagram görsel gönderisi)
CIKTI = os.environ.get('CIKTI') or ('gorsel.jpg' if MOD == 'foto' else 'video.mp4')

ORNEK = {
    'id': 0,
    'baslik': "İstanbul'da hafta sonu sağanak yağış bekleniyor",
    'seslendirme': "İstanbul'da hafta sonu sağanak yağış bekleniyor. Meteoroloji, cumartesi öğleden sonra başlayacak yağışın "
                   "pazar sabahına kadar aralıklarla süreceğini açıkladı. Kaynak: Anadolu Ajansı, NTV.",
    'kaynak': 'Kaynak: Anadolu Ajansı, NTV',
    'govde': 'Meteoroloji, cumartesi öğleden sonra başlayacak yağışın pazar sabahına kadar aralıklarla süreceğini açıkladı.',
    'videoBasligi': "İstanbul'da hafta sonu sağanak yağış bekleniyor #Shorts",
    'aciklama': 'Deneme videosu.',
}
# Yas tonu denemesi için (KURU=1 ORNEK_YAS=1)
ORNEK_YAS = {
    'id': 0, 'yas': True,
    'baslik': 'Hakkari\'de iki askerimiz şehit oldu',
    'seslendirme': "Hakkari'de iki askerimiz şehit oldu. Milli Savunma Bakanlığı, şehitlerimizin naaşlarının memleketlerine "
                   "gönderileceğini açıkladı. Başımız sağ olsun. Şehitlerimize Allah'tan rahmet, ailelerine sabır diliyoruz. "
                   "Kaynak: Anadolu Ajansı, TRT Haber.",
    'kaynak': 'Kaynak: Anadolu Ajansı, TRT Haber',
    'govde': 'Milli Savunma Bakanlığı, şehitlerimizin naaşlarının memleketlerine gönderileceğini açıkladı.',
    'videoBasligi': "Hakkari'de iki askerimiz şehit oldu",
    'aciklama': 'Deneme videosu.',
}


def tema(haber):
    """Şehit haberleri yas tonunda: siyah-gri arka plan, koyu etiket, beyaz altyazı, taziye satırı."""
    if haber.get('yas'):
        return {'etiket': 'BAŞIMIZ SAĞ OLSUN', 'etiket_renk': '&H00303030', 'c0': '0x000000', 'c1': '0x1c1c1c',
                'altyazi': '&H00FFFFFF', 'cizgi': '0x555555'}
    return {'etiket': 'GÜNDEM', 'etiket_renk': '&H002A2AD9', 'c0': '0x0b1220', 'c1': '0x1d2a44',
            'altyazi': '&H0033D6FF', 'cizgi': '0x3a4a66'}


def log(*a):
    print(*a, flush=True)


def istek(url, *, method='GET', veri=None, basliklar=None, json_veri=None, zaman=60):
    # Cloudflare varsayılan Python-urllib imzasını engelliyor (hata 1010); tanımlı bir istemci adı gönder
    b = {'user-agent': 'gundem-video/1.0 (+github-actions)', **(basliklar or {})}
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

_JETON = None


def kimlik():
    """GitHub Actions OIDC jetonu (gizli anahtar gerekmez); yoksa VIDEO_ANAHTAR."""
    global _JETON
    url, tok = os.environ.get('ACTIONS_ID_TOKEN_REQUEST_URL'), os.environ.get('ACTIONS_ID_TOKEN_REQUEST_TOKEN')
    if url and tok:
        if not _JETON:
            s, _, g = istek(url + '&audience=gundem-sitesi', basliklar={'authorization': f'Bearer {tok}'})
            if s != 200:
                raise RuntimeError(f'GitHub kimlik jetonu alınamadı: {s}')
            _JETON = jsonla(g)['value']
        return {'authorization': f'Bearer {_JETON}'}
    if os.environ.get('VIDEO_ANAHTAR'):
        return {'x-video-anahtar': os.environ['VIDEO_ANAHTAR']}
    raise RuntimeError('Kimlik yok: GitHub Actions içinde id-token izni ya da VIDEO_ANAHTAR gerekli')


def site(yol, **kw):
    b = {**kimlik(), **kw.pop('basliklar', {})}
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


def seslendir(metin, dosya, yas=False):
    model = os.environ.get('PIPER_MODEL')
    if model and shutil.which('piper'):
        # Yas haberlerinde daha ağır ve duraklamalı okunur
        hiz = ['--length_scale', '1.15', '--sentence_silence', '0.7'] if yas else ['--sentence_silence', '0.35']
        subprocess.run(['piper', '--model', model, '--output_file', dosya, *hiz],
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
    baslik = kaydir(haber['baslik'], 18)  # dar tutulur: sağ üstteki logoya değmesin
    if len(baslik) > 6:
        baslik = baslik[:6]
        baslik[-1] = baslik[-1].rstrip('.,;:') + '…'
    son = zaman_ass(toplam + 1)
    t = tema(haber)
    satirlar = [
        '[Script Info]', 'ScriptType: v4.00+', f'PlayResX: {G}', f'PlayResY: {Y}', 'WrapStyle: 2', 'ScaledBorderAndShadow: yes', '',
        '[V4+ Styles]',
        'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, '
        'StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
        f'Style: Etiket,{FONT},46,&H00FFFFFF,&H00FFFFFF,{t["etiket_renk"]},{t["etiket_renk"]},1,0,0,0,100,100,4,0,3,18,0,7,90,90,0,1',
        f'Style: Baslik,{FONT},64,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,7,90,90,0,1',
        f'Style: Altyazi,{FONT},84,{t["altyazi"]},&H00FFFFFF,&H00000000,&H96000000,1,0,0,0,100,100,0,0,1,6,2,5,80,80,0,1',
        f'Style: Kaynak,{FONT},42,&H00B8B8B8,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,1,90,90,0,1',
        '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
        f'Dialogue: 0,0:00:00.00,{son},Etiket,,0,0,0,,{{\\pos(90,230)}}' + t['etiket'],
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
    seslendir(haber['seslendirme'], ses, haber.get('yas'))
    toplam = sure(ses) + 0.6
    alt = os.path.join(klasor, 'alt.ass')
    ass_yaz(haber, toplam, alt)
    t = tema(haber)
    arka = f'gradients=s={G}x{Y}:c0={t["c0"]}:c1={t["c1"]}:x0=0:y0=0:x1=0:y1={Y}:speed=0.0001:r=30:d={toplam:.2f}'
    cizim = (f'drawbox=x=90:y=1700:w={G - 180}:h=2:color={t["cizgi"]}:t=fill,ass={alt}')
    subprocess.run([
        'ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', arka, '-i', ses, '-i', LOGO,
        '-filter_complex', f'[0:v]{cizim}[z];[2:v]scale=170:170[l];[z][l]overlay=x=W-w-70:y=200[v]',
        '-map', '[v]', '-map', '1:a', '-af', 'apad,aresample=44100', '-t', f'{toplam:.2f}',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-r', '30',
        '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', CIKTI,
    ], check=True)
    log(f'Video hazır: {CIKTI} ({toplam:.1f} sn, {os.path.getsize(CIKTI) / 1e6:.1f} MB)')


def foto_uret(haber, klasor):
    """Instagram için 4:5 (1080x1350) logolu haber görseli."""
    gy = 1350
    baslik = kaydir(haber['baslik'], 22)
    if len(baslik) > 5:
        baslik = baslik[:5]
        baslik[-1] = baslik[-1].rstrip('.,;:') + '…'
    govde = kaydir(haber.get('govde') or '', 36)
    if len(govde) > 7:
        govde = govde[:7]
        govde[-1] = govde[-1].rstrip('.,;:') + '…'
    by = 270 + len(baslik) * 74 + 60
    t = tema(haber)
    yas = (['Başımız sağ olsun.'] if haber.get('yas') else [])
    alt = os.path.join(klasor, 'foto.ass')
    satirlar = [
        '[Script Info]', 'ScriptType: v4.00+', f'PlayResX: {G}', f'PlayResY: {gy}', 'WrapStyle: 2', 'ScaledBorderAndShadow: yes', '',
        '[V4+ Styles]',
        'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, '
        'StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
        f'Style: Etiket,{FONT},42,&H00FFFFFF,&H00FFFFFF,{t["etiket_renk"]},{t["etiket_renk"]},1,0,0,0,100,100,4,0,3,16,0,7,90,90,0,1',
        f'Style: Baslik,{FONT},66,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,7,90,90,0,1',
        f'Style: Govde,{FONT},44,&H00E5E7EB,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,90,90,0,1',
        f'Style: Kaynak,{FONT},36,&H00B8B8B8,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,1,90,90,0,1',
        '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
        'Dialogue: 0,0:00:00.00,0:00:05.00,Etiket,,0,0,0,,{\\pos(90,140)}' + t['etiket'],
        'Dialogue: 0,0:00:00.00,0:00:05.00,Baslik,,0,0,0,,{\\pos(90,270)}' + '\\N'.join(ass_kac(x) for x in baslik),
        f'Dialogue: 0,0:00:00.00,0:00:05.00,Govde,,0,0,0,,{{\\pos(90,{by})}}' + '\\N'.join(ass_kac(x) for x in govde + yas),
        'Dialogue: 0,0:00:00.00,0:00:05.00,Kaynak,,0,0,0,,{\\pos(90,1260)}' + ass_kac(haber['kaynak']),
    ]
    with open(alt, 'w', encoding='utf-8') as f:
        f.write('\n'.join(satirlar) + '\n')
    arka = f'gradients=s={G}x{gy}:c0={t["c0"]}:c1={t["c1"]}:x0=0:y0=0:x1=0:y1={gy}:speed=0.0001:r=1:d=1'
    subprocess.run([
        'ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', arka, '-i', LOGO,
        '-filter_complex', f'[0:v]drawbox=x=90:y=1200:w={G - 180}:h=2:color={t["cizgi"]}:t=fill,ass={alt}[z];'
                           f'[1:v]scale=160:160[l];[z][l]overlay=x=W-w-70:y=100[v]',
        '-map', '[v]', '-frames:v', '1', '-q:v', '2', CIKTI,
    ], check=True)
    log(f'Görsel hazır: {CIKTI} ({os.path.getsize(CIKTI) / 1e3:.0f} KB)')


def instagram_foto(haber, gorsel_url):
    host = os.environ.get('IG_GRAPH') or 'https://graph.facebook.com/v23.0'
    kul, tok = os.environ['IG_USER_ID'], os.environ['IG_ACCESS_TOKEN']
    s, _, g = istek(f'{host}/{kul}/media', method='POST', veri=urllib.parse.urlencode({
        'image_url': gorsel_url, 'caption': haber['aciklama'][:2100], 'access_token': tok}).encode(),
        basliklar={'content-type': 'application/x-www-form-urlencoded'})
    kap = jsonla(g).get('id')
    if s != 200 or not kap:
        raise RuntimeError(f'Instagram görsel: {jsonla(g)}')
    for _ in range(12):
        _, _, g = istek(f'{host}/{kap}?fields=status_code&access_token={urllib.parse.quote(tok)}')
        if jsonla(g).get('status_code') in (None, 'FINISHED'):
            break
        time.sleep(5)
    s, _, g = istek(f'{host}/{kul}/media_publish', method='POST', veri=urllib.parse.urlencode({
        'creation_id': kap, 'access_token': tok}).encode(), basliklar={'content-type': 'application/x-www-form-urlencoded'})
    if s != 200:
        raise RuntimeError(f'Instagram yayın: {jsonla(g)}')
    log('Instagram görsel: paylaşıldı', jsonla(g).get('id'))


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
    host = os.environ.get('IG_GRAPH') or 'https://graph.facebook.com/v23.0'
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
        haber = ORNEK_YAS if os.environ.get('ORNEK_YAS') == '1' else ORNEK
    else:
        os.environ.setdefault('GUNDEM_URL', 'https://gundem-sitesi.vitrin-web.workers.dev')
        s, _, g = site(f'/api/video/sira?tur={MOD}', method='POST')
        d = jsonla(g)
        if s != 200:
            log('Sıra alınamadı:', s, d)
            return 1
        if not d.get('haber'):
            log('İş yok:', d.get('neden'))
            return 0
        haber = d['haber']
    log('Haber:', haber['baslik'])

    with tempfile.TemporaryDirectory() as k:
        try:
            (foto_uret if MOD == 'foto' else video_uret)(haber, k)
        except Exception as e:
            if not kuru:
                sonuc_bildir(haber['id'], 'uretim', str(e))
            raise
    if kuru:
        return 0

    with open(CIKTI, 'rb') as f:
        s, _, g = site(f"/api/video/{haber['id']}/dosya", method='PUT', veri=f.read(),
                       basliklar={'content-type': 'image/jpeg' if MOD == 'foto' else 'video/mp4'}, zaman=300)
    if s != 200:
        sonuc_bildir(haber['id'], 'uretim', f'yükleme: {s} {jsonla(g)}')
        log('Video siteye yüklenemedi:', s, jsonla(g))
        return 1
    video_url = jsonla(g)['url']
    log('Video adresi:', video_url)

    hatali = 0
    ig = all(os.environ.get(x) for x in ('IG_USER_ID', 'IG_ACCESS_TOKEN'))
    platformlar = [('instagram', ig, lambda: instagram_foto(haber, video_url))] if MOD == 'foto' else [
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
