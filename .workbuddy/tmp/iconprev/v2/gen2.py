# -*- coding: utf-8 -*-
"""自适应图标候选构图 v2：整图内缩档位 + 中心特写档位，按真实尺寸排版。"""
from PIL import Image, ImageDraw, ImageFont

SRC = r"C:/Users/25912/Desktop/login-uhd-pack/login-poster-1440.png"
OUT = r"C:/Users/25912/Desktop/MY/.workbuddy/tmp/iconprev/v2"
FONT = r"C:/Windows/Fonts/msyh.ttc"

CANVAS = 432
im = Image.open(SRC).convert("RGB")
W, H = im.size
BG = im.getpixel((64, 720))
CENTER = (731, 727)


def crop_sq(center, side):
    cx, cy = center
    half = side // 2
    box = (max(0, cx - half), max(0, cy - half), min(W, cx + half), min(H, cy + half))
    return im.crop(box).resize((side, side), Image.LANCZOS)


def compose(art, content_dp):
    canvas = Image.new("RGB", (CANVAS, CANVAS), BG)
    c = int(CANVAS * content_dp / 108)
    canvas.paste(art.resize((c, c), Image.LANCZOS), ((CANVAS - c) // 2, (CANVAS - c) // 2))
    return canvas


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
    ("A", "原图直铺\n108dp", compose(im, 108)),
    ("B", "整图内缩\n80dp", compose(im, 80)),
    ("C", "整图安全区\n66dp", compose(im, 66)),
    ("D", "中心特写\n950", compose(crop_sq(CENTER, 950), 108)),
    ("E", "中心特写\n700", compose(crop_sq(CENTER, 700), 108)),
]

for key, _, img in variants:
    img.save(f"{OUT}/v2_{key}.png")

PAD, COLW = 28, 184
sheet_w = PAD * 2 + COLW * len(variants)
sheet_h = 400
sheet = Image.new("RGB", (sheet_w, sheet_h), (248, 249, 251))
d = ImageDraw.Draw(sheet)
f_title = ImageFont.truetype(FONT, 20)
f_body = ImageFont.truetype(FONT, 14)
f_tag = ImageFont.truetype(FONT, 13)
f_note = ImageFont.truetype(FONT, 15)

for i, (key, label, img) in enumerate(variants):
    cx = PAD + i * COLW + COLW // 2
    d.text((cx, 30), key, font=f_title, fill=(23, 32, 51), anchor="mm")
    d.multiline_text((cx, 62), label, font=f_tag, fill=(102, 112, 133), anchor="mm",
                     align="center", spacing=2)
    big = masked(img, 108)
    sheet.paste(big, (cx - 54, 96), big)
    d.text((cx, 226), "108px", font=f_body, fill=(102, 112, 133), anchor="mm")

    s48 = masked(img, 48)
    c48 = masked(img, 48, "circle")
    s24 = masked(img, 24)
    sheet.paste(s48, (cx - 78, 246), s48)
    sheet.paste(c48, (cx - 24, 246), c48)
    sheet.paste(s24, (cx + 30, 258), s24)
    d.text((cx - 54, 306), "48", font=f_body, fill=(102, 112, 133), anchor="mm")
    d.text((cx, 306), "48圆", font=f_body, fill=(102, 112, 133), anchor="mm")
    d.text((cx + 42, 306), "24", font=f_body, fill=(102, 112, 133), anchor="mm")

d.text((PAD, 356), "上排 108px 为系统图标实际尺寸的三倍放大参考；下排 48/24 为桌面与列表真实像素",
       font=f_note, fill=(102, 112, 133))

sheet.save(f"{OUT}/sheet2.png")
print("saved", sheet.size)
