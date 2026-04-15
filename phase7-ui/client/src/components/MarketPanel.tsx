import { useEffect } from 'react'
import { useStore } from '../store'
import { fetchRegime, fetchPortfolio } from '../api'

export default function MarketPanel() {
  const regime    = useStore((s) => s.regime)
  const portfolio = useStore((s) => s.portfolio)
  const setRegime    = useStore((s) => s.setRegime)
  const setPortfolio = useStore((s) => s.setPortfolio)

  useEffect(() => {
    fetchRegime().then(setRegime).catch(() => {})
    fetchPortfolio().then(setPortfolio).catch(() => {})
  }, [])

  const regimeColor =
    regime?.regime === 'BULL'   ? 'green' :
    regime?.regime === 'BEAR'   ? 'red'   :
    regime?.regime === 'CRISIS' ? 'red'   : 'amber'

  return (
    <div className="panel" style={{ minHeight: 0, overflow: 'auto' }}>
      <div className="panel-title">MARKET INTELLIGENCE</div>
      <div className="panel-body">

        {/* Regime block */}
        {regime ? (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <span className={`metric-value ${regimeColor}`} style={{ fontSize: 18 }}>
                {regime.regime}
              </span>
              <span className="dim" style={{ fontSize: 11 }}>
                {Math.round(regime.confidence * 100)}% conf
              </span>
              {regime.as_of && (
                <span className="dim" style={{ fontSize: 10, marginLeft: 'auto' }}>
                  {regime.as_of}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 11 }}>
              {regime.weekly_return !== undefined && (
                <span>
                  <span className="dim">WK RET </span>
                  <span className={regime.weekly_return >= 0 ? 'green' : 'red'}>
                    {(regime.weekly_return * 100).toFixed(2)}%
                  </span>
                </span>
              )}
              {regime.volatility_30d !== undefined && (
                <span>
                  <span className="dim">VOL30 </span>
                  <span className="amber">{(regime.volatility_30d * 100).toFixed(2)}%</span>
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="dim" style={{ fontSize: 11, marginBottom: 12 }}>loading regime...</div>
        )}

        {/* Portfolio picks */}
        <div className="panel-title" style={{ fontSize: 10, marginBottom: 6 }}>TOP PICKS</div>
        {portfolio.length === 0 ? (
          <div className="dim" style={{ fontSize: 11 }}>no picks loaded</div>
        ) : (
          <table className="ticker-table">
            <thead>
              <tr>
                <th>TICKER</th>
                <th>EV/EBIT</th>
                <th>VAL</th>
                <th>QUAL</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.slice(0, 10).map((p) => (
                <tr key={p.ticker}>
                  <td className="cyan">{p.ticker}</td>
                  <td>{p.ev_ebit?.toFixed(1) ?? '—'}</td>
                  <td>{p.value_composite?.toFixed(0) ?? '—'}</td>
                  <td>{p.quality_score?.toFixed(0) ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
