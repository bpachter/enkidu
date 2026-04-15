import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { fetchParams, saveParams } from '../api'

interface SliderRowProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}

function SliderRow({ label, value, min, max, step, onChange }: SliderRowProps) {
  return (
    <div className="param-row">
      <span className="param-label">{label}</span>
      <input
        type="range"
        className="param-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="param-value">{value}</span>
    </div>
  )
}

export default function ModelParamsPanel() {
  const params    = useStore((s) => s.params)
  const setParams = useStore((s) => s.setParams)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetchParams().then((p) => setParams(p)).catch(() => {})
  }, [])

  async function handleSave() {
    await saveParams(params)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="panel" style={{ minHeight: 0, overflow: 'auto' }}>
      <div className="panel-title">MODEL PARAMS</div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>

        <SliderRow
          label="TEMP"
          value={params.temperature}
          min={0} max={2} step={0.05}
          onChange={(v) => setParams({ temperature: v })}
        />
        <SliderRow
          label="TOP_P"
          value={params.top_p}
          min={0} max={1} step={0.05}
          onChange={(v) => setParams({ top_p: v })}
        />
        <SliderRow
          label="TOP_K"
          value={params.top_k}
          min={1} max={100} step={1}
          onChange={(v) => setParams({ top_k: v })}
        />
        <SliderRow
          label="REP_PEN"
          value={params.repeat_penalty}
          min={1} max={2} step={0.05}
          onChange={(v) => setParams({ repeat_penalty: v })}
        />
        <SliderRow
          label="CTX"
          value={params.num_ctx}
          min={2048} max={131072} step={2048}
          onChange={(v) => setParams({ num_ctx: v })}
        />
        <SliderRow
          label="SEED"
          value={params.seed}
          min={-1} max={9999} step={1}
          onChange={(v) => setParams({ seed: v })}
        />

        <button
          className="save-btn"
          onClick={handleSave}
          style={{ marginTop: 8 }}
        >
          {saved ? 'SAVED ✓' : 'SAVE PARAMS'}
        </button>
      </div>
    </div>
  )
}
