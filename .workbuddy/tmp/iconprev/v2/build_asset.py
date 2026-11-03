# -*- coding: utf-8 -*-
"""产出装机资源：108dp@4x 自适应图标前景图 + 备选构图 + 前后对比预览。"""
from PIL import Image, ImageDraw, ImageFont

SRC = r"C:/Users/25912/Desktop/login-uhd-pack/login-poster-1440.png"
RES = r"C:/Users/25912/Desktop/MY/apps/android-app/app/src/main/res"
TMP = r"C:/Users/25912/Desktop/MY/.workbuddy/tmp/iconprev/v2"
OLD = r"C:/Users/25912/Desktop/MY/apps/android-app/app/src/main/res/drawable-nodpi/platform_logo.png"
FONT = r"C:/Windows/Fonts/msyh.ttc"

CANVAS = 432  # 108dp @ 4x
INSET = 72    # 裁掉底板倒角与外圈亮边
CONTENT_DP = 72  # 自适应图标可视视口正好 72dp

im = Image.open(SRC).convert("RGB")
W, H = im.size
inner = im.crop((INSET, INSET, W - INSET, H - INSET))
BG = (243, 243, 243)  # 与 inner 边缘稳定后的底色一致


def compose(art, content_dp):
    canvas = Image.new("RGB", (CANVAS, CANVAS), BG)
    c = int(CANVAS * content_dp / 108)
    canvas.paste(art.resize((c, c), Image.LANCZOS), ((CANVAS - c) // 2, (CANVAS - c) // 2))
    return canvas


def crop_sq(src, center, side):
    cx, cy = center
    half = side // 2
    box = (max(0, cx - half), max(0, cy - half), min(src.size[0], cx + half), min(src.size[1], cy + half))
    return src.crop(box).resize((side, side), Image.LANCZOS)


primary = compose(inner, CONTENT_DP)
primary.save(f"{RES}/drawable-nodpi/ic_launcher_scene.png", optimize=True)
print("saved", f"{RES}/drawable-nodpi/ic_launcher_scene.png", primary.size)

# 备选：中心特写 900（周边元素各露一半），同样 108dp 满幅
alt = compose(crop_sq(inner, (731 - INSET, 727 - INSET), 900), 108)
alt.save(f"{TMP}/alt_center_900.png", optimize=True)


VIEWPORT = 72  # 启动器实际显示的可视视口（dp）


def viewport(img):
    """取 108dp 画布中央 72dp —— 这才是用户看到的区域。"""
    w = img.size[0]
    side = int(round(w * VIEWPORT / 108))
    off = (w - side) // 2
    return img.crop((off, off, off + side, off + side))


def masked(img, size, shape="squircle", r=0.235):
    img = viewport(img)
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


# 旧图标：platform_logo 铺在自适应图标上的等效合成
old_logo = Image.open(OLD).convert("RGBA")
old_canvas = Image.new("RGBA", (CANVAS, CANVAS), (247, 250, 255, 255))
side = int(CANVAS * (108 - 38) / 108)  # layer-list 19dp inset ×2
tmp = Image.new("RGBA", (side, side), (0, 0, 0, 0))
tmp.alpha_composite(old_logo.resize((side, side), Image.LANCZOS))
old_canvas.alpha_composite(tmp, ((CANVAS - side) // 2, (CANVAS - side) // 2))

rows = [("更换前（S 标）", old_canvas), ("更换后（3D 场景）", primary.convert("RGBA"))]
sheet = Image.new("RGB", (560, 250), (248, 249, 251))
d = ImageDraw.Draw(sheet)
f_title = ImageFont.truetype(FONT, 18)
f_body = ImageFont.truetype(FONT, 14)
for i, (label, img) in enumerate(rows):
    cx = 150 + i * 260
    d.text((cx, 26), label, font=f_title, fill=(23, 32, 51), anchor="mm")
    big = masked(img, 120)
    sheet.paste(big, (cx - 60, 52), big)
    for j, (size, shape) in enumerate([(48, "squircle"), (48, "circle"), (24, "squircle")]):
        icon = masked(img, size, shape)
        x = cx - 92 + j * 56 + (8 if size == 24 else 0)
        y = 186 + (12 if size == 24 else 0)
        sheet.paste(icon, (x, y), icon)
    d.text((cx, 236), "桌面 48px / 48px 圆形 / 通知栏列表 24px", font=f_body,
           fill=(102, 112, 133), anchor="mm")
sheet.save(f"{TMP}/before_after.png")
print("saved", f"{TMP}/before_after.png")
