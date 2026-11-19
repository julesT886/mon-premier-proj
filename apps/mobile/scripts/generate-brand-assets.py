"""Génère l'identité visuelle de Brumeterre (icônes, splash, bannière Play Store).

Motif : un croissant de lune doré au-dessus de bandes de brume, sur fond de nuit.
Usage (depuis apps/mobile) : python3 scripts/generate-brand-assets.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
STORE = ROOT.parent.parent / "store" / "graphics"

NIGHT_CENTER = (36, 41, 66)
NIGHT_EDGE = (14, 16, 24)
GOLD = (232, 182, 90)
GOLD_LIGHT = (250, 222, 160)
MIST = (205, 214, 235)
SS = 4  # suréchantillonnage pour l'anticrénelage


def radial_background(w: int, h: int) -> Image.Image:
    """Dégradé radial nuit (centre légèrement plus clair, en haut)."""
    small = Image.new("RGB", (w // 8, h // 8))
    px = small.load()
    cx, cy = small.width / 2, small.height * 0.42
    maxd = (cx**2 + (small.height - cy) ** 2) ** 0.5
    for y in range(small.height):
        for x in range(small.width):
            t = min(1.0, (((x - cx) ** 2 + (y - cy) ** 2) ** 0.5) / maxd)
            px[x, y] = tuple(int(a + (b - a) * t) for a, b in zip(NIGHT_CENTER, NIGHT_EDGE))
    return small.resize((w, h), Image.BICUBIC)


def emblem(size: int, scale: float = 1.0, mono: bool = False) -> Image.Image:
    """Croissant + brume sur fond transparent, centré dans un carré `size`."""
    S = size * SS
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    c = S / 2
    r = S * 0.25 * scale
    moon_cy = c - S * 0.07 * scale

    # Halo doré
    if not mono:
        glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        ImageDraw.Draw(glow).ellipse(
            [c - r * 1.15, moon_cy - r * 1.15, c + r * 1.15, moon_cy + r * 1.15],
            fill=GOLD + (55,),
        )
        layer = Image.alpha_composite(layer, glow.filter(ImageFilter.GaussianBlur(S * 0.1)))

    # Croissant : disque moins un disque décalé
    moon = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(moon)
    d.ellipse([c - r, moon_cy - r, c + r, moon_cy + r], fill=255)
    off = r * 0.55
    d.ellipse([c - r + off, moon_cy - r - off * 0.45, c + r + off, moon_cy + r - off * 0.45], fill=0)
    moon_color = Image.new("RGBA", (S, S), (255, 255, 255, 255) if mono else GOLD + (255,))
    if not mono:
        # Léger dégradé clair sur le bord gauche du croissant
        light = Image.new("RGBA", (S, S), GOLD_LIGHT + (0,))
        lmask = Image.new("L", (S, S), 0)
        ImageDraw.Draw(lmask).ellipse(
            [c - r * 1.05, moon_cy - r * 0.9, c - r * 0.1, moon_cy + r * 0.9], fill=170
        )
        light.putalpha(lmask.filter(ImageFilter.GaussianBlur(S * 0.03)))
        moon_color = Image.alpha_composite(moon_color, light)
    layer.paste(moon_color, (0, 0), moon)

    # Bandes de brume (devant le bas du croissant)
    mist = Image.new("L", (S, S), 0)
    md = ImageDraw.Draw(mist)
    bands = [(0.10, 0.62, 0.30), (0.20, 0.40, 0.22), (0.30, 0.16, 0.12)]
    for i, (dy, width, thick) in enumerate(bands):
        y = moon_cy + r * 0.55 + dy * S * scale
        w = S * width * scale
        h = S * 0.045 * scale * (1 - i * 0.15)
        x0 = c - w / 2 + (S * 0.04 * scale if i == 1 else 0)
        md.rounded_rectangle([x0, y, x0 + w, y + h], radius=h / 2, fill=255 if mono else 235 - i * 45)
    if not mono:
        mist = mist.filter(ImageFilter.GaussianBlur(S * 0.006))
    mist_color = Image.new("RGBA", (S, S), (255, 255, 255, 255) if mono else MIST + (255,))
    layer.paste(mist_color, (0, 0), mist)

    return layer.resize((size, size), Image.LANCZOS)


def save(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, optimize=True)
    print(f"  {path.relative_to(ROOT.parent.parent)}  {img.size[0]}x{img.size[1]}")


def main() -> None:
    print("Assets générés :")
    # Icône iOS / générique (opaque, sans transparence : exigence App Store)
    icon = radial_background(1024, 1024).convert("RGBA")
    icon = Image.alpha_composite(icon, emblem(1024))
    save(icon.convert("RGB"), ASSETS / "icon.png")

    # Android adaptatif : fond + premier plan dans la zone sûre (~61 % central)
    save(radial_background(512, 512), ASSETS / "android-icon-background.png")
    save(emblem(512, scale=0.72), ASSETS / "android-icon-foreground.png")
    save(emblem(432, scale=0.72, mono=True), ASSETS / "android-icon-monochrome.png")

    # Écran de démarrage (sur fond uni #14161F défini dans app.json)
    save(emblem(1024, scale=0.9), ASSETS / "splash-icon.png")

    # Favicon web
    save(icon.resize((48, 48), Image.LANCZOS).convert("RGB"), ASSETS / "favicon.png")

    # Play Store : icône 512x512 et bannière 1024x500
    save(icon.resize((512, 512), Image.LANCZOS).convert("RGB"), STORE / "play-icon-512.png")
    banner = radial_background(1024, 500).convert("RGBA")
    banner.alpha_composite(emblem(440, scale=1.0), (60, 30))
    draw = ImageDraw.Draw(banner)
    font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
    x, max_w = 480, 1024 - 480 - 40
    try:
        size = 96
        title = ImageFont.truetype(font_path, size)
        while draw.textlength("Brumeterre", font=title) > max_w and size > 40:
            size -= 2
            title = ImageFont.truetype(font_path, size)
        sub = ImageFont.truetype(font_path.replace("Serif-Bold", "Sans"), 30)
    except OSError:
        title = sub = ImageFont.load_default()
    draw.text((x, 170), "Brumeterre", font=title, fill=GOLD)
    draw.text((x + 4, 290), "Idle RPG · coach de build IA", font=sub, fill=MIST)
    save(banner.convert("RGB"), STORE / "play-feature-graphic-1024x500.png")


if __name__ == "__main__":
    main()
