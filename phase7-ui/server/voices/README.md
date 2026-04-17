# Voice Profiles

Each voice profile is a reference `.wav` file that XTTS/Chatterbox clones.

## How to add a new voice

### Step 1 — Get reference audio

You need 5–15 seconds of clean speech from the target voice (no background music, single speaker).

**From YouTube (quickest method):**
```bash
pip install yt-dlp ffmpeg-python
# Download audio from a YouTube clip
yt-dlp -x --audio-format wav -o "raw_%(id)s.%(ext)s" "https://youtube.com/watch?v=VIDEO_ID"
# Trim to the best 8 seconds (adjust -ss start time and -t duration)
ffmpeg -i raw_VIDEO_ID.wav -ss 0:00:05 -t 8 -ar 22050 -ac 1 voicename.wav
```

**Requirements for good cloning:**
- 5–15 seconds ideal (more is better up to ~30s)
- Clean speech, minimal background noise
- The emotional tone you want (calm, dramatic, commanding)
- Mono or stereo both work — we convert to mono 22050 Hz

## Current profiles

| File | Voice | Notes |
|------|-------|-------|
| `megatron.wav` | Megatron (Transformers) | To add: find a clip of Frank Welker / Hugo Weaving |
| *(add more .wav files here)* | | |

## Profile registration

Profiles are auto-discovered from this directory at server startup.
Any `.wav` file here becomes an available voice — no code changes needed.
The filename (without `.wav`) is used as the profile ID.

## Tips for Megatron

- **G1 animated** (Frank Welker, 1984): flat affect, metallic delivery — search YouTube for "G1 Megatron speech"
- **Movie Megatron** (Hugo Weaving, 2007): gravelly, menacing — cleaner audio quality
- **Transformers: Prime** (Frank Welker, 2010): deeper, more powerful — probably the best for cloning

Pick 8 seconds where he speaks steadily with no music underneath.
