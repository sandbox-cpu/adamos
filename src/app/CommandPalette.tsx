import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowRight,
  BrainCircuit,
  CornerDownLeft,
  FileText,
  FlaskConical,
  FolderKanban,
  FolderPlus,
  ImagePlus,
  MessageSquare,
  PanelsTopLeft,
  Presentation,
  Radio,
  Search,
  Sparkles,
} from 'lucide-react'
import { ALL_NAV } from './nav'
import { useUI } from '../stores/ui'
import { useAgents, useLead, useProjects, useRoles } from '../hooks/data'
import { searchBrain, type BrainHit } from '../lib/brain/search'
import { startConversation } from '../lib/agents/chat'
import { AgentAvatar } from '../components/agents/AgentAvatar'
import { Kbd } from '../components/ui/bits'
import { cn } from '../lib/utils'

interface Item {
  id: string
  group: string
  label: ReactNode
  hint?: string
  icon: ReactNode
  keywords: string
  run: () => void
}

export function CommandPalette() {
  const open = useUI((s) => s.palette)
  const setOpen = useUI((s) => s.setPalette)
  const askLead = useUI((s) => s.askLead)
  const navigate = useNavigate()
  const lead = useLead()
  const agents = useAgents()
  const roles = useRoles()
  const projects = useProjects()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [notes, setNotes] = useState<BrainHit[]>([])
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(!useUI.getState().palette)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setActive(0)
    }
  }, [open])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setNotes([])
      return
    }
    const t = setTimeout(() => void searchBrain(q, 5).then(setNotes), 120)
    return () => clearTimeout(t)
  }, [query])

  const go = (path: string) => {
    setOpen(false)
    navigate(path)
  }

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase()
    const list: Item[] = []
    if (q && lead) {
      list.push({
        id: 'ask',
        group: 'Ask',
        label: (
          <span>
            Ask {lead.name}: <span className="text-fg">“{query.trim()}”</span>
          </span>
        ),
        icon: <AgentAvatar agent={lead} size="xs" />,
        keywords: q,
        run: () => {
          setOpen(false)
          askLead(query.trim())
        },
      })
    }
    const actions: Item[] = [
      { id: 'a-project', group: 'Create', label: 'New project', icon: <FolderPlus />, keywords: 'new project create', run: () => go('/projects?new=1') },
      { id: 'a-mastermind', group: 'Create', label: 'Start a mastermind', icon: <BrainCircuit />, keywords: 'mastermind plan strategy team', run: () => go('/mastermind?new=1') },
      { id: 'a-deck', group: 'Create', label: 'New presentation', icon: <Presentation />, keywords: 'deck slides presentation pitch', run: () => go('/decks?new=1') },
      { id: 'a-site', group: 'Create', label: 'New landing page', icon: <PanelsTopLeft />, keywords: 'landing page website microsite', run: () => go('/sites?new=1') },
      { id: 'a-research', group: 'Create', label: 'New research', icon: <FlaskConical />, keywords: 'research competitor market trends', run: () => go('/research?new=1') },
      { id: 'a-image', group: 'Create', label: 'Create an image', icon: <ImagePlus />, keywords: 'image picture generate media', run: () => go('/media') },
      {
        id: 'a-press',
        group: 'Create',
        label: 'Write a press release',
        icon: <FileText />,
        keywords: 'press release pitch statement write',
        run: () => go('/press?new=press_release'),
      },
      { id: 'a-live', group: 'Create', label: 'Go live with voice & screen share', icon: <Radio />, keywords: 'live voice call screen share talk', run: () => go('/live') },
    ]
    const nav: Item[] = ALL_NAV.map((n) => ({
      id: `nav-${n.to}`,
      group: 'Go to',
      label: n.label,
      hint: n.description,
      icon: <n.icon />,
      keywords: `${n.label} ${n.description}`.toLowerCase(),
      run: () => go(n.to),
    }))
    const agentItems: Item[] = agents.map((a) => ({
      id: `agent-${a.id}`,
      group: 'Chat with',
      label: a.name,
      hint: roles.find((r) => r.id === a.roleId)?.name,
      icon: <AgentAvatar agent={a} size="xs" />,
      keywords: `${a.name} ${roles.find((r) => r.id === a.roleId)?.name ?? ''} chat message`.toLowerCase(),
      run: async () => {
        const conv = await startConversation({ kind: 'direct', agentIds: [a.id] })
        go(`/comms/${conv.id}`)
      },
    }))
    const projectItems: Item[] = projects.map((p) => ({
      id: `project-${p.id}`,
      group: 'Projects',
      label: p.name,
      hint: p.client,
      icon: <FolderKanban />,
      keywords: `${p.name} ${p.client ?? ''}`.toLowerCase(),
      run: () => go(`/projects/${p.id}`),
    }))
    const noteItems: Item[] = notes.map((n) => ({
      id: `note-${n.path}`,
      group: 'Brain',
      label: n.title,
      hint: n.folder,
      icon: <FileText />,
      keywords: q,
      run: () => go(`/brain?note=${encodeURIComponent(n.path)}`),
    }))
    const match = (i: Item) => !q || i.keywords.includes(q) || q.split(/\s+/).every((w) => i.keywords.includes(w))
    list.push(...actions.filter(match), ...nav.filter(match), ...agentItems.filter(match).slice(0, q ? 6 : 4), ...projectItems.filter(match).slice(0, q ? 6 : 3), ...noteItems)
    return list
  }, [query, lead, agents, roles, projects, notes])

  useEffect(() => setActive(0), [query])

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      items[active]?.run()
    } else if (e.key === 'Escape') setOpen(false)
  }

  let lastGroup = ''
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[95] flex items-start justify-center px-3 pt-[12vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="glass-strong relative w-full max-w-2xl overflow-hidden rounded-3xl"
          >
            <div className="flex items-center gap-3 border-b border-white/[0.07] px-5">
              <Search className="size-5 text-muted" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={`Ask ${lead?.name ?? 'your team'} anything, or jump somewhere…`}
                className="h-16 flex-1 bg-transparent text-[16px] text-fg outline-none placeholder:text-faint"
              />
              <Kbd>Esc</Kbd>
            </div>
            <div ref={listRef} className="max-h-[56vh] overflow-y-auto p-2">
              {items.map((item, i) => {
                const header = item.group !== lastGroup ? item.group : null
                lastGroup = item.group
                return (
                  <div key={item.id}>
                    {header && <div className="px-3 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">{header}</div>}
                    <button
                      data-index={i}
                      onMouseMove={() => setActive(i)}
                      onClick={() => item.run()}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm transition [&_svg]:size-[18px]',
                        i === active ? 'bg-white/[0.08] text-fg' : 'text-soft',
                      )}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-muted">{item.icon}</span>
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.hint && <span className="hidden truncate text-xs text-faint sm:block">{item.hint}</span>}
                      {i === active && (item.id === 'ask' ? <CornerDownLeft className="text-muted" /> : <ArrowRight className="text-muted" />)}
                    </button>
                  </div>
                )
              })}
              {!items.length && (
                <div className="flex flex-col items-center py-10 text-center text-sm text-muted">
                  <Sparkles className="mb-2 size-6" />
                  Type a question and press Enter to ask your lead agent.
                </div>
              )}
            </div>
            <div className="flex items-center gap-4 border-t border-white/[0.06] px-5 py-2.5 text-[11px] text-faint">
              <span className="flex items-center gap-1.5">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> to move
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd>↵</Kbd> to choose
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                <MessageSquare className="size-3.5" /> <Kbd>⌘</Kbd>
                <Kbd>J</Kbd> opens {lead?.name ?? 'your lead'}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
