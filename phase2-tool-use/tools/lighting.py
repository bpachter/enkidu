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
except ImportError:
    _OPENRGB_AVAILABLE = False


# --- Animation config ---

# Amber/orange wave colors — cycles across keyboard LEDs
_WAVE_COLORS = [
    RGBColor(255, 80,  0),   # amber-orange
    RGBColor(255, 30,  0),   # deep red-orange
    RGBColor(255, 140, 0),   # bright amber
    RGBColor(200, 20,  0),   # dark red
    RGBColor(255, 60,  0),   # orange
]

_FRAME_DELAY = 0.05   # seconds per frame (~20 fps)
_WAVE_SPEED  = 0.4    # wave travel speed (higher = faster)

# Hardware mode to use for zone-less devices during inference
_HARDWARE_INFERENCE_MODE = "Rainbow Wave"
_HARDWARE_RESTORE_MODE   = "Static"
_RESTORE_COLOR           = RGBColor(0, 0, 0)


# --- Internal helpers ---

def _lerp_color(a: RGBColor, b: RGBColor, t: float) -> RGBColor:
    return RGBColor(
        int(a.red   + (b.red   - a.red)   * t),
        int(a.green + (b.green - a.green) * t),
        int(a.blue  + (b.blue  - a.blue)  * t),
    )


def _wave_color(position: float, t: float) -> RGBColor:
    """Color for one LED at normalized position [0,1] at time t."""
    phase = (position - t * _WAVE_SPEED) % 1.0
    n = len(_WAVE_COLORS)
    idx_f = phase * n
    idx_a = int(idx_f) % n
    idx_b = (idx_a + 1) % n
    return _lerp_color(_WAVE_COLORS[idx_a], _WAVE_COLORS[idx_b], idx_f - int(idx_f))


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
    except Exception:
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
            n = len(device.leds)
            if n == 0:
                continue
            colors = [_wave_color(i / n, t) for i in range(n)]
            try:
                device.set_colors(colors)
            except Exception:
                pass

        time.sleep(_FRAME_DELAY)

    # Restore everything
    for device in direct_devices:
        try:
            device.set_color(_RESTORE_COLOR)
        except Exception:
            pass

    for device in hardware_devices:
        _set_mode(device, _HARDWARE_RESTORE_MODE)
        try:
            device.set_color(_RESTORE_COLOR)
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
