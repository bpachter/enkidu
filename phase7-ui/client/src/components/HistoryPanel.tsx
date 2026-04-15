import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { fetchHistory } from '../api'

export default function HistoryPanel() {
  const history    = useStore((s) => s.history)
  const setHistory = useStore((s) => s.setHistory)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    fetchHistory().then(setHistory).catch(() => {})
  }, [])

  return (
    <div className="panel panel-bottom" style={{ minHeight: 0 }}>
      <div className="panel-title">CONVERSATION HISTORY</div>
      <div className="history-list">
        {history.length === 0 ? (
          <div className="dim" style={{ fontSize: 11, padding: '8px 0' }}>no history found</div>
        ) : (
          history.map((h) => (
            <div
              key={h.id}
              className={`history-item ${expanded === h.id ? 'expanded' : ''}`}
              onClick={() => setExpanded(expanded === h.id ? null : h.id)}
            >
              <div className="history-header">
                <span className="dim" style={{ fontSize: 10 }}>
                  {new Date(h.timestamp).toLocaleString('en-US', {
                    month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit', hour12: false,
                  })}
                </span>
                <span className="history-preview">
                  {expanded === h.id ? h.user : h.user.slice(0, 60) + (h.user.length > 60 ? '…' : '')}
                </span>
              </div>
              {expanded === h.id && (
                <div className="history-response">
                  <span className="dim" style={{ fontSize: 10 }}>ENKIDU › </span>
                  {h.assistant.slice(0, 400)}{h.assistant.length > 400 ? '…' : ''}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
