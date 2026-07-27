from pathlib import Path
import argparse
import json

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter
import numpy as np


CANVAS_SIZE = (1536, 2732)


def main():
    parser = argparse.ArgumentParser(
        description="Compose a real wearable-nail hand foreground onto a blurred selfie-style background."
    )
    parser.add_argument("--hand", required=True, help="Real hand/nail foreground image. Solid background or transparent PNG works best.")
    parser.add_argument("--background", required=True, help="Doubao-generated blurred model/background image.")
    parser.add_argument("--out", required=True, help="Output directory.")
    parser.add_argument("--title", default="", help="Optional metadata only; not drawn on image.")
    parser.add_argument("--mode", choices=["auto", "solid-bg", "source-alpha", "soft-card"], default="auto")
    parser.add_argument("--scale", type=float, default=1.08, help="Foreground scale multiplier.")
    parser.add_argument("--x", type=float, default=0.50, help="Foreground center x ratio.")
    parser.add_argument("--y", type=float, default=0.69, help="Foreground center y ratio.")
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    raw_hand = Image.open(args.hand)
    hand_rgb = enhance_hand(raw_hand.convert("RGB"))
    alpha, alpha_mode = make_alpha(raw_hand, hand_rgb, args.mode)
    cutout = hand_rgb.convert("RGBA")
    cutout.putalpha(alpha)

    bg = fit_cover(Image.open(args.background).convert("RGB"), CANVAS_SIZE)
    bg = prepare_background(bg)

    output = compose(bg, cutout, args.scale, args.x, args.y)
    output_file = out_dir / "selfie-bokeh-compose.png"
    cutout.save(out_dir / "hand-cutout.png")
    output.save(output_file, quality=95)

    manifest = {
        "hand": str(Path(args.hand).resolve()),
        "background": str(Path(args.background).resolve()),
        "output": str(output_file),
        "alpha_mode": alpha_mode,
        "note": "前景手部/甲片来自真实图片；背景来自单独生成的虚化自拍氛围图；成图不绘制任何文字。",
    }
    (out_dir / "compose-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


def enhance_hand(img):
    img = ImageEnhance.Color(img).enhance(1.04)
    img = ImageEnhance.Contrast(img).enhance(1.04)
    img = ImageEnhance.Sharpness(img).enhance(1.08)
    return img


def prepare_background(img):
    # Keep the background soft so the real nail foreground owns attention.
    img = img.filter(ImageFilter.GaussianBlur(1.2))
    img = ImageEnhance.Contrast(img).enhance(0.92)
    img = ImageEnhance.Color(img).enhance(0.96)
    return img


def make_alpha(source, rgb, mode):
    if mode in ("auto", "source-alpha") and source.mode in ("RGBA", "LA"):
        alpha = source.convert("RGBA").getchannel("A")
        if np.mean(np.asarray(alpha) < 250) > 0.02:
            return alpha, "source-alpha"
        if mode == "source-alpha":
            return alpha, "source-alpha-empty"

    if mode == "soft-card":
        return rounded_alpha(rgb.size, 38), "soft-card"

    alpha, confidence = solid_background_alpha(rgb)
    if mode == "solid-bg":
        return alpha, "solid-bg"
    if confidence >= 0.42:
        return alpha, "solid-bg-auto"

    # Fallback: preserve the real image as a soft-edged foreground card rather than damaging nail pixels.
    return rounded_alpha(rgb.size, 38), "soft-card-fallback"


def solid_background_alpha(img):
    arr = np.asarray(img).astype(np.float32)
    h, w = arr.shape[:2]
    border = np.concatenate([
        arr[: max(8, h // 26), :, :].reshape(-1, 3),
        arr[-max(8, h // 26):, :, :].reshape(-1, 3),
        arr[:, : max(8, w // 26), :].reshape(-1, 3),
        arr[:, -max(8, w // 26):, :].reshape(-1, 3),
    ], axis=0)
    bg = np.median(border, axis=0)
    spread = np.mean(np.linalg.norm(border - bg, axis=1))
    dist = np.linalg.norm(arr - bg, axis=2)

    threshold = max(26.0, spread * 2.15)
    alpha = np.clip((dist - threshold) / 52.0, 0, 1)
    alpha = (alpha * 255).astype(np.uint8)
    alpha_img = Image.fromarray(alpha, "L").filter(ImageFilter.GaussianBlur(2.0))
    alpha_img = alpha_img.point(lambda p: 255 if p > 190 else p)

    subject_ratio = np.mean(np.asarray(alpha_img) > 80)
    confidence = max(0.0, min(1.0, 1.0 - spread / 85.0))
    if subject_ratio < 0.10 or subject_ratio > 0.84:
        confidence *= 0.35
    return alpha_img, confidence


def rounded_alpha(size, radius):
    w, h = size
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, w, h), radius=radius, fill=255)
    return mask


def compose(bg, cutout, scale_factor, center_x_ratio, center_y_ratio):
    canvas = bg.convert("RGBA")
    target_w = int(canvas.width * 0.86 * scale_factor)
    scale = target_w / cutout.width
    target_h = int(cutout.height * scale)
    if target_h > int(canvas.height * 0.74):
        target_h = int(canvas.height * 0.74)
        target_w = int(cutout.width * (target_h / cutout.height))

    hand = cutout.resize((target_w, target_h), Image.Resampling.LANCZOS)
    x = int(canvas.width * center_x_ratio - target_w / 2)
    y = int(canvas.height * center_y_ratio - target_h / 2)

    alpha = hand.getchannel("A")
    shadow = Image.new("RGBA", hand.size, (30, 22, 18, 135))
    shadow.putalpha(alpha.filter(ImageFilter.GaussianBlur(28)).point(lambda p: int(p * 0.30)))
    canvas.alpha_composite(shadow, (x + 22, y + 30))

    # A subtle foreground light wash helps the cutout sit inside the phone-shot background.
    light = Image.new("RGBA", hand.size, (255, 236, 215, 24))
    light.putalpha(alpha.point(lambda p: int(p * 0.10)))
    hand = Image.alpha_composite(hand, light)

    canvas.alpha_composite(hand, (x, y))
    canvas = add_phone_texture(canvas)
    return canvas.convert("RGB")


def add_phone_texture(img):
    arr = np.asarray(img.convert("RGB")).astype(np.float32)
    rng = np.random.default_rng(17)
    noise = rng.normal(0, 1.8, arr.shape)
    arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, "RGB").convert("RGBA")


def fit_cover(img, size):
    target_w, target_h = size
    scale = max(target_w / img.width, target_h / img.height)
    resized = img.resize((int(img.width * scale), int(img.height * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - target_w) // 2
    top = (resized.height - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


if __name__ == "__main__":
    main()
