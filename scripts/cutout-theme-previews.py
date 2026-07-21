"""Flood-fill near-black screenshot backdrop → transparent PNG cutouts."""
from pathlib import Path
from PIL import Image

SRC = Path(r"C:\Users\julez\Apps\Anvyll.app\modal-img")
DEST = Path(r"C:\Users\julez\Apps\Anvyll.app\anvyll\src\renderer\assets\theme-previews")
DEST.mkdir(parents=True, exist_ok=True)

# Chronological screenshots → forge themes (accent colors from visual inspection)
MAPPING = {
    "Schermafbeelding 2026-07-21 225113.png": "crimson-shop.png",
    "Schermafbeelding 2026-07-21 225328.png": "tempered-green.png",
    "Schermafbeelding 2026-07-21 225510.png": "midnight-anvil.png",
    "Schermafbeelding 2026-07-21 225541.png": "cool-temper.png",
    "Schermafbeelding 2026-07-21 225633.png": "white-hot.png",
    "Schermafbeelding 2026-07-21 225713.png": "forged-steel.png",
    "Schermafbeelding 2026-07-21 225744.png": "ember-forge.png",
    "Schermafbeelding 2026-07-21 235617.png": "ash-paper.png",
}

THRESH = 18


def is_bg(rgb: tuple) -> bool:
    r, g, b = rgb[:3]
    return r <= THRESH and g <= THRESH and b <= THRESH


def flood_clear(im: Image.Image) -> Image.Image:
    rgba = im.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()
    visited = bytearray(w * h)
    stack: list[tuple[int, int]] = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    for x in range(0, w, 8):
        stack.append((x, 0))
        stack.append((x, h - 1))
    for y in range(0, h, 8):
        stack.append((0, y))
        stack.append((w - 1, y))

    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        idx = y * w + x
        if visited[idx]:
            continue
        visited[idx] = 1
        c = px[x, y]
        if not is_bg(c):
            continue
        px[x, y] = (0, 0, 0, 0)
        stack.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])

    bbox = rgba.getbbox()
    if bbox:
        pad = 8
        l, t, r, b = bbox
        l = max(0, l - pad)
        t = max(0, t - pad)
        r = min(w, r + pad)
        b = min(h, b + pad)
        rgba = rgba.crop((l, t, r, b))
    return rgba


def main() -> None:
    for src_name, out_name in MAPPING.items():
        in_path = SRC / src_name
        out_path = DEST / out_name
        if not in_path.exists():
            print(f"MISSING {src_name}")
            continue
        result = flood_clear(Image.open(in_path))
        result.save(out_path, "PNG")
        print(f"OK {src_name} -> {out_name} {result.size}")


if __name__ == "__main__":
    main()
