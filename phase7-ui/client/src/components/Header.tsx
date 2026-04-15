import { useStore } from '../store'

export default function Header() {
  const busy   = useStore((s) => s.busy)
  const regime = useStore((s) => s.regime)
  const now    = new Date().toISOString().slice(0, 10).replace(/-/g, '.')

  return (
    <header className="app-header panel">
      <span className="header-logo">ENKIDU</span>
      <span className="dim" style={{ fontSize: 13 }}>░</span>
      <span className="header-meta">v7.0 · RTX 4090 · {now}</span>

      {regime && (
        <span
          className={`regime-badge ${regime.regime.toLowerCase()}`}
          style={{ marginLeft: 16 }}
        >
          {regime.regime}
          <span style={{ fontSize: 12, opacity: 0.7 }}>
            {' '}{Math.round(regime.confidence * 100)}%
          </span>
        </span>
      )}

      <div className="header-status">
        <span className={`status-dot ${busy ? 'busy' : ''}`} />
        <span>{busy ? 'PROCESSING' : 'ONLINE'}</span>
      </div>
    </header>
  )
}
