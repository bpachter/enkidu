"""
phase7-ui/server/voice.py — Speech-to-text + text-to-speech for Enkidu

STT: faster-whisper (base.en CUDA float16 → CPU int8 fallback)
     initial_prompt biases Whisper toward "Enkidu" and other proper nouns

TTS priority (per voice profile):
  1. Chatterbox (Resemble AI) — local voice cloning from .wav reference, GPU
  2. edge-tts BrianNeural     — neural quality, requires internet
  3. pyttsx3 David Desktop    — offline Windows SAPI5 fallback

Voice profiles:
  Drop any .wav file into phase7-ui/server/voices/
  The filename (without .wav) becomes the profile ID.
  GET /api/voices  → list of available profile IDs
  Active profile stored in module-level _active_voice (default: "default")
"""

import asyncio
import json as _json
import logging
import math
import os
import subprocess
import sys
import tempfile
import threading
from pathlib import Path
from typing import Optional

import numpy as np

logger = logging.getLogger("enkidu.voice")

# ---------------------------------------------------------------------------
# Voice profile directory
# ---------------------------------------------------------------------------

_VOICES_DIR = Path(__file__).parent / "voices"

def prewarm_chatterbox():
    """Start TTS workers in background threads so they're ready for the first request."""
    if not list_voices():
        return
    if _f5_available():
        t = threading.Thread(target=_start_f5_worker, name="f5tts-prewarm", daemon=True)
        t.start()
        logger.info("F5-TTS worker pre-warming in background…")
    else:
        t = threading.Thread(target=_start_worker, name="chatterbox-prewarm", daemon=True)
        t.start()
        logger.info("Chatterbox worker pre-warming in background…")


def list_voices() -> list[str]:
    """Return sorted list of available voice profile IDs (wav filenames without ext)."""
    if not _VOICES_DIR.exists():
        return []
    return sorted(p.stem for p in _VOICES_DIR.glob("*.wav"))

def get_voice_path(profile_id: str) -> Optional[Path]:
    """Return path to a voice profile's reference wav, or None if not found."""
    p = _VOICES_DIR / f"{profile_id}.wav"
    return p if p.exists() else None

# Active voice profile (module-level, set via set_active_voice)
_active_voice: str = "default"

def get_active_voice() -> str:
    return _active_voice

def set_active_voice(profile_id: str) -> bool:
    """Set active voice profile. Returns True if the profile exists (or is 'default')."""
    global _active_voice
    if profile_id == "default" or get_voice_path(profile_id) is not None:
        _active_voice = profile_id
        logger.info(f"Active voice set to: {profile_id}")
        return True
    logger.warning(f"Voice profile not found: {profile_id}")
    return False


# ---------------------------------------------------------------------------
# STT — faster-whisper
# ---------------------------------------------------------------------------

_WHISPER_MODEL_SIZE = os.environ.get("WHISPER_MODEL", "base.en")

# initial_prompt biases Whisper toward recognising "Enkidu" and related names.
_WHISPER_PROMPT = (
    "Enkidu is an AI assistant built by Ben Pachter. "
    "He runs locally on an NVIDIA RTX 4090 GPU."
)

_whisper: Optional[object] = None


def _load_whisper():
    global _whisper
    if _whisper is not None:
        return _whisper
    try:
        from faster_whisper import WhisperModel
        logger.info(f"Loading Whisper '{_WHISPER_MODEL_SIZE}' on CUDA (float16)…")
        _whisper = WhisperModel(_WHISPER_MODEL_SIZE, device="cuda", compute_type="float16")
        logger.info("Whisper ready (CUDA).")
    except Exception as e:
        logger.warning(f"CUDA Whisper failed ({e}), falling back to CPU…")
        try:
            from faster_whisper import WhisperModel
            _whisper = WhisperModel(_WHISPER_MODEL_SIZE, device="cpu", compute_type="int8")
            logger.info("Whisper ready (CPU).")
        except Exception as e2:
            logger.error(f"Whisper unavailable: {e2}")
            _whisper = None
    return _whisper


