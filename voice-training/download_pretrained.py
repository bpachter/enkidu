"""
download_pretrained.py — Download StyleTTS2 LibriTTS pretrained checkpoint.

Downloads directly from the HuggingFace CDN (no HF library needed),
with SSL verification disabled to avoid Windows TLS connection resets.

Files needed:
  - epoch_2nd_00100.pth   (~1.4 GB) model weights
  - config.yml            (<1 KB)   model config
  - and associated aligner / pitch extractor files
"""

import os
import sys
import warnings
from pathlib import Path

import requests
import urllib3

# Suppress the InsecureRequestWarning — we know we're disabling SSL verification
# because urllib / Windows TLS drops connections to HuggingFace (WinError 10054).
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
warnings.filterwarnings("ignore", message="Unverified HTTPS")

OUT_DIR = Path(__file__).parent / "pretrained" / "StyleTTS2-LibriTTS"

HF_BASE = "https://huggingface.co/yl4579/StyleTTS2-LibriTTS/resolve/main"

FILES = [
    # Actual file in the HuggingFace repo is epoch 20 (the published checkpoint)
    # Utility models (ASR, JDC, PLBERT) are in the styletts2_repo/Utils/ dir from git clone
    ("Models/LibriTTS/epochs_2nd_00020.pth",  "epochs_2nd_00020.pth"),
    ("Models/LibriTTS/config.yml",             "config.yml"),
]

_SESSION = requests.Session()
_SESSION.verify = False
_SESSION.headers.update({"User-Agent": "Mozilla/5.0", "Connection": "close"})


def download_file(url: str, dest: Path, label: str) -> bool:
    if dest.exists() and dest.stat().st_size > 1000:
        print(f"  {label}: already exists, skipping")
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"  {label}")
    try:
        with _SESSION.get(url, stream=True, timeout=180) as resp:
            resp.raise_for_status()
            total = int(resp.headers.get("Content-Length", 0))
            downloaded = 0
            with open(dest, "wb") as f:
                for chunk in resp.iter_content(chunk_size=1 << 20):
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total:
                        pct = downloaded * 100 // total
                        mb  = downloaded // (1 << 20)
                        print(f"\r    {pct}%  ({mb} MB / {total // (1<<20)} MB)", end="", flush=True)
        print(f"\r    done ({dest.stat().st_size // (1<<20)} MB)          ")
        return True
    except Exception as e:
        print(f"\r    FAILED: {e}")
        return False


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Downloading StyleTTS2-LibriTTS pretrained weights to:\n  {OUT_DIR}\n")
    ok = True
    for hf_path, local_name in FILES:
        url  = f"{HF_BASE}/{hf_path}"
        dest = OUT_DIR / local_name
        if not download_file(url, dest, local_name):
            ok = False
    if ok:
        print("\nAll files downloaded successfully.")
        print("Run setup_styletts2.bat to install remaining deps, then train.bat to fine-tune.")
    else:
        print("\nSome files failed. Check your internet connection and retry.")
        sys.exit(1)


if __name__ == "__main__":
    main()
