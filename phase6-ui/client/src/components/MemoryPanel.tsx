import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { fetchMemory, rateMemory, deleteMemory } from '../api'

const PASSWORD = 'antifragile'

export default function MemoryPanel() {
  const memory       = useStore((s) => s.memory)
  const stats        = useStore((s) => s.memoryStats)
  const setMemory    = useStore((s) => s.setMemory)
  const updateRating = useStore((s) => s.updateMemoryRating)
  const removeEntry  = useStore((s) => s.removeMemoryEntry)

  const [expanded,   setExpanded]   = useState<string | null>(null)
  const [unlocked,   setUnlocked]   = useState(false)
  const [showInput,  setShowInput]  = useState(false)
  const [pwInput,    setPwInput]    = useState('')
  const [pwError,    setPwError]    = useState(false)

  async function load() {
    try {
      const d = await fetchMemory()
      setMemory(d.entries ?? [], d.stats ?? { total: 0, rated: 0, avg_score: null })
    } catch {}
  }

  useEffect(() => { load() }, [])

  function handleUnlockAttempt() {
    if (pwInput === PASSWORD) {
      setUnlocked(true)
      setShowInput(false)
      setPwInput('')
      setPwError(false)
    } else {
      setPwError(true)
      setPwInput('')
    }
  }

  async function handleRate(id: string, r: number | null) {
    updateRating(id, r)
    await rateMemory(id, r).catch(() => {})
  }

  async function handleDelete(id: string) {
    removeEntry(id)
    await deleteMemory(id).catch(() => {})
  }

  return (
    <div className="panel panel-bottom" style={{ minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Title row */}
      <div className="panel-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span>MEMORY BANK</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {unlocked && (
            <button onClick={load} style={{ background: 'none', border: 'none', color: 'var(--amber-dim)', fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer', padding: '0 2px' }}>↺</button>
          )}
          <button
            onClick={() => { if (unlocked) { setUnlocked(false) } else { setShowInput((s) => !s); setPwError(false) } }}
            style={{ background: 'none', border: 'none', color: unlocked ? 'var(--green)' : 'var(--amber-dim)', fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer', padding: '0 2px' }}
            title={unlocked ? 'Lock' : 'Unlock'}
          >
            {unlocked ? '🔓' : '🔒'}
          </button>
        </div>
      </div>

      {/* Password input */}
      {!unlocked && showInput && (
        <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', gap: 6 }}>
          <input
            autoFocus
            type="password"
            placeholder="password…"
            value={pwInput}
            onChange={(e) => { setPwInput(e.target.value); setPwError(false) }}
            onKeyDown={(e) => e.key === 'Enter' && handleUnlockAttempt()}
            style={{
              flex: 1, background: pwError ? '#1a0005' : '#0a0c14',
              border: `1px solid ${pwError ? 'var(--red)' : 'var(--border)'}`,
              color: 'var(--amber)', fontFamily: 'var(--font-mono)', fontSize: 11,
              padding: '3px 6px', outline: 'none',
            }}
          />
          <button
            onClick={handleUnlockAttempt}
            style={{ background: 'var(--amber-dim)', border: 'none', color: '#000', fontFamily: 'var(--font-mono)', fontSize: 10, padding: '2px 8px', cursor: 'pointer', letterSpacing: '0.08em' }}
          >
            OK
          </button>
        </div>
      )}

      {/* Locked placeholder */}
      {!unlocked && !showInput && (
        <div className="dim" style={{ fontSize: 11, padding: '8px 12px', flexShrink: 0 }}>
          {stats?.total ?? 0} entries · click 🔒 to view
        </div>
      )}

      {/* Unlocked: stats + entries */}
      {unlocked && (
        <>
          {stats && (
            <div style={{ display: 'flex', gap: 16, padding: '4px 12px 6px', fontSize: 10, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <span><span className="dim">TOTAL </span><span className="amber">{stats.total}</span></span>
              <span><span className="dim">RATED </span><span className="cyan">{stats.rated}</span></span>
              {stats.avg_score !== null && (
                <span><span className="dim">AVG </span><span className="green">{stats.avg_score}</span></span>
              )}
            </div>
          )}

          <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}>
            {memory.length === 0 ? (
              <div className="dim" style={{ fontSize: 11, padding: '8px 12px' }}>no memory entries</div>
            ) : (
              memory.map((e) => (
                <div key={e.id} style={{ borderBottom: '1px solid var(--border)', background: expanded === e.id ? '#0a0c14' : 'transparent' }}>
                  <div
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '6px 10px', cursor: 'pointer' }}
                    onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                  >
                    <span style={{
                      fontSize: 9, padding: '1px 4px', flexShrink: 0, marginTop: 1,
                      background: e.score !== null ? (e.score >= 7 ? 'var(--green-dim)' : e.score >= 4 ? '#3a2a00' : '#2a0008') : 'var(--border)',
                      color: e.score !== null ? (e.score >= 7 ? 'var(--green)' : e.score >= 4 ? 'var(--amber)' : 'var(--red)') : 'var(--white-dim)',
                    }}>
                      {e.score !== null ? e.score.toFixed(1) : '—'}
                    </span>

                    <span style={{ fontSize: 11, color: 'var(--amber)', flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      {e.user}
                    </span>

                    <span style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={(ev) => ev.stopPropagation()}>
                      <button onClick={() => handleRate(e.id, e.rating === 1 ? null : 1)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: '0 2px', color: e.rating === 1 ? 'var(--green)' : 'var(--white-dim)' }}
                        title="Good response">▲</button>
                      <button onClick={() => handleRate(e.id, e.rating === -1 ? null : -1)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: '0 2px', color: e.rating === -1 ? 'var(--red)' : 'var(--white-dim)' }}
                        title="Poor response">▼</button>
                      <button onClick={() => handleDelete(e.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, padding: '0 2px', color: 'var(--white-dim)' }}
                        title="Delete">✕</button>
                    </span>
                  </div>

                  {expanded === e.id && (
                    <div style={{ padding: '0 10px 8px 10px', fontSize: 11 }}>
                      <div style={{ color: 'var(--cyan)', marginBottom: 4, fontSize: 10 }}>
                        {new Date(e.timestamp).toLocaleString('en-US', { hour12: false })}
                      </div>
                      <div style={{ color: 'var(--amber)', marginBottom: 6, lineHeight: 1.5 }}>{e.user}</div>
                      <div style={{ color: 'var(--white-dim)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{e.assistant}</div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
