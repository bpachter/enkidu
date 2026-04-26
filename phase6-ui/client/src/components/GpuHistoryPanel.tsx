/**
 * GpuHistoryPanel.tsx — full-width hardware monitoring bar
 * Always visible across the top of the UI (row 2 of the app grid).
 * Each metric shows a live value + 60-second sparkline history at 2 Hz.
 */

import { useState } from 'react'
import {
  AreaChart, Area, YAxis, ResponsiveContainer, Tooltip,
} from 'recharts'
import { useStore } from '../store'
import MetricDetailModal, { type MetricInfo, type ModalState } from './MetricDetailModal'

interface SparkPoint {
  [key: string]: number
}

interface DerivedPoint extends SparkPoint {
  ts: number
  gpu_delta: number
  vram_delta: number
  temp_rate: number
  power_delta: number
  thermal_headroom: number
  perf_per_w: number
  clock_eff: number
  pressure: number
  cpu_gpu_ratio: number
}

const C = {
  gpu:      { stroke: 'rgba(185,215,245,0.80)', fill: 'rgba(185,215,245,0.14)' },
  vram:     { stroke: 'rgba(210,220,232,0.70)', fill: 'rgba(210,220,232,0.10)' },
  temp:     { stroke: 'rgba(210,220,232,0.70)', fill: 'rgba(210,220,232,0.10)' },
  power:    { stroke: 'rgba(200,212,228,0.65)', fill: 'rgba(200,212,228,0.09)' },
  clock_sm: { stroke: 'rgba(175,208,240,0.75)', fill: 'rgba(175,208,240,0.11)' },
  clock_mem:{ stroke: 'rgba(195,215,238,0.70)', fill: 'rgba(195,215,238,0.10)' },
  cpu:      { stroke: 'rgba(210,218,228,0.62)', fill: 'rgba(210,218,228,0.09)' },
}

function threshold(val: number, warn: number, crit: number): string {
  if (val >= crit) return 'rgba(220,175,160,0.88)'
  if (val >= warn) return 'rgba(225,210,185,0.82)'
  return 'rgba(185,210,240,0.85)'
}

// ── Metric info lookup ────────────────────────────────────────────────────

