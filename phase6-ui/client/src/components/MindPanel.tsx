import { useEffect, useState } from 'react'
import { fetchHistory, fetchMemory, fetchMind } from '../api'

interface MindStats {
  total: number
  rated: number
  thumbs_up: number
  first_exchange: string | null
}

interface Insight {
  id: string
  timestamp: string
  user: string
  assistant: string
  rating: number | null
  score: string | null
}

interface RecentTopic {
  msg: string
  timestamp: string
}

interface TopicEntry {
  term: string
  count: number
  pct: number
}

interface MindData {
  stats: MindStats
  insights: Insight[]
  recent_topics: RecentTopic[]
  topic_map: TopicEntry[]
}

interface MemoryEntry {
  id: string
  timestamp: string
  user: string
  assistant: string
  rating: number | null
  score: string | null
}

interface HistoryEntry {
  id: string
  timestamp: string
  user: string
  assistant: string
}

const STOPWORDS = new Set([
  'the','a','an','is','are','was','were','be','been','being','have','has',
  'had','do','does','did','will','would','could','should','may','might',
  'shall','can','of','to','in','for','on','with','at','by','from','as',
  'into','through','during','before','after','above','below','up','down',
  'out','off','over','under','again','then','once','here','there','when',
  'where','why','how','all','both','each','few','more','most','other',
  'some','such','no','nor','not','only','own','same','so','than','too',
  'very','just','but','and','or','if','i','you','he','she','it','we',
  'they','me','him','her','us','them','my','your','his','its','our',
  'their','this','that','these','those','what','which','who','whom',
  'about','get','got','also','please','let','make','use','using','used',
  'need','want','help','know','think','see','tell','give','look','going',
  'gone','come','take','show','keep','say','said','does','much','many',
  'any','like','well','okay','yeah','sure','right','good','great','true',
])

function buildTopicMap(texts: string[]): TopicEntry[] {
  const counts = new Map<string, number>()
  for (const text of texts) {
    const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? []
    for (const word of words) {
      if (STOPWORDS.has(word)) continue
      counts.set(word, (counts.get(word) ?? 0) + 1)
    }
  }
  const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 20)
  const maxCount = ranked[0]?.[1] ?? 1
  return ranked.map(([term, count]) => ({
    term,
    count,
    pct: Math.round((count / maxCount) * 100),
  }))
}

function buildFallbackMindData(memoryEntries: MemoryEntry[], historyEntries: HistoryEntry[]): MindData {
  const total = memoryEntries.length
  const rated = memoryEntries.filter((entry) => entry.rating !== null).length
  const thumbsUp = memoryEntries.filter((entry) => entry.rating === 1).length
  const oldest = [...memoryEntries].sort((left, right) => left.timestamp.localeCompare(right.timestamp))[0]?.timestamp ?? null
  const insights = [...memoryEntries]
    .sort((left, right) => {
      if ((left.rating === 1) !== (right.rating === 1)) return left.rating === 1 ? -1 : 1
      return Number(right.score ?? 0) - Number(left.score ?? 0)
    })
    .slice(0, 10)
  const recentTopics = historyEntries.slice(0, 25).map((entry) => ({
    msg: entry.user,
    timestamp: entry.timestamp,
  }))
  const topicMap = buildTopicMap(memoryEntries.map((entry) => entry.user))

  return {
    stats: {
      total,
      rated,
      thumbs_up: thumbsUp,
      first_exchange: oldest,
    },
    insights,
    recent_topics: recentTopics,
    topic_map: topicMap,
  }
}

function formatRelative(ts: string | null): string {
  if (!ts) return '—'
  try {
    const d = new Date(ts)
    const diff = Date.now() - d.getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 2) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 7) return `${days}d ago`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

function formatBorn(ts: string | null): string {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    })
  } catch { return '—' }
}

