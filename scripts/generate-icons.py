#!/usr/bin/env python3
"""Generate Cylform application icons in forest/emerald green.

Outputs:
  - 32x32.png
  - 128x128.png
  - 128x128@2x.png  (256×256)
  - icon.ico          (multi-resolution: 16,24,32,48,64,128,256)
  - icon.icns         (macOS icon set)
  - icon_1024x1024.png (hi-res source / marketing asset)
"""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "desktop" / "src-tauri" / "icons"

# ---------------------------------------------------------------------------
# Palette — forest/emerald greens
# ---------------------------------------------------------------------------
EMERALD = (5, 150, 105)          # #059669 — primary bond colour
FOREST = (6, 78, 59)             # #064e3b — dark outer ring
LIGHT_EMERALD = (52, 211, 153)   # #34d399 — highlight / atoms
DARK_SHADOW = (2, 44, 34)        # #022c22 — 3-D shadow
WHITE = (255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)


def hexagon_points(cx: float, cy: float, radius: float, rotation: float = 0.0):
    """Return 6 vertex tuples for a regular hexagon."""
    pts = []
    for i in range(6):
        angle = math.radians(60 * i + rotation)
        pts.append((cx + radius * math.cos(angle), cy + radius * math.sin(angle)))
    return pts


def draw_cylinder(
    draw: ImageDraw.ImageDraw,
    p1: tuple[float, float],
    p2: tuple[float, float],
    width: float,
    color_main: tuple[int, int, int],
    color_dark: tuple[int, int, int],
    color_highlight: tuple[int, int, int],
) -> None:
    """Draw a pseudo-3D cylinder between two points."""
    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    length = math.hypot(dx, dy)
    if length == 0:
        return

    ux, uy = dx / length, dy / length
    px, py = -uy, ux  # perpendicular unit vector
    hw = width / 2

    # Main body
    body = [
        (p1[0] + px * hw * 0.8, p1[1] + py * hw * 0.8),
        (p2[0] + px * hw * 0.8, p2[1] + py * hw * 0.8),
        (p2[0] - px * hw * 0.8, p2[1] - py * hw * 0.8),
        (p1[0] - px * hw * 0.8, p1[1] - py * hw * 0.8),
    ]
    draw.polygon(body, fill=color_main)

    # Top highlight strip
    highlight = [
        (p1[0] + px * hw * 0.3, p1[1] + py * hw * 0.3),
        (p2[0] + px * hw * 0.3, p2[1] + py * hw * 0.3),
        (p2[0] + px * hw * 0.6, p2[1] + py * hw * 0.6),
        (p1[0] + px * hw * 0.6, p1[1] + py * hw * 0.6),
    ]
    draw.polygon(highlight, fill=color_highlight)

    # Bottom shadow strip
    shadow = [
        (p1[0] - px * hw * 0.3, p1[1] - py * hw * 0.3),
        (p2[0] - px * hw * 0.3, p2[1] - py * hw * 0.3),
        (p2[0] - px * hw * 0.7, p2[1] - py * hw * 0.7),
        (p1[0] - px * hw * 0.7, p1[1] - py * hw * 0.7),
    ]
    draw.polygon(shadow, fill=color_dark)


def draw_sphere(
    draw: ImageDraw.ImageDraw,
    cx: float,
    cy: float,
    r: float,
    color_main: tuple[int, int, int],
    color_highlight: tuple[int, int, int],
    color_shadow: tuple[int, int, int],
) -> None:
    """Draw a glossy sphere (atom)."""
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color_main)

    # Specular highlight (top-left)
    hx = cx - r * 0.35
    hy = cy - r * 0.35
    hr = r * 0.35
    draw.ellipse([hx - hr, hy - hr, hx + hr, hy + hr], fill=color_highlight)

    # Shadow crescent (bottom-right)
    sx = cx + r * 0.25
    sy = cy + r * 0.25
    sr = r * 0.55
    draw.ellipse([sx - sr, sy - sr, sx + sr, sy + sr], fill=color_shadow)

    # Subtle outline to keep shape crisp when downsampling
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color_main, width=1)