const METRIC_INFO: Record<string, MetricInfo> = {
  gpu_util: {
    description: 'Percentage of GPU shader processors actively executing work each sampling interval. The primary indicator of whether the GPU is compute-bound.',
    warnThreshold: 70, critThreshold: 90,
    states: [
      { level: 'safe', range: '0–69%',  meaning: 'Normal range. GPU has headroom. Inference is CPU- or I/O-bound.' },
      { level: 'warn', range: '70–89%', meaning: 'Heavy load. GPU approaching saturation — monitor temp and power closely.' },
      { level: 'crit', range: '90–100%', meaning: 'Fully saturated. Throughput is maximal but any thermal throttle directly cuts token/s.' },
    ],
  },
  vram_pct: {
    description: 'Fraction of the 24 GB GDDR6X frame buffer consumed by active model weights and KV-cache. VRAM pressure causes layers to spill to system RAM, destroying latency.',
    warnThreshold: 70, critThreshold: 90,
    states: [
      { level: 'safe', range: '0–69%',  meaning: 'Entire active model fits in VRAM. Fastest possible inference.' },
      { level: 'warn', range: '70–89%', meaning: 'VRAM under pressure. Loading new models or extending context may cause OOM.' },
      { level: 'crit', range: '90–100%', meaning: 'Near-OOM. Inference may stall or crash. Unload idle models immediately.' },
    ],
  },
  temp: {
    description: 'GPU die temperature in Celsius. The RTX 4090 thermal design target is 83 °C; sustained operation above 85 °C triggers hardware frequency throttling.',
    warnThreshold: 70, critThreshold: 85,
    states: [
      { level: 'safe', range: '< 70 °C',  meaning: 'Cool. Full boost clocks sustained with ample thermal headroom.' },
      { level: 'warn', range: '70–84 °C', meaning: 'Warm. Boost clocks begin stepping back. Verify case airflow.' },
      { level: 'crit', range: '≥ 85 °C',  meaning: 'Throttle territory. GPU is reducing clocks to protect itself. Check fan curve and ambient temp.' },
    ],
  },
  power: {
    description: 'GPU package power draw in Watts. Sustained operation at or near the configured power limit (default 450 W) throttles clocks to stay within the envelope.',
    warnThreshold: 351, critThreshold: 419,
    states: [
      { level: 'safe', range: '< 78% TDP',  meaning: 'Not power-limited. Full boost clocks available.' },
      { level: 'warn', range: '78–92% TDP', meaning: 'Approaching power cap. Clock boosts may be reduced to stay within limit.' },
      { level: 'crit', range: '≥ 93% TDP',  meaning: 'Power-limited. Driver is capping clocks. Raise TDP in MSI Afterburner or nvidia-smi if needed.' },
    ],
  },
  clock_sm: {
    description: 'Shader (SM) clock frequency in MHz — the speed at which the GPU executes compute kernels. RTX 4090 boosts up to ~2,870 MHz under ideal conditions.',
    states: [
      { level: 'safe', range: '2200–2870 MHz', meaning: 'Full boost. Optimal inference throughput.' },
      { level: 'warn', range: '1500–2199 MHz', meaning: 'Clock restrained — likely thermal or power-limited.' },
      { level: 'crit', range: '< 1500 MHz',    meaning: 'Severe throttle. Investigate temperature, power cap, or driver state.' },
    ],
  },
  clock_mem: {
    description: 'GDDR6X memory clock in MHz, governing bandwidth available for weight and activation transfers. Should be stable at or near maximum at all times.',
    states: [
      { level: 'safe', range: '≥ 10,000 MHz', meaning: 'Full-speed memory. Bandwidth at maximum.' },
      { level: 'warn', range: '5000–9999 MHz', meaning: 'Memory in lower P-state or mildly throttled.' },
      { level: 'crit', range: '< 5000 MHz',    meaning: 'Significant memory clock reduction. Check driver and thermal state.' },
    ],
  },
  fan_speed: {
    description: 'GPU cooling fan speed as a percentage of maximum RPM. The RTX 4090 triple-fan cooler ramps aggressively above 70 °C. High sustained speeds signal thermal pressure.',
    states: [
      { level: 'safe', range: '0–79%', meaning: 'Normal operating speed. Thermal management handling load without stress.' },
      { level: 'warn', range: '≥ 80%', meaning: 'Fans running hard. Thermal load is high — check ambient temp and case airflow.' },
      { level: 'crit', range: '100%',  meaning: 'Maximum fan speed. GPU is near critical temperature limits.' },
    ],
  },
  cpu_percent: {
    description: 'System-wide CPU utilisation across all logical cores. High CPU load starves GPU feed tasks: prompt tokenisation, KV-cache management, and tensor dispatch.',
    warnThreshold: 70, critThreshold: 90,
    states: [
      { level: 'safe', range: '0–69%',  meaning: 'CPU has headroom. No contention with the inference pipeline.' },
      { level: 'warn', range: '70–89%', meaning: 'CPU under load. Watch for inference latency spikes at batch boundaries.' },
      { level: 'crit', range: '≥ 90%',  meaning: 'CPU saturated. Inference throughput may be CPU-gated rather than GPU-gated.' },
    ],
  },
  ram_percent: {
    description: 'System RAM utilisation. High RAM pressure triggers OS paging to disk, delaying model loading, tokenisation, and any host-side tensor operations.',
    warnThreshold: 70, critThreshold: 90,
    states: [
      { level: 'safe', range: '0–69%',  meaning: 'Ample headroom. All active processes fit in physical RAM.' },
      { level: 'warn', range: '70–89%', meaning: 'RAM under pressure. Large context windows or multiple models may trigger paging.' },
      { level: 'crit', range: '≥ 90%',  meaning: 'Near-OOM. OS will begin swapping to disk, causing severe inference latency spikes.' },
    ],
  },
  // ── Derived row ──────────────────────────────────────────────────────────
  gpu_delta: {
    description: 'Rate of change of GPU utilisation per second. Large positive spikes indicate a new inference batch arriving; large drops indicate batch completion or an OOM event.',
    states: [
      { level: 'safe', range: '|Δ| < 22 %/s',  meaning: 'Smooth, steady load — normal for sustained generation.' },
      { level: 'warn', range: '22–35 %/s',      meaning: 'Rapid load change. Likely a new heavy request or model swap.' },
      { level: 'crit', range: '|Δ| > 35 %/s',  meaning: 'Shock load or sudden drop. Could indicate OOM event, batch flush, or kernel crash.' },
    ],
  },
  vram_delta: {
    description: 'Rate of change of VRAM utilisation per second. A fast rise warns of a large context allocation; a sudden drop may indicate a model unload or OOM eviction.',
    states: [
      { level: 'safe', range: '|Δ| < 2.5 %/s', meaning: 'Stable VRAM — steady-state inference.' },
      { level: 'warn', range: '2.5–4 %/s',      meaning: 'Active allocation or deallocation. Likely model loading or context expansion.' },
      { level: 'crit', range: '|Δ| > 4 %/s',   meaning: 'Rapid VRAM change. Possible OOM event or large model swap mid-inference.' },
    ],
  },
  temp_rate: {
    description: 'Temperature rate of change in °C per minute. Positive values mean the GPU is heating; a steep rise predicts imminent thermal throttling.',
    states: [
      { level: 'safe', range: '< +10 °C/min',  meaning: 'Normal thermal response to load changes.' },
      { level: 'warn', range: '+10 to +15 °C/min', meaning: 'Heating quickly — may reach throttle temperature within minutes if unchanged.' },
      { level: 'crit', range: '> +15 °C/min',  meaning: 'Thermal runaway risk. Verify fans are spinning and airflow is unobstructed.' },
    ],
  },
  power_delta: {
    description: 'Rate of change of GPU power draw in Watts per second. Large swings correlate with batch arrival/departure and can reveal unstable power delivery.',
    states: [
      { level: 'safe', range: '|Δ| < 28 W/s',  meaning: 'Smooth power profile — consistent inference load.' },
      { level: 'warn', range: '28–50 W/s',      meaning: 'Power transient — normal at batch boundaries. Watch for PSU instability.' },
      { level: 'crit', range: '|Δ| > 50 W/s',  meaning: 'Large power spike. Verify PSU headroom; repeated spikes can cause rail droop.' },
    ],
  },
  thermal_headroom: {
    description: 'Degrees Celsius remaining before the 85 °C hardware throttle threshold. Falling headroom means the system is approaching automatic clock reduction.',
    invertedThreshold: true,
    states: [
      { level: 'safe', range: '> 15 °C',  meaning: 'Substantial margin. No throttling risk in the near term.' },
      { level: 'warn', range: '8–15 °C',  meaning: 'Buffer shrinking. Consider increasing fan speed or reducing ambient temperature.' },
      { level: 'crit', range: '< 8 °C',   meaning: 'Imminent throttle. GPU may reduce clocks within seconds at current load.' },
    ],
  },
  perf_per_w: {
    description: 'GPU utilisation divided by power draw — a proxy for inference efficiency. Higher is better; sustained declines indicate thermal or power-limit throttling wasting power.',
    states: [
      { level: 'safe', range: '> 0.30 %/W',  meaning: 'Good efficiency. GPU is delivering useful work per watt consumed.' },
      { level: 'warn', range: '0.15–0.30 %/W', meaning: 'Moderate efficiency. Check if power or thermal limits are constraining clocks.' },
      { level: 'crit', range: '< 0.15 %/W',  meaning: 'Poor efficiency. Either load is very light or heavy throttling is wasting power.' },
    ],
  },
  clock_eff: {
    description: 'SM clock frequency in MHz per Watt of power draw. Drops sharply when the GPU is throttled — more power consumed for fewer clock cycles.',
    states: [
      { level: 'safe', range: '> 8 MHz/W',  meaning: 'High clock efficiency. Good frequency-per-watt at current TDP.' },
      { level: 'warn', range: '5–8 MHz/W',  meaning: 'Power limiter or thermal throttle beginning to erode clock-per-watt ratio.' },
      { level: 'crit', range: '< 5 MHz/W',  meaning: 'Clock efficiency collapsed. Heavy throttling active — investigate root cause.' },
    ],
  },
  pressure: {
    description: 'Composite load pressure index: √(GPU_util × VRAM_pct). Combines the two primary saturation dimensions into a single scalar. 100 = both fully saturated.',
    states: [
      { level: 'safe', range: '0–64',    meaning: 'System operating with meaningful headroom in at least one resource.' },
      { level: 'warn', range: '64–90',   meaning: 'Both resources under significant load. Throughput is near maximum but fragile.' },
      { level: 'crit', range: '> 90',    meaning: 'Near-total saturation. Any new allocation risks OOM or severe latency degradation.' },
    ],
  },
  cpu_gpu_ratio: {
    description: 'CPU utilisation divided by GPU utilisation. Values near 1.0 indicate balanced parallelism; values well above 1 mean the CPU cannot feed the GPU fast enough, creating a pipeline stall.',
    states: [
      { level: 'safe', range: '0–0.9x',  meaning: 'GPU-bound inference — ideal. The GPU is the bottleneck, not the CPU.' },
      { level: 'warn', range: '0.9–1.4x', meaning: 'Approaching CPU-parity. Inference pipeline is nearly CPU-bound.' },
      { level: 'crit', range: '> 1.4x',  meaning: 'CPU-gated. Optimise tokenisation, batching, or reduce CPU background load.' },
    ],
  },
}

