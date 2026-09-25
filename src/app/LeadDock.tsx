import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Maximize2, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLead, useRoleOf } from '../hooks/data'
import { useUI } from '../stores/ui'
import { useLive } from '../stores/live'
import { getLeadConversation, sendDirect } from '../lib/agents/chat'
import type { Conversation } from '../lib/types'
import { AgentAvatar } from '../components/agents/AgentAvatar'
import { ChatView } from '../components/chat/ChatView'
import { useSettings } from '../stores/settings'
import { matchesShortcut, shortcutModifier } from '../lib/shortcuts'

function Starters({ onPick, starters }: { onPick: (s: string) => void; starters: string[] }) {
  return (
    <div className="grid gap-2">
      {starters.map((s) => (
        <button
          key={s}
          onClick={() => onPick(s)}
          className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-2.5 text-left text-[13px] text-soft transition hover:border-white/15 hover:bg-white/[0.06] hover:text-fg"
        >
          {s}
        </button>
      ))}
    </div>
  )
}

/** The lead agent, one click away from anywhere in the OS. */
export function LeadDock() {
  const open = useUI((s) => s.dock)
  const setDock = useUI((s) => s.setDock)
  const draft = useUI((s) => s.dockDraft)
  const lead = useLead()
  const role = useRoleOf(lead)
  const [conv, setConv] = useState<Conversation | null>(null)
  const [prefill, setPrefill] = useState('')
  const running = useLive((s) => (conv ? !!s.running[conv.id] : false))
  const navigate = useNavigate()
  const location = useLocation()
  const userName = useSettings((s) => s.settings.userName.split(' ')[0])
  // Chat pages and full-screen editors have their own controls where the floating button would sit.
  // Stay out of the way of full-screen tools and live previews.
  const hideLauncher =
    /^\/(comms|huddle|live|brain)(\/|$)/.test(location.pathname) ||
    /^\/(decks|sites)\/[^/]+/.test(location.pathname) ||
    (location.pathname === '/media' && new URLSearchParams(location.search).get('tab') === 'social')

  useEffect(() => {
    if (open && lead) void getLeadConversation().then(setConv)
  }, [open, lead])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (matchesShortcut(e, 'j')) {
        e.preventDefault()
        setDock(!useUI.getState().dock)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setDock])

  // A draft passed with askLead() is sent straight away.
  useEffect(() => {
    if (open && conv && draft.trim()) {
      void sendDirect(conv.id, draft.trim())
      useUI.setState({ dockDraft: '' })
    }
  }, [open, conv, draft])

  if (!lead) return null

  return (
    <>
      <AnimatePresence>
        {!open && !hideLauncher && (
          <motion.button
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setDock(true)}
            className="fixed right-5 bottom-5 z-40 flex items-center gap-3 rounded-full border border-white/10 bg-ink-850/80 py-1.5 pr-4 pl-1.5 shadow-[0_18px_50px_-12px_rgb(0_0_0/0.8)] backdrop-blur-xl sm:right-7 sm:bottom-7"
            aria-label={`Ask ${lead.name}`}
          >
            <span className="relative">
              <span className="absolute -inset-2 animate-pulse-soft rounded-full" style={{ background: `radial-gradient(circle, ${lead.color}55, transparent 70%)` }} />
              <AgentAvatar agent={lead} size="md" active={running} />
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-[13px] font-semibold text-fg">Ask {lead.name}</span>
              <span className="block text-[11px] text-muted">{running ? 'Working on it…' : `${shortcutModifier}+J · your chief of staff`}</span>
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className="glass-strong fixed inset-x-2 bottom-2 z-50 flex h-[min(720px,calc(100dvh-16px))] flex-col overflow-hidden rounded-3xl sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[440px]"
          >
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
              <AgentAvatar agent={lead} size="md" active={running} status={running ? 'working' : 'online'} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{lead.name}</div>
                <div className="truncate text-xs text-muted">{running ? 'Working on it…' : (role?.name ?? 'Lead agent')}</div>
              </div>
              <button
                onClick={() => {
                  setDock(false)
                  if (conv) navigate(`/comms/${conv.id}`)
                }}
                className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/[0.07] hover:text-fg"
                title="Open full screen"
                aria-label="Open full screen"
              >
                <Maximize2 className="size-4" />
              </button>
              <button onClick={() => setDock(false)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/[0.07] hover:text-fg" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              {conv && (
                <ChatView
                  conversation={conv}
                  compact
                  autoFocus
                  placeholder={`Tell ${lead.name} what you need…`}
                  draft={prefill}
                  empty={
                    <div className="px-1 pb-6">
                      <div className="mb-5 flex flex-col items-center pt-4 text-center">
                        <AgentAvatar agent={lead} size="xl" active />
                        <h3 className="mt-4 font-display text-xl font-semibold">
                          Hi {userName}, I’m {lead.name}.
                        </h3>
                        <p className="mt-1 max-w-xs text-sm text-muted">Tell me what’s on your mind. I’ll organise it, book it, or hand it to the right specialist.</p>
                      </div>
                      <Starters starters={role?.starters ?? []} onPick={(s) => (/[:\s]$/.test(s) ? setPrefill(s) : void sendDirect(conv.id, s))} />
                    </div>
                  }
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
