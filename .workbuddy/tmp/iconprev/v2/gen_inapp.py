# -*- coding: utf-8 -*-
"""App 内品牌位 32/40/48dp 对照：S 标 vs 3D 场景。"""
from PIL import Image, ImageDraw, ImageFont

SCENE = r"C:/Users/25912/Desktop/MY/apps/android-app/app/src/main/res/drawable-nodpi/ic_launcher_scene.png"
LOGO = r"C:/Users/25912/Desktop/MY/apps/android-app/app/src/main/res/drawable-nodpi/platform_logo.png"
TMP = r"C:/Users/25912/Desktop/MY/.workbuddy/tmp/iconprev/v2"
FONT = r"C:/Windows/Fonts/msyh.ttc"
S = 4


def flatten(path):
    im = Image.open(path).convert("RGBA")
    bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
    bg.alpha_composite(im)
    return bg.convert("RGB")


def viewport(img, dp=72):
    w = img.size[0]
    side = int(round(w * dp / 108))
    off = (w - side) // 2
    return img.crop((off, off, off + side, off + side))


def icon(img, dp, radius_ratio=0.22):
    px = dp * S
    big = img.resize((px, px), Image.LANCZOS).convert("RGBA")
    m = Image.new("L", (px, px), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, px - 1, px - 1), radius=int(px * radius_ratio), fill=255)
    big.putalpha(m)
    return big.resize((dp, dp), Image.LANCZOS)


scene = viewport(flatten(SCENE))
logo = flatten(LOGO)

sheet = Image.new("RGB", (600, 250), (255, 255, 255))
d = ImageDraw.Draw(sheet)
f_t = ImageFont.truetype(FONT, 16)
f_b = ImageFont.truetype(FONT, 13)

rows = [("S 标（现用）", logo), ("3D 场景（新）", scene)]
for i, (label, img) in enumerate(rows):
    cy = 70 + i * 90
    d.text((24, cy), label, font=f_t, fill=(23, 32, 51), anchor="lm")
    x = 200
    for dp in (32, 40, 48):
        ic = icon(img, dp)
        sheet.paste(ic, (x, cy - dp // 2), ic)
        d.text((x + dp // 2, cy + 34), f"{dp}dp", font=f_b, fill=(102, 112, 133), anchor="mm")
        x += 72

d.text((24, 222), "内嵌品牌位实际尺寸；32dp 为侧栏折叠态、48dp 为个人中心头像位",
       font=f_b, fill=(102, 112, 133))
sheet.save(f"{TMP}/inapp_brand.png")
print("ok")
