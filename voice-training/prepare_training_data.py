"""
prepare_training_data.py — Resample VCTK audio and build StyleTTS2 filelists.

After download_vctk.py has extracted the raw audio and txt, this script:
  1. Resamples all WAVs to 24 kHz mono (StyleTTS2 expects 24 kHz)
  2. Runs a quick energy filter to drop silent/corrupted clips
  3. Phonemizes transcripts to IPA (espeak backend — StyleTTS2 format)
  4. Writes train_list.txt and val_list.txt: path|ipa_text|speaker_id
  5. Writes speaker_map.json

Usage:
    python prepare_training_data.py [--vctk-dir ./vctk_data] [--out-dir ./training_data]
"""

import argparse
import json
import os
import random
import re
from pathlib import Path

import numpy as np
import soundfile as sf

TARGET_SR = 24_000
MIN_DURATION_S = 1.5
MAX_DURATION_S = 12.0
MIN_RMS = 0.004
VAL_FRACTION = 0.05


def resample_wav(src: Path, dst: Path, target_sr: int = TARGET_SR) -> bool:
    try:
        import librosa
        audio, sr = librosa.load(str(src), sr=target_sr, mono=True)
        rms = float(np.sqrt(np.mean(audio.astype(np.float64) ** 2)))
        dur = len(audio) / target_sr
        if rms < MIN_RMS or dur < MIN_DURATION_S or dur > MAX_DURATION_S:
            return False
        dst.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(dst), audio, target_sr, subtype="PCM_16")
        return True
    except Exception as e:
        print(f"  SKIP {src.name}: {e}")
        return False


def phonemize_text(text: str) -> str:
    from phonemizer import phonemize
    return phonemize(
        text,
        language="en-us",
        backend="espeak",
        strip=True,
        preserve_punctuation=True,
        with_stress=True,
    ).strip()


def find_transcript(stem: str, txt_dir: Path) -> str:
    """Look up transcript for a VCTK wav stem (e.g. p237_001)."""
    base = re.sub(r"_mic\d$", "", stem)
    spkr = base.split("_")[0]
    txt = txt_dir / spkr / f"{base}.txt"
    if txt.exists():
        return txt.read_text(encoding="utf-8").strip()
    return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vctk-dir",  default="./vctk_data",    help="VCTK data root")
    ap.add_argument("--out-dir",   default="./training_data", help="Output directory")
    ap.add_argument("--speakers",  default="",               help="Comma-separated speaker IDs")
    ap.add_argument("--seed",      type=int, default=42)
    args = ap.parse_args()

    random.seed(args.seed)
    vctk     = Path(args.vctk_dir).resolve()
    out      = Path(args.out_dir).resolve()
    out_wavs = out / "wavs"
    out_wavs.mkdir(parents=True, exist_ok=True)

    wav_raw = vctk / "wavs_raw"
    txt_dir = vctk / "txt"

    if not txt_dir.exists():
        print(f"WARNING: txt directory not found at {txt_dir}")
        print("Make sure download_vctk.py extracted txt files (re-run with --extract-txt flag).")

    if args.speakers:
        speakers = [s.strip() for s in args.speakers.split(",") if s.strip()]
    else:
        speakers = sorted(p.name for p in wav_raw.iterdir() if p.is_dir())
    print(f"Processing {len(speakers)} speakers: {speakers}")

    speaker_map = {s: i for i, s in enumerate(speakers)}
    rows = []

    for spkr in speakers:
        spkr_raw = wav_raw / spkr
        if not spkr_raw.exists():
            print(f"  {spkr}: not found, skipping")
            continue

        audio_files = sorted(spkr_raw.glob("*.flac")) + sorted(spkr_raw.glob("*.wav"))
        ok = 0
        for src in audio_files:
            stem = src.stem
            base = re.sub(r"_mic\d$", "", stem)
            # Skip mic2 if mic1 exists
            if "_mic2" in stem and (spkr_raw / f"{base}_mic1{src.suffix}").exists():
                continue

            raw_text = find_transcript(stem, txt_dir)
            if not raw_text:
                continue

            dst = out_wavs / spkr / f"{base}.wav"
            if not dst.exists() and not resample_wav(src, dst, TARGET_SR):
                continue

            rows.append((str(dst), raw_text, speaker_map[spkr]))
            ok += 1

        print(f"  {spkr}: {ok} clips")

    print(f"\nTotal: {len(rows)} clips — phonemizing (this takes a few minutes)...")

    # Batch phonemize all texts
    all_texts = [r[1] for r in rows]
    from phonemizer import phonemize
    all_ipa = phonemize(
        all_texts,
        language="en-us",
        backend="espeak",
        strip=True,
        preserve_punctuation=True,
        with_stress=True,
    )

    phonemized_rows = [
        (wav, ipa.strip(), sid)
        for (wav, _, sid), ipa in zip(rows, all_ipa)
        if ipa.strip()
    ]

    random.shuffle(phonemized_rows)
    n_val = max(1, int(len(phonemized_rows) * VAL_FRACTION))
    val_rows   = phonemized_rows[:n_val]
    train_rows = phonemized_rows[n_val:]

    def _write(path: Path, data):
        # StyleTTS2 format: path|ipa_text|speaker_id
        path.write_text(
            "".join(f"{wav}|{ipa}|{sid}\n" for wav, ipa, sid in data),
            encoding="utf-8",
        )
        print(f"Wrote {len(data)} rows -> {path}")

    _write(out / "train_list.txt", train_rows)
    _write(out / "val_list.txt",   val_rows)

    (out / "speaker_map.json").write_text(
        json.dumps(speaker_map, indent=2), encoding="utf-8"
    )
    print(f"\nDone. {len(speakers)} speakers, {len(train_rows)} train / {len(val_rows)} val clips.")
    print(f"Update finetune_config.yml num_speakers if needed: {len(speakers)}")


if __name__ == "__main__":
    main()
