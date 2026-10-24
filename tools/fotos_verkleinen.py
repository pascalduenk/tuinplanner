"""Maakt app-formaat foto's en thumbnails van de originele tuinfoto's.

Gebruik (vanuit de projectmap):  python tools/fotos_verkleinen.py
De originelen in fotos/ worden niet aangepast.
"""
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
BRON = ROOT / "fotos"
GROOT = ROOT / "img" / "planten"
KLEIN = ROOT / "img" / "thumbs"

# plant-id -> (bronbestand, optionele uitsnede als fracties (links, boven, rechts, onder))
FOTOS = {
    "pluimhortensia-stam": ("IMG20261024155504.jpg", None),
    "leliegras": ("IMG20261024155509.jpg", None),
    "beukenhaag": ("IMG20261024155521.jpg", None),
    "stamboompje-jong": ("IMG20261024155530.jpg", None),
    "esdoorn": ("IMG20261024155538.jpg", None),
    "stamroos": ("IMG20261024155551.jpg", None),
    "pluimhortensia-struik": ("IMG20261024155557.jpg", None),
    "maagdenpalm": ("IMG20261024155557.jpg", (0.0, 0.62, 1.0, 1.0)),
    "klimroos": ("IMG20261024155606.jpg", None),
    "ooievaarsbek": ("IMG20261024155609.jpg", None),
    "prachtkaars": ("IMG20261024155620.jpg", None),
    "brandkruid": ("IMG20261024155623.jpg", None),
    "sering": ("IMG20261024155647.jpg", None),
    "annabelle": ("IMG20261024155659.jpg", None),
    "dakplataan": ("IMG20261024155710.jpg", None),
    "kogeldistel": ("IMG20261024155719.jpg", (0.0, 0.1, 1.0, 0.75)),
    "tuin-algemeen": ("IMG20261024155719.jpg", None),
    "hemelsleutel": ("IMG20261024155725.jpg", None),
    "lampenpoetsersgras": ("IMG20261024155727.jpg", None),
    "lavendel": ("IMG20261024155738.jpg", None),
    "laurierkers": ("IMG20261024155748.jpg", None),
    "gazon": ("IMG20261024155748.jpg", (0.6, 0.5, 1.0, 1.0)),
    "boerenhortensia": ("IMG20261024155835.jpg", None),
    "pluimhortensia-compact": ("IMG20261024155845.jpg", None),
}

GROOT_MAX = 1400  # langste zijde
KLEIN_MIN = 400   # kortste zijde


def verwerk(plant_id: str, bestand: str, uitsnede) -> None:
    with Image.open(BRON / bestand) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        if uitsnede:
            w, h = im.size
            l, t, r, b = uitsnede
            im = im.crop((int(l * w), int(t * h), int(r * w), int(b * h)))

        groot = im.copy()
        groot.thumbnail((GROOT_MAX, GROOT_MAX), Image.LANCZOS)
        groot.save(GROOT / f"{plant_id}.jpg", "JPEG", quality=80, optimize=True, progressive=True)

        w, h = im.size
        schaal = KLEIN_MIN / min(w, h)
        klein = im.resize((round(w * schaal), round(h * schaal)), Image.LANCZOS)
        klein.save(KLEIN / f"{plant_id}.jpg", "JPEG", quality=75, optimize=True, progressive=True)


def main() -> None:
    GROOT.mkdir(parents=True, exist_ok=True)
    KLEIN.mkdir(parents=True, exist_ok=True)
    for plant_id, (bestand, uitsnede) in FOTOS.items():
        verwerk(plant_id, bestand, uitsnede)
        print(f"ok  {plant_id:24s} <- {bestand}")


if __name__ == "__main__":
    main()