def render_icon(size: int) -> Image.Image:
    """Render the Cylform icon at the requested pixel size."""
    scale = 4  # 4× supersample for clean edges
    s = size * scale
    img = Image.new("RGBA", (s, s), TRANSPARENT)
    draw = ImageDraw.Draw(img)

    cx = cy = s // 2

    # Outer forest-green circular canvas
    pad = int(s * 0.06)
    bg_r = (s // 2) - pad
    draw.ellipse([cx - bg_r, cy - bg_r, cx + bg_r, cy + bg_r], fill=FOREST)

    # Slightly lighter inner disc for depth
    inner_r = int(bg_r * 0.82)
    draw.ellipse([cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r], fill=(10, 120, 80))

    # Hexagonal ring (benzene-like) — the "Cylform" molecule
    hex_radius = inner_r * 0.55
    pts = hexagon_points(cx, cy, hex_radius, rotation=30)
    cyl_w = hex_radius * 0.38

    for i in range(6):
        p1 = pts[i]
        p2 = pts[(i + 1) % 6]
        draw_cylinder(draw, p1, p2, cyl_w, EMERALD, DARK_SHADOW, LIGHT_EMERALD)

    # Atoms at vertices
    atom_r = cyl_w * 0.65
    for p in pts:
        draw_sphere(draw, p[0], p[1], atom_r, EMERALD, LIGHT_EMERALD, DARK_SHADOW)

    # Central nucleus / focal sphere
    core_r = atom_r * 0.7
    draw.ellipse([cx - core_r, cy - core_r, cx + core_r, cy + core_r], fill=LIGHT_EMERALD)
    hl_r = core_r * 0.4
    draw.ellipse(
        [cx - core_r * 0.4 - hl_r, cy - core_r * 0.4 - hl_r,
         cx - core_r * 0.4 + hl_r, cy - core_r * 0.4 + hl_r],
        fill=WHITE,
    )

    # Downscale with Lanczos for anti-aliasing
    return img.resize((size, size), Image.LANCZOS)


# ---------------------------------------------------------------------------
# Low-level ICO assembler (Pillow's multi-res ICO save is unreliable)
# ---------------------------------------------------------------------------

def _encode_png(rgba_bytes: bytes, width: int, height: int) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack("!I", len(data))
            + tag
            + data
            + struct.pack("!I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for x in range(width):
            i = (y * width + x) * 4
            raw.extend(rgba_bytes[i : i + 4])

    return b"".join(
        [
            b"\x89PNG\r\n\x1a\n",
            chunk(b"IHDR", struct.pack("!IIBBBBB", width, height, 8, 6, 0, 0, 0)),
            chunk(b"IDAT", zlib.compress(bytes(raw), 9)),
            chunk(b"IEND", b""),
        ]
    )


def build_ico(images: list[tuple[int, int, bytes]]) -> bytes:
    """Assemble a multi-resolution ICO from PNG-encoded RGBA frames.

    `images` is a list of (width, height, png_bytes).
    """
    count = len(images)
    header = struct.pack("<HHH", 0, 1, count)
    directory = b""
    payload = b""
    offset = 6 + 16 * count

    for w, h, png in images:
        bw = w if w < 256 else 0
        bh = h if h < 256 else 0
        directory += struct.pack("<BBBBHHII", bw, bh, 0, 0, 1, 32, len(png), offset)
        payload += png
        offset += len(png)

    return header + directory + payload


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    ICON_DIR.mkdir(parents=True, exist_ok=True)

    # PNG exports
    png_assets = {
        "32x32.png": 32,
        "128x128.png": 128,
        "128x128@2x.png": 256,
    }

    rendered_pngs: dict[int, bytes] = {}
    for filename, size in png_assets.items():
        img = render_icon(size)
        path = ICON_DIR / filename
        img.save(path, "PNG")
        print(f"  {path.relative_to(ROOT)}")
        rendered_pngs[size] = img.tobytes()

    # Hi-res marketing source
    hi_res = render_icon(1024)
    hi_res_path = ICON_DIR / "icon_1024x1024.png"
    hi_res.save(hi_res_path, "PNG")
    print(f"  {hi_res_path.relative_to(ROOT)}")

    # ICO (multi-resolution)
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    ico_images: list[tuple[int, int, bytes]] = []
    for sz in ico_sizes:
        img = render_icon(sz)
        png_bytes = _encode_png(img.tobytes(), sz, sz)
        ico_images.append((sz, sz, png_bytes))

    ico_path = ICON_DIR / "icon.ico"
    ico_path.write_bytes(build_ico(ico_images))
    print(f"  {ico_path.relative_to(ROOT)}  ({len(ico_sizes)} sizes)")

    # ICNS (macOS)
    icns_path = ICON_DIR / "icon.icns"
    try:
        hi_res.save(icns_path, "ICNS")
        print(f"  {icns_path.relative_to(ROOT)}")
    except Exception as exc:
        print(f"  Warning: could not write ICNS ({exc})")


if __name__ == "__main__":
    main()