def _resample(audio: np.ndarray, orig_rate: int, target_rate: int = 16000) -> np.ndarray:
    if orig_rate == target_rate:
        return audio
    try:
        from scipy.signal import resample_poly
        g = math.gcd(orig_rate, target_rate)
        return resample_poly(audio, target_rate // g, orig_rate // g).astype(np.float32)
    except ImportError:
        n_out = int(len(audio) * target_rate / orig_rate)
        return np.interp(np.linspace(0, len(audio) - 1, n_out), np.arange(len(audio)), audio).astype(np.float32)


def transcribe(raw_bytes: bytes, sample_rate: int = 16000) -> str:
    model = _load_whisper()
    if model is None:
        return ""
    try:
        audio = np.frombuffer(raw_bytes, dtype=np.float32).copy()
        if sample_rate != 16000:
            audio = _resample(audio, sample_rate)
        segments, _ = model.transcribe(
            audio,
            language="en",
            beam_size=5,
            initial_prompt=_WHISPER_PROMPT,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 300},
        )
        text = " ".join(s.text.strip() for s in segments).strip()
        return _fix_proper_nouns(text)
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        return ""


# Belt-and-suspenders: correct common Whisper mishearings of "Enkidu"
_ENKIDU_ALIASES = [
    "and kidu", "and kiddo", "inkido", "inkidu", "en kidu", "en-kidu",
    "enkido", "enkidoo", "and cue do", "and queue do", "kidu", "unkidu",
]

def _fix_proper_nouns(text: str) -> str:
    lower = text.lower()
    for alias in _ENKIDU_ALIASES:
        if alias in lower:
            import re
            text = re.sub(re.escape(alias), "Enkidu", text, flags=re.IGNORECASE)
    return text


# ---------------------------------------------------------------------------
# TTS — F5-TTS (primary, fast flow-matching voice cloning) — persistent worker
# ---------------------------------------------------------------------------

_F5_WORKER_SCRIPT = Path(__file__).parent / "f5tts_worker.py"
_F5_MODEL_DIR     = Path(__file__).parent / "f5tts_model"

_f5_proc:   Optional[subprocess.Popen] = None
_f5_lock  = threading.Lock()
_f5_ready = False


def _f5_available() -> bool:
    return (_F5_MODEL_DIR / "model_1250000.safetensors").exists() and (_F5_MODEL_DIR / "vocab.txt").exists()