function SparkTip({ active, payload, unit }: any) {
  if (!active || !payload?.length) return null
  const v = payload[0]?.value
  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-strong)',
        padding: '3px 7px',
        fontSize: 10,
        fontFamily: 'var(--font-mono)',
        fontVariantNumeric: 'tabular-nums',
        color: payload[0]?.color ?? 'rgba(185,210,240,0.85)',
        borderRadius: 3,
        boxShadow: '0 4px 12px -4px rgba(0,0,0,0.6)',
      }}
    >
      {typeof v === 'number' ? v.toFixed(1) : '—'}{unit}
    </div>
  )
}

// ── Single metric cell ────────────────────────────────────────────────────

interface CellProps {
  label:        string
  value:        string
  color:        string
  data:         SparkPoint[]
  dataKey:      string
  stroke:       string
  domain:       [number, number]
  unit:         string
  sub?:         string
  isCrit?:      boolean
  isWarn?:      boolean
  onOpenModal?: (rect: DOMRect) => void
}

function MetricCell({ label, value, color, data, dataKey, stroke, domain, unit, sub, isCrit, isWarn, onOpenModal }: CellProps) {
  const cls = `hw-cell${isCrit ? ' hw-cell--crit' : isWarn ? ' hw-cell--warn' : ''}`
  return (
    <div className={cls} onClick={onOpenModal ? (e) => onOpenModal(e.currentTarget.getBoundingClientRect()) : undefined} style={onOpenModal ? { cursor: 'pointer' } : undefined}>
      <div className="hw-cell-header">
        <span className="hw-cell-label">{label}</span>
        <div>
          <span className="hw-cell-value" style={{ color, textShadow: `0 0 8px ${color}60` }}>
            {value}
          </span>
          {sub && <div className="hw-cell-sub">{sub}</div>}
        </div>
      </div>
      <div className="hw-cell-spark">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 1, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`hg-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={stroke} stopOpacity={0.3} />
                <stop offset="95%" stopColor={stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis domain={domain} hide />
            <Tooltip
              content={<SparkTip unit={unit} />}
              cursor={{ stroke, strokeWidth: 1, strokeOpacity: 0.35 }}
            />
            <Area
              type="monotone"
              dataKey={dataKey as string}
              stroke={stroke}
              strokeWidth={1.5}
              fill={`url(#hg-${dataKey})`}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── Static cell (no sparkline — RAM, fan) ─────────────────────────────────

interface StaticCellProps {
  label:        string
  value:        string
  color:        string
  barPct?:      number
  barColor?:    string
  sub?:         string
  isCrit?:      boolean
  isWarn?:      boolean
  onOpenModal?: (rect: DOMRect) => void
}

function StaticCell({ label, value, color, barPct, barColor, sub, isCrit, isWarn, onOpenModal }: StaticCellProps) {
  const cls = `hw-cell${isCrit ? ' hw-cell--crit' : isWarn ? ' hw-cell--warn' : ''}`
  return (
    <div className={cls} onClick={onOpenModal ? (e) => onOpenModal(e.currentTarget.getBoundingClientRect()) : undefined} style={onOpenModal ? { cursor: 'pointer' } : undefined}>
      <div className="hw-cell-header">
        <span className="hw-cell-label">{label}</span>
        <div>
          <span className="hw-cell-value" style={{ color, textShadow: `0 0 8px ${color}60` }}>
            {value}
          </span>
          {sub && <div className="hw-cell-sub">{sub}</div>}
        </div>
      </div>
      {barPct !== undefined && (
        <div className="hw-cell-bar-track">
          <div
            className="hw-cell-bar-fill"
            style={{ width: `${Math.min(100, barPct)}%`, background: barColor ?? color, transition: 'width 400ms ease' }}
          />
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────

export default function GpuHistoryPanel() {
  const history = useStore((s) => s.gpuHistory)
  const stats   = useStore((s) => s.gpuStats)
  const [modal, setModal] = useState<ModalState | null>(null)

  // Helper: build the ModalState (live data from store, anchored to clicked cell)
  const om = (
    label: string, value: string, color: string,
    dataKey: string, isDerived: boolean, stroke: string,
    domain: [number, number], unit: string,
  ) => (rect: DOMRect) => setModal({
    label, value, color, dataKey, isDerived, stroke, domain, unit, cellRect: rect,
    info: METRIC_INFO[dataKey] ?? { description: label, states: [] },
  })

  if (!stats || history.length === 0) {
    return (
      <div className="hw-bar" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <span
          className="font-display animate-pulse-soft"
          style={{
            fontSize: 11,
            color: 'rgba(190,212,235,0.72)',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
          }}
        >
          ◈ Collecting telemetry…
        </span>
      </div>
    )
  }

  const latest    = history[history.length - 1]
  const vramPct   = (stats.vram_used / stats.vram_total) * 100
  const vramUsedG = (stats.vram_used / 1024).toFixed(1)
  const vramTotG  = (stats.vram_total / 1024).toFixed(0)
  const powerPct  = stats.power_limit > 0 ? (stats.power_draw / stats.power_limit) * 100 : 0
  // Graceful fallback for fields added after initial deployment (old backend may omit them)
  const clockSm   = latest.clock_sm  ?? 0
  const clockMem  = latest.clock_mem ?? 0
  const fanSpeed  = stats.fan_speed  ?? 0
  const primarySeries: SparkPoint[] = history.map((p) => ({ ...p }))

  const derivedSeries: DerivedPoint[] = history.map((curr, i) => {
    const prev = history[Math.max(0, i - 1)]
    const dt = Math.max((curr.ts - prev.ts) / 1000, 0.25)

    const gpuDelta = i === 0 ? 0 : (curr.gpu_util - prev.gpu_util) / dt
    const vramDelta = i === 0 ? 0 : (curr.vram_pct - prev.vram_pct) / dt
    const tempRatePerMin = i === 0 ? 0 : ((curr.temp - prev.temp) / dt) * 60
    const powerDelta = i === 0 ? 0 : (curr.power - prev.power) / dt
    const thermalHeadroom = Math.max(0, 85 - curr.temp)
    const perfPerW = curr.power > 1 ? curr.gpu_util / curr.power : 0
    const clockEff = curr.power > 1 ? curr.clock_sm / curr.power : 0
    const pressure = Math.sqrt(Math.max(0, curr.gpu_util * curr.vram_pct))
    const cpuGpuRatio = curr.gpu_util > 1 ? curr.cpu_percent / curr.gpu_util : 0

    return {
      ts: curr.ts,
      gpu_delta: gpuDelta,
      vram_delta: vramDelta,
      temp_rate: tempRatePerMin,
      power_delta: powerDelta,
      thermal_headroom: thermalHeadroom,
      perf_per_w: perfPerW,
      clock_eff: clockEff,
      pressure,
      cpu_gpu_ratio: cpuGpuRatio,
    }
  })

  const dLatest = derivedSeries[derivedSeries.length - 1]

  const signed = (n: number, digits = 1): string => `${n >= 0 ? '+' : ''}${n.toFixed(digits)}`

  return (
    <>
      {modal && <MetricDetailModal {...modal} onClose={() => setModal(null)} />}

      <div className="hw-bar-stack">
        <div className="hw-bar">

          {/* GPU UTIL */}
          <MetricCell
            label="GPU UTIL" value={`${latest.gpu_util.toFixed(0)}%`}
            color={threshold(latest.gpu_util, 70, 90)}
            data={primarySeries} dataKey="gpu_util" stroke={C.gpu.stroke} domain={[0, 100]} unit="%"
            isCrit={latest.gpu_util >= 90} isWarn={latest.gpu_util >= 70 && latest.gpu_util < 90}
            onOpenModal={om('GPU UTIL', `${latest.gpu_util.toFixed(0)}%`, threshold(latest.gpu_util, 70, 90), 'gpu_util', false, C.gpu.stroke, [0, 100], '%')}
          />

          {/* VRAM */}
          <MetricCell
            label="VRAM" value={`${vramUsedG}G`} sub={`/ ${vramTotG}G  (${vramPct.toFixed(0)}%)`}
            color={threshold(vramPct, 70, 90)}
            data={primarySeries} dataKey="vram_pct" stroke={C.vram.stroke} domain={[0, 100]} unit="%"
            isCrit={vramPct >= 90} isWarn={vramPct >= 70 && vramPct < 90}
            onOpenModal={om('VRAM', `${vramUsedG}G`, threshold(vramPct, 70, 90), 'vram_pct', false, C.vram.stroke, [0, 100], '%')}
          />

          {/* TEMP */}
          <MetricCell
            label="TEMP" value={`${latest.temp.toFixed(0)}°C`}
            color={threshold(latest.temp, 70, 85)}
            data={primarySeries} dataKey="temp" stroke={C.temp.stroke} domain={[20, 100]} unit="°C"
            isCrit={latest.temp >= 85} isWarn={latest.temp >= 70 && latest.temp < 85}
            onOpenModal={om('TEMP', `${latest.temp.toFixed(0)}°C`, threshold(latest.temp, 70, 85), 'temp', false, C.temp.stroke, [20, 100], '°C')}
          />

          {/* POWER */}
          <MetricCell
            label="POWER" value={`${latest.power.toFixed(0)}W`} sub={`/ ${stats.power_limit.toFixed(0)}W  (${powerPct.toFixed(0)}%)`}
            color={threshold(powerPct, 78, 93)}
            data={primarySeries} dataKey="power" stroke={C.power.stroke} domain={[0, stats.power_limit ?? 450]} unit="W"
            isCrit={powerPct >= 93} isWarn={powerPct >= 78 && powerPct < 93}
            onOpenModal={om('POWER', `${latest.power.toFixed(0)}W`, threshold(powerPct, 78, 93), 'power', false, C.power.stroke, [0, stats.power_limit ?? 450], 'W')}
          />

          {/* SM CLOCK */}
          <MetricCell
            label="SM CLK" value={clockSm > 0 ? `${(clockSm / 1000).toFixed(2)}G` : '—'} sub="GHz"
            color="rgba(175,208,240,0.85)"
            data={primarySeries} dataKey="clock_sm" stroke={C.clock_sm.stroke} domain={[0, 3000]} unit="MHz"
            isCrit={clockSm > 0 && clockSm < 1500} isWarn={clockSm > 0 && clockSm >= 1500 && clockSm < 2200}
            onOpenModal={om('SM CLK', clockSm > 0 ? `${(clockSm / 1000).toFixed(2)}G` : '—', 'rgba(175,208,240,0.85)', 'clock_sm', false, C.clock_sm.stroke, [0, 3000], 'MHz')}
          />

          {/* MEM CLOCK */}
          <MetricCell
            label="MEM CLK" value={clockMem > 0 ? `${(clockMem / 1000).toFixed(1)}G` : '—'} sub="GHz"
            color="rgba(185,215,240,0.78)"
            data={primarySeries} dataKey="clock_mem" stroke={C.clock_mem.stroke} domain={[0, 12000]} unit="MHz"
            isCrit={clockMem > 0 && clockMem < 5000} isWarn={clockMem > 0 && clockMem >= 5000 && clockMem < 10000}
            onOpenModal={om('MEM CLK', clockMem > 0 ? `${(clockMem / 1000).toFixed(1)}G` : '—', 'rgba(185,215,240,0.78)', 'clock_mem', false, C.clock_mem.stroke, [0, 12000], 'MHz')}
          />

          {/* FAN */}
          <StaticCell
            label="FAN" value={fanSpeed > 0 ? `${fanSpeed.toFixed(0)}%` : '—'}
            color={fanSpeed > 80 ? 'rgba(225,210,185,0.82)' : 'rgba(200,215,232,0.72)'}
            barPct={fanSpeed} barColor={fanSpeed > 80 ? 'rgba(225,210,185,0.72)' : 'rgba(185,210,240,0.55)'}
            isWarn={fanSpeed > 80}
            onOpenModal={(rect) => setModal({
              label: 'FAN', value: `${fanSpeed.toFixed(0)}%`,
              color: fanSpeed > 80 ? 'rgba(225,210,185,0.82)' : 'rgba(200,215,232,0.72)',
              dataKey: 'fan_speed', isDerived: false, stroke: 'rgba(200,215,232,0.72)',
              domain: [0, 100], unit: '%', cellRect: rect,
              info: METRIC_INFO.fan_speed,
            })}
          />

          {/* CPU */}
          <MetricCell
            label="CPU" value={`${latest.cpu_percent.toFixed(0)}%`}
            color={threshold(latest.cpu_percent, 70, 90)}
            data={primarySeries} dataKey="cpu_percent" stroke={C.cpu.stroke} domain={[0, 100]} unit="%"
            isCrit={latest.cpu_percent >= 90} isWarn={latest.cpu_percent >= 70 && latest.cpu_percent < 90}
            onOpenModal={om('CPU', `${latest.cpu_percent.toFixed(0)}%`, threshold(latest.cpu_percent, 70, 90), 'cpu_percent', false, C.cpu.stroke, [0, 100], '%')}
          />

          {/* RAM */}
          <StaticCell
            label="RAM" value={`${stats.ram_used_gb}G`} sub={`/ ${stats.ram_total_gb}G  (${stats.ram_percent.toFixed(0)}%)`}
            color={threshold(stats.ram_percent, 70, 90)}
            barPct={stats.ram_percent} barColor={threshold(stats.ram_percent, 70, 90)}
            isCrit={stats.ram_percent >= 90} isWarn={stats.ram_percent >= 70 && stats.ram_percent < 90}
            onOpenModal={(rect) => setModal({
              label: 'RAM', value: `${stats.ram_used_gb}G`,
              color: threshold(stats.ram_percent, 70, 90),
              dataKey: 'ram_percent', isDerived: false, stroke: 'rgba(210,218,228,0.62)',
              domain: [0, 100], unit: '%', cellRect: rect,
              info: METRIC_INFO.ram_percent,
            })}
          />

        </div>

        {/* Secondary telemetry: derivatives and computed efficiency metrics */}
        <div className="hw-bar hw-bar-secondary">
          <MetricCell
            label="UTIL Δ" value={signed(dLatest.gpu_delta, 1)}
            color={Math.abs(dLatest.gpu_delta) > 22 ? 'rgba(220,175,160,0.88)' : 'rgba(190,212,235,0.82)'}
            data={derivedSeries} dataKey="gpu_delta" stroke="rgba(186,214,242,0.74)" domain={[-55, 55]} unit="%/s"
            isCrit={Math.abs(dLatest.gpu_delta) > 35} isWarn={Math.abs(dLatest.gpu_delta) > 22 && Math.abs(dLatest.gpu_delta) <= 35}
            onOpenModal={om('UTIL Δ', signed(dLatest.gpu_delta, 1), Math.abs(dLatest.gpu_delta) > 22 ? 'rgba(220,175,160,0.88)' : 'rgba(190,212,235,0.82)', 'gpu_delta', true, 'rgba(186,214,242,0.74)', [-55, 55], '%/s')}
          />

          <MetricCell
            label="VRAM Δ" value={signed(dLatest.vram_delta, 2)}
            color={Math.abs(dLatest.vram_delta) > 2.5 ? 'rgba(225,210,185,0.82)' : 'rgba(190,212,235,0.82)'}
            data={derivedSeries} dataKey="vram_delta" stroke="rgba(206,220,236,0.70)" domain={[-6, 6]} unit="%/s"
            isCrit={Math.abs(dLatest.vram_delta) > 4} isWarn={Math.abs(dLatest.vram_delta) > 2.5 && Math.abs(dLatest.vram_delta) <= 4}
            onOpenModal={om('VRAM Δ', signed(dLatest.vram_delta, 2), Math.abs(dLatest.vram_delta) > 2.5 ? 'rgba(225,210,185,0.82)' : 'rgba(190,212,235,0.82)', 'vram_delta', true, 'rgba(206,220,236,0.70)', [-6, 6], '%/s')}
          />

          <MetricCell
            label="TEMP RATE" value={signed(dLatest.temp_rate, 1)}
            color={dLatest.temp_rate > 10 ? 'rgba(220,175,160,0.88)' : 'rgba(200,215,232,0.80)'}
            data={derivedSeries} dataKey="temp_rate" stroke="rgba(210,220,232,0.72)" domain={[-18, 18]} unit="°C/min"
            isCrit={dLatest.temp_rate > 15} isWarn={dLatest.temp_rate > 10 && dLatest.temp_rate <= 15}
            onOpenModal={om('TEMP RATE', signed(dLatest.temp_rate, 1), dLatest.temp_rate > 10 ? 'rgba(220,175,160,0.88)' : 'rgba(200,215,232,0.80)', 'temp_rate', true, 'rgba(210,220,232,0.72)', [-18, 18], '°C/min')}
          />

          <MetricCell
            label="POWER Δ" value={signed(dLatest.power_delta, 1)}
            color={Math.abs(dLatest.power_delta) > 28 ? 'rgba(225,210,185,0.82)' : 'rgba(190,212,235,0.82)'}
            data={derivedSeries} dataKey="power_delta" stroke="rgba(198,214,231,0.72)" domain={[-65, 65]} unit="W/s"
            isCrit={Math.abs(dLatest.power_delta) > 50} isWarn={Math.abs(dLatest.power_delta) > 28 && Math.abs(dLatest.power_delta) <= 50}
            onOpenModal={om('POWER Δ', signed(dLatest.power_delta, 1), Math.abs(dLatest.power_delta) > 28 ? 'rgba(225,210,185,0.82)' : 'rgba(190,212,235,0.82)', 'power_delta', true, 'rgba(198,214,231,0.72)', [-65, 65], 'W/s')}
          />

          <MetricCell
            label="THERMAL HEADROOM" value={`${dLatest.thermal_headroom.toFixed(1)}°`}
            color={dLatest.thermal_headroom < 8 ? 'rgba(220,175,160,0.88)' : 'rgba(190,212,235,0.82)'}
            data={derivedSeries} dataKey="thermal_headroom" stroke="rgba(186,214,242,0.78)" domain={[0, 70]} unit="°C"
            isCrit={dLatest.thermal_headroom < 5} isWarn={dLatest.thermal_headroom >= 5 && dLatest.thermal_headroom < 8}
            onOpenModal={om('THERMAL HEADROOM', `${dLatest.thermal_headroom.toFixed(1)}°`, dLatest.thermal_headroom < 8 ? 'rgba(220,175,160,0.88)' : 'rgba(190,212,235,0.82)', 'thermal_headroom', true, 'rgba(186,214,242,0.78)', [0, 70], '°C')}
          />

          <MetricCell
            label="PERF/W" value={dLatest.perf_per_w.toFixed(3)}
            color="rgba(190,212,235,0.82)"
            data={derivedSeries} dataKey="perf_per_w" stroke="rgba(176,206,236,0.78)" domain={[0, 1.0]} unit="%/W"
            onOpenModal={om('PERF/W', dLatest.perf_per_w.toFixed(3), 'rgba(190,212,235,0.82)', 'perf_per_w', true, 'rgba(176,206,236,0.78)', [0, 1.0], '%/W')}
          />

          <MetricCell
            label="CLOCK EFF" value={dLatest.clock_eff.toFixed(2)}
            color="rgba(190,212,235,0.82)"
            data={derivedSeries} dataKey="clock_eff" stroke="rgba(184,210,236,0.74)" domain={[0, 20]} unit="MHz/W"
            onOpenModal={om('CLOCK EFF', dLatest.clock_eff.toFixed(2), 'rgba(190,212,235,0.82)', 'clock_eff', true, 'rgba(184,210,236,0.74)', [0, 20], 'MHz/W')}
          />

          <MetricCell
            label="LOAD PRESSURE" value={dLatest.pressure.toFixed(0)}
            color={dLatest.pressure > 82 ? 'rgba(225,210,185,0.82)' : 'rgba(190,212,235,0.82)'}
            data={derivedSeries} dataKey="pressure" stroke="rgba(196,216,238,0.75)" domain={[0, 100]} unit="idx"
            isCrit={dLatest.pressure > 90} isWarn={dLatest.pressure > 64 && dLatest.pressure <= 90}
            onOpenModal={om('LOAD PRESSURE', dLatest.pressure.toFixed(0), dLatest.pressure > 82 ? 'rgba(225,210,185,0.82)' : 'rgba(190,212,235,0.82)', 'pressure', true, 'rgba(196,216,238,0.75)', [0, 100], 'idx')}
          />

          <MetricCell
            label="CPU/GPU RATIO" value={dLatest.cpu_gpu_ratio.toFixed(2)}
            color={dLatest.cpu_gpu_ratio > 1.4 ? 'rgba(225,210,185,0.82)' : 'rgba(190,212,235,0.82)'}
            data={derivedSeries} dataKey="cpu_gpu_ratio" stroke="rgba(188,212,236,0.74)" domain={[0, 3]} unit="x"
            isCrit={dLatest.cpu_gpu_ratio > 2.0} isWarn={dLatest.cpu_gpu_ratio > 1.4 && dLatest.cpu_gpu_ratio <= 2.0}
            onOpenModal={om('CPU/GPU RATIO', dLatest.cpu_gpu_ratio.toFixed(2), dLatest.cpu_gpu_ratio > 1.4 ? 'rgba(225,210,185,0.82)' : 'rgba(190,212,235,0.82)', 'cpu_gpu_ratio', true, 'rgba(188,212,236,0.74)', [0, 3], 'x')}
          />
        </div>
      </div>
    </>
  )
}
