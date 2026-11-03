"""把登录背景素材裁到真实动画区间并重编码。

原素材首尾各夹了与主体无关的「卡片特写」帧，且带 elst 起点偏移，
导致循环点跨过一张完全不同的画面。这里只保留区间内的帧，并从 0 重新计时。
"""
import os
import sys
from fractions import Fraction

import av

JOBS = [
    # src, dst, first_frame, last_frame (inclusive), width, height, crf
    ("login_bg_phone.mp4", "login_bg_phone.crf28.mp4", 1, 477, 1080, 1920, 28),
    ("login_bg_tablet.mp4", "login_bg_tablet.crf28.mp4", 3, 475, 1920, 1080, 28),
]


def reencode(src, dst, first, last, width, height, crf):
    inp = av.open(src)
    ist = inp.streams.video[0]
    frames = []
    for i, frame in enumerate(inp.decode(ist)):
        if i < first:
            continue
        if i > last:
            break
        frames.append(frame.reformat(width=width, height=height, format="yuv420p"))
    inp.close()
    print(f"  decoded {len(frames)} frames ({first}..{last}) from {src}")

    out = av.open(dst, "w", format="mp4", options={"movflags": "+faststart"})
    ost = out.add_stream("libx264", rate=24)
    ost.width = width
    ost.height = height
    ost.pix_fmt = "yuv420p"
    ost.time_base = Fraction(1, 24)
    ost.options = {
        "crf": str(crf),
        "preset": "slow",
        "profile": "high",
        "level": "4.0",
        "g": "48",
        "keyint_min": "24",
        "max_b_frames": "2",
        "x264-params": "scenecut=0:open-gop=0",
    }
    for idx, frame in enumerate(frames):
        frame.pts = idx
        frame.time_base = Fraction(1, 24)
        for packet in ost.encode(frame):
            out.mux(packet)
    for packet in ost.encode(None):
        out.mux(packet)
    out.close()
    size = os.path.getsize(dst) / 1024
    print(f"  -> {dst}  {size:.0f} KB  {len(frames)/24:.3f}s")


if __name__ == "__main__":
    for job in JOBS:
        reencode(*job)