export default function MindPanel() {
  const [data, setData]       = useState<MindData | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [pulse, setPulse]     = useState(false)

  async function load() {
    try {
      const d = await fetchMind()
      setData(d)
      setPulse(true)
      setTimeout(() => setPulse(false), 600)
      return
    } catch {
      try {
        const [memoryData, historyData] = await Promise.all([
          fetchMemory(),
          fetchHistory(),
        ])
        const fallback = buildFallbackMindData(
          (memoryData.entries ?? []) as MemoryEntry[],
          (historyData ?? []) as HistoryEntry[],
        )
        setData(fallback)
        setPulse(true)
        setTimeout(() => setPulse(false), 600)
      } catch {
        setData(null)
      }
    }
  }

  useEffect(() => {
    load()
    const intervalId = setInterval(load, 12_000)
    return () => clearInterval(intervalId)
  }, [])

  const stats = data?.stats
  const insights = data?.insights ?? []
  const topics = data?.recent_topics ?? []
  const topicMap = data?.topic_map ?? []

  return (
    <div className="mind-panel">
      {/* Header */}
      <div className="mind-header">
        <span className={`mind-pulse-dot ${pulse ? 'mind-pulse-active' : ''}`} />
        <span className="mind-header-title">AWARENESS</span>
        {stats && (
          <span className="mind-depth-badge">{stats.total} exchanges</span>
        )}
      </div>

      <div className="mind-body">
        {/* Memory Depth */}
        {stats && (
          <div className="mind-section">
            <div className="mind-section-label">DEPTH</div>
            <div className="mind-depth-grid">
              <div className="mind-stat-cell">
                <span className="mind-stat-val">{stats.total}</span>
                <span className="mind-stat-key">total</span>
              </div>
              <div className="mind-stat-cell">
                <span className="mind-stat-val">{stats.thumbs_up}</span>
                <span className="mind-stat-key">valued</span>
              </div>
              <div className="mind-stat-cell">
                <span className="mind-stat-val">{stats.rated}</span>
                <span className="mind-stat-key">rated</span>
              </div>
            </div>
            {stats.first_exchange && (
              <div className="mind-born">
                awakened {formatBorn(stats.first_exchange)}
              </div>
            )}
          </div>
        )}

        {/* Topic map */}
        {topicMap.length > 0 && (
          <div className="mind-section">
            <div className="mind-section-label">KNOWLEDGE MAP</div>
            <div className="mind-topic-map">
              {topicMap.map((t) => (
                <div key={t.term} className="mind-topic-row">
                  <span className="mind-topic-term">{t.term}</span>
                  <div className="mind-topic-bar-wrap">
                    <div className="mind-topic-bar" style={{ width: `${t.pct}%` }} />
                  </div>
                  <span className="mind-topic-count">{t.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Insights */}
        {insights.length > 0 && (
          <div className="mind-section">
            <div className="mind-section-label">INSIGHTS</div>
            <div className="mind-insights-list">
              {insights.map((ins) => (
                <div
                  key={ins.id}
                  className={`mind-insight-card ${expanded === ins.id ? 'expanded' : ''}`}
                  onClick={() => setExpanded(expanded === ins.id ? null : ins.id)}
                >
                  <div className="mind-insight-header">
                    {ins.rating === 1 && (
                      <span className="mind-insight-star" title="Valued exchange">★</span>
                    )}
                    <span className="mind-insight-q">{ins.user}</span>
                    <span className="mind-insight-age">{formatRelative(ins.timestamp)}</span>
                  </div>
                  {expanded === ins.id && (
                    <div className="mind-insight-body">
                      {ins.assistant}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent awareness stream */}
        {topics.length > 0 && (
          <div className="mind-section">
            <div className="mind-section-label">RECENT STREAM</div>
            <div className="mind-stream">
              {topics.map((t, i) => (
                <div key={i} className="mind-stream-row">
                  <span className="mind-stream-age">{formatRelative(t.timestamp)}</span>
                  <span className="mind-stream-msg">{t.msg}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!data && (
          <div className="mind-offline">
            Mithrandir backend offline — memory unavailable
          </div>
        )}
      </div>
    </div>
  )
}
