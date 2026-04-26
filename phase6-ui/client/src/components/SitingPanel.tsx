import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, { Map as MapLibreMap, Marker, Popup } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  fetchSitingFactors,
  fetchSitingSample,
  fetchSitingWeights,
  scoreSites,
  type SitingFactor,
  type SitingScore,
  type SitingSite,
} from '../api'

type Archetype = 'training' | 'inference' | 'mixed'

const SCORE_GREEN = '#39d353'
const SCORE_AMBER = '#ff9500'
const SCORE_RED   = '#ff1a40'
const KILL_GREY   = '#444'

function scoreColor(score: number, killed: boolean): string {
  if (killed) return KILL_GREY
  if (score >= 7.0) return SCORE_GREEN
  if (score >= 5.0) return SCORE_AMBER
  return SCORE_RED
}

const DARK_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap',
    },
  },
  layers: [
    { id: 'bg', type: 'background' as const, paint: { 'background-color': '#07080d' } },
    {
      id: 'osm',
      type: 'raster' as const,
      source: 'osm',
      paint: { 'raster-opacity': 0.35, 'raster-saturation': -0.9, 'raster-brightness-max': 0.5 },
    },
  ],
}

interface Props {
  onClose?: () => void
}

export default function SitingPanel({ onClose }: Props) {
  const mapDiv  = useRef<HTMLDivElement | null>(null)
  const mapRef  = useRef<MapLibreMap | null>(null)
  const markersRef = useRef<Marker[]>([])

  const [archetype, setArchetype] = useState<Archetype>('training')
  const [sites,    setSites]    = useState<SitingSite[]>([])
  const [scores,   setScores]   = useState<SitingScore[] | null>(null)
  const [factors,  setFactors]  = useState<SitingFactor[]>([])
  const [weights,  setWeights]  = useState<Record<string, number>>({})
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  // Mount map once
  useEffect(() => {
    if (!mapDiv.current || mapRef.current) return
    const m = new maplibregl.Map({
      container: mapDiv.current,
      style: DARK_STYLE as maplibregl.StyleSpecification,
      center: [-95, 39],
      zoom: 3.6,
      attributionControl: false,
    })
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    m.addControl(new maplibregl.AttributionControl({ compact: true }))
    mapRef.current = m
    return () => { m.remove(); mapRef.current = null }
  }, [])

  // Initial data fetch
  useEffect(() => {
    fetchSitingSample().then(d => setSites(d.sites)).catch(e => setError(String(e)))
    fetchSitingFactors().then(d => setFactors(d.factors)).catch(() => {})
  }, [])

  // Refresh weights when archetype changes
  useEffect(() => {
    fetchSitingWeights(archetype).then(d => setWeights(d.weights)).catch(() => {})
  }, [archetype])

  // (Re)render markers whenever sites or scores change
  useEffect(() => {
    const m = mapRef.current
    if (!m || !sites.length) return
    markersRef.current.forEach(mk => mk.remove())
    markersRef.current = []

    const scoreById = new Map<string, SitingScore>()
    scores?.forEach(s => scoreById.set(s.site_id, s))

    sites.forEach(s => {
      const sc = scoreById.get(s.site_id)
      const killed = sc ? Object.values(sc.kill_flags).some(Boolean) : false
      const color = sc ? scoreColor(sc.composite, killed) : '#888'

      const el = document.createElement('div')
      el.style.cssText = `
        width: ${sc ? 22 : 12}px;
        height: ${sc ? 22 : 12}px;
        border-radius: 50%;
        background: ${color};
        border: 2px solid #07080d;
        box-shadow: 0 0 8px ${color};
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        font-family: 'VT323', monospace; font-size: 11px; color: #07080d; font-weight: bold;
      `
      if (sc) el.textContent = sc.composite.toFixed(1)

      const popupHtml = sc
        ? `<div style="font-family:'Share Tech Mono',monospace;font-size:11px;color:#ff9500;padding:4px 6px">
             <div style="font-family:'VT323',monospace;font-size:16px;color:#00e5ff">${s.name}</div>
             <div style="color:#8899aa;margin-bottom:4px">${s.state} · ${s.acres ?? '?'} ac</div>
             <div>SCORE <span style="color:${color};font-size:14px;font-family:'VT323',monospace">${sc.composite.toFixed(2)}</span> / 10</div>
             ${killed ? `<div style="color:#ff1a40">⚠ KILLED: ${Object.entries(sc.kill_flags).filter(([,v]) => v).map(([k]) => k).join(', ')}</div>` : ''}
           </div>`
        : `<div style="font-family:'Share Tech Mono',monospace;font-size:11px;color:#ff9500;padding:4px 6px">
             <div style="font-family:'VT323',monospace;font-size:16px;color:#00e5ff">${s.name}</div>
             <div style="color:#8899aa">${s.state} · ${s.acres ?? '?'} ac · unscored</div>
           </div>`

      const popup = new Popup({ offset: 16, closeButton: false }).setHTML(popupHtml)
      const marker = new Marker({ element: el }).setLngLat([s.lon, s.lat]).setPopup(popup).addTo(m)
      el.addEventListener('click', () => setSelected(s.site_id))
      markersRef.current.push(marker)
    })
  }, [sites, scores])

  const runScore = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await scoreSites({ archetype })
      setScores(data.results)
      const top = data.results[0]
      if (top && mapRef.current && top.lat != null && top.lon != null) {
        mapRef.current.flyTo({ center: [top.lon, top.lat], zoom: 5.5, speed: 0.8 })
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const selectedScore = useMemo(
    () => scores?.find(s => s.site_id === selected) ?? null,
    [scores, selected],
  )
  const ranked = useMemo(() => scores ?? [], [scores])
  const implementedCount = factors.filter(f => f.implemented).length

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'var(--bg)', color: 'var(--amber)',
      display: 'grid',
      gridTemplateColumns: '320px 1fr 340px',
      gridTemplateRows: '42px 1fr',
    }}>
      {/* Header */}
      <div style={{
        gridColumn: '1 / -1', gridRow: 1,
        display: 'flex', alignItems: 'center', gap: 16, padding: '0 16px',
        background: '#060810', borderBottom: '1px solid var(--border)',
      }}>
        <span className="header-logo" style={{ color: 'var(--cyan)' }}>ATLAS</span>
        <span className="header-meta">DATACENTER SITING · {implementedCount}/{factors.length} factors live</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--white-dim)', letterSpacing: '0.1em' }}>ARCHETYPE</span>
          {(['training', 'inference', 'mixed'] as Archetype[]).map(a => (
            <button
              key={a}
              onClick={() => setArchetype(a)}
              className={`tab-btn ${archetype === a ? 'active' : ''}`}
              style={{ flex: 'none', padding: '4px 10px', borderBottom: archetype === a ? '2px solid var(--amber)' : '2px solid transparent' }}
            >{a.toUpperCase()}</button>
          ))}
          <button
            onClick={runScore}
            disabled={loading}
            className="save-btn"
            style={{ width: 'auto', padding: '4px 14px', borderColor: 'var(--cyan)', color: 'var(--cyan)' }}
          >{loading ? 'SCORING...' : 'RUN SCORE'}</button>
          {onClose && (
            <button onClick={onClose} className="save-btn" style={{ width: 'auto', padding: '4px 14px' }}>
              ◀ EXIT
            </button>
          )}
        </div>
      </div>

      {/* Left: weights & factors */}
      <div style={{
        gridColumn: 1, gridRow: 2,
        background: 'var(--bg-panel)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div className="panel-title">WEIGHTS · {archetype.toUpperCase()}</div>
        <div style={{ overflowY: 'auto', padding: '8px 12px', flex: 1 }}>
          {Object.entries(weights)
            .sort((a, b) => b[1] - a[1])
            .map(([k, w]) => {
              const fact = factors.find(f => f.name === k)
              const live = fact?.implemented
              return (
                <div key={k} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
                    <span style={{ color: live ? 'var(--amber)' : 'var(--white-dim)' }}>
                      {live ? '●' : '○'} {k}
                    </span>
                    <span style={{ color: 'var(--cyan)', fontFamily: 'var(--font-display)', fontSize: 13 }}>
                      {(w * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill amber" style={{ width: `${w * 100 * 4}%`, opacity: live ? 1 : 0.35 }} />
                  </div>
                </div>
              )
            })}
          <div style={{ marginTop: 14, fontSize: 9, color: 'var(--white-dim)', lineHeight: 1.6 }}>
            ● = factor implemented (live data)<br />
            ○ = stub (cohort-median imputed)
          </div>
        </div>
      </div>

      {/* Map */}
      <div style={{ gridColumn: 2, gridRow: 2, position: 'relative' }}>
        <div ref={mapDiv} style={{ position: 'absolute', inset: 0 }} />
        {error && (
          <div style={{
            position: 'absolute', top: 12, left: 12, background: 'rgba(255,26,64,0.15)',
            border: '1px solid var(--red)', color: 'var(--red)', padding: '6px 10px',
            fontSize: 11, fontFamily: 'var(--font-mono)', maxWidth: '60%',
          }}>{error}</div>
        )}
        {!scores && (
          <div style={{
            position: 'absolute', bottom: 16, left: 16,
            background: 'rgba(7,8,13,0.85)', border: '1px solid var(--border)',
            padding: '8px 12px', fontSize: 11, color: 'var(--white-dim)',
            fontFamily: 'var(--font-mono)', letterSpacing: '0.05em',
          }}>
            {sites.length} candidate sites loaded · click <span style={{ color: 'var(--cyan)' }}>RUN SCORE</span> to compute
          </div>
        )}
      </div>

      {/* Right: ranked list / detail */}
      <div style={{
        gridColumn: 3, gridRow: 2,
        background: 'var(--bg-panel)', borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div className="panel-title">{selectedScore ? 'SITE DETAIL' : 'RANKINGS'}</div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {selectedScore ? (
            <SiteDetail score={selectedScore} factors={factors} onBack={() => setSelected(null)} />
          ) : ranked.length ? (
            <table className="ticker-table">
              <thead>
                <tr><th>#</th><th>SITE</th><th style={{ textAlign: 'right' }}>SCORE</th></tr>
              </thead>
              <tbody>
                {ranked.map((r, i) => {
                  const killed = Object.values(r.kill_flags).some(Boolean)
                  return (
                    <tr key={r.site_id} onClick={() => {
                      setSelected(r.site_id)
                      if (mapRef.current && r.lat != null && r.lon != null) {
                        mapRef.current.flyTo({ center: [r.lon, r.lat], zoom: 6.5 })
                      }
                    }} style={{ cursor: 'pointer' }}>
                      <td style={{ color: 'var(--white-dim)' }}>{i + 1}</td>
                      <td className="ticker-sym">{r.site_id}</td>
                      <td style={{ textAlign: 'right', color: scoreColor(r.composite, killed), fontFamily: 'var(--font-display)', fontSize: 14 }}>
                        {killed ? 'KILL' : r.composite.toFixed(2)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: 16, fontSize: 11, color: 'var(--white-dim)' }}>
              No scores yet. Run the engine to populate rankings.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SiteDetail({
  score,
  factors,
  onBack,
}: {
  score: SitingScore
  factors: SitingFactor[]
  onBack: () => void
}) {
  const killed = Object.entries(score.kill_flags).filter(([, v]) => v).map(([k]) => k)
  const sub = Object.entries(score.sub_scores).sort((a, b) => b[1] - a[1])

  return (
    <div style={{ padding: 12 }}>
      <button onClick={onBack} className="save-btn" style={{ width: 'auto', padding: '3px 10px', marginBottom: 10 }}>
        ◀ BACK
      </button>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--cyan)' }}>{score.name}</div>
      <div style={{ fontSize: 10, color: 'var(--white-dim)', marginBottom: 8 }}>
        {score.site_id} · {score.state} · {score.acres ?? '?'} acres
      </div>
      <div style={{
        display: 'flex', gap: 12, alignItems: 'baseline',
        padding: '8px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
        marginBottom: 10,
      }}>
        <span style={{ fontSize: 9, color: 'var(--white-dim)', letterSpacing: '0.1em' }}>COMPOSITE</span>
        <span style={{
          fontFamily: 'var(--font-display)', fontSize: 28,
          color: scoreColor(score.composite, killed.length > 0),
        }}>{score.composite.toFixed(2)}</span>
        <span style={{ fontSize: 11, color: 'var(--white-dim)' }}>/ 10</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--white-dim)' }}>{score.archetype}</span>
      </div>

      {killed.length > 0 && (
        <div style={{
          background: 'rgba(255,26,64,0.1)', border: '1px solid var(--red)',
          color: 'var(--red)', padding: '6px 8px', fontSize: 10, marginBottom: 10,
        }}>
          ⚠ DISQUALIFIED: {killed.join(', ')}
        </div>
      )}

      <div style={{ fontSize: 9, color: 'var(--white-dim)', letterSpacing: '0.1em', marginBottom: 4 }}>
        FACTOR SUB-SCORES
      </div>
      {sub.map(([fname, val]) => {
        const fact = factors.find(f => f.name === fname)
        const live = fact?.implemented
        const w = score.weights_used[fname] ?? 0
        const raw = score.raw_sub_scores[fname]
        return (
          <div key={fname} style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
              <span style={{ color: live ? 'var(--amber)' : 'var(--white-dim)' }}>
                {live ? '●' : '○'} {fname}
              </span>
              <span>
                <span style={{ color: 'var(--cyan)', fontFamily: 'var(--font-display)' }}>
                  {(val * 100).toFixed(0)}
                </span>
                <span style={{ color: 'var(--white-dim)', fontSize: 9 }}> ×{(w * 100).toFixed(0)}%</span>
                {raw == null && <span style={{ color: 'var(--white-dim)', fontSize: 9 }}> (imp)</span>}
              </span>
            </div>
            <div className="bar-track">
              <div className="bar-fill cyan" style={{ width: `${val * 100}%`, opacity: live ? 1 : 0.4 }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
