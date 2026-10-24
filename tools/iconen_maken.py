"""Tekent de app-iconen (blad op groene achtergrond).

Gebruik (vanuit de projectmap):  python tools/iconen_maken.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
UIT = ROOT / "icons"

ACHTERGROND = (47, 84, 52)   # donker bladgroen
BLAD = (196, 222, 160)       # lichtgroen
NERF = (47, 84, 52)

S = 1024  # tekenformaat, daarna verkleind


def blad(schaal: float) -> Image.Image:
    """Een blad als RGBA-laag, gecentreerd; schaal = deel van het canvas."""
    laag = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(laag)
    bw, bh = S * schaal * 0.48, S * schaal
    cx, cy = S / 2, S / 2
    d.ellipse((cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2), fill=BLAD)
    # middennerf en steeltje
    d.line((cx, cy - bh * 0.42, cx, cy + bh * 0.62), fill=NERF, width=int(S * 0.022))
    # zijnerven
    for i in range(1, 4):
        y = cy - bh * 0.3 + i * bh * 0.16
        d.line((cx, y, cx - bw * 0.32, y - bh * 0.12), fill=NERF, width=int(S * 0.014))
        d.line((cx, y, cx + bw * 0.32, y - bh * 0.12), fill=NERF, width=int(S * 0.014))
    # steeltje dat buiten het blad uitsteekt in bladkleur
    d.line((cx, cy + bh / 2 - 4, cx, cy + bh * 0.62), fill=BLAD, width=int(S * 0.03))
    return laag.rotate(-35, resample=Image.BICUBIC, center=(cx, cy))


def icoon(schaal: float, rond: bool) -> Image.Image:
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if rond:
        d.rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * 0.22), fill=ACHTERGROND)
    else:
        d.rectangle((0, 0, S, S), fill=ACHTERGROND)
    im.alpha_composite(blad(schaal))
    return im


def main() -> None:
    UIT.mkdir(parents=True, exist_ok=True)
    gewoon = icoon(0.62, rond=True)
    maskable = icoon(0.48, rond=False)  # binnen de veilige zone van 80%
    for naam, im, maat in [
        ("icon-192.png", gewoon, 192),
        ("icon-512.png", gewoon, 512),
        ("icon-maskable-512.png", maskable, 512),
        ("apple-touch-icon.png", maskable, 180),
        ("favicon-32.png", gewoon, 32),
    ]:
        im.resize((maat, maat), Image.LANCZOS).save(UIT / naam)
        print("ok ", naam)


if __name__ == "__main__":
    main()
