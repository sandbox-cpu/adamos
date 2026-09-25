import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'motion/react'
import { format } from 'date-fns'
import {
  ArrowUpRight,
  Box,
  Brain,
  CircleDot,
  Copy,
  ExternalLink,
  Eye,
  Galaxy,
  Link2,
  List,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Waypoints,
  X,
} from 'lucide-react'
import { db } from '../../lib/db'
import { backlinks, buildGraph } from '../../lib/brain/graph'
import { searchBrain, type BrainHit } from '../../lib/brain/search'
import { obsidianUri } from '../../lib/brain/vault-fs'
import { resyncVaultFolder } from '../../lib/brain/link'
import type { BrainNote } from '../../lib/types'
import { cn, copyText, errorMessage, formatNumber } from '../../lib/utils'
import { useSettings } from '../../stores/settings'
import { useUI } from '../../stores/ui'
import { useLead } from '../../hooks/data'
import { Button } from '../../components/ui/Button'
import { Menu, Tabs } from '../../components/ui/bits'
import { Markdown } from '../../components/ui/Markdown'
import { Modal } from '../../components/ui/Modal'
import { toast } from '../../components/ui/Toast'
import { BrainScene } from './BrainScene'
import { groupColors, GHOST_COLOR, OTHER_COLOR, type BrainLayout } from './layout'
import { LinkVaultOptions } from './LinkVault'

type View = '3d' | 'list'

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ */
/*  Note reader                                                        */
/* ------------------------------------------------------------------ */

