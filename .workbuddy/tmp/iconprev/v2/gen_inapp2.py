# -*- coding: utf-8 -*-
"""替换后 App 内各品牌位真实尺寸预览。"""
from PIL import Image, ImageDraw, ImageFont

BRAND = r"C:/Users/25912/Desktop/MY/apps/android-app/app/src/main/res/drawable-nodpi/brand_mark.webp"
TMP = r"C:/Users/25912/Desktop/MY/.workbuddy/tmp/iconprev/v2"
FONT = r"C:/Windows/Fonts/msyh.ttc"
S = 4

brand = Image.open(BRAND).convert("RGB")


def icon(dp, shape="round", r=0.22):
    px = dp * S
    big = brand.resize((px, px), Image.LANCZOS).convert("RGBA")
    m = Image.new("L", (px, px), 0)
    d = ImageDraw.Draw(m)
    if shape == "circle":
        d.ellipse((0, 0, px - 1, px - 1), fill=255)
    else:
        d.rounded_rectangle((0, 0, px - 1, px - 1), radius=int(px * r), fill=255)
    big.putalpha(m)
    return big.resize((dp, dp), Image.LANCZOS)


items = [
    ("桌面图标 48", 48, "round"),
    ("启动动画 54", 54, "round"),
    ("账号管理 52", 52, "circle"),
    ("登录 BrandMark 40", 40, "round"),
    ("侧栏 34", 34, "round"),
    ("个人中心 36", 36, "circle"),
    ("小组件 26", 26, "round"),
    ("小组件 24", 24, "round"),
]

sheet = Image.new("RGB", (700, 190), (255, 255, 255))
d = ImageDraw.Draw(sheet)
f_t = ImageFont.truetype(FONT, 15)
f_l = ImageFont.truetype(FONT, 11)
d.text((20, 18), "替换后各位置真实尺寸（1x 像素）", font=f_t, fill=(23, 32, 51))

x = 24
base = 90
for label, dp, shape in items:
    ic = icon(dp, shape)
    sheet.paste(ic, (x, base - dp // 2), ic)
    d.text((x + dp // 2, base + 46), label, font=f_l, fill=(102, 112, 133), anchor="mm")
    x += max(dp, 66) + 22

d.text((20, 168), "品牌图与桌面图标同构图；小区块为真实像素，不是放大示意",
       font=f_l, fill=(140, 148, 163))
sheet.save(f"{TMP}/inapp_after.png")
print("ok")
