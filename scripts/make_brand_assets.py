#!/usr/bin/env python3
"""يولّد كل ملفات الشعار والأيقونات من صورة شعار واحدة.
الاستخدام:  python scripts/make_brand_assets.py my-logo.png [#16213e]
- الشعار يفضّل PNG بخلفية شفافة (يُفضّل مربعاً/أفقياً بحجم 1000px+).
- اللون الاختياري = خلفية أيقونة التطبيق (نفس --navy / themeColor).
ينتج في public/: logo.png logo-white.png mark.png mark-white.png favicon.png icons/*
(mark = الشعار نفسه؛ لو عندك أيقونة مصغّرة مختلفة استبدل mark.png / mark-white.png يدوياً.)"""
import sys, os
from PIL import Image

src = sys.argv[1]; bg = sys.argv[2] if len(sys.argv) > 2 else '#16213e'
out = os.path.join(os.path.dirname(__file__), '..', 'public'); os.makedirs(os.path.join(out, 'icons'), exist_ok=True)
im = Image.open(src).convert('RGBA'); im = im.crop(im.getbbox())

def white(i):
    w = Image.new('RGBA', i.size, (255, 255, 255, 0)); w.putalpha(i.getchannel('A')); return w

def fit(i, w, h, pad=0.0):
    k = min(w * (1 - pad) / i.width, h * (1 - pad) / i.height)
    r = i.resize((max(1, int(i.width * k)), max(1, int(i.height * k))), Image.LANCZOS)
    c = Image.new('RGBA', (w, h), (0, 0, 0, 0)); c.paste(r, ((w - r.width) // 2, (h - r.height) // 2), r); return c

def icon(size, pad):
    c = Image.new('RGBA', (size, size), bg); c.alpha_composite(fit(white(im), size, size, pad)); return c.convert('RGB')

lg = fit(im, 800, int(800 * im.height / im.width)) if im.width >= im.height else fit(im, int(800 * im.width / im.height), 800)
lg.save(f'{out}/logo.png'); white(lg).save(f'{out}/logo-white.png')
mk = fit(im, 256, 256); mk.save(f'{out}/mark.png'); white(mk).save(f'{out}/mark-white.png')
fit(im, 64, 64).save(f'{out}/favicon.png')
icon(192, .22).save(f'{out}/icons/icon-192.png'); icon(512, .22).save(f'{out}/icons/icon-512.png'); icon(512, .40).save(f'{out}/icons/icon-512-maskable.png')
print('تم — راجع public/ ثم npm run build')
