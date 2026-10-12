#!/usr/bin/env python3
"""
Builds every raster brand asset (app icon, adaptive icon, splash, notification icons, favicons, social card)
from the official logo files in brand/source/. Requires Pillow + numpy.   Usage: python3 scripts/brand/build_assets.py

The source logos are raster images. Transparent versions are made by removing the flat background colour
("colour to alpha"), so a vector (SVG) master is still recommended for the web: see docs/design/BRAND.md.
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "brand", "source")
OUT = os.path.join(ROOT, "brand", "png")
APP = os.path.join(ROOT, "apps", "mobile", "assets", "brand")
RES = os.path.join(ROOT, "native", "tarteel-android", "android", "src", "main", "res")

CREAM = (0xFB, 0xF9, 0xF4)
GREEN = (0x03, 0x40, 0x2E)  # app icon / dark splash background, sampled from the official green tile
LANCZOS = Image.Resampling.LANCZOS


def load(name):
    return Image.open(os.path.join(SRC, name)).convert("RGB")


def median_corner(im, n=12):
    a = np.asarray(im)
    corners = np.concatenate([a[:n, :n].reshape(-1, 3), a[:n, -n:].reshape(-1, 3), a[-n:, :n].reshape(-1, 3), a[-n:, -n:].reshape(-1, 3)])
    return tuple(int(v) for v in np.median(corners, axis=0))


def color_to_alpha(im, bg=None, lo=8.0, hi=70.0):
    """Remove a flat background: alpha from the distance to bg, colours un-mixed from it. Returns RGBA."""
    bg = bg or median_corner(im)
    a = np.asarray(im).astype(np.float32)
    bgv = np.array(bg, dtype=np.float32)
    d = np.abs(a - bgv).max(axis=2)
    alpha = np.clip((d - lo) / (hi - lo), 0.0, 1.0)
    safe = np.maximum(alpha, 1e-3)[..., None]
    rgb = np.clip((a - (1.0 - alpha[..., None]) * bgv) / safe, 0, 255)
    out = np.dstack([rgb, alpha * 255.0]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def tight_square(rgba, size, fill=0.84):
    """Crop to the visible pixels and centre them on a transparent square; the mark spans `fill` of the side."""
    alpha = np.asarray(rgba)[..., 3]
    ys, xs = np.where(alpha > 12)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    crop = rgba.crop(box)
    scale = size * fill / max(crop.size)
    crop = crop.resize((max(1, round(crop.width * scale)), max(1, round(crop.height * scale))), LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(crop, ((size - crop.width) // 2, (size - crop.height) // 2), crop)
    return canvas


def silhouette(rgba, color=(255, 255, 255)):
    a = np.asarray(rgba).copy()
    a[..., 0], a[..., 1], a[..., 2] = color
    return Image.fromarray(a, "RGBA")


def save(im, *path):
    p = os.path.join(*path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    im.save(p, optimize=True)
    return p


def main():
    on_white = load("mark-on-white.png")
    on_green = load("mark-on-green.png")
    primary = load("logo-primary-on-cream.png")

    # --- transparent marks
    mark_color = tight_square(color_to_alpha(on_white), 1024, 0.84)          # green + gold, for light backgrounds
    mark_light = tight_square(color_to_alpha(on_green, bg=GREEN), 1024, 0.84)  # cream + gold, for dark backgrounds
    mark_mono = silhouette(mark_color)                                        # single colour (white), for system UI
    save(mark_color, OUT, "mark-color.png")
    save(mark_light, OUT, "mark-light.png")
    save(mark_mono, OUT, "mark-mono-white.png")

    # --- primary lockup (mark + wordmark + Arabic + tagline), transparent
    lockup = color_to_alpha(primary, bg=CREAM, lo=6, hi=60)
    save(tight_square(lockup, 1254, 0.92), OUT, "logo-primary-transparent.png")
    primary.save(os.path.join(OUT, "logo-primary-on-cream.png"), optimize=True)

    # --- app icon: official green tile, full bleed (the OS applies its own corner mask)
    icon = on_green.resize((1024, 1024), LANCZOS)
    save(icon, OUT, "app-icon-1024.png")

    # --- Android adaptive icon: foreground on a transparent 1024 canvas, mark inside the 66% safe zone
    fg = tight_square(color_to_alpha(on_green, bg=GREEN), 1024, 0.50)
    save(fg, OUT, "adaptive-foreground-1024.png")
    save(silhouette(tight_square(color_to_alpha(on_white), 1024, 0.50)), OUT, "adaptive-monochrome-1024.png")

    # --- splash images (transparent; background colour comes from app config)
    save(mark_color, OUT, "splash-light.png")
    save(mark_light, OUT, "splash-dark.png")

    # --- web: favicons, touch icons, PWA, social card
    web = os.path.join(OUT, "web")
    for s in (16, 32, 48):
        save(tight_square(color_to_alpha(on_white), s * 4, 0.92).resize((s, s), LANCZOS), web, f"favicon-{s}.png")
    ico_src = tight_square(color_to_alpha(on_white), 256, 0.92)
    os.makedirs(web, exist_ok=True)
    ico_src.save(os.path.join(web, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
    save(icon.resize((180, 180), LANCZOS), web, "apple-touch-icon-180.png")
    save(icon.resize((192, 192), LANCZOS), web, "android-chrome-192.png")
    save(icon.resize((512, 512), LANCZOS), web, "android-chrome-512.png")
    mask = Image.new("RGB", (1024, 1024), GREEN)
    mask.paste(fg, (0, 0), fg)
    save(mask.resize((512, 512), LANCZOS), web, "maskable-512.png")
    card = Image.new("RGB", (1200, 630), CREAM)
    lk = tight_square(lockup, 560, 1.0)
    card.paste(lk, ((1200 - 560) // 2, (630 - 560) // 2), lk)
    save(card, web, "og-image-1200x630.png")

    # --- Android notification small icons: white silhouette, ~20/24 of the box, on transparent
    sil = silhouette(tight_square(color_to_alpha(on_white), 512, 0.84))
    for folder, px in (("mdpi", 24), ("hdpi", 36), ("xhdpi", 48), ("xxhdpi", 72), ("xxxhdpi", 96)):
        save(sil.resize((px, px), LANCZOS), RES, f"drawable-{folder}", "ic_stat_prayer.png")

    # --- copies the mobile app bundles
    save(icon, APP, "icon.png")
    save(fg, APP, "adaptive-icon-foreground.png")
    save(Image.open(os.path.join(OUT, "adaptive-monochrome-1024.png")), APP, "adaptive-icon-monochrome.png")
    save(mark_color, APP, "splash-light.png")
    save(mark_light, APP, "splash-dark.png")
    save(mark_color.resize((512, 512), LANCZOS), APP, "mark-color.png")
    save(mark_light.resize((512, 512), LANCZOS), APP, "mark-light.png")
    save(tight_square(color_to_alpha(on_white), 192, 0.92), APP, "favicon.png")
    print("brand assets written")


if __name__ == "__main__":
    main()
