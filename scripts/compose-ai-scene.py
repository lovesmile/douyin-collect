from pathlib import Path
import argparse
import json

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageEnhance
import numpy as np


CANVAS_SIZE = (1600, 2848)
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}


def main():
    parser = argparse.ArgumentParser(
        description="Compose a real wearable-nail hand subject onto designed backgrounds without redrawing nails."
    )
    parser.add_argument("--subject", required=True, help="Real hand/nail subject image.")
    parser.add_argument("--out", required=True, help="Output directory.")
    parser.add_argument("--title", default="这套真的显白到发光")
    parser.add_argument("--subtitle", default="真实上手｜甲片细节保留｜氛围封面")
    parser.add_argument("--mode", choices=["auto", "solid-bg", "soft-card"], default="auto")
    parser.add_argument("--background", help="Optional Doubao-generated empty background image.")
    parser.add_argument("--background-dir", help="Optional directory containing Doubao-generated empty backgrounds.")
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    source = Image.open(args.subject)
    subject = enhance_subject(source.convert("RGB"))
    alpha, mode_used = make_alpha(source, subject, args.mode)
    cutout = subject.convert("RGBA")
    cutout.putalpha(alpha)
    cutout.save(out_dir / "subject-cutout.png")

    backgrounds = load_backgrounds(args.background, args.background_dir)
    outputs = []
    for index, item in enumerate(backgrounds, start=1):
        bg = item["image"]
        cover = compose(bg, cutout, args.title, args.subtitle, item["label"], prefer_text_box=item["source"] != "built-in")
        file = out_dir / f"scene-cover-{index:02d}-{item['slug']}.png"
        cover.save(file, quality=95)
        outputs.append(str(file))

    manifest = {
        "subject": str(Path(args.subject).resolve()),
        "background": str(Path(args.background).resolve()) if args.background else None,
        "background_dir": str(Path(args.background_dir).resolve()) if args.background_dir else None,
        "mode_requested": args.mode,
        "mode_used": mode_used,
        "outputs": outputs,
        "note": "甲片主体来自实拍图像素；背景只做氛围，不重绘甲片。成图文案会自动移除 AI 字样。",
    }
    (out_dir / "compose-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


def load_backgrounds(background, background_dir):
    items = []

    if background:
        path = Path(background)
        items.append({
            "slug": safe_slug(path.stem) or "doubao-bg",
            "label": "定制氛围背景",
            "source": "file",
            "image": fit_cover(Image.open(path).convert("RGB"), CANVAS_SIZE),
        })

    if background_dir:
        root = Path(background_dir)
        files = sorted(file for file in root.iterdir() if file.suffix.lower() in IMAGE_EXTS)
        for file in files:
            items.append({
                "slug": safe_slug(file.stem) or f"doubao-bg-{len(items) + 1}",
                "label": "定制氛围背景",
                "source": "dir",
                "image": fit_cover(Image.open(file).convert("RGB"), CANVAS_SIZE),
            })

    if items:
        return items

    return [
        {
            "slug": "silk-pearl",
            "label": "珍珠丝绸氛围",
            "source": "built-in",
            "image": make_background(*CANVAS_SIZE, (246, 236, 228), (226, 207, 196), "silk-pearl"),
        },
        {
            "slug": "cafe-table",
            "label": "浅色咖啡桌氛围",
            "source": "built-in",
            "image": make_background(*CANVAS_SIZE, (248, 244, 238), (220, 208, 195), "cafe-table"),
        },
        {
            "slug": "soft-magazine",
            "label": "高级杂志封面氛围",
            "source": "built-in",
            "image": make_background(*CANVAS_SIZE, (252, 249, 245), (232, 222, 214), "soft-magazine"),
        },
    ]


def enhance_subject(img):
    img = ImageEnhance.Color(img).enhance(1.04)
    img = ImageEnhance.Contrast(img).enhance(1.03)
    img = ImageEnhance.Sharpness(img).enhance(1.06)
    return img


def make_alpha(source, rgb, mode):
    if source.mode in ("RGBA", "LA"):
        alpha = source.convert("RGBA").getchannel("A")
        if np.mean(np.asarray(alpha) < 250) > 0.02:
            return alpha, "source-alpha"

    if mode == "soft-card":
        return rounded_alpha(rgb.size, 46), "soft-card"

    alpha, confidence = solid_background_alpha(rgb)
    if mode == "solid-bg":
        return alpha, "solid-bg"

    if confidence >= 0.42:
        return alpha, "solid-bg-auto"
    return rounded_alpha(rgb.size, 46), "soft-card-fallback"


def solid_background_alpha(img):
    arr = np.asarray(img).astype(np.float32)
    h, w = arr.shape[:2]
    border = np.concatenate([
        arr[: max(8, h // 30), :, :].reshape(-1, 3),
        arr[-max(8, h // 30):, :, :].reshape(-1, 3),
        arr[:, : max(8, w // 30), :].reshape(-1, 3),
        arr[:, -max(8, w // 30):, :].reshape(-1, 3),
    ], axis=0)
    bg = np.median(border, axis=0)
    spread = np.mean(np.linalg.norm(border - bg, axis=1))
    dist = np.linalg.norm(arr - bg, axis=2)

    threshold = max(28.0, spread * 2.2)
    alpha = np.clip((dist - threshold) / 55.0, 0, 1)
    alpha = (alpha * 255).astype(np.uint8)
    alpha_img = Image.fromarray(alpha, "L").filter(ImageFilter.GaussianBlur(2.2))
    alpha_img = alpha_img.point(lambda p: 255 if p > 190 else p)

    subject_ratio = np.mean(np.asarray(alpha_img) > 80)
    confidence = max(0.0, min(1.0, 1.0 - spread / 85.0))
    if subject_ratio < 0.08 or subject_ratio > 0.82:
        confidence *= 0.4
    return alpha_img, confidence


def rounded_alpha(size, radius):
    w, h = size
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, w, h), radius=radius, fill=255)
    return mask


def compose(bg, cutout, title, subtitle, label, prefer_text_box=False):
    canvas = bg.convert("RGBA")
    draw = ImageDraw.Draw(canvas)
    title = public_text(title)
    subtitle = public_text(subtitle)
    label = public_text(label)

    if prefer_text_box:
        overlay = Image.new("RGBA", canvas.size, (255, 255, 255, 0))
        od = ImageDraw.Draw(overlay)
        od.rounded_rectangle((76, 96, 1048, 500), radius=54, fill=(255, 255, 255, 178))
        canvas = Image.alpha_composite(canvas, overlay.filter(ImageFilter.GaussianBlur(0.2)))
        draw = ImageDraw.Draw(canvas)

    font_title = load_font(94)
    font_sub = load_font(45)
    font_badge = load_font(42)
    font_small = load_font(44)

    draw.text((112, 150), title, fill=(72, 48, 42), font=font_title)
    draw.text((116, 270), subtitle, fill=(128, 92, 78), font=font_sub)
    badge_w = int(draw.textlength(label, font=font_badge)) + 58
    draw.rounded_rectangle((112, 392, 112 + badge_w, 468), radius=38, fill=(255, 255, 255, 205))
    draw.text((141, 404), label, fill=(112, 78, 68), font=font_badge)

    target_w = 1280
    scale = target_w / cutout.width
    target_h = int(cutout.height * scale)
    if target_h > 1860:
        target_h = 1860
        target_w = int(cutout.width * (target_h / cutout.height))
    subject = cutout.resize((target_w, target_h), Image.Resampling.LANCZOS)

    x = (canvas.width - target_w) // 2
    y = 555
    alpha = subject.getchannel("A")
    shadow = Image.new("RGBA", subject.size, (80, 55, 38, 130))
    shadow.putalpha(alpha.filter(ImageFilter.GaussianBlur(30)).point(lambda p: int(p * 0.34)))
    canvas.alpha_composite(shadow, (x + 24, y + 34))
    canvas.alpha_composite(subject, (x, y))

    glow = Image.new("RGBA", canvas.size, (255, 255, 255, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((x - 160, y - 120, x + target_w + 180, y + target_h + 150), fill=(255, 255, 255, 18))
    canvas = Image.alpha_composite(canvas, glow.filter(ImageFilter.GaussianBlur(80)))

    draw = ImageDraw.Draw(canvas)
    footer_y = canvas.height - 250
    if prefer_text_box:
        draw.rounded_rectangle((92, footer_y - 18, 1010, footer_y + 148), radius=42, fill=(255, 255, 255, 150))
    draw.text((120, canvas.height - 235), "适合：通勤 / 约会 / 拍照", fill=(112, 82, 73), font=font_small)
    draw.text((120, canvas.height - 165), "重点看甲面光泽和上手显白度", fill=(112, 82, 73), font=font_small)
    return canvas.convert("RGB")


def public_text(text):
    """Text drawn onto publishable images must not expose AI-production wording."""
    text = str(text)
    replacements = {
        "AI": "",
        "ai": "",
        "Ai": "",
        "aI": "",
        "人工智能": "",
        "智能生成": "生成",
        "生成式": "",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    return text.replace("｜｜", "｜").strip("｜ ")


def fit_cover(img, size):
    target_w, target_h = size
    scale = max(target_w / img.width, target_h / img.height)
    resized = img.resize((int(img.width * scale), int(img.height * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - target_w) // 2
    top = (resized.height - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


def make_background(width, height, top, bottom, style):
    top = np.array(top, dtype=np.float32)
    bottom = np.array(bottom, dtype=np.float32)
    t = np.linspace(0, 1, height, dtype=np.float32)[:, None, None]
    base = np.tile(top * (1 - t) + bottom * t, (1, width, 1))
    yy, xx = np.mgrid[0:height, 0:width]
    waves = 10 * np.sin(xx / 95 + yy / 230) + 8 * np.sin((xx - yy) / 175)
    base += waves[:, :, None]

    if style == "silk-pearl":
        add_glow(base, width * 0.23, height * 0.20, 470, (255, 255, 255), 58)
        add_glow(base, width * 0.82, height * 0.72, 560, (239, 207, 194), 38)
    elif style == "cafe-table":
        add_glow(base, width * 0.75, height * 0.24, 620, (255, 255, 255), 52)
        add_glow(base, width * 0.18, height * 0.75, 430, (219, 188, 168), 26)
    else:
        add_glow(base, width * 0.50, height * 0.28, 720, (255, 255, 255), 60)
        add_glow(base, width * 0.85, height * 0.88, 460, (232, 203, 192), 30)

    noise = np.random.default_rng(11).normal(0, 1.8, base.shape)
    img = np.clip(base + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(img, "RGB").filter(ImageFilter.GaussianBlur(0.25))


def add_glow(base, cx, cy, radius, color, strength):
    h, w = base.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    dist = ((xx - cx) ** 2 + (yy - cy) ** 2) ** 0.5
    alpha = np.clip(1 - dist / radius, 0, 1) ** 2
    color = np.array(color, dtype=np.float32)
    base[:] = base * (1 - alpha[:, :, None] * strength / 255) + color * (alpha[:, :, None] * strength / 255)


def safe_slug(text):
    keep = []
    for ch in text.lower():
        if ch.isalnum():
            keep.append(ch)
        elif ch in ("-", "_", " "):
            keep.append("-")
    slug = "".join(keep).strip("-")
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug[:60]


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
