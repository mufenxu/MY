# -*- coding: utf-8 -*-
"""生成自适应图标候选构图，并按 108px / 48px 实拍尺寸排版对比。"""
from PIL import Image, ImageDraw, ImageFont

SRC = r"C:/Users/25912/Desktop/login-uhd-pack/login-poster-1440.png"
OUT = r"C:/Users/25912/Desktop/MY/.workbuddy/tmp/iconprev/v2"
FONT = r"C:/Windows/Fonts/msyh.ttc"

CANVAS = 432  # 108dp @ 4x
im = Image.open(SRC).convert("RGB")
W, H = im.size
BG = im.getpixel((64, 720))  # 底板内部靠边处取色，用作外部填充
print("source", im.size, "bg", BG)


def masked(img, size, shape, radius_ratio=0.235):
    """把 RGB 图缩到 size 并按形状裁切，返回 RGBA。"""
    small = img.resize((size, size), Image.LANCZOS).convert("RGBA")
    m = Image.new("L", (size * 4, size * 4), 0)
    d = ImageDraw.Draw(m)
    s4 = size * 4
    if shape == "circle":
        d.ellipse((0, 0, s4 - 1, s4 - 1), fill=255)
    else:
        d.rounded_rectangle((0, 0, s4 - 1, s4 - 1), radius=int(s4 * radius_ratio), fill=255)
    m = m.resize((size, size), Image.LANCZOS)
    small.putalpha(m)
    return small


def compose(art, content_dp):
    """art 为正方形图；content_dp 表示内容占 108dp 画布的多少。"""
    canvas = Image.new("RGB", (CANVAS, CANVAS), BG)
    c = int(CANVAS * content_dp / 108)
    a = art.resize((c, c), Image.LANCZOS)
    canvas.paste(a, ((CANVAS - c) // 2, (CANVAS - c) // 2))
    return canvas


def crop(center, side):
    cx, cy = center
    half = side // 2
    box = (cx - half, cy - half, cx + half, cy + half)
    box = (max(0, box[0]), max(0, box[1]), min(W, box[2]), min(H, box[3]))
    out = im.crop(box)
    return out.resize((side, side), Image.LANCZOS)


CENTER = (731, 727)

variants = [
    ("A 原图直铺", compose(im, 108)),
    ("B 整图缩进安全区", compose(im, 66)),
    ("C 中心特写 950", compose(crop(CENTER, 950), 108)),
    ("D 中心特写 700", compose(crop(CENTER, 700), 108)),
]

for name, canvas_img in variants:
    canvas_img.save(f"{OUT}/{name.split()[0]}.png")

# 排版
PAD, COLW = 40, 200
TOP, ROWS_Y = 110, [(110, 108), (250, 48), (330, 48)]
sheet_w = PAD * 2 + COLW * len(variants)
sheet_h = 420
sheet = Image.new("RGB", (sheet_w, sheet_h), (250, 250, 250))
d = ImageDraw.Draw(sheet)
f_title = ImageFont.truetype(FONT, 22)
f_label = ImageFont.truetype(FONT, 16)
f_small = ImageFont.truetype(FONT, 14)

for i, (name, canvas_img) in enumerate(variants):
    x0 = PAD + i * COLW + COLW // 2
    d.text((x0, 34), name, font=f_title, fill=(23, 32, 51), anchor="mm")
    big = masked(canvas_img, 108, "squircle")
    sheet.paste(big, (x0 - 54, 74), big)
    d.text((x0, 194), "108px", font=f_small, fill=(102, 112, 133), anchor="mm")

    mid = masked(canvas_img, 48, "squircle")
    sheet.paste(mid, (x0 - 74 - 24, 216), mid)
    d.text((x0 - 50, 244), "48px", font=f_small, fill=(102, 112, 133), anchor="mm")

    cir = masked(canvas_img, 48, "circle")
    sheet.paste(cir, (x0 + 26 - 24 + 24, 216), cir)
    d.text((x0 + 50, 244), "48px 圆", font=f_small, fill=(102, 112, 133), anchor="mm")

    d.text((x0, 372), "48px 实际观感见上排", font=f_label, fill=(102, 112, 133), anchor="mm")

sheet = sheet.crop((0, 0, sheet_w, 400))
sheet.save(f"{OUT}/sheet.png")
print("saved", f"{OUT}/sheet.png", sheet.size)
