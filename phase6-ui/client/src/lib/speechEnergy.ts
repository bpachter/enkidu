/**
 * speechEnergy.ts — module-level speech amplitude broadcaster
 *
 * When TTS audio plays, the audio pipeline hooks in an AnalyserNode and
 * calls setSpeechAnalyser(). A RAF loop reads time-domain amplitude and
 * broadcasts a normalised energy value [0, 1] to all registered listeners.
 *
 * Components (CelestialBackground, ChatPanel) subscribe once and read this
 * value in their own RAF loops via a ref, keeping rendering fully decoupled.
 */

type EnergyListener = (energy: number, isSpeaking: boolean) => void

const _listeners = new Set<EnergyListener>()
let _analyser: AnalyserNode | null = null
let _frameId:  number | null = null
let _tdBuf:    Uint8Array<ArrayBuffer> | null = null

// ── Public API ─────────────────────────────────────────────────────────────

/** Call when a new audio buffer starts playing (pass the connected AnalyserNode). */
export function setSpeechAnalyser(a: AnalyserNode | null): void {
  _analyser = a
  _tdBuf    = a ? new Uint8Array(a.frequencyBinCount) as Uint8Array<ArrayBuffer> : null
  if (a && _frameId === null) _startLoop()
  if (!a)                     _broadcast(0, false)
}

/** Subscribe to speech energy updates. Returns an unsubscribe function. */
export function subscribeSpeechEnergy(fn: EnergyListener): () => void {
  _listeners.add(fn)
  return () => _listeners.delete(fn)
}

// ── Internal ───────────────────────────────────────────────────────────────

function _startLoop(): void {
  const loop = () => {
    if (!_analyser || !_tdBuf) {
      _frameId = null
      return
    }
    _analyser.getByteTimeDomainData(_tdBuf)

    // RMS of deviation from silence centre (128) → normalise to [0, 1]
    let sumSq = 0
    for (let i = 0; i < _tdBuf.length; i++) {
      const dev = (_tdBuf[i] - 128) / 128
      sumSq += dev * dev
    }
    const rms    = Math.sqrt(sumSq / _tdBuf.length)
    const energy = Math.min(1, rms / 0.22)   // 0.22 ≈ typical speech peak RMS

    _broadcast(energy, energy > 0.04)
    _frameId = requestAnimationFrame(loop)
  }
  _frameId = requestAnimationFrame(loop)
}

function _broadcast(energy: number, isSpeaking: boolean): void {
  for (const fn of _listeners) fn(energy, isSpeaking)
}
