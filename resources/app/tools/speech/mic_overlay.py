#!/usr/bin/env python
# Creator Studio microphone overlay - always-on-top, click-through.
# Polls the local speech status and shows a centered, rounded card at the TOP
# of the screen while Right Control is recording or the transcript is being
# written. The card is deliberately taller than the old pill so the microphone
# glyph can sit exactly in the middle of its rounded accent tile.

import argparse
import ctypes
import json
import threading
import time
import tkinter as tk
import urllib.request

WIN_W = 430
WIN_H = 104
TOP_MARGIN = 16

BG = "#0f0d17"
BORDER = "#8b6cf6"
TEXT = "#f5f1ff"
MUTED = "#a9a1bd"
ACCENT = "#8b6cf6"
TRACK = "#2b2540"
CLEAR = "#010101"


def enable_dpi_awareness() -> None:
    """Stop Windows from bitmap-scaling the overlay on high-DPI displays."""
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)  # per-monitor aware
        return
    except Exception:
        pass
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass


def round_rect(canvas, x1, y1, x2, y2, radius, **kwargs):
    radius = max(0, min(radius, (x2 - x1) // 2, (y2 - y1) // 2))
    points = [
        x1 + radius, y1,
        x2 - radius, y1,
        x2, y1,
        x2, y1 + radius,
        x2, y2 - radius,
        x2, y2,
        x2 - radius, y2,
        x1 + radius, y2,
        x1, y2,
        x1, y2 - radius,
        x1, y1 + radius,
        x1, y1,
    ]
    return canvas.create_polygon(points, smooth=True, splinesteps=24, **kwargs)


class Overlay:
    def __init__(self, port: int):
        self.port = port
        self.active = False
        self.finishing = False
        self.progress = 0
        self.failures = 0
        self.visible = False
        self.signature = None
        self.done_until = 0.0
        self.done_shown = False

        enable_dpi_awareness()
        self.root = tk.Tk()
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)
        self.root.attributes("-alpha", 0.0)
        self.root.configure(bg=CLEAR)
        self.root.withdraw()
        try:
            self.root.attributes("-transparentcolor", CLEAR)
        except Exception:
            pass

        self.scale = max(1.0, self.root.winfo_fpixels("1i") / 96.0)
        # The card design is authored at 560x148; this keeps it compact on screen.
        self.layout_scale = 0.82

        def s(value: float) -> int:
            return int(round(value * self.scale * self.layout_scale))

        self.s = s
        width = s(WIN_W)
        height = s(WIN_H)
        screen_w = self.root.winfo_screenwidth()
        x = max(0, (screen_w - width) // 2)
        y = s(TOP_MARGIN)
        self.root.geometry(f"{width}x{height}+{x}+{y}")

        self.canvas = tk.Canvas(
            self.root, width=width, height=height, bg=CLEAR, highlightthickness=0, bd=0
        )
        self.canvas.pack(fill="both", expand=True)

        # Card
        margin = s(8)
        card_top = s(4)
        card_bottom = height - s(4)
        self.card_center_y = (card_top + card_bottom) // 2
        round_rect(
            self.canvas,
            margin,
            card_top,
            width - margin,
            card_bottom,
            s(20),
            fill=BG,
            outline=BORDER,
            width=max(1, s(1)),
        )

        # Accent tile: taller rounded square, mic glyph centered in both axes.
        tile_w = s(50)
        tile_h = s(58)
        tile_x = margin + s(14)
        tile_y = self.card_center_y - tile_h // 2
        round_rect(
            self.canvas,
            tile_x,
            tile_y,
            tile_x + tile_w,
            tile_y + tile_h,
            s(20),
            fill=ACCENT,
            outline="",
        )

        cx = tile_x + tile_w // 2
        cy = self.card_center_y
        # Capsule
        round_rect(
            self.canvas,
            cx - s(6),
            cy - s(13),
            cx + s(6),
            cy + s(6),
            s(7),
            fill=TEXT,
            outline="",
        )
        # U-shaped cradle
        self.canvas.create_arc(
            cx - s(9),
            cy - s(4),
            cx + s(9),
            cy + s(12),
            start=180,
            extent=180,
            style="arc",
            outline=TEXT,
            width=max(1, s(2)),
        )
        # Stem and base
        self.canvas.create_line(cx, cy + s(12), cx, cy + s(17), fill=TEXT, width=max(1, s(2)))
        self.canvas.create_line(
            cx - s(7), cy + s(17), cx + s(7), cy + s(17), fill=TEXT, width=max(1, s(2)), capstyle="round"
        )

        # Text area is centered in the space to the right of the tile.
        content_left = tile_x + tile_w + s(16)
        content_right = width - margin - s(18)
        self.text_cx = (content_left + content_right) // 2
        self.bar_left = content_left
        self.bar_right = content_right

        self.title_id = self.canvas.create_text(
            self.text_cx,
            cy - s(12),
            anchor="center",
            text="Listening",
            fill=TEXT,
            font=("Segoe UI Semibold", -s(12)),
        )
        self.sub_id = self.canvas.create_text(
            self.text_cx,
            cy + s(10),
            anchor="center",
            text="Release Right Ctrl to transcribe",
            fill=MUTED,
            font=("Segoe UI", -s(9)),
        )

        bar_y = cy + s(4)
        bar_h = s(7)
        self.bar_top = bar_y
        self.bar_bottom = bar_y + bar_h
        self.bar_track_id = round_rect(
            self.canvas,
            self.bar_left,
            bar_y,
            self.bar_right,
            bar_y + bar_h,
            bar_h // 2,
            fill=TRACK,
            outline="",
            state="hidden",
        )
        self.bar_fill_id = round_rect(
            self.canvas,
            self.bar_left,
            bar_y,
            self.bar_left,
            bar_y + bar_h,
            bar_h // 2,
            fill=ACCENT,
            outline="",
            state="hidden",
        )
        self.root.update_idletasks()
        self.make_click_through()
        threading.Thread(target=self.poll, daemon=True).start()
        self.root.after(80, self.tick)
        self.root.mainloop()

    def make_click_through(self):
        try:
            user32 = ctypes.windll.user32
            hwnd = user32.GetParent(self.root.winfo_id()) or self.root.winfo_id()
            style = user32.GetWindowLongW(hwnd, -20)
            # WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW
            user32.SetWindowLongW(hwnd, -20, style | 0x00080000 | 0x00000020 | 0x08000000 | 0x00000080)
        except Exception:
            pass

    def poll(self):
        url = f"http://127.0.0.1:{self.port}/api/speech/status"
        while True:
            try:
                with urllib.request.urlopen(url, timeout=1.2) as response:
                    data = json.load(response)
                self.active = bool(data.get("active"))
                self.finishing = bool(data.get("finishing"))
                self.progress = max(0, min(100, int(data.get("progress") or 0)))
                self.failures = 0
            except Exception:
                self.failures += 1
                if self.failures >= 5:
                    self.active = False
                    self.finishing = False
            time.sleep(0.16)

    def _render(self, done: bool) -> None:
        s = self.s
        if self.active:
            self.canvas.itemconfigure(self.title_id, text="Listening", fill=TEXT)
            self.canvas.coords(self.title_id, self.text_cx, self.card_center_y - s(10))
            self.canvas.itemconfigure(self.sub_id, text="Release Right Ctrl to transcribe", state="normal")
            self.canvas.itemconfigure(self.bar_track_id, state="hidden")
            self.canvas.itemconfigure(self.bar_fill_id, state="hidden")
            return

        progress = 100 if done else self.progress
        title = "Done" if done else ("Transcribing" if progress < 50 else "Writing")
        self.canvas.itemconfigure(self.title_id, text=title, fill=TEXT)
        self.canvas.coords(self.title_id, self.text_cx, self.card_center_y - s(10))
        self.canvas.itemconfigure(self.sub_id, state="hidden")
        self.canvas.itemconfigure(self.bar_track_id, state="normal")
        span = max(1, self.bar_right - self.bar_left)
        fill_right = self.bar_left + max(0, int(span * progress / 100))
        if progress <= 0:
            self.canvas.itemconfigure(self.bar_fill_id, state="hidden")
        else:
            self.canvas.itemconfigure(self.bar_fill_id, state="normal")
            self.canvas.coords(
                self.bar_fill_id,
                *self._rounded_points(self.bar_left, self.bar_top, fill_right, self.bar_bottom, (self.bar_bottom - self.bar_top) // 2),
            )

    def _rounded_points(self, x1, y1, x2, y2, radius):
        radius = max(0, min(radius, max(0, (x2 - x1) // 2), (y2 - y1) // 2))
        return [
            x1 + radius, y1,
            x2 - radius, y1,
            x2, y1,
            x2, y1 + radius,
            x2, y2 - radius,
            x2, y2,
            x2 - radius, y2,
            x1 + radius, y2,
            x1, y2,
            x1, y2 - radius,
            x1, y1 + radius,
            x1, y1,
        ]

    def tick(self):
        now = time.monotonic()
        if self.finishing and self.progress >= 100:
            self.done_until = now + 0.85
            self.done_shown = True
        if self.active:
            self.done_shown = False

        show = self.active or self.finishing
        done = False
        if not show:
            if self.done_shown and now < self.done_until:
                show = True
                done = True
            else:
                self.done_shown = False

        if show:
            if not self.visible:
                self.root.deiconify()
                self.root.attributes("-alpha", 1.0)
                self.root.attributes("-topmost", True)
                self.visible = True
            signature = ("done" if done else "active" if self.active else ("typing", self.progress))
            if signature != self.signature:
                self.signature = signature
                self._render(done)
        elif self.visible:
            self.root.attributes("-alpha", 0.0)
            self.root.withdraw()
            self.visible = False
            self.signature = None

        self.root.after(80, self.tick)


INSTANCE_MUTEX_NAME = "CreatorStudio.TwiXSpeechOverlay"
_INSTANCE_MUTEX = None


def acquire_single_instance() -> bool:
    global _INSTANCE_MUTEX
    try:
        kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
        _INSTANCE_MUTEX = kernel32.CreateMutexW(None, False, INSTANCE_MUTEX_NAME)
        if kernel32.GetLastError() == 183:  # ERROR_ALREADY_EXISTS
            print("[ERROR] Another Creator Studio speech process is already running.", flush=True)
            return False
    except Exception:
        pass
    return True


def main():
    parser = argparse.ArgumentParser(description="Creator Studio microphone overlay")
    parser.add_argument("--port", type=int, default=4317)
    args = parser.parse_args()
    if not acquire_single_instance():
        return 0
    Overlay(args.port)


if __name__ == "__main__":
    main()
