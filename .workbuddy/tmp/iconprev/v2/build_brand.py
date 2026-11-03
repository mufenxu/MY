# -*- coding: utf-8 -*-
"""App 内品牌标识：与桌面图标同源同构图，但裁成满幅方块（不带 108dp 画布留白）。"""
from PIL import Image

SRC = r"C:/Users/25912/Desktop/login-uhd-pack/login-poster-1440.png"
OUT = r"C:/Users/25912/Desktop/MY/apps/android-app/app/src/main/res/drawable-nodpi/brand_mark.png"
INSET = 72  # 与桌面图标同一刀，去掉底板倒角与亮边
SIZE = 512

im = Image.open(SRC).convert("RGB")
inner = im.crop((INSET, INSET, im.size[0] - INSET, im.size[1] - INSET))
inner.resize((SIZE, SIZE), Image.LANCZOS).save(OUT, optimize=True)
print("saved", OUT, SIZE)
