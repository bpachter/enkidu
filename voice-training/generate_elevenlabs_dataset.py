"""
generate_elevenlabs_dataset.py — Synthesize a StyleTTS2 training dataset
using ElevenLabs, in the exact Mithrandir voice.

Usage:
    python generate_elevenlabs_dataset.py \
        --api-key YOUR_KEY \
        --voice-id YOUR_VOICE_ID \
        [--out-dir ./elevenlabs_data] \
        [--resume]

Outputs:
    elevenlabs_data/
        wavs/          24kHz mono WAVs
        train_list.txt
        val_list.txt
"""

import argparse
import json
import random
import time
from pathlib import Path

import numpy as np
import soundfile as sf

# ---------------------------------------------------------------------------
# Sentence bank — varied lengths, phoneme coverage, Mithrandir-appropriate
# ---------------------------------------------------------------------------
SENTENCES = [
    # Short (3-7 words)
    "All systems are operational.",
    "The analysis is complete.",
    "I have considered your question.",
    "Proceed with caution.",
    "That is an astute observation.",
    "I understand completely.",
    "Let me think on this.",
    "The data is clear.",
    "Your request has been processed.",
    "I am listening.",
    "That requires further consideration.",
    "The answer is straightforward.",
    "I must advise against that.",
    "The pattern is evident.",
    "Interesting. Tell me more.",
    "This warrants closer examination.",
    "The risk is acceptable.",
    "I have run the numbers.",
    "The signal is strong.",
    "Trust the process.",

    # Medium (8-15 words)
    "Mithrandir is online and all primary systems are functioning normally.",
    "I have identified three key factors you should consider before proceeding.",
    "The market indicators suggest a period of consolidation ahead.",
    "Based on the available data, I recommend a measured approach.",
    "Your question touches on something I find genuinely interesting.",
    "The pattern you have described is consistent with prior observations.",
    "I have cross-referenced the relevant sources and reached a conclusion.",
    "Allow me to walk you through my reasoning step by step.",
    "The probability of that outcome is higher than you might expect.",
    "I would characterize the current situation as cautiously optimistic.",
    "There are several ways to interpret this, and I will explain each.",
    "The simplest explanation is often the correct one, in my experience.",
    "I have processed your request and prepared a detailed response.",
    "This is a nuanced problem that deserves a careful answer.",
    "The evidence points in one direction, though not conclusively.",
    "You raise a fair point, and I want to give it proper weight.",
    "Let us examine this from a different angle for a moment.",
    "I can confirm that the information you provided is accurate.",
    "My assessment of the situation has changed in light of this.",
    "The most prudent course of action is to gather more information.",
    "I have noticed a discrepancy that may be worth investigating.",
    "The underlying assumption in your question may need revisiting.",
    "Several factors contribute to this outcome, not just one.",
    "I will give you my honest assessment, even if it is not what you hoped.",
    "The timeline you have proposed is ambitious but potentially achievable.",
    "I am tracking multiple threads simultaneously and will report back.",
    "Your instinct on this appears to be correct based on the data.",
    "The second option carries significantly less risk in my estimation.",
    "I have flagged this for further review given the uncertainty involved.",
    "This is precisely the kind of question I find most challenging.",

    # Longer (16-25 words)
    "After reviewing all available information, I believe the most defensible position is one of structured uncertainty — acknowledging what we do not know.",
    "The quantitative indicators are telling one story while the qualitative signals suggest something rather different, and I think that tension is worth exploring.",
    "I want to be transparent about the limits of my confidence here, because I think epistemic honesty is more valuable than false certainty.",
    "When I weigh the potential upside against the downside risks, the asymmetry does not favor the aggressive approach you are considering.",
    "The relationship between these two variables is not linear, which is why simple extrapolations from past behavior can lead you astray.",
    "I have been monitoring this situation closely, and I believe a decision point is approaching sooner than most people currently anticipate.",
    "There is a version of this that works out well, and a version that does not, and right now I cannot reliably distinguish between them.",
    "The framework you are using to evaluate this problem may itself be part of the problem — it is worth stepping back and questioning the assumptions.",
    "I think the most important thing to understand here is not the conclusion, but the chain of reasoning that leads to it.",
    "What strikes me about this situation is not what has changed, but what has remained stubbornly constant despite significant pressure to shift.",

    # Technical and numeric (important for TTS coverage)
    "The value has increased by fourteen point three percent over the past quarter.",
    "I estimate the probability at roughly sixty to sixty-five percent, with significant uncertainty.",
    "The three primary variables are volatility, duration, and counterparty exposure.",
    "At current rates, the break-even point occurs somewhere around month eighteen.",
    "The error margin is plus or minus two and a half percentage points.",
    "Version two point four introduced the changes you are asking about.",
    "The system processed one thousand four hundred and twenty requests in the last hour.",
    "We are looking at a window of approximately seventy-two to ninety-six hours.",
    "The composite score across all five dimensions comes to eighty-one out of one hundred.",
    "Response latency has improved from four hundred milliseconds to under one hundred.",

    # Questions and interactive
    "Would you like me to elaborate on any of those points in particular?",
    "Is there a specific aspect of this you would like me to focus on?",
    "Have you considered what happens in the scenario where that assumption is wrong?",
    "What is the outcome you are ultimately trying to achieve here?",
    "Are you asking me to evaluate the plan as stated, or to suggest alternatives?",
    "How confident are you in the source of that information?",
    "Would a more conservative estimate be more useful for your purposes?",
    "Shall I run through the full analysis, or would a summary suffice?",
    "What would change your mind about this assessment?",
    "Is there additional context I should factor into my response?",

    # Reflective and measured tone — core Mithrandir register
    "I find myself genuinely uncertain here, which I think is the appropriate response given the available evidence.",
    "The question you are asking is deceptively simple, and I want to resist the temptation to give you a deceptively simple answer.",
    "I have been wrong before, and I try to hold that fact in mind whenever I feel most confident.",
    "There is wisdom in patience, particularly when the cost of waiting is low and the cost of being wrong is high.",
    "My role is not to tell you what you want to hear, but to tell you what I genuinely believe to be true.",
    "I will do my best to be useful, but I want to be honest about what falls within my capabilities and what does not.",
    "The most dangerous kind of confidence is the kind that feels earned but is not yet tested.",
    "Sometimes the right answer is that there is no clean answer, and I would rather say that clearly than pretend otherwise.",
    "I approach this the same way I approach everything — carefully, with attention to what I might be missing.",
    "What I can offer you is my clearest thinking, applied carefully, with an honest accounting of its limits.",

    # Phonemically diverse — covers difficult English sounds
    "The threshold for triggering the alert is deliberately set quite high.",
    "She sells seashells, but the relevant question is whether the market wants seashells.",
    "The rhythm of the speech should feel natural, not mechanical or forced.",
    "Whether the weather holds will determine whether we proceed or withdraw.",
    "The peculiar nature of this particular problem requires particular patience.",
    "Through careful thought and thorough analysis, the truth becomes clearer.",
    "The structure of the argument is sound even if the conclusion is surprising.",
    "Extraordinary claims require extraordinary evidence — that principle applies here.",
    "The philosophical question underlying this is more interesting than the practical one.",
    "Precision in language often prevents confusion downstream, and I try to practice it.",

    # Varied sentence structures
    "First, let us establish what we know with confidence. Second, what we can reasonably infer. Third, what remains genuinely uncertain.",
    "The short answer is yes. The longer answer involves several important qualifications.",
    "To put it plainly: the risk is real, the timeline is compressed, and the margin for error is narrow.",
    "I would frame it this way — not as a problem to solve, but as a tension to manage.",
    "On one hand, the case for caution is strong. On the other, inaction carries its own costs.",
    "The good news is that the situation is recoverable. The less good news is that it will require deliberate effort.",
    "Here is what I know. Here is what I do not know. Here is what I think you should do next.",
    "It is a reasonable question. It does not have a reasonable answer, at least not yet.",
    "The headline is reassuring. The details are less so, and the details usually matter more.",
    "I will give you the conclusion first, then the reasoning, so you can tell me where you disagree.",

    # More varied filler and transitions
    "As I understand it, the core of your question is really about timing.",
    "That said, I want to flag one assumption that I think deserves scrutiny.",
    "With that context in mind, let me offer a different framing.",
    "Before I answer, I want to make sure I understand what you are actually asking.",
    "To be clear, I am not disagreeing with your premise — I am questioning the conclusion.",
    "In my estimation, the most likely scenario is also the least discussed.",
    "For what it is worth, my initial read on this was different from where I ended up.",
    "The conventional wisdom here is probably right, but I would not take it for granted.",
    "I have heard this argument made before, and I think it is more persuasive than it first appears.",
    "Let me try a different approach to explaining this, since the first one clearly did not land.",

    # Additional sentences to reach ~400 total with variety
    "The connection between those two observations is not immediately obvious, but it is there.",
    "I want to resist the urge to oversimplify something that is genuinely complicated.",
    "The fact that it is difficult to measure does not mean it is not important.",
    "I am inclined to trust the process here, even though the immediate results are ambiguous.",
    "The version of events you have described is plausible but not the only plausible version.",
    "What makes this hard is not the analysis but the uncertainty about which analysis applies.",
    "I think the honest answer is that I am not sure, and I want to say that rather than guess.",
    "The counterargument to what I just said is actually quite strong, and I want to acknowledge it.",
    "We are operating under time pressure, which tends to compress the space for careful thinking.",
    "I would rather be approximately right than precisely wrong.",
    "The distinction between those two things is subtle but consequential.",
    "That framing is not wrong, exactly, but it may not be the most useful one.",
    "I keep returning to one part of this problem that I have not fully resolved.",
    "The right answer here depends heavily on assumptions that we have not yet made explicit.",
    "My confidence in this analysis is moderate — higher than a guess, lower than a certainty.",
    "I think the second-order effects here are more important than the first-order ones.",
    "The data supports the conclusion, but the data has known limitations worth acknowledging.",
    "What I find most interesting is not the outcome but what it implies about the underlying dynamics.",
    "I try not to mistake familiarity with a situation for genuine understanding of it.",
    "The magnitude of the effect is smaller than the significance of the pattern it reveals.",
    "I am comfortable with this level of uncertainty, though I understand if you are not.",
    "There is no clean answer here that does not involve some uncomfortable trade-offs.",
    "The speed at which this developed is itself informative about the underlying dynamics.",
    "I want to flag something that did not come up in our earlier discussion but probably should have.",
    "The analogy is imperfect, as analogies always are, but I think it still illuminates something useful.",
    "I am tracking this closely and will update you as the situation develops.",
    "The most useful thing I can do right now is to help you think clearly about the options.",
    "I notice I have been focusing on the downside risks — let me also be fair about the upside.",
    "The question is not whether this is possible but whether it is probable, and those are very different questions.",
    "I want to give you an honest answer, which means I need to resist the pressure to sound more certain than I am.",
]


