import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { format } from 'date-fns'
import { CircleCheck, CircleX, LoaderCircle, Menu as MenuIcon, Search, Sparkles, X } from 'lucide-react'
import { navFor } from './nav'
import { useUI } from '../stores/ui'
import { useJobs } from '../stores/jobs'
import { useAgents } from '../hooks/data'
import { AgentAvatar } from '../components/agents/AgentAvatar'
import { Kbd } from '../components/ui/bits'
import { cn, timeAgo } from '../lib/utils'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { shortcutModifier } from '../lib/shortcuts'

function Clock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="hidden text-right leading-tight xl:block">
      <div className="text-[13px] font-medium tabular-nums text-fg">{format(now, 'HH:mm')}</div>
      <div className="text-[11px] text-faint">{format(now, 'EEE d MMM')}</div>
    </div>
  )
}

function JobsButton() {
  const jobs = useJobs((s) => s.jobs)
  const dismiss = useJobs((s) => s.dismiss)
  const agents = useAgents()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const running = jobs.filter((j) => j.status === 'running')
  if (!jobs.length) return null
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-medium transition',
          running.length
            ? 'border-[color-mix(in_oklab,var(--accent)_40%,transparent)] bg-[color-mix(in_oklab,var(--accent)_12%,transparent)] text-fg'
            : 'border-white/[0.08] bg-white/[0.04] text-soft',
        )}
      >
        {running.length ? <LoaderCircle className="size-3.5 animate-spin" /> : <CircleCheck className="size-3.5 text-good" />}
        <span className="hidden sm:inline">{running.length ? `${running.length} working` : 'All done'}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="glass-strong absolute right-0 top-11 z-50 w-80 rounded-2xl p-2"
          >
            <div className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">Agent work</div>
            {jobs.map((j) => {
              const agent = agents.find((a) => a.id === j.agentId)
              return (
                <div key={j.id} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/[0.05]">
                  {agent ? <AgentAvatar agent={agent} size="sm" active={j.status === 'running'} /> : <Sparkles className="size-5 text-muted" />}
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      if (j.link) navigate(j.link)
                      setOpen(false)
                    }}
                  >
                    <div className="truncate text-[13px] text-fg">{j.title}</div>
                    <div className={cn('truncate text-[11px]', j.status === 'error' ? 'text-bad' : 'text-muted')}>
                      {j.status === 'error' ? (j.error ?? 'Failed') : j.status === 'running' ? j.stage : `Ready · ${timeAgo(j.startedAt)}`}
                    </div>
                  </button>
                  {j.status === 'running' ? (
                    <LoaderCircle className="size-4 animate-spin text-muted" />
                  ) : j.status === 'error' ? (
                    <CircleX className="size-4 text-bad" />
                  ) : (
                    <button onClick={() => dismiss(j.id)} className="opacity-0 transition group-hover:opacity-100" aria-label="Dismiss">
                      <X className="size-4 text-faint" />
                    </button>
                  )}
                </div>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function DemoBadge() {
  const profiles = useLiveQuery(() => db.profiles.count(), [], 1)
  const navigate = useNavigate()
  if (profiles > 0) return null
  return (
    <button
      onClick={() => navigate('/settings?tab=ai')}
      className="hidden h-9 items-center gap-2 rounded-xl border border-warn/30 bg-warn/10 px-3 text-xs font-medium text-warn transition hover:bg-warn/15 md:flex"
      title="Agents give sample answers until an AI provider is connected"
    >
      <Sparkles className="size-3.5" />
      Demo mode · Connect AI
    </button>
  )
}

export function Topbar() {
  const location = useLocation()
  const item = navFor(location.pathname)
  const setPalette = useUI((s) => s.setPalette)
  const setMobileNav = useUI((s) => s.setMobileNav)
  return (
    <header className="relative z-20 flex h-16 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-ink-950/40 px-4 backdrop-blur-xl sm:px-6">
      <button
        onClick={() => setMobileNav(true)}
        className="grid size-9 place-items-center rounded-xl text-muted hover:bg-white/[0.06] hover:text-fg lg:hidden"
        aria-label="Open navigation"
      >
        <MenuIcon className="size-5" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {item && <item.icon className="size-4 text-muted" />}
          <span className="truncate text-sm font-medium text-fg">{item?.label ?? 'Home'}</span>
        </div>
      </div>
      <button
        onClick={() => setPalette(true)}
        className="flex h-9 w-9 items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-2.5 text-[13px] text-muted transition hover:border-white/[0.14] hover:text-soft sm:w-72 sm:px-3"
      >
        <Search className="size-4 shrink-0" />
        <span className="hidden flex-1 truncate text-left sm:block">Ask your team or search…</span>
        <span className="hidden items-center gap-1 sm:flex">
          <Kbd>{shortcutModifier}</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>
      <DemoBadge />
      <JobsButton />
      <Clock />
    </header>
  )
}