function NotePanel({
  note,
  notes,
  graph,
  onSelect,
  onClose,
}: {
  note: BrainNote
  notes: BrainNote[]
  graph: ReturnType<typeof buildGraph>
  onSelect: (path: string) => void
  onClose: () => void
}) {
  const brain = useSettings((s) => s.settings.brain)
  const askLead = useUI((s) => s.askLead)
  const lead = useLead()
  const back = useMemo(() => backlinks(notes, note.path, graph.resolver), [notes, note.path, graph])
  const outgoing = useMemo(() => {
    const seen = new Set<string>()
    return note.links
      .map((l) => ({ raw: l, path: graph.resolver.resolve(l, note.path) }))
      .filter((l) => {
        const key = l.path ?? `?${l.raw}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
  }, [note, graph])
  const uri = brain.mode !== 'none' ? obsidianUri(brain.name, note.path) : undefined
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [note.path])

  return (
    <motion.aside
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      className="glass-strong absolute inset-x-2 bottom-2 z-20 flex max-h-[62vh] flex-col overflow-hidden rounded-3xl md:inset-x-auto md:top-4 md:right-4 md:bottom-4 md:max-h-none md:w-[440px]"
    >
      <div className="flex items-start gap-3 border-b border-white/[0.06] px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11.5px] text-muted">{note.folder || 'Vault root'}</div>
          <h2 className="font-display text-xl leading-tight font-semibold tracking-tight">{note.title}</h2>
        </div>
        <button onClick={onClose} className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-white/[0.07] hover:text-fg" aria-label="Close note">
          <X className="size-4" />
        </button>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="primary"
            icon={<Sparkles />}
            onClick={() =>
              askLead(`Read my note “${note.title}” (${note.path}) and give me the key points, anything that needs action, and how it connects to my current projects.`)
            }
          >
            Ask {lead?.name ?? 'your lead'} about it
          </Button>
          {uri && (
            <Button size="sm" variant="secondary" icon={<ExternalLink />} onClick={() => window.open(uri, '_self')}>
              Open in Obsidian
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            icon={<Copy />}
            onClick={async () => {
              await copyText(note.content)
              toast.success('Note copied')
            }}
          >
            Copy
          </Button>
        </div>
        {note.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {note.tags.map((t) => (
              <span key={t} className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[12px] text-soft">
                #{t}
              </span>
            ))}
          </div>
        )}
        <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
          <Markdown
            obsidian
            className="text-[13.5px]"
            onWikiLink={(target) => {
              const path = graph.resolver.resolve(target, note.path)
              if (path) onSelect(path)
              else toast.info('That note doesn’t exist yet', target)
            }}
          >
            {note.content.replace(/^---\n[\s\S]*?\n---\n?/, '')}
          </Markdown>
        </div>
        {back.length > 0 && (
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">
              <ArrowUpRight className="size-3.5 rotate-180" /> Linked from · {back.length}
            </h3>
            <div className="space-y-1">
              {back.map((b) => (
                <button
                  key={b.path}
                  onClick={() => onSelect(b.path)}
                  className="block w-full truncate rounded-xl px-3 py-2 text-left text-[13px] text-soft hover:bg-white/[0.05] hover:text-fg"
                >
                  {b.title}
                  <span className="ml-2 text-[11.5px] text-faint">{b.folder}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {outgoing.length > 0 && (
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">
              <ArrowUpRight className="size-3.5" /> Links to · {outgoing.length}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {outgoing.map((l) =>
                l.path ? (
                  <button
                    key={l.path}
                    onClick={() => onSelect(l.path!)}
                    className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[12px] text-soft hover:border-white/20 hover:text-fg"
                  >
                    {notes.find((n) => n.path === l.path)?.title ?? l.raw}
                  </button>
                ) : (
                  <span key={l.raw} className="rounded-full border border-dashed border-white/[0.08] px-2.5 py-1 text-[12px] text-faint" title="Not written yet">
                    {l.raw}
                  </span>
                ),
              )}
            </div>
          </div>
        )}
        <p className="text-[11.5px] text-faint">
          {formatNumber(note.words)} words · edited {format(note.mtime, 'd MMM yyyy')}
        </p>
      </div>
    </motion.aside>
  )
}

/* ------------------------------------------------------------------ */
/*  Search                                                             */
/* ------------------------------------------------------------------ */

function BrainSearch({ onPick }: { onPick: (path: string) => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<BrainHit[]>([])
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      const r = q.trim() ? await searchBrain(q, 7) : []
      if (!cancelled) setHits(r)
    }, 120)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [q])
  return (
    <div className="relative w-full max-w-md">
      <div className="glass-strong flex h-11 items-center gap-2.5 rounded-2xl px-4">
        <Search className="size-4 shrink-0 text-muted" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && hits[0]) {
              onPick(hits[0].path)
              setOpen(false)
            }
          }}
          placeholder="Search your notes…"
          className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint"
        />
      </div>
      {open && hits.length > 0 && (
        <div className="glass-strong absolute inset-x-0 top-12 z-30 max-h-[50vh] overflow-y-auto rounded-2xl p-1.5">
          {hits.map((h) => (
            <button
              key={h.path}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(h.path)
                setOpen(false)
              }}
              className="block w-full rounded-xl px-3 py-2.5 text-left hover:bg-white/[0.06]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[13.5px] font-medium">{h.title}</span>
                <span className="shrink-0 text-[11px] text-faint">{h.folder}</span>
              </div>
              <div className="mt-0.5 line-clamp-2 text-[12px] text-muted">{h.snippet}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  List view (and fallback when 3D isn't available)                   */
/* ------------------------------------------------------------------ */

function NoteList({ notes, colors, onPick }: { notes: BrainNote[]; colors: Map<string, string>; onPick: (path: string) => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, BrainNote[]>()
    for (const n of notes) {
      const g = n.folder ? n.folder.split('/')[0] : 'Root'
      map.set(g, [...(map.get(g) ?? []), n])
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [notes])
  return (
    <div className="h-full overflow-y-auto px-4 pt-24 pb-28 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        {groups.map(([group, list]) => (
          <section key={group}>
            <h3 className="mb-3 flex items-center gap-2 text-[12px] font-semibold tracking-[0.12em] text-muted uppercase">
              <span className="size-2 rounded-full" style={{ background: colors.get(group) ?? OTHER_COLOR }} />
              {group} · {list.length}
            </h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {list
                .sort((a, b) => b.mtime - a.mtime)
                .map((n) => (
                  <button
                    key={n.path}
                    onClick={() => onPick(n.path)}
                    className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3.5 text-left transition hover:border-white/[0.14] hover:bg-white/[0.045]"
                  >
                    <div className="truncate text-[13.5px] font-medium">{n.title}</div>
                    <div className="mt-1 line-clamp-2 text-[12px] text-muted">
                      {n.content
                        .replace(/^---[\s\S]*?---/, '')
                        .replace(/[#*_>[\]`]/g, '')
                        .trim()
                        .slice(0, 140)}
                    </div>
                  </button>
                ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

const LAYOUTS: { id: BrainLayout; label: string; icon: ReactNode }[] = [
  { id: 'brain', label: 'Brain', icon: <Brain /> },
  { id: 'neural', label: 'Neural', icon: <Waypoints /> },
  { id: 'galaxy', label: 'Galaxy', icon: <Galaxy /> },
]

export default function BrainPage() {
  const [params, setParams] = useSearchParams()
  const notes = useLiveQuery(() => db.notes.toArray(), [], [] as BrainNote[])
  const brain = useSettings((s) => s.settings.brain)
  const askLead = useUI((s) => s.askLead)
  const lead = useLead()
  const [layout, setLayout] = useState<BrainLayout>(() => (localStorage.getItem('brain.layout') as BrainLayout) || 'brain')
  const [view, setView] = useState<View>(() => (webglAvailable() ? '3d' : 'list'))
  const [showGhosts, setShowGhosts] = useState(false)
  const [showLabels, setShowLabels] = useState(true)
  const [hovered, setHovered] = useState<string>()
  const [focusGroup, setFocusGroup] = useState<string>()
  const [linking, setLinking] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [question, setQuestion] = useState('')
  const selected = params.get('note') ?? undefined

  const graph = useMemo(() => buildGraph(notes, { includeGhosts: showGhosts }), [notes, showGhosts])
  const colors = useMemo(() => groupColors(graph.groups), [graph.groups])
  const note = selected ? notes.find((n) => n.path === selected) : undefined
  const hoveredNode = hovered ? graph.nodes.find((n) => n.id === hovered) : undefined
  const legend = useMemo(() => {
    const counts = new Map<string, number>()
    for (const n of graph.nodes) if (!n.ghost) counts.set(n.group, (counts.get(n.group) ?? 0) + 1)
    const named = graph.groups.filter((g) => g !== 'Unresolved' && colors.get(g) !== OTHER_COLOR)
    const other = graph.groups.filter((g) => g !== 'Unresolved' && colors.get(g) === OTHER_COLOR).reduce((s, g) => s + (counts.get(g) ?? 0), 0)
    return { named: named.map((g) => ({ group: g, count: counts.get(g) ?? 0, color: colors.get(g)! })), other }
  }, [graph, colors])

  useEffect(() => {
    try {
      localStorage.setItem('brain.layout', layout)
    } catch {
      // Remembering the layout is a nicety.
    }
  }, [layout])

  const select = (path?: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (path) next.set('note', path)
        else next.delete('note')
        return next
      },
      { replace: true },
    )

  const sync = async () => {
    setSyncing(true)
    try {
      const n = await resyncVaultFolder()
      toast.success('Brain refreshed', `${formatNumber(n)} notes`)
    } catch (err) {
      toast.error('Couldn’t refresh your vault', errorMessage(err))
    } finally {
      setSyncing(false)
    }
  }

  const fallback = <NoteList notes={notes} colors={colors} onPick={select} />

  return (
    <div className="relative h-full overflow-hidden bg-[#04050a]">
      {view === '3d' && notes.length > 0 ? (
        <SceneBoundary fallback={fallback}>
          <div className="absolute inset-0">
            <BrainScene
              graph={graph}
              layout={layout}
              colors={colors}
              selectedId={selected}
              focusGroup={focusGroup}
              showLabels={showLabels}
              onHover={setHovered}
              onSelect={select}
            />
          </div>
        </SceneBoundary>
      ) : notes.length > 0 ? (
        fallback
      ) : null}

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-3 p-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="glass-strong pointer-events-auto flex items-center gap-4 rounded-3xl px-4 py-3">
          <div className="grid size-10 place-items-center rounded-2xl bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] text-white shadow-[0_8px_30px_-8px_var(--accent)]">
            <Brain className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="font-display text-[17px] leading-tight font-semibold tracking-tight">
              {brain.mode === 'none' ? (notes.some((n) => n.demo) ? 'Sample brain' : 'Your brain') : (brain.name ?? 'Your brain')}
            </div>
            <div className="text-[12px] text-muted">
              {formatNumber(notes.length)} notes · {formatNumber(graph.links.length)} links · {legend.named.length + (legend.other ? 1 : 0)} folders
            </div>
          </div>
          <div className="flex items-center gap-1">
            {brain.mode === 'fs' && (
              <Button size="sm" variant="ghost" icon={<RefreshCw className={cn(syncing && 'animate-spin')} />} onClick={() => void sync()} aria-label="Refresh from your vault">
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            )}
            <Button size="sm" variant={brain.mode === 'none' ? 'primary' : 'secondary'} icon={brain.mode === 'none' ? <Link2 /> : <Upload />} onClick={() => setLinking(true)}>
              {brain.mode === 'none' ? 'Link your vault' : 'Change'}
            </Button>
          </div>
        </div>

        <div className="pointer-events-auto flex flex-1 justify-center lg:px-4">
          <BrainSearch onPick={select} />
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          {view === '3d' && <Tabs size="sm" value={layout} onChange={setLayout} items={LAYOUTS} className="glass-strong" />}
          <div className="glass-strong flex rounded-2xl p-1">
            <button
              onClick={() => setView('3d')}
              className={cn('grid size-7 place-items-center rounded-xl transition', view === '3d' ? 'bg-white/[0.1] text-fg' : 'text-muted hover:text-fg')}
              aria-label="3D view"
            >
              <Box className="size-4" />
            </button>
            <button
              onClick={() => setView('list')}
              className={cn('grid size-7 place-items-center rounded-xl transition', view === 'list' ? 'bg-white/[0.1] text-fg' : 'text-muted hover:text-fg')}
              aria-label="List view"
            >
              <List className="size-4" />
            </button>
          </div>
          <Menu
            trigger={(open) => (
              <button onClick={open} className="glass-strong grid size-9 place-items-center rounded-2xl text-muted hover:text-fg" aria-label="View options">
                <SlidersHorizontal className="size-4" />
              </button>
            )}
            items={[
              { label: showLabels ? 'Hide labels' : 'Show labels', icon: <Eye />, onSelect: () => setShowLabels((v) => !v) },
              { label: showGhosts ? 'Hide unwritten notes' : 'Show unwritten notes', icon: <CircleDot />, onSelect: () => setShowGhosts((v) => !v) },
            ]}
          />
        </div>
      </div>

      {/* Hover card */}
      <AnimatePresence>
        {hoveredNode && view === '3d' && hoveredNode.id !== selected && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass-strong pointer-events-none absolute top-24 left-1/2 z-10 -translate-x-1/2 rounded-2xl px-4 py-2 text-center lg:top-20"
          >
            <div className="text-[13.5px] font-semibold">{hoveredNode.title}</div>
            <div className="text-[11.5px] text-muted">
              {hoveredNode.ghost ? 'Not written yet' : `${hoveredNode.folder || 'Vault root'} · ${hoveredNode.degree} connection${hoveredNode.degree === 1 ? '' : 's'}`}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Legend */}
      {view === '3d' && legend.named.length > 0 && (
        <div className="glass-strong absolute bottom-24 left-4 z-10 hidden max-w-[240px] rounded-3xl p-3 md:block">
          <div className="mb-1.5 px-2 text-[10.5px] font-semibold tracking-[0.14em] text-muted uppercase">Folders</div>
          {legend.named.map((l) => (
            <button
              key={l.group}
              onClick={() => setFocusGroup((g) => (g === l.group ? undefined : l.group))}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-[12.5px] transition',
                focusGroup === l.group ? 'bg-white/[0.08] text-fg' : focusGroup ? 'text-faint hover:text-soft' : 'text-soft hover:bg-white/[0.04]',
              )}
            >
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: l.color, boxShadow: `0 0 10px ${l.color}` }} />
              <span className="min-w-0 flex-1 truncate">{l.group}</span>
              <span className="text-[11px] text-faint">{l.count}</span>
            </button>
          ))}
          {legend.other > 0 && (
            <div className="flex items-center gap-2.5 px-2 py-1.5 text-[12.5px] text-muted">
              <span className="size-2.5 rounded-full" style={{ background: OTHER_COLOR }} />
              <span className="flex-1">Other folders</span>
              <span className="text-[11px] text-faint">{legend.other}</span>
            </div>
          )}
          {showGhosts && (
            <div className="flex items-center gap-2.5 px-2 py-1.5 text-[12.5px] text-muted">
              <span className="size-2.5 rounded-full" style={{ background: GHOST_COLOR }} />
              <span className="flex-1">Unwritten notes</span>
            </div>
          )}
        </div>
      )}

      {/* Ask your brain */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!question.trim()) return
          askLead(`Search my brain (my Obsidian notes) and answer this, citing the notes you used: ${question.trim()}`)
          setQuestion('')
        }}
        className="glass-strong absolute bottom-5 left-1/2 z-10 flex w-[min(620px,calc(100%-2rem))] -translate-x-1/2 items-center gap-3 rounded-full py-1.5 pr-1.5 pl-5"
      >
        <MessageSquareText className="size-4 shrink-0 text-[var(--accent)]" />
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={`Ask your brain anything… ${lead ? `${lead.name} will look it up` : ''}`}
          className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint"
        />
        <button
          type="submit"
          disabled={!question.trim()}
          className="grid size-9 place-items-center rounded-full bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] text-white transition disabled:opacity-40"
          aria-label="Ask"
        >
          <Send className="size-4" />
        </button>
      </form>

      {/* Empty */}
      {notes.length === 0 && (
        <div className="absolute inset-0 grid place-items-center px-4">
          <div className="max-w-xl text-center">
            <div className="mx-auto grid size-16 place-items-center rounded-3xl bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] text-white shadow-[0_18px_50px_-12px_var(--accent)]">
              <Brain className="size-8" />
            </div>
            <h1 className="mt-6 font-display text-4xl font-semibold tracking-tight">Bring your brain to life</h1>
            <p className="mt-3 text-[15px] text-soft">Link your Obsidian vault and every note becomes a glowing, connected map your whole team can think with.</p>
            <div className="mt-8 text-left">
              <LinkVaultOptions />
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>{note && <NotePanel key="panel" note={note} notes={notes} graph={graph} onSelect={select} onClose={() => select(undefined)} />}</AnimatePresence>

      <Modal
        open={linking}
        onClose={() => setLinking(false)}
        size="lg"
        icon={<Link2 />}
        title="Link your Obsidian brain"
        subtitle="Everything stays on this computer. Agents never change your existing notes."
      >
        <LinkVaultOptions onLinked={() => setLinking(false)} />
        {brain.mode !== 'none' && (
          <p className="mt-5 text-center text-[12.5px] text-muted">
            Currently linked: <span className="text-soft">{brain.name}</span>
            {brain.lastSync ? ` · last read ${format(brain.lastSync, 'd MMM, HH:mm')}` : ''}
          </p>
        )}
      </Modal>
    </div>
  )
}