def resample_to_24k(audio_bytes: bytes, original_sr: int) -> np.ndarray:
    import io
    import librosa
    data, sr = librosa.load(io.BytesIO(audio_bytes), sr=24_000, mono=True)
    return data


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api-key",  required=True, help="ElevenLabs API key")
    ap.add_argument("--voice-id", required=True, help="ElevenLabs voice ID for Mithrandir")
    ap.add_argument("--out-dir",  default="./elevenlabs_data", help="Output directory")
    ap.add_argument("--resume",   action="store_true", help="Skip already-generated clips")
    ap.add_argument("--model",    default="eleven_multilingual_v2", help="ElevenLabs model ID")
    ap.add_argument("--stability",    type=float, default=0.65)
    ap.add_argument("--similarity",   type=float, default=0.85)
    ap.add_argument("--style",        type=float, default=0.35)
    ap.add_argument("--val-fraction", type=float, default=0.05)
    ap.add_argument("--seed",         type=int,   default=42)
    args = ap.parse_args()

    random.seed(args.seed)

    from elevenlabs import ElevenLabs
    client = ElevenLabs(api_key=args.api_key)

    out      = Path(args.out_dir).resolve()
    wav_dir  = out / "wavs"
    wav_dir.mkdir(parents=True, exist_ok=True)

    sentences = SENTENCES.copy()
    random.shuffle(sentences)

    print(f"Generating {len(sentences)} clips into {out}")
    print(f"Voice: {args.voice_id}  Model: {args.model}")
    print(f"Stability={args.stability}  Similarity={args.similarity}  Style={args.style}\n")

    completed = []
    failed    = []

    for i, text in enumerate(sentences):
        wav_path = wav_dir / f"mithrandir_{i:04d}.wav"

        if args.resume and wav_path.exists() and wav_path.stat().st_size > 1000:
            print(f"  [{i+1}/{len(sentences)}] skip (exists): {wav_path.name}")
            completed.append((str(wav_path), text))
            continue

        try:
            audio_gen = client.text_to_speech.convert(
                voice_id=args.voice_id,
                text=text,
                model_id=args.model,
                voice_settings={
                    "stability":          args.stability,
                    "similarity_boost":   args.similarity,
                    "style":              args.style,
                    "use_speaker_boost":  True,
                },
            )
            audio_bytes = b"".join(audio_gen)
            audio = resample_to_24k(audio_bytes, 44100)
            sf.write(str(wav_path), audio, 24_000, subtype="PCM_16")
            completed.append((str(wav_path), text))
            print(f"  [{i+1}/{len(sentences)}] ok  — {wav_path.name}  ({len(text)} chars)")
        except Exception as e:
            print(f"  [{i+1}/{len(sentences)}] FAILED: {e}")
            failed.append((i, text, str(e)))

        # Respect ElevenLabs rate limits
        time.sleep(0.4)

    # Write filelists (StyleTTS2 single-speaker format: path|text)
    random.shuffle(completed)
    n_val   = max(1, int(len(completed) * args.val_fraction))
    val     = completed[:n_val]
    train   = completed[n_val:]

    def _write(path, rows):
        Path(path).write_text(
            "".join(f"{wav}|{text}\n" for wav, text in rows),
            encoding="utf-8",
        )
        print(f"Wrote {len(rows)} rows -> {path}")

    _write(out / "train_list.txt", train)
    _write(out / "val_list.txt",   val)
    (out / "speaker_map.json").write_text(
        json.dumps({"mithrandir": 0}, indent=2), encoding="utf-8"
    )

    print(f"\nDone: {len(completed)} generated, {len(failed)} failed.")
    if failed:
        print("Failed sentences:")
        for idx, txt, err in failed:
            print(f"  [{idx}] {err}: {txt[:60]}")
    print(f"\nNext step: run train_elevenlabs.bat")


if __name__ == "__main__":
    main()
