import { useEffect, useRef } from 'react'
import { subscribeSpeechEnergy } from '../lib/speechEnergy'

interface Star {
  x: number; y: number
  radius: number
  baseOpacity: number
  twinkleSpeed: number
  twinklePhase: number
  color: [number, number, number]
  isHero: boolean
}

interface NebulaVol {
  cx: number; cy: number
  rx: number; ry: number
  r: number; g: number; b: number
  opacity: number
  driftAmpX: number; driftAmpY: number
  driftFreqX: number; driftFreqY: number
  breatheAmp: number
  phase: number
}

interface CloudWisp {
  x0: number
  y: number
  w: number
  h: number
  opacity: number
  speed: number
  puffs: number
  undulate: number
  phase: number
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpRGB(
  n: [number, number, number],
  d: [number, number, number],
  t: number,
): string {
  return `rgb(${Math.round(lerp(n[0], d[0], t))},${Math.round(lerp(n[1], d[1], t))},${Math.round(lerp(n[2], d[2], t))})`
}

function lerpRGBA(
  n: [number, number, number, number],
  d: [number, number, number, number],
  t: number,
): string {
  return `rgba(${Math.round(lerp(n[0], d[0], t))},${Math.round(lerp(n[1], d[1], t))},${Math.round(lerp(n[2], d[2], t))},${lerp(n[3], d[3], t).toFixed(3)})`
}

// Far, mid, and near cloud layers — each drifts left at different speeds for parallax depth.
const CLOUD_WISPS: CloudWisp[] = [
  // Far layer — thin, slow, many
  { x0: 0.05, y: 0.10, w: 0.50, h: 0.042, opacity: 0.55, speed: 0.036, puffs:  7, undulate: 0.006, phase: 0.0 },
  { x0: 0.45, y: 0.24, w: 0.44, h: 0.038, opacity: 0.50, speed: 0.033, puffs:  6, undulate: 0.005, phase: 1.3 },
  { x0: 0.82, y: 0.70, w: 0.48, h: 0.040, opacity: 0.48, speed: 0.039, puffs:  6, undulate: 0.006, phase: 2.6 },
  { x0: 0.22, y: 0.56, w: 0.40, h: 0.036, opacity: 0.46, speed: 0.031, puffs:  5, undulate: 0.005, phase: 4.1 },
  { x0: 0.65, y: 0.38, w: 0.52, h: 0.042, opacity: 0.52, speed: 0.037, puffs:  7, undulate: 0.006, phase: 5.5 },
  // Mid layer — broader, medium speed
  { x0: 0.15, y: 0.18, w: 0.68, h: 0.070, opacity: 0.60, speed: 0.064, puffs:  9, undulate: 0.010, phase: 0.7 },
  { x0: 0.60, y: 0.50, w: 0.62, h: 0.065, opacity: 0.56, speed: 0.070, puffs:  8, undulate: 0.011, phase: 2.2 },
  { x0: 0.90, y: 0.30, w: 0.72, h: 0.075, opacity: 0.58, speed: 0.060, puffs: 10, undulate: 0.009, phase: 3.8 },
  { x0: 0.35, y: 0.78, w: 0.60, h: 0.068, opacity: 0.50, speed: 0.072, puffs:  8, undulate: 0.011, phase: 5.0 },
  // Near layer — large, faster, more diffuse
  { x0: 0.25, y: 0.06, w: 0.88, h: 0.130, opacity: 0.38, speed: 0.128, puffs: 12, undulate: 0.015, phase: 1.5 },
  { x0: 0.70, y: 0.88, w: 0.82, h: 0.125, opacity: 0.34, speed: 0.136, puffs: 11, undulate: 0.017, phase: 4.0 },
  { x0: 0.50, y: 0.46, w: 0.76, h: 0.118, opacity: 0.36, speed: 0.120, puffs: 11, undulate: 0.014, phase: 6.5 },
]

function buildStars(count: number): Star[] {
  return Array.from({ length: count }, () => {
    const roll = Math.random()
    const isHero = roll > 0.88
    const isMid  = roll > 0.55
    const cRoll = Math.random()
    let color: [number, number, number]
    if      (cRoll > 0.82) color = [255, 244, 206]
    else if (cRoll > 0.62) color = [225, 238, 255]
    else if (cRoll > 0.42) color = [236, 246, 255]
    else                   color = [250, 252, 255]
    return {
      x:            Math.random(),
      y:            Math.random(),
      radius:       isHero ? 1.1 + Math.random() * 0.7 : isMid ? 0.55 + Math.random() * 0.45 : 0.25 + Math.random() * 0.30,
      baseOpacity:  isHero ? 0.70 + Math.random() * 0.30 : 0.28 + Math.random() * 0.52,
      twinkleSpeed: 0.35 + Math.random() * 1.60,
      twinklePhase: Math.random() * Math.PI * 2,
      color,
      isHero,
    }
  })
}

const NIGHT_NEBULAE: NebulaVol[] = [
  { cx: 0.12, cy: 0.08, rx: 0.58, ry: 0.46, r: 40,  g: 98,  b: 170, opacity: 0.26,
    driftAmpX: 0.022, driftAmpY: 0.018, driftFreqX: 0.15, driftFreqY: 0.11, breatheAmp: 0.18, phase: 0.0 },
  { cx: 0.88, cy: 0.90, rx: 0.44, ry: 0.38, r: 32,  g: 84,  b: 148, opacity: 0.24,
    driftAmpX: 0.018, driftAmpY: 0.020, driftFreqX: 0.12, driftFreqY: 0.18, breatheAmp: 0.16, phase: 1.4 },
  { cx: 0.52, cy: 0.52, rx: 0.34, ry: 0.42, r: 64,  g: 124, b: 198, opacity: 0.18,
    driftAmpX: 0.014, driftAmpY: 0.012, driftFreqX: 0.20, driftFreqY: 0.15, breatheAmp: 0.20, phase: 2.8 },
  { cx: 0.76, cy: 0.16, rx: 0.30, ry: 0.26, r: 156, g: 136, b: 84,  opacity: 0.12,
    driftAmpX: 0.016, driftAmpY: 0.012, driftFreqX: 0.17, driftFreqY: 0.20, breatheAmp: 0.12, phase: 0.7 },
  { cx: 0.22, cy: 0.78, rx: 0.26, ry: 0.34, r: 52,  g: 112, b: 184, opacity: 0.18,
    driftAmpX: 0.013, driftAmpY: 0.016, driftFreqX: 0.22, driftFreqY: 0.12, breatheAmp: 0.16, phase: 2.1 },
  { cx: 0.58, cy: 0.82, rx: 0.24, ry: 0.24, r: 42,  g: 90,  b: 158, opacity: 0.14,
    driftAmpX: 0.011, driftAmpY: 0.014, driftFreqX: 0.18, driftFreqY: 0.16, breatheAmp: 0.14, phase: 4.3 },
]

const STARS = buildStars(160)

export default function CelestialBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const speechEnergyRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const unsub = subscribeSpeechEnergy((e) => { speechEnergyRef.current = e })
    const ctx = canvas.getContext('2d')!
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2))

    // Read theme set synchronously by App.tsx's useState initializer — no flash.
    const initialProgress = document.documentElement.getAttribute('data-theme') === 'dark' ? 0 : 1
    const themeProgressRef = { current: initialProgress }
    const themeTargetRef   = { current: initialProgress }

    const resize = () => {
      canvas.width  = Math.floor(window.innerWidth * dpr)
      canvas.height = Math.floor(window.innerHeight * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const themeObserver = new MutationObserver(() => {
      themeTargetRef.current = document.documentElement.getAttribute('data-theme') === 'dark' ? 0 : 1
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    let frameId: number
    let t = 0

    const draw = () => {
      frameId = requestAnimationFrame(draw)
      t += 0.008
      const speechBoost = speechEnergyRef.current
      const W = canvas.width / dpr
      const H = canvas.height / dpr

      // ── Smooth theme transition: ~4s linear at 60fps (0.004/frame) ──
      const diff = themeTargetRef.current - themeProgressRef.current
      if (Math.abs(diff) > 0.0005) {
        themeProgressRef.current += Math.sign(diff) * Math.min(Math.abs(diff), 0.004)
      }
      const p = themeProgressRef.current  // 0 = full night, 1 = full day

      // ── Sky gradient: lerp night→day stops ────────────────────
      ctx.globalCompositeOperation = 'source-over'
      const sky = ctx.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0.00, lerpRGB([6, 22, 43],   [96, 105, 114], p))
      sky.addColorStop(0.36, lerpRGB([3, 16, 34],   [114, 124, 134], p))
      sky.addColorStop(0.70, lerpRGB([2, 12, 26],   [146, 156, 167], p))
      sky.addColorStop(1.00, lerpRGB([1,  7, 19],   [168, 177, 187], p))
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, W, H)

      // ── Night: celestial blue bloom (fades as day rises) ──────
      const nightBloomOp = 0.14 * (1 - p)
      if (nightBloomOp > 0.001) {
        const bloom = ctx.createRadialGradient(W * 0.58, H * 0.06, H * 0.03, W * 0.5, H * 0.2, H * 0.7)
        bloom.addColorStop(0, `rgba(126,182,244,${nightBloomOp.toFixed(3)})`)
        bloom.addColorStop(1, 'rgba(126,182,244,0)')
        ctx.fillStyle = bloom
        ctx.fillRect(0, 0, W, H)
      }

      // ── Day: heavenly light (rises with p) ────────────────────
      if (p > 0.001) {
        const heavenPulse = 0.88 + 0.12 * Math.sin(t * 0.22)
        const speechGlow  = 1 + speechBoost * 0.70

        const bloom = ctx.createRadialGradient(W * 0.50, H * 0.16, H * 0.02, W * 0.50, H * 0.34, H * 0.78)
        bloom.addColorStop(0,    `rgba(255,255,255,${Math.min(0.90, 0.48 * heavenPulse * speechGlow * p).toFixed(3)})`)
        bloom.addColorStop(0.35, `rgba(246,249,255,${Math.min(0.55, 0.23 * heavenPulse * speechGlow * p).toFixed(3)})`)
        bloom.addColorStop(1,    'rgba(255,255,255,0)')
        ctx.fillStyle = bloom
        ctx.fillRect(0, 0, W, H)

        const shaft = ctx.createLinearGradient(W * 0.30, 0, W * 0.70, 0)
        shaft.addColorStop(0.00, 'rgba(255,255,255,0)')
        shaft.addColorStop(0.38, `rgba(245,249,255,${Math.min(0.22, 0.06 * heavenPulse * speechGlow * p).toFixed(3)})`)
        shaft.addColorStop(0.50, `rgba(255,255,255,${Math.min(0.45, 0.14 * heavenPulse * speechGlow * p).toFixed(3)})`)
        shaft.addColorStop(0.62, `rgba(245,249,255,${Math.min(0.22, 0.06 * heavenPulse * speechGlow * p).toFixed(3)})`)
        shaft.addColorStop(1.00, 'rgba(255,255,255,0)')
        ctx.fillStyle = shaft
        ctx.fillRect(0, 0, W, H)

        const aureole = ctx.createRadialGradient(W * 0.5, H * 0.12, H * 0.01, W * 0.5, H * 0.12, H * 0.18)
        aureole.addColorStop(0, `rgba(255,255,255,${Math.min(0.80, 0.34 * heavenPulse * speechGlow * p).toFixed(3)})`)
        aureole.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = aureole
        ctx.fillRect(0, 0, W, H)
      }

      // ── Night: additive nebula volumes (dissolve into day) ────
      if (p < 0.999) {
        ctx.globalCompositeOperation = 'lighter'
        for (const neb of NIGHT_NEBULAE) {
          const breathe = 1 + neb.breatheAmp * Math.sin(t * 0.4 + neb.phase)
          const cx = (neb.cx + neb.driftAmpX * Math.sin(t * neb.driftFreqX + neb.phase)) * W
          const cy = (neb.cy + neb.driftAmpY * Math.cos(t * neb.driftFreqY + neb.phase)) * H
          const rx = neb.rx * W
          const ry = neb.ry * W
          const op = Math.min(neb.opacity * breathe, 0.54) * (1 - p)
          if (op < 0.001) continue
          const speechNebBoost = 1 + speechBoost * 0.35

          ctx.save()
          ctx.translate(cx, cy)
          ctx.scale(1, ry / rx)

          const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx)
          grad.addColorStop(0,    `rgba(${neb.r},${neb.g},${neb.b},${Math.min(0.72, op * speechNebBoost * 0.85).toFixed(3)})`)
          grad.addColorStop(0.38, `rgba(${neb.r},${neb.g},${neb.b},${Math.min(0.44, op * speechNebBoost * 0.50).toFixed(3)})`)
          grad.addColorStop(0.72, `rgba(${neb.r},${neb.g},${neb.b},${Math.min(0.16, op * speechNebBoost * 0.18).toFixed(3)})`)
          grad.addColorStop(1,    `rgba(${neb.r},${neb.g},${neb.b},0)`)

          ctx.fillStyle = grad
          ctx.beginPath()
          ctx.arc(0, 0, rx, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
        }
      }

      // ── Day: parallax cloud wisps (materialize with p) ────────
      if (p > 0.001) {
        ctx.globalCompositeOperation = 'source-over'
        for (const wisp of CLOUD_WISPS) {
          const period   = 1.0 + wisp.w + 0.12
          const rawPhase = (wisp.x0 * period + wisp.speed * t) % period
          const wispCx   = (1.0 + wisp.w / 2 + 0.06 - rawPhase) * W
          if (wispCx + wisp.w * W * 0.5 < 0 || wispCx - wisp.w * W * 0.5 > W) continue

          for (let i = 0; i < wisp.puffs; i++) {
            const frac   = wisp.puffs > 1 ? i / (wisp.puffs - 1) : 0.5
            const puffX  = wispCx + (frac - 0.5) * wisp.w * W
            if (puffX < -wisp.h * W * 2 || puffX > W + wisp.h * W * 2) continue

            const puffY  = wisp.y * H + wisp.undulate * H * Math.sin(t * 0.14 + wisp.phase + frac * Math.PI * 2.5)
            const bell   = Math.sin(frac * Math.PI)
            const puffR  = wisp.h * W * (0.48 + 0.80 * bell)
            const puffOp = wisp.opacity * (0.38 + 0.62 * bell) * p

            const toneMix = 0.5 + 0.5 * Math.sin(wisp.phase + frac * Math.PI * 3.0 + t * 0.03)
            const coreR = Math.round(220 + 35 * toneMix)
            const coreG = Math.round(224 + 31 * toneMix)
            const coreB = Math.round(230 + 25 * toneMix)
            const midR  = Math.round(198 + 42 * toneMix)
            const midG  = Math.round(204 + 40 * toneMix)
            const midB  = Math.round(214 + 36 * toneMix)

            const grad = ctx.createRadialGradient(puffX, puffY, 0, puffX, puffY, puffR)
            grad.addColorStop(0,    `rgba(${coreR},${coreG},${coreB},${(puffOp * 0.94).toFixed(3)})`)
            grad.addColorStop(0.32, `rgba(${midR},${midG},${midB},${(puffOp * 0.66).toFixed(3)})`)
            grad.addColorStop(0.64, `rgba(${midR},${midG},${midB},${(puffOp * 0.22).toFixed(3)})`)
            grad.addColorStop(1,    'rgba(228,234,242,0)')

            ctx.fillStyle = grad
            ctx.beginPath()
            ctx.arc(puffX, puffY, puffR, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }

      // ── Stars: lerp starScale night→day (fade during day) ─────
      ctx.globalCompositeOperation = 'source-over'
      const starScale = lerp(1.0, 0.35, p)
      for (const star of STARS) {
        const twinkle = 0.55 + 0.45 * Math.sin(t * star.twinkleSpeed + star.twinklePhase)
        const op = Math.min(star.baseOpacity * (0.65 + 0.35 * twinkle) * starScale, 1.0)
        const x = star.x * W
        const y = star.y * H
        const [r, g, b] = star.color

        if (star.isHero) {
          const halo = ctx.createRadialGradient(x, y, 0, x, y, star.radius * 5)
          halo.addColorStop(0,   `rgba(${r},${g},${b},${(op * 0.35).toFixed(3)})`)
          halo.addColorStop(0.5, `rgba(${r},${g},${b},${(op * 0.12).toFixed(3)})`)
          halo.addColorStop(1,   `rgba(${r},${g},${b},0)`)
          ctx.fillStyle = halo
          ctx.beginPath()
          ctx.arc(x, y, star.radius * 5, 0, Math.PI * 2)
          ctx.fill()
        }

        ctx.fillStyle = `rgba(${r},${g},${b},${op.toFixed(3)})`
        ctx.beginPath()
        ctx.arc(x, y, star.radius, 0, Math.PI * 2)
        ctx.fill()
      }

      // ── Atmospheric veil: lerp night→day tone ─────────────────
      ctx.globalCompositeOperation = 'source-over'
      const veil = ctx.createLinearGradient(0, 0, 0, H)
      veil.addColorStop(0, 'rgba(0,0,0,0)')
      veil.addColorStop(1, lerpRGBA([0, 6, 16, 0.26], [72, 80, 92, 0.22], p))
      ctx.fillStyle = veil
      ctx.fillRect(0, 0, W, H)
    }

    draw()
    return () => {
      cancelAnimationFrame(frameId)
      themeObserver.disconnect()
      window.removeEventListener('resize', resize)
      unsub()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width:  '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
        display: 'block',
      }}
    />
  )
}
