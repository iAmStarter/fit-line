#!/usr/bin/env python3
"""Generate the 800×540 rich-menu PNG (สรุปออกกำลัง)."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 800, 540
OUT = Path(__file__).resolve().parent.parent / "assets" / "richmenu-summary-800x540.png"

# Teal / fitness tone aligned with success green #1e9e57 family
BG_TOP = (30, 110, 85)
BG_BOTTOM = (22, 78, 62)
ACCENT = (30, 158, 87)
TEXT_WHITE = (255, 255, 255)
TEXT_MUTED = (210, 240, 225)


def lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def main() -> None:
    img = Image.new("RGB", (W, H))
    px = img.load()
    for y in range(H):
        t = y / max(H - 1, 1)
        r = lerp(BG_TOP[0], BG_BOTTOM[0], t)
        g = lerp(BG_TOP[1], BG_BOTTOM[1], t)
        b = lerp(BG_TOP[2], BG_BOTTOM[2], t)
        for x in range(W):
            px[x, y] = (r, g, b)

    draw = ImageDraw.Draw(img)

    # Decorative bars (chart hint)
    bar_bottom = H - 72
    for i, h in enumerate([28, 44, 18, 52, 36, 12, 48]):
        x0 = 48 + i * 98
        draw.rounded_rectangle(
            (x0, bar_bottom - h, x0 + 56, bar_bottom),
            radius=4,
            fill=(255, 255, 255, 40) if img.mode == "RGBA" else (60, 150, 110),
        )

    # Icon circle
    cx, cy = 120, H // 2 - 20
    draw.ellipse((cx - 52, cy - 52, cx + 52, cy + 52), fill=ACCENT)
    draw.line((cx - 18, cy + 8, cx - 4, cy + 24), fill=TEXT_WHITE, width=8)
    draw.line((cx - 4, cy + 24, cx + 22, cy - 12), fill=TEXT_WHITE, width=8)

    # Fonts — fall back to default if no Thai font
    try:
        title_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Unicode.ttf", 52)
        sub_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Unicode.ttf", 28)
    except OSError:
        title_font = ImageFont.load_default()
        sub_font = ImageFont.load_default()

    draw.text((200, H // 2 - 58), "สรุปออกกำลัง", fill=TEXT_WHITE, font=title_font)
    draw.text((200, H // 2 + 8), "แตะเพื่อดูรายงาน 7 วัน", fill=TEXT_MUTED, font=sub_font)

    # Top chip
    draw.rounded_rectangle((32, 28, 220, 72), radius=12, fill=(255, 255, 255, 30) if False else (45, 130, 100))
    draw.text((48, 38), "Fit Webhook", fill=TEXT_WHITE, font=sub_font)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, format="PNG", optimize=True)
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
