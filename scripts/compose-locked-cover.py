from pathlib import Path
import argparse
import math
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont
import numpy as np


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--title", default="这套真的显白到发光")
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    src = Image.open(args.input).convert("RGB")

    for index, style in enumerate(["silk", "magazine", "pearl"], start=1):
        cover = make_cover(src, args.title, style)
        cover.save(out_dir / f"locked-cover-{index:02d}-{style}.png", quality=95)


def make_cover(src, title, style):
    width, height = 1600, 2848
    bg = make_background(width, height, style).convert("RGBA")
    draw = ImageDraw.Draw(bg)

    card_w = 1320
    card_h = int(card_w * src.height / src.width)
    if card_h > 1880:
        card_h = 1880
        card_w = int(card_h * src.width / src.height)
    photo = src.resize((card_w, card_h), Image.Resampling.LANCZOS).convert("RGBA")

    x = (width - card_w) // 2
    y = 520
    shadow = Image.new("RGBA", (card_w + 80, card_h + 80), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle((40, 40, card_w + 40, card_h + 40), radius=44, fill=(80, 55, 35, 85))
    shadow = shadow.filter(ImageFilter.GaussianBlur(28))
    bg.alpha_composite(shadow, (x - 40, y - 20))

    mask = Image.new("L", (card_w, card_h), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle((0, 0, card_w, card_h), radius=38, fill=255)
    bg.paste(photo, (x, y), mask)
    draw.rounded_rectangle((x, y, x + card_w, y + card_h), radius=38, outline=(255, 255, 255, 190), width=5)

    font_big = load_font(96)
    font_small = load_font(48)
    draw.text((120, 170), title, fill=(72, 48, 40), font=font_big)
    draw.text((124, 292), "真实上手｜甲片细节保留｜氛围封面", fill=(130, 92, 76), font=font_small)

    badge = "穿戴甲"
    badge_font = load_font(44)
    bx, by = 118, 410
    tw = draw.textlength(badge, font=badge_font)
    draw.rounded_rectangle((bx, by, bx + tw + 56, by + 76), radius=38, fill=(255, 255, 255, 185))
    draw.text((bx + 28, by + 12), badge, fill=(108, 76, 65), font=badge_font)

    draw.text((124, height - 210), "适合：通勤 / 约会 / 拍照", fill=(115, 82, 72), font=font_small)
    draw.text((124, height - 140), "重点看甲面光泽和上手显白度", fill=(115, 82, 72), font=font_small)
    return bg.convert("RGB")


def make_background(width, height, style):
    yy, xx = np.mgrid[0:height, 0:width]
    if style == "silk":
        base = np.zeros((height, width, 3), dtype=np.float32)
        base[:, :, 0] = 245
        base[:, :, 1] = 232
        base[:, :, 2] = 222
        wave = 18 * np.sin(xx / 85 + yy / 240) + 10 * np.sin((xx + yy) / 130)
        base += wave[:, :, None]
        add_glow(base, width * 0.25, height * 0.18, 420, (255, 255, 255), 48)
        add_glow(base, width * 0.78, height * 0.72, 520, (236, 202, 185), 36)
    elif style == "magazine":
        base = vertical_gradient(width, height, (248, 244, 238), (221, 208, 196))
        add_glow(base, width * 0.72, height * 0.25, 560, (255, 255, 255), 55)
        add_glow(base, width * 0.18, height * 0.78, 520, (229, 200, 185), 35)
    else:
        base = vertical_gradient(width, height, (252, 248, 244), (235, 220, 214))
        rng = random.Random(7)
        for _ in range(28):
            cx, cy = rng.randint(0, width), rng.randint(0, height)
            radius = rng.randint(18, 58)
            add_glow(base, cx, cy, radius, (255, 255, 255), rng.randint(16, 34))
    noise = np.random.default_rng(1).normal(0, 2.0, base.shape)
    base = np.clip(base + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(base, "RGB").filter(ImageFilter.GaussianBlur(0.35))


def vertical_gradient(width, height, top, bottom):
    top = np.array(top, dtype=np.float32)
    bottom = np.array(bottom, dtype=np.float32)
    t = np.linspace(0, 1, height, dtype=np.float32)[:, None, None]
    return np.tile(top * (1 - t) + bottom * t, (1, width, 1))


def add_glow(base, cx, cy, radius, color, strength):
    h, w = base.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    dist = ((xx - cx) ** 2 + (yy - cy) ** 2) ** 0.5
    alpha = np.clip(1 - dist / radius, 0, 1) ** 2
    color = np.array(color, dtype=np.float32)
    base[:] = base * (1 - alpha[:, :, None] * strength / 255) + color * (alpha[:, :, None] * strength / 255)


def load_font(size):
    candidates = [
        "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/simhei.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ]
    for file in candidates:
        if Path(file).exists():
            return ImageFont.truetype(file, size=size)
    return ImageFont.load_default()


if __name__ == "__main__":
    main()
