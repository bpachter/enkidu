"""Resume an interrupted VCTK download using HTTP Range requests."""
import sys
from pathlib import Path
import requests
import urllib3
urllib3.disable_warnings()

URL = "https://datashare.ed.ac.uk/bitstream/handle/10283/3443/VCTK-Corpus-0.92.zip?sequence=2&isAllowed=y"
DEST = Path(__file__).parent / "vctk_data" / "VCTK-Corpus-0.92.zip"

def main():
    existing = DEST.stat().st_size if DEST.exists() else 0
    headers = {"User-Agent": "Mozilla/5.0", "Connection": "keep-alive"}
    if existing:
        headers["Range"] = f"bytes={existing}-"
        print(f"Resuming from {existing / (1<<30):.2f} GB")

    session = requests.Session()
    session.verify = False
    with session.get(URL, headers=headers, stream=True, timeout=600) as r:
        if r.status_code == 416:
            print("Server says file is already complete (416 Range Not Satisfiable).")
            return
        r.raise_for_status()
        total = existing + int(r.headers.get("Content-Length", 0))
        mode = "ab" if existing else "wb"
        downloaded = existing
        with open(DEST, mode) as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                f.write(chunk)
                downloaded += len(chunk)
                if total:
                    pct = downloaded * 100 // total
                    print(f"\r  {pct}%  ({downloaded/(1<<30):.2f} / {total/(1<<30):.2f} GB)", end="", flush=True)
    print(f"\nDone — {DEST.stat().st_size/(1<<30):.2f} GB total")

if __name__ == "__main__":
    main()
