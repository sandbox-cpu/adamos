import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, Check, ListChecks, MessagesSquare, MoreHorizontal, Pencil, Play, Plus, Trash2, UsersRound, Wand2 } from 'lucide-react'
import { db } from '../../lib/db'
import { continueGroup, deleteConversation, MAX_GROUP, renameConversation, sendGroup, startConversation, suggestParticipants, summarizeGroup } from '../../lib/agents/chat'
import type { Agent, Conversation } from '../../lib/types'
import { cn, hexToRgba, timeAgo, truncate } from '../../lib/utils'
import { useLive } from '../../stores/live'
import { useAgents, useConversations, useLead, useMessages, useProjects, useRoles } from '../../hooks/data'
import { AgentAvatar, AvatarStack } from '../../components/agents/AgentAvatar'
import { ChatView } from '../../components/chat/ChatView'
import { Button } from '../../components/ui/Button'
import { Menu } from '../../components/ui/bits'
import { Select, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { toast } from '../../components/ui/Toast'

/* ------------------------------------------------------------------ */
/*  Picking who joins                                                  */
/* ------------------------------------------------------------------ */

function ParticipantPicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const agents = useAgents()
  const roles = useRoles()
  const available = agents.filter((a) => a.status === 'active')
  const toggle = (a: Agent) => {
    if (selected.includes(a.id)) onChange(selected.filter((x) => x !== a.id))
    else if (selected.length < MAX_GROUP) onChange([...selected, a.id])
    else toast.info(`Up to ${MAX_GROUP} agents per huddle`, 'Take someone out to make room.')
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {available.map((a) => {
        const on = selected.includes(a.id)
        const full = !on && selected.length >= MAX_GROUP
        return (
          <button
            key={a.id}
            onClick={() => toggle(a)}
            className={cn(
              'relative flex items-center gap-3 rounded-2xl border p-3 text-left transition',
              on ? 'border-transparent bg-white/[0.07]' : 'border-white/[0.07] bg-white/[0.025] hover:border-white/[0.15]',
              full && 'opacity-45',
            )}
            style={on ? { boxShadow: `inset 0 0 0 1.5px ${a.color}, 0 10px 30px -18px ${a.color}` } : undefined}
          >
            <AgentAvatar agent={a} size="sm" active={on} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-medium">{a.name}</div>
              <div className="truncate text-[11.5px] text-muted">{a.title || roles.find((r) => r.id === a.roleId)?.name}</div>
            </div>
            {on && (
              <span className="grid size-5 shrink-0 place-items-center rounded-full text-ink-950" style={{ background: a.color }}>
                <Check className="size-3" strokeWidth={3} />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  New huddle                                                         */
/* ------------------------------------------------------------------ */

function NewHuddle({ onBack }: { onBack?: () => void }) {
  const navigate = useNavigate()
  const agents = useAgents()
  const roles = useRoles()
  const lead = useLead()
  const projects = useProjects()
  const [topic, setTopic] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [projectId, setProjectId] = useState('')
  const [starting, setStarting] = useState(false)

  const ideas = useMemo(() => {
    const live = projects.filter((p) => p.status === 'active' || p.status === 'pitch').slice(0, 2)
    return [
      ...live.map((p) => `What’s the boldest way to get ${p.client && !/internal/i.test(p.client) ? p.client : p.name} national coverage this quarter?`),
      'A negative review about a client is going viral. How do we respond in the next hour?',
      'Brainstorm three stunts that would get us talked about',
      'What should our own LinkedIn strategy be for the next six months?',
    ].slice(0, 4)
  }, [projects])

  const pickForMe = () => {
    const picks = suggestParticipants(topic || 'campaign strategy media', agents, roles, 3)
    setSelected(picks.map((a) => a.id))
  }

  const start = async () => {
    if (!topic.trim() || selected.length === 0) return
    setStarting(true)
    try {
      const conv = await startConversation({ kind: 'group', agentIds: selected, topic: topic.trim(), title: truncate(topic.trim(), 70), projectId: projectId || undefined })
      navigate(`/huddle/${conv.id}`)
      void sendGroup(conv.id, topic.trim())
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 pt-8 pb-16 sm:px-8">
        {onBack && (
          <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-[13px] text-muted hover:text-fg md:hidden">
            <ArrowLeft className="size-4" /> All huddles
          </button>
        )}
        <div className="mb-8">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">Huddle</div>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">Get the team round the table</h1>
          <p className="mt-2 text-[15px] text-soft">
            Put a question to up to four specialists and watch them work it out together. Wrap up whenever you like and the agreed actions go straight onto your board.
          </p>
        </div>

        <div className="glass space-y-7 rounded-3xl p-6">
          <div>
            <label className="mb-2 block text-[13px] font-medium text-soft">What should they discuss?</label>
            <Textarea
              autoFocus
              rows={3}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. How do we turn Northwind’s autumn launch into a national story?"
              className="text-[15px]"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {ideas.map((i) => (
                <button
                  key={i}
                  onClick={() => setTopic(i)}
                  className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-left text-[12.5px] text-soft transition hover:border-white/[0.16] hover:text-fg"
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <label className="text-[13px] font-medium text-soft">
                Who’s joining?{' '}
                <span className="text-muted">
                  {selected.length} of {MAX_GROUP}
                </span>
              </label>
              <Button size="sm" variant="secondary" icon={<Wand2 />} onClick={pickForMe}>
                {lead ? `Let ${lead.name} pick` : 'Pick for me'}
              </Button>
            </div>
            <ParticipantPicker selected={selected} onChange={setSelected} />
          </div>

          {projects.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <div className="text-[13px] font-medium text-soft">Link to a project</div>
                <div className="text-[12px] text-muted">Actions from the huddle land on that project’s board.</div>
              </div>
              <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="sm:w-64">
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.client ? `${p.client} · ${p.name}` : p.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-5">
            <AvatarStack agents={agents.filter((a) => selected.includes(a.id))} size="sm" />
            <Button variant="primary" size="lg" icon={<Play />} loading={starting} disabled={!topic.trim() || selected.length === 0} onClick={() => void start()}>
              Start the huddle
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Huddle room                                                        */
/* ------------------------------------------------------------------ */

function RoundTable({ conversation, participants }: { conversation: Conversation; participants: Agent[] }) {
  const messages = useMessages(conversation.id)
  const speaking = [...messages].reverse().find((m) => m.status === 'streaming')?.agentId
  const lastSpoke = (id: string) => [...messages].reverse().find((m) => m.agentId === id && m.status === 'done')
  return (
    <div className="flex items-end justify-center gap-4 sm:gap-7">
      {participants.map((a) => {
        const on = a.id === speaking
        const spoke = lastSpoke(a.id)
        return (
          <motion.div key={a.id} layout className="flex flex-col items-center gap-1.5" animate={{ opacity: speaking && !on ? 0.55 : 1, scale: on ? 1.08 : 1 }}>
            <div className="relative">
              {on && (
                <motion.div
                  className="absolute -inset-4 rounded-full blur-xl"
                  style={{ background: hexToRgba(a.color, 0.55) }}
                  animate={{ opacity: [0.4, 0.9, 0.4] }}
                  transition={{ duration: 1.6, repeat: Infinity }}
                />
              )}
              <AgentAvatar agent={a} size="md" speaking={on} />
            </div>
            <div className="text-center">
              <div className="text-[12px] font-medium">{a.name}</div>
              <div className="h-4 text-[10.5px] text-muted">
                {on ? <span className="text-[color-mix(in_oklab,var(--accent)_70%,white)]">speaking…</span> : spoke ? timeAgo(spoke.createdAt) : 'listening'}
              </div>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

function HuddleRoom({ conversation, onBack }: { conversation: Conversation; onBack: () => void }) {
  const navigate = useNavigate()
  const agents = useAgents()
  const running = useLive((s) => !!s.running[conversation.id])
  const messages = useMessages(conversation.id)
  const [editing, setEditing] = useState(false)
  const [people, setPeople] = useState<string[]>(conversation.agentIds)
  const participants = conversation.agentIds.map((id) => agents.find((a) => a.id === id)).filter((a): a is Agent => !!a)
  const hasReplies = messages.some((m) => m.role === 'agent' && m.status === 'done')
  const summarised = messages.some((m) => !!m.summary)

  const remove = async () => {
    if (!window.confirm('Delete this huddle and everything said in it?')) return
    await deleteConversation(conversation.id)
    navigate('/huddle', { replace: true })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-white/[0.06] px-4 pt-3 pb-4 sm:px-6">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/[0.07] hover:text-fg md:hidden" aria-label="All huddles">
            <ArrowLeft className="size-4" />
          </button>
          <MessagesSquare className="size-4 shrink-0 text-muted" />
          <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{conversation.title}</h2>
          <Menu
            trigger={(open) => (
              <button onClick={open} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/[0.07] hover:text-fg" aria-label="More">
                <MoreHorizontal className="size-4" />
              </button>
            )}
            items={[
              {
                label: 'Change who’s in',
                icon: <UsersRound />,
                onSelect: () => {
                  setPeople(conversation.agentIds)
                  setEditing(true)
                },
              },
              {
                label: 'Rename',
                icon: <Pencil />,
                onSelect: async () => {
                  const t = window.prompt('Name this huddle', conversation.title)
                  if (t) await renameConversation(conversation.id, t)
                },
              },
              'divider',
              { label: 'Delete huddle', icon: <Trash2 />, danger: true, onSelect: () => void remove() },
            ]}
          />
        </div>
        <div className="mt-4">
          <RoundTable conversation={conversation} participants={participants} />
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <ChatView
          conversation={conversation}
          footer={
            hasReplies && (
              <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
                <Button size="sm" variant="secondary" icon={<MessagesSquare />} disabled={running} onClick={() => void continueGroup(conversation.id)}>
                  Keep discussing
                </Button>
                <Button size="sm" variant={summarised ? 'secondary' : 'primary'} icon={<ListChecks />} disabled={running} onClick={() => void summarizeGroup(conversation.id)}>
                  {summarised ? 'Summarise again' : 'Wrap up with actions'}
                </Button>
              </div>
            )
          }
        />
      </div>
      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        size="lg"
        icon={<UsersRound />}
        title="Who’s in this huddle?"
        subtitle={`Up to ${MAX_GROUP} agents. Newcomers read the conversation so far.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={people.length === 0}
              onClick={async () => {
                await db.conversations.update(conversation.id, { agentIds: people })
                setEditing(false)
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <ParticipantPicker selected={people} onChange={setPeople} />
      </Modal>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

function HuddleList({ activeId, onNew }: { activeId?: string; onNew: () => void }) {
  const navigate = useNavigate()
  const huddles = useConversations('group')
  const agents = useAgents()
  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-5 pb-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Huddle</h1>
        <p className="text-[12.5px] text-muted">Group chat with up to {MAX_GROUP} agents</p>
        <Button variant="primary" icon={<Plus />} onClick={onNew} className="mt-4 w-full">
          New huddle
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-6">
        <AnimatePresence initial={false}>
          {huddles.map((h) => {
            const people = h.agentIds.map((id) => agents.find((a) => a.id === id)).filter((a): a is Agent => !!a)
            return (
              <motion.button
                key={h.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => navigate(`/huddle/${h.id}`)}
                className={cn('flex w-full flex-col gap-2 rounded-2xl px-3 py-3 text-left transition', h.id === activeId ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]')}
              >
                <div className="flex items-center justify-between gap-2">
                  <AvatarStack agents={people} size="xs" max={4} />
                  <span className="text-[11px] text-faint">{timeAgo(h.updatedAt)}</span>
                </div>
                <div className="line-clamp-2 text-[13.5px] font-medium text-fg">{h.title}</div>
                {h.preview && <div className="line-clamp-1 text-[12px] text-muted">{h.preview}</div>}
              </motion.button>
            )
          })}
        </AnimatePresence>
        {huddles.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-muted">No huddles yet. Start one and your team will talk it through.</p>}
      </div>
    </div>
  )
}

export default function HuddlePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const huddles = useConversations('group')
  const conversation = huddles.find((h) => h.id === id)
  const [mobileList, setMobileList] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    void db.conversations.get(id).then((c) => {
      if (!cancelled && !c) navigate('/huddle', { replace: true })
    })
    return () => {
      cancelled = true
    }
  }, [id, navigate])

  useEffect(() => setMobileList(false), [id])

  return (
    <div className="flex h-full min-h-0">
      <aside className={cn('w-full shrink-0 border-r border-white/[0.06] bg-black/10 md:block md:w-[300px] lg:w-[320px]', mobileList ? 'block' : 'hidden')}>
        <HuddleList
          activeId={id}
          onNew={() => {
            setMobileList(false)
            navigate('/huddle')
          }}
        />
      </aside>
      <section className={cn('min-w-0 flex-1', mobileList ? 'hidden md:block' : 'block')}>
        {id && conversation ? (
          <HuddleRoom key={conversation.id} conversation={conversation} onBack={() => setMobileList(true)} />
        ) : (
          <NewHuddle onBack={() => setMobileList(true)} />
        )}
      </section>
    </div>
  )
}
