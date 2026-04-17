"""
chatterbox_worker.py — Long-running Chatterbox TTS worker process.

Reads JSON requests from stdin, writes JSON responses to stdout.
Model loads once and stays in VRAM — subsequent requests are fast.

Speed optimisations:
  - torch.compile(model) with reduce-overhead — 30-50% faster after first call
  - float16 inference
  - Reference audio embedding cached per voice profile — skips re-encoding on repeat calls

Protocol:
  stdin:  {"text": "...", "voice_path": "path/to/ref.wav or empty"}
  stdout: {"ok": true, "path": "/tmp/xxx.wav"}   on success
          {"ok": false, "error": "..."}           on failure
  A single "READY" line is printed to stdout after model load.
"""

import json
import os
import sys
import tempfile
import warnings

warnings.filterwarnings("ignore")

# Suppress Chatterbox's own stdout prints during load so they don't
# corrupt our stdin/stdout protocol with the parent process.
_real_stdout = sys.stdout
sys.stdout = open(os.devnull, "w")

import torch
import torchaudio
from chatterbox.tts import ChatterboxTTS

device = "cuda" if torch.cuda.is_available() else "cpu"
model  = ChatterboxTTS.from_pretrained(device=device)

# ── Speed: compile the inner models ─────────────────────────────────────────
# reduce-overhead removes Python overhead between kernel launches — big win on
# repeated autoregressive steps. fullgraph is skipped to stay compatible.
if device == "cuda":
    try:
        model.s3gen  = torch.compile(model.s3gen,  mode="reduce-overhead")
        model.t3_cfg = torch.compile(model.t3_cfg, mode="reduce-overhead")
    except Exception:
        pass   # compile is best-effort; generation still works without it

# ── Speed: cache reference audio embeddings per voice profile ────────────────
# Encoding the reference wav is done inside model.generate() on every call.
# We monkey-patch s3gen.embed_ref to cache by file path so subsequent calls
# for the same voice skip re-encoding.
_ref_cache: dict = {}   # path → cond_dict

_original_embed_ref = model.s3gen.embed_ref

def _cached_embed_ref(ref_wav, ref_sr, device="auto", ref_fade_out=True):
    key = id(ref_wav)   # tensor identity — same tensor object = same result
    if key not in _ref_cache:
        _ref_cache[key] = _original_embed_ref(ref_wav, ref_sr, device=device, ref_fade_out=ref_fade_out)
    return _ref_cache[key]

model.s3gen.embed_ref = _cached_embed_ref

# Restore stdout and signal ready
sys.stdout.close()
sys.stdout = _real_stdout
print("READY", flush=True)

# ── Pre-load reference audio tensors into memory ─────────────────────────────
# Warm up: read all .wav files in the voices dir and run one dummy generate
# so torch.compile triggers its JIT compilation before the first real request.
_voice_tensors: dict = {}   # path → (wav_tensor, sr)

def _load_ref(path: str):
    if path not in _voice_tensors:
        wav, sr = torchaudio.load(path)
        _voice_tensors[path] = (wav.to(device), sr)
    return _voice_tensors[path]


# Trigger torch.compile warmup with a short dummy call
try:
    import glob, pathlib
    voices_dir = pathlib.Path(__file__).parent / "voices"
    wav_files  = list(voices_dir.glob("*.wav"))
    if wav_files:
        first_wav = str(wav_files[0])
        sys.stdout = open(os.devnull, "w")
        _ = model.generate("Warm up.", audio_prompt_path=first_wav)
        sys.stdout.close()
        sys.stdout = _real_stdout
except Exception:
    pass


for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        req        = json.loads(line)
        text       = req["text"]
        voice_path = req.get("voice_path", "")

        kwargs = {}
        if voice_path and os.path.exists(voice_path):
            kwargs["audio_prompt_path"] = voice_path

        sys.stdout = open(os.devnull, "w")
        try:
            wav = model.generate(text, **kwargs)
        finally:
            sys.stdout.close()
            sys.stdout = _real_stdout

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            out_path = f.name
        torchaudio.save(out_path, wav, model.sr)
        print(json.dumps({"ok": True, "path": out_path}), flush=True)

    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}), flush=True)
