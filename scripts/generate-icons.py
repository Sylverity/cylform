#!/usr/bin/env python3

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "desktop" / "src-tauri" / "icons"

BG = (255, 255, 255, 255)
CYAN = (47, 157, 244, 255)
CYAN_DARK = (27, 111, 180, 255)
ATOM = (255, 170, 76, 255)
ATOM_LIGHT = (255, 207, 145, 255)
SHADOW = (212, 228, 243, 255)


def blank(size: int, color: tuple[int, int, int, int]) -> list[list[list[int]]]:
    return [[list(color) for _ in range(size)] for _ in range(size)]


def blend(dst: list[int], src: tuple[int, int, int, int], alpha: float) -> None:
    a = max(0.0, min(1.0, alpha * (src[3] / 255.0)))
    inv = 1.0 - a
    dst[0] = round(dst[0] * inv + src[0] * a)
    dst[1] = round(dst[1] * inv + src[1] * a)
    dst[2] = round(dst[2] * inv + src[2] * a)
    dst[3] = round(dst[3] * inv + src[3] * a)


def draw_circle(
    canvas: list[list[list[int]]],
    cx: float,
    cy: float,
    radius: float,
    color: tuple[int, int, int, int],
) -> None:
    height = len(canvas)
    width = len(canvas[0])
    x0 = max(0, int(math.floor(cx - radius - 1)))
    x1 = min(width - 1, int(math.ceil(cx + radius + 1)))
    y0 = max(0, int(math.floor(cy - radius - 1)))
    y1 = min(height - 1, int(math.ceil(cy + radius + 1)))

    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            dist = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            coverage = radius + 0.5 - dist
            if coverage > 0:
                blend(canvas[y][x], color, min(1.0, coverage))


def draw_segment(
    canvas: list[list[list[int]]],
    ax: float,
    ay: float,
    bx: float,
    by: float,
    radius: float,
    color: tuple[int, int, int, int],
) -> None:
    height = len(canvas)
    width = len(canvas[0])
    x0 = max(0, int(math.floor(min(ax, bx) - radius - 1)))
    x1 = min(width - 1, int(math.ceil(max(ax, bx) + radius + 1)))
    y0 = max(0, int(math.floor(min(ay, by) - radius - 1)))
    y1 = min(height - 1, int(math.ceil(max(ay, by) + radius + 1)))

    vx = bx - ax
    vy = by - ay
    vv = vx * vx + vy * vy

    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px = x + 0.5 - ax
            py = y + 0.5 - ay
            t = 0.0 if vv == 0 else max(0.0, min(1.0, (px * vx + py * vy) / vv))
            qx = ax + t * vx
            qy = ay + t * vy
            dist = math.hypot(x + 0.5 - qx, y + 0.5 - qy)
            coverage = radius + 0.5 - dist
            if coverage > 0:
                blend(canvas[y][x], color, min(1.0, coverage))


def encode_png(canvas: list[list[list[int]]]) -> bytes:
    height = len(canvas)
    width = len(canvas[0])

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack("!I", len(data))
            + tag
            + data
            + struct.pack("!I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    raw = bytearray()
    for row in canvas:
        raw.append(0)
        for pixel in row:
            raw.extend(pixel)

    return b"".join(
        [
            b"\x89PNG\r\n\x1a\n",
            chunk(b"IHDR", struct.pack("!IIBBBBB", width, height, 8, 6, 0, 0, 0)),
            chunk(b"IDAT", zlib.compress(bytes(raw), 9)),
            chunk(b"IEND", b""),
        ]
    )


def ico_from_png(png_data: bytes, size: int) -> bytes:
    header = struct.pack("<HHH", 0, 1, 1)
    directory = struct.pack(
        "<BBBBHHII",
        0 if size >= 256 else size,
        0 if size >= 256 else size,
        0,
        0,
        1,
        32,
        len(png_data),
        6 + 16,
    )
    return header + directory + png_data


def render_icon(size: int) -> bytes:
    canvas = blank(size, BG)
    scale = size / 256.0

    draw_circle(canvas, 128 * scale, 128 * scale, 102 * scale, SHADOW)
    draw_segment(canvas, 70 * scale, 170 * scale, 182 * scale, 86 * scale, 31 * scale, CYAN_DARK)
    draw_segment(canvas, 70 * scale, 164 * scale, 182 * scale, 80 * scale, 24 * scale, CYAN)
    draw_circle(canvas, 65 * scale, 176 * scale, 28 * scale, ATOM)
    draw_circle(canvas, 189 * scale, 78 * scale, 24 * scale, ATOM)
    draw_circle(canvas, 183 * scale, 72 * scale, 11 * scale, ATOM_LIGHT)
    draw_circle(canvas, 59 * scale, 170 * scale, 13 * scale, ATOM_LIGHT)

    return encode_png(canvas)


def main() -> None:
    ICON_DIR.mkdir(parents=True, exist_ok=True)

    assets = {
        "32x32.png": 32,
        "128x128.png": 128,
        "128x128@2x.png": 256,
    }

    rendered: dict[int, bytes] = {}
    for filename, size in assets.items():
        png = render_icon(size)
        rendered[size] = png
        (ICON_DIR / filename).write_bytes(png)

    (ICON_DIR / "icon.ico").write_bytes(ico_from_png(rendered[256], 256))


if __name__ == "__main__":
    main()
