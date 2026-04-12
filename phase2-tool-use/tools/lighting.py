"""
lighting.py — RGB lighting effects for Enkidu

Drives a "churning" animation across all OpenRGB devices while local GPU
inference is running. Two strategies depending on device capability:

  - Devices with "Direct" mode (e.g. Corsair K70):
      Per-LED amber/orange wave rendered in a background thread.

  - Devices without "Direct" but with hardware effects (e.g. Dell G Series):
      Switches to "Rainbow Wave" during inference, restores "Static" after.

If OpenRGB isn't running, all calls are silent no-ops.

Requirements:
    - OpenRGB running with SDK Server enabled (port 6742)
    - pip install openrgb-python
"""

import threading
import time
from typing import Optional

try:
    from openrgb import OpenRGBClient
    from openrgb.utils import RGBColor
    _OPENRGB_AVAILABLE = True
except ImportError as e:
    print(f"[lighting] openrgb-python not available: {e}")
    _OPENRGB_AVAILABLE = False
    RGBColor = None


# --- Animation config ---

_FRAME_DELAY = 0.04   # seconds per frame (~25 fps)

# Hardware mode for zone-less devices (Dell G Series etc.)
_HARDWARE_INFERENCE_MODE = "Rainbow Wave"
_HARDWARE_RESTORE_MODE   = "Static"


# --- Internal helpers ---

def _hsv_to_rgb(h: float, s: float, v: float) -> RGBColor:
    """Convert HSV (h in [0,360], s and v in [0,1]) to RGBColor."""
    h = h % 360
    c = v * s
    x = c * (1 - abs((h / 60) % 2 - 1))
    m = v - c
    if   h < 60:  r, g, b = c, x, 0
    elif h < 120: r, g, b = x, c, 0
    elif h < 180: r, g, b = 0, c, x
    elif h < 240: r, g, b = 0, x, c
    elif h < 300: r, g, b = x, 0, c
    else:         r, g, b = c, 0, x
    return RGBColor(int((r + m) * 255), int((g + m) * 255), int((b + m) * 255))


def _rainbow_color(position: float, t: float) -> RGBColor:
    """
    Full-spectrum rainbow wave that sweeps across the keyboard.
    position: LED position normalized [0, 1]
    t:        elapsed time in seconds
    """
    wave_cycles = 1.5   # number of full rainbow cycles visible at once
    speed = 120         # degrees per second — how fast the wave travels
    hue = (position * 360 * wave_cycles + t * speed) % 360
    return _hsv_to_rgb(hue, 1.0, 1.0)


def _supports_mode(device, mode_name: str) -> bool:
    return any(m.name.lower() == mode_name.lower() for m in device.modes)


def _set_mode(device, mode_name: str):
    try:
        device.set_mode(mode_name)
    except Exception:
        pass


def _run_animation(stop: threading.Event):
    """Background thread: drives per-LED wave on Direct devices."""
    try:
        client = OpenRGBClient(name="Enkidu")
    except Exception as e:
        print(f"[lighting] Could not connect to OpenRGB: {e}")
        return

    # Separate devices by capability
    direct_devices = [d for d in client.devices if _supports_mode(d, "Direct")]
    hardware_devices = [d for d in client.devices if not _supports_mode(d, "Direct")]

    # Direct devices: switch to Direct mode for per-LED control
    for device in direct_devices:
        _set_mode(device, "Direct")

    # Hardware-mode devices: activate inference effect now
    for device in hardware_devices:
        if _supports_mode(device, _HARDWARE_INFERENCE_MODE):
            _set_mode(device, _HARDWARE_INFERENCE_MODE)

    start = time.perf_counter()

    while not stop.is_set():
        t = time.perf_counter() - start

        for device in direct_devices:
            for zone in device.zones:
                n = len(zone.leds)
                if n == 0:
                    continue
                colors = [_rainbow_color(i / n, t) for i in range(n)]
                try:
                    zone.set_colors(colors, fast=True)
                except Exception:
                    pass

        time.sleep(_FRAME_DELAY)

    # Restore everything
    black = RGBColor(0, 0, 0)
    for device in direct_devices:
        try:
            device.set_color(black)  # set_color (singular) sends immediately
        except Exception:
            pass

    for device in hardware_devices:
        _set_mode(device, _HARDWARE_RESTORE_MODE)
        try:
            device.set_color(black)
        except Exception:
            pass


# --- Public API ---

_stop_event: Optional[threading.Event] = None
_thread:     Optional[threading.Thread] = None


def inference_start():
    """Call before local inference. Starts the lighting animation."""
    global _stop_event, _thread

    if not _OPENRGB_AVAILABLE:
        return
    if _thread and _thread.is_alive():
        return

    _stop_event = threading.Event()
    _thread = threading.Thread(target=_run_animation, args=(_stop_event,), daemon=True)
    _thread.start()


def inference_stop():
    """Call after local inference. Stops animation and restores lights."""
    global _stop_event, _thread

    if _stop_event:
        _stop_event.set()
    if _thread:
        _thread.join(timeout=2.0)
    _stop_event = None
    _thread = None


# --- Quick test ---
if __name__ == "__main__":
    print("Starting animation for 10 seconds...")
    inference_start()
    time.sleep(10)
    print("Stopping...")
    inference_stop()
    print("Done.")
