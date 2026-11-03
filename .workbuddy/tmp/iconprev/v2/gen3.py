# -*- coding: utf-8 -*-
"""第三版：先把原图底板边缘裁掉（去白框/去倒角），再比较 108dp / 72dp / 中心特写。"""
from PIL import Image, ImageDraw, ImageFont

SRC = r"C:/Users/25912/Desktop/login-uhd-pack/login-poster-1440.png"
OUT = r"C:/Users/25912/Desktop/MY/.workbuddy/tmp/iconprev/v2"
FONT = r"C:/Windows/Fonts/msyh.ttc"

CANVAS = 432
im = Image.open(SRC).convert("RGB")
W, H = im.size
CENTER = (731, 727)

INSET = 34  # 裁掉底板倒角与描边
inner = im.crop((INSET, INSET, W - INSET, H - INSET))
BG = inner.getpixel((6, inner.size[1] // 2))
print("inner", inner.size, "bg", BG)


def compose(art, content_dp, bg=BG):
    canvas = Image.new("RGB", (CANVAS, CANVAS), bg)
    c = int(CANVAS * content_dp / 108)
    canvas.paste(art.resize((c, c), Image.LANCZOS), ((CANVAS - c) // 2, (CANVAS - c) // 2))
    return canvas


def crop_sq(src, center, side):
    cx, cy = center
    half = side // 2
    box = (max(0, cx - half), max(0, cy - half), min(src.size[0], cx + half), min(src.size[1], cy + half))
    return src.crop(box).resize((side, side), Image.LANCZOS)


def masked(img, size, shape="squircle", r=0.235):
    s = img.resize((size, size), Image.LANCZOS).convert("RGBA")
    m = Image.new("L", (size * 4, size * 4), 0)
    d = ImageDraw.Draw(m)
    s4 = size * 4
    if shape == "circle":
        d.ellipse((0, 0, s4 - 1, s4 - 1), fill=255)
    else:
        d.rounded_rectangle((0, 0, s4 - 1, s4 - 1), radius=int(s4 * r), fill=255)
    s.putalpha(m.resize((size, size), Image.LANCZOS))
    return s


variants = [
    ("A1", "整图 108dp\n(边缘裁切)", compose(inner, 108)),
    ("A2", "整图 72dp\n(铺满视口)", compose(inner, 72)),
    ("A3", "整图 78dp\n(留 3dp 边)", compose(inner, 78)),
    ("B1", "中心特写 760\n(球+环+辐条)", compose(crop_sq(inner, (CENTER[0] - INSET, CENTER[1] - INSET), 760), 108)),
    ("B2", "中心特写 900\n(带周边元素)", compose(crop_sq(inner, (CENTER[0] - INSET, CENTER[1] - INSET), 900), 108)),
]

for key, _, img in variants:
    img.save(f"{OUT}/v3_{key}.png")

PAD, COLW = 28, 184
sheet = Image.new("RGB", (PAD * 2 + COLW * len(variants), 400), (248, 249, 251))
d = ImageDraw.Draw(sheet)
f_title = ImageFont.truetype(FONT, 19)
f_tag = ImageFont.truetype(FONT, 13)
f_body = ImageFont.truetype(FONT, 14)
f_note = ImageFont.truetype(FONT, 15)

for i, (key, label, img) in enumerate(variants):
    cx = PAD + i * COLW + COLW // 2
    d.text((cx, 28), key, font=f_title, fill=(23, 32, 51), anchor="mm")
    d.multiline_text((cx, 62), label, font=f_tag, fill=(102, 112, 133), anchor="mm",
                     align="center", spacing=2)
    big = masked(img, 108)
    sheet.paste(big, (cx - 54, 100), big)
    d.text((cx, 228), "108px", font=f_body, fill=(102, 112, 133), anchor="mm")
    sheet.paste(masked(img, 48), (cx - 78, 248), masked(img, 48))
    sheet.paste(masked(img, 48, "circle"), (cx - 24, 248), masked(img, 48, "circle"))
    sheet.paste(masked(img, 24), (cx + 30, 260), masked(img, 24))
    d.text((cx - 54, 308), "48", font=f_body, fill=(102, 112, 133), anchor="mm")
    d.text((cx, 308), "48圆", font=f_body, fill=(102, 112, 133), anchor="mm")
    d.text((cx + 42, 308), "24", font=f_body, fill=(102, 112, 133), anchor="mm")

d.text((PAD, 356), "原图底板倒角已裁掉；A2 的 72dp 正好等于自适应图标可视视口，元素不被裁",
       font=f_note, fill=(102, 112, 133))
sheet.save(f"{OUT}/sheet3.png")
print("saved", sheet.size)