def _start_f5_worker() -> bool:
    global _f5_proc, _f5_ready
    if _f5_proc is not None and _f5_proc.poll() is None:
        return _f5_ready

    if not _f5_available():
        return False

    logger.info("Starting F5-TTS worker process…")
    try:
        _f5_proc = subprocess.Popen(
            [sys.executable, str(_F5_WORKER_SCRIPT)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        import time as _time
        deadline = _time.time() + 60
        while _time.time() < deadline:
            line = _f5_proc.stdout.readline().strip()
            if line == "READY":
                logger.info("F5-TTS worker ready.")
                _f5_ready = True
                return True
            if line:
                logger.debug(f"F5-TTS worker (startup): {line}")
        logger.error("F5-TTS worker did not become ready within 60s")
        _f5_ready = False
        return False
    except Exception as e:
        logger.error(f"Failed to start F5-TTS worker: {e}")
        _f5_proc = None; _f5_ready = False
        return False


def _synth_f5tts(text: str, voice_path: Optional[Path], timeout: int = 60) -> Optional[bytes]:
    global _f5_proc, _f5_ready
    with _f5_lock:
        if not _start_f5_worker():
            return None

        req = {"text": text, "voice_path": str(voice_path) if voice_path else ""}
        try:
            _f5_proc.stdin.write(_json.dumps(req) + "\n")
            _f5_proc.stdin.flush()
        except Exception as e:
            logger.error(f"F5-TTS worker write error: {e}")
            _f5_proc = None; _f5_ready = False
            return None

        result_holder: list = []
        def _read():
            # Skip any non-JSON lines (e.g. progress prints from tts.infer)
            while True:
                try:
                    line = _f5_proc.stdout.readline()
                except Exception:
                    break
                if not line:
                    break  # process closed
                line = line.strip()
                if not line:
                    continue
                try:
                    result_holder.append(_json.loads(line))
                    return
                except _json.JSONDecodeError:
                    logger.debug(f"F5-TTS non-JSON line: {line!r}")

        t = threading.Thread(target=_read, daemon=True)
        t.start(); t.join(timeout)

        if not result_holder:
            logger.error("F5-TTS worker timed out or died")
            _f5_proc.kill(); _f5_proc = None; _f5_ready = False
            return None

        resp = result_holder[0]

        if not resp.get("ok"):
            logger.error(f"F5-TTS error: {resp.get('error')}")
            return None

        out_path = resp["path"]
        try:
            with open(out_path, "rb") as f:
                data = f.read()
            os.unlink(out_path)
            logger.info(f"F5-TTS: {len(data)} bytes (voice={voice_path and voice_path.stem})")
            return data
        except Exception as e:
            logger.error(f"F5-TTS output read error: {e}")
            return None


# ---------------------------------------------------------------------------
# TTS — Chatterbox (fallback voice cloning) — persistent worker process
#
# The worker loads the model once and stays alive, accepting requests via
# stdin/stdout JSON. This avoids the cuDNN conflict from loading inside
# uvicorn's thread pool AND gives fast response after the first warm-up.
# ---------------------------------------------------------------------------

_WORKER_SCRIPT = Path(__file__).parent / "chatterbox_worker.py"

_worker_proc:   Optional[subprocess.Popen] = None
_worker_lock  = threading.Lock()
_worker_ready = False


def _start_worker() -> bool:
    """Start the Chatterbox worker subprocess. Returns True if ready."""
    global _worker_proc, _worker_ready
    if _worker_proc is not None and _worker_proc.poll() is None:
        return _worker_ready   # already running

    logger.info("Starting Chatterbox worker process…")
    try:
        _worker_proc = subprocess.Popen(
            [sys.executable, str(_WORKER_SCRIPT)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,   # line-buffered
        )
        # Read lines until we see "READY" — Chatterbox prints its own
        # log lines to stdout before our signal, so we skip them.
        import time as _time
        deadline = _time.time() + 120   # 2-minute load timeout
        while _time.time() < deadline:
            line = _worker_proc.stdout.readline().strip()
            if line == "READY":
                logger.info("Chatterbox worker ready.")
                _worker_ready = True
                return True
            if line:
                logger.debug(f"Chatterbox worker (startup): {line}")
        logger.error("Chatterbox worker did not become ready within 120s")
        _worker_ready = False
        return False
    except Exception as e:
        logger.error(f"Failed to start Chatterbox worker: {e}")
        _worker_proc = None
        _worker_ready = False
        return False


def _synth_chatterbox(text: str, voice_path: Optional[Path], timeout: int = 120) -> Optional[bytes]:
    """Send a synthesis request to the persistent worker. Returns WAV bytes or None."""
    global _worker_proc, _worker_ready

    with _worker_lock:
        if not _start_worker():
            return None

        req = {"text": text, "voice_path": str(voice_path) if voice_path else ""}
        try:
            _worker_proc.stdin.write(_json.dumps(req) + "\n")
            _worker_proc.stdin.flush()
        except Exception as e:
            logger.error(f"Chatterbox worker write error: {e}")
            _worker_proc = None; _worker_ready = False
            return None

        # Read response with timeout via a thread; skip any non-JSON lines
        result_holder: list = []
        def _read():
            while True:
                try:
                    line = _worker_proc.stdout.readline()
                except Exception:
                    break
                if not line:
                    break  # process closed
                line = line.strip()
                if not line:
                    continue
                try:
                    result_holder.append(_json.loads(line))
                    return
                except _json.JSONDecodeError:
                    logger.debug(f"Chatterbox non-JSON line: {line!r}")

        t = threading.Thread(target=_read, daemon=True)
        t.start()
        t.join(timeout)

        if not result_holder:
            logger.error("Chatterbox worker timed out — killing and restarting next call")
            _worker_proc.kill()
            _worker_proc = None; _worker_ready = False
            return None

        resp = result_holder[0]

        if not resp.get("ok"):
            logger.error(f"Chatterbox worker error: {resp.get('error')}")
            return None

        out_path = resp["path"]
        try:
            with open(out_path, "rb") as f:
                data = f.read()
            os.unlink(out_path)
            label = voice_path.stem if voice_path else "default"
            logger.info(f"Chatterbox TTS: {len(data)} bytes (voice={label})")
            return data
        except Exception as e:
            logger.error(f"Chatterbox worker output read error: {e}")
            return None


# ---------------------------------------------------------------------------
# TTS — edge-tts (secondary, neural, internet required)
# ---------------------------------------------------------------------------

_TTS_VOICE = "en-US-BrianNeural"


async def _synth_edge_tts(text: str) -> Optional[bytes]:
    try:
        import edge_tts
        communicate = edge_tts.Communicate(text, _TTS_VOICE)
        chunks: list[bytes] = []
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                chunks.append(chunk["data"])
        result = b"".join(chunks)
        if result:
            logger.info(f"edge-tts: {len(result)} bytes")
            return result
        logger.warning("edge-tts returned empty audio")
    except Exception as e:
        logger.warning(f"edge-tts failed: {e}")
    return None


# ---------------------------------------------------------------------------
# TTS — pyttsx3 SAPI5 (tertiary, offline Windows fallback)
# ---------------------------------------------------------------------------

def _synth_sapi(text: str) -> bytes:
    """Synthesize via pyttsx3 SAPI5 in a subprocess to avoid COM threading issues."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        tmp_path = f.name

    script = (
        "import pyttsx3, sys\n"
        "engine = pyttsx3.init()\n"
        "engine.setProperty('rate', 165)\n"
        "engine.setProperty('volume', 1.0)\n"
        "voices = engine.getProperty('voices')\n"
        "for v in voices:\n"
        "    if 'david' in v.name.lower():\n"
        "        engine.setProperty('voice', v.id)\n"
        "        break\n"
        f"engine.save_to_file({repr(text)}, {repr(tmp_path)})\n"
        "engine.runAndWait()\n"
    )

    try:
        subprocess.run(
            [sys.executable, "-c", script],
            capture_output=True,
            timeout=20,
        )
        with open(tmp_path, "rb") as f:
            return f.read()
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# Public synthesize() — tries Chatterbox → edge-tts → SAPI
# ---------------------------------------------------------------------------

async def synthesize(text: str, voice_profile: Optional[str] = None) -> tuple[bytes, str]:
    """
    Return (audio_bytes, format_str) where format_str is 'wav' or 'mp3'.

    voice_profile: override the active voice for this call (None = use _active_voice).
    Priority:
      1. Chatterbox (if available) — returns WAV
      2. edge-tts BrianNeural (if Chatterbox unavailable/no reference) — returns MP3
      3. pyttsx3 SAPI5 — returns WAV
    """
    if not text.strip():
        return b"", "wav"

    profile = voice_profile if voice_profile is not None else _active_voice
    voice_path = get_voice_path(profile) if profile != "default" else None

    loop = asyncio.get_event_loop()

    # ── 1. F5-TTS (fast flow-matching, ~2-5s) ───────────────────────────────
    if voice_path is not None and _f5_available():
        wav = await loop.run_in_executor(None, lambda: _synth_f5tts(text, voice_path))
        if wav:
            return wav, "wav"
        logger.warning("F5-TTS failed, trying Chatterbox…")

    # ── 2. Chatterbox (slower autoregressive, ~25s) ──────────────────────────
    if voice_path is not None:
        logger.info(f"Chatterbox synthesis starting (voice={voice_path.stem})…")
        wav = await loop.run_in_executor(None, lambda: _synth_chatterbox(text, voice_path))
        if wav:
            return wav, "wav"
        logger.warning("Chatterbox failed, falling back to edge-tts")

    # ── 2. edge-tts (neural, internet) ──────────────────────────────────────
    mp3 = await _synth_edge_tts(text)
    if mp3:
        return mp3, "mp3"

    # ── 3. pyttsx3 SAPI5 (offline) ──────────────────────────────────────────
    try:
        wav = await loop.run_in_executor(None, lambda: _synth_sapi(text))
        if wav:
            logger.info(f"SAPI fallback: {len(wav)} bytes")
            return wav, "wav"
    except Exception as e:
        logger.error(f"SAPI fallback failed: {e}")

    return b"", "wav"
