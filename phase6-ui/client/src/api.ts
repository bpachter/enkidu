const BASE = 'http://localhost:8000'

export async function fetchParams() {
  const r = await fetch(`${BASE}/api/params`)
  return r.json()
}

export async function saveParams(params: object) {
  const r = await fetch(`${BASE}/api/params`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return r.json()
}

export async function fetchHistoryItem(id: string) {
  const r = await fetch(`${BASE}/api/history/${id}`)
  return r.json()
}

export async function fetchHistory() {
  const r = await fetch(`${BASE}/api/history`)
  const data = await r.json()
  return data.exchanges ?? []
}

export async function fetchPortfolio() {
  const r = await fetch(`${BASE}/api/portfolio`)
  const data = await r.json()
  return data.picks ?? []
}

export async function fetchRegime() {
  const r = await fetch(`${BASE}/api/regime`)
  return r.json()
}

export async function fetchMemory() {
  const r = await fetch(`${BASE}/api/memory`)
  return r.json()
}

export async function rateMemory(id: string, rating: number | null) {
  await fetch(`${BASE}/api/memory/${id}/rate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating }),
  })
}

export async function deleteMemory(id: string) {
  await fetch(`${BASE}/api/memory/${id}`, { method: 'DELETE' })
}

export async function fetchDocs() {
  const r = await fetch(`${BASE}/api/docs`)
  return r.json()  // { docs: DocEntry[], categories: string[] }
}

export async function searchDocs(query: string) {
  const r = await fetch(`${BASE}/api/docs/search?q=${encodeURIComponent(query)}`)
  return r.json()  // { results: string, query: string }
}

export function createChatSocket(
  onStep: (msg: string) => void,
  onToken: (token: string) => void,
  onResponse: (msg: string) => void,
  onDone: () => void,
  onError: (e: string) => void,
  onAudio?: (b64: string, fmt: string) => void,
  onTtsError?: (msg: string) => void,
): WebSocket {
  const ws = new WebSocket('ws://localhost:8000/ws/chat')
  ws.onmessage = (ev) => {
    const data = JSON.parse(ev.data)
    if (data.type === 'step')      onStep(data.content)
    if (data.type === 'token')     onToken(data.content)
    if (data.type === 'response')  onResponse(data.content)
    if (data.type === 'done')      onDone()
    if (data.type === 'error')     onError(data.content)
    if (data.type === 'tts_error' && onTtsError) onTtsError(data.content)
    // tts_chunk: sentence-by-sentence streaming (primary path)
    // tts_audio: single-shot legacy (kept for backward compat)
    if ((data.type === 'tts_chunk' || data.type === 'tts_audio') && onAudio)
      onAudio(data.data, data.format ?? 'wav')
  }
  // If the socket drops mid-response, synthesize a "done" event so the UI
  // releases the busy spinner and the buttons become clickable again.
  ws.onclose = () => { try { onDone() } catch {} }
  ws.onerror = () => { try { onError('chat socket error'); onDone() } catch {} }
  return ws
}

export function createGpuSocket(onStats: (s: object) => void): WebSocket {
  const ws = new WebSocket('ws://localhost:8000/ws/gpu')
  ws.onmessage = (ev) => onStats(JSON.parse(ev.data))
  return ws
}


// ─────────────────────────────────────────────────────────────────────────
// Phase 7 — Data Center Siting
// ─────────────────────────────────────────────────────────────────────────

export type Archetype = 'training' | 'inference' | 'mixed'

export interface FactorResultDTO {
  factor: string
  raw_value: number | null
  normalized: number          // 0..1
  weight: number
  weighted: number            // weight * normalized
  killed: boolean
  provenance: Record<string, unknown>
}

export interface SiteResultDTO {
  site_id: string
  lat: number
  lon: number
  composite: number           // 0..10
  factors: Record<string, FactorResultDTO>
  kill_flags: Record<string, boolean>
  imputed: string[]
  provenance: Record<string, unknown>
  extras?: Record<string, unknown>
}

export interface SitingFactorsResponse {
  factors: string[]
  default_archetype: Archetype
  weights: Record<Archetype, Record<string, number>>
  kill_criteria: Record<string, unknown>
}

export interface SitingLayer {
  key: string
  source: string
  layer: string
  name: string
  cached: boolean
}

export async function fetchSitingFactors(): Promise<SitingFactorsResponse> {
  const r = await fetch(`${BASE}/api/siting/factors`)
  if (!r.ok) throw new Error(`siting/factors ${r.status}`)
  return r.json()
}

export async function fetchSitingSample(): Promise<{ results: SiteResultDTO[] }> {
  const r = await fetch(`${BASE}/api/siting/sample`)
  if (!r.ok) throw new Error(`siting/sample ${r.status}`)
  return r.json()
}

export async function scoreSites(payload: {
  sites: Array<{ site_id: string; lat: number; lon: number; [k: string]: unknown }>
  archetype?: Archetype
  weight_overrides?: Record<string, number>
}): Promise<{ results: SiteResultDTO[] }> {
  const r = await fetch(`${BASE}/api/siting/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!r.ok) throw new Error(`siting/score ${r.status}`)
  return r.json()
}

export async function fetchSitingLayers(): Promise<{
  layers: SitingLayer[]
  data_sources: Record<string, unknown>
}> {
  const r = await fetch(`${BASE}/api/siting/layers`)
  if (!r.ok) throw new Error(`siting/layers ${r.status}`)
  return r.json()
}

export interface SitingLayerGeoJSON {
  type: 'FeatureCollection'
  features: GeoJSON.Feature[]
  _meta: {
    layer: string
    name: string
    source: string
    returned: number
    limit: number
    bbox: string | null
    cache_path: string
  }
}

export async function fetchSitingLayerGeoJSON(
  layerKey: string,
  bbox?: [number, number, number, number],
  limit = 5000,
): Promise<SitingLayerGeoJSON | { error: string }> {
  const params = new URLSearchParams()
  if (bbox) params.set('bbox', bbox.join(','))
  params.set('limit', String(limit))
  const r = await fetch(`${BASE}/api/siting/layer/${layerKey}?${params.toString()}`)
  if (r.status === 404) {
    const j = await r.json().catch(() => ({}))
    return { error: j.error ?? 'not cached' }
  }
  if (!r.ok) throw new Error(`siting/layer/${layerKey} ${r.status}`)
  return r.json()
}
