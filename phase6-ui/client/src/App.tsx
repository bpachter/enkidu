import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings2, BookText, Code2, Moon, Sun, BrainCircuit, Archive } from 'lucide-react'
import CelestialBackground from './components/CelestialBackground'
import ChatPanel        from './components/ChatPanel'
import GpuHistoryPanel  from './components/GpuHistoryPanel'
import ModelParamsPanel from './components/ModelParamsPanel'
import MemoryPanel      from './components/MemoryPanel'
import MindPanel        from './components/MindPanel'
import DocsPanel        from './components/DocsPanel'
import SitingPanel      from './components/SitingPanel'
import DevPanel         from './components/DevPanel'
import { useStore }     from './store'
import { createGpuSocket } from './api'

type LeftTab  = 'params' | 'docs'
type RightTab = 'vault' | 'mind'
type AppMode  = 'terminal' | 'avalon' | 'dev'
type ThemeMode = 'dark' | 'light'

function getEstHour(): number {
  return parseInt(
    new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }),
    10,
  )
}

function themeForTime(): ThemeMode {
  const h = getEstHour()
  return h >= 7 && h < 18 ? 'light' : 'dark'
}

export default function App() {
  const setGpuStats          = useStore((s) => s.setGpuStats)
  const pushGpuHistory       = useStore((s) => s.pushGpuHistory)
  const setPendingChatInput  = useStore((s) => s.setPendingChatInput)
  const [leftTab,  setLeftTab]  = useState<LeftTab>('params')
  const [rightTab, setRightTab] = useState<RightTab>('mind')
  const [mode,     setMode]     = useState<AppMode>('terminal')
  const [theme, setTheme] = useState<ThemeMode>(() => {
    // Set attribute synchronously so CelestialBackground reads correct value on mount.
    const t = themeForTime()
    document.documentElement.setAttribute('data-theme', t)
    return t
  })

  // GPU WebSocket lives here — always connected regardless of which panel is visible.
  useEffect(() => {
    const ws = createGpuSocket((raw) => {
      const s = raw as Record<string, number>
      setGpuStats(s as never)
      pushGpuHistory({
        ts:          Date.now(),
        gpu_util:    s.gpu_util,
        vram_pct:    (s.vram_used / s.vram_total) * 100,
        temp:        s.temp,
        power:       s.power_draw,
        clock_sm:    s.clock_sm  ?? 0,
        clock_mem:   s.clock_mem ?? 0,
        cpu_percent: s.cpu_percent,
      })
    })
    return () => ws.close()
  }, [setGpuStats, pushGpuHistory])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Auto-switch at 7 AM and 6 PM EST — polls every 30 s, smooth canvas handles the visual fade
  useEffect(() => {
    const id = setInterval(() => setTheme(themeForTime()), 30_000)
    return () => clearInterval(id)
  }, [])

  if (mode === 'avalon') {
    return <SitingPanel onClose={() => setMode('terminal')} />
  }

  if (mode === 'dev') {
    return <DevPanel onClose={() => setMode('terminal')} />
  }

  return (
    <>
    <CelestialBackground />
    <div className="sky-layer sky-stars sky-stars-a" aria-hidden="true" />
    <div className="sky-layer sky-stars sky-stars-b" aria-hidden="true" />
    <div className="sky-layer sky-aurora" aria-hidden="true" />
    <div className="app-grid app-grid-shell">
      <button
        onClick={() => {
          const next = theme === 'dark' ? 'light' : 'dark'
          // Fade content to opacity-0, snap theme while invisible, then let 3s fade-in play
          document.documentElement.classList.add('theme-fading')
          setTimeout(() => {
            setTheme(next)
            requestAnimationFrame(() => requestAnimationFrame(() =>
              document.documentElement.classList.remove('theme-fading')
            ))
          }, 320)
        }}
        title={theme === 'dark' ? 'Switch to day mode (auto at 7 AM EST)' : 'Switch to night mode (auto at 6 PM EST)'}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        className="theme-toggle fixed top-2 right-3 z-50"
      >
        {theme === 'dark' ? <Sun className="h-3 w-3" strokeWidth={2.3} /> : <Moon className="h-3 w-3" strokeWidth={2.3} />}
        {theme === 'dark' ? 'Day' : 'Night'}
      </button>

      {/* Dev panel launch button */}
      <button
        onClick={() => setMode('dev')}
        title="Open Mithrandir Forge — code orchestration and review"
        className="
          app-launch-btn group fixed bottom-2 right-2 z-50
          inline-flex items-center gap-2 rounded-sm border
          px-3 py-1 font-display text-[10.5px] font-semibold uppercase tracking-[0.22em]
          transition-all duration-150
          hover:shadow-[0_0_14px_-4px_rgba(184,196,208,0.4)]
          focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2
        "
        style={{
          borderColor: 'var(--border-strong)',
          background: 'rgba(186,198,210,0.10)',
          color: 'var(--fg)',
        }}
      >
        <Code2 className="h-3 w-3" strokeWidth={2.4} />
        Dev
      </button>

      {/* External app links — bottom-left launcher strip */}
      <div className="fixed bottom-2 left-2 z-50 flex items-center gap-2">
        {[
          { label: 'Avalon',  href: 'https://bpachter.github.io/avalon/' },
          { label: 'Orator',  href: 'https://bpachter.github.io/orator/?view=yield-curve&range=5Y' },
          { label: 'Chronos', href: 'https://bpachter.github.io/chronos/' },
          { label: 'Aegis',   href: 'https://bpachter.github.io/aegis/' },
        ].map(({ label, href }) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="
              app-launch-btn inline-flex items-center rounded-sm border
              px-3 py-1 font-display text-[10.5px] font-semibold uppercase tracking-[0.22em]
              transition-all duration-150
              hover:shadow-[0_0_14px_-4px_rgba(184,196,208,0.4)]
              no-underline
            "
            style={{
              borderColor: 'var(--border-strong)',
              background: 'rgba(186,198,210,0.10)',
              color: 'var(--fg)',
            }}
          >
            {label}
          </a>
        ))}
      </div>

      {/* Hardware monitoring strip */}
      <div className="hw-bar-row">
        <GpuHistoryPanel />
      </div>

      {/* Left column: Params / Docs */}
      <div className="col-left">
        <div className="tab-bar">
          <button
            className={`tab-btn ${leftTab === 'params' ? 'active' : ''}`}
            onClick={() => setLeftTab('params')}
          >
            <Settings2 className="mr-1.5 inline h-3 w-3 -translate-y-px" strokeWidth={2.2} />
            Params
          </button>
          <button
            className={`tab-btn ${leftTab === 'docs' ? 'active' : ''}`}
            onClick={() => setLeftTab('docs')}
          >
            <BookText className="mr-1.5 inline h-3 w-3 -translate-y-px" strokeWidth={2.2} />
            CUDA
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={leftTab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              style={{ height: '100%' }}
            >
              {leftTab === 'params' && <ModelParamsPanel />}
              {leftTab === 'docs'   && (
                <DocsPanel onAskMithrandir={(q) => setPendingChatInput(q)} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Center column: Chat + Memory */}
      <div className="col-chat">
        <ChatPanel />
      </div>

      {/* Right column: Context Vault / Mind */}
      <div className="col-right">
        <div className="tab-bar">
          <button
            className={`tab-btn ${rightTab === 'mind' ? 'active' : ''}`}
            onClick={() => setRightTab('mind')}
          >
            <BrainCircuit className="mr-1.5 inline h-3 w-3 -translate-y-px" strokeWidth={2.2} />
            Mind
          </button>
          <button
            className={`tab-btn ${rightTab === 'vault' ? 'active' : ''}`}
            onClick={() => setRightTab('vault')}
          >
            <Archive className="mr-1.5 inline h-3 w-3 -translate-y-px" strokeWidth={2.2} />
            Vault
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={rightTab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              style={{ height: '100%' }}
            >
              {rightTab === 'vault' && <MemoryPanel />}
              {rightTab === 'mind'  && <MindPanel />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
    </>
  )
}
