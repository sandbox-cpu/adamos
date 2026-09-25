import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, History, MoreHorizontal, Pencil, Plus, Search, SquarePen, Trash2, UserRound } from 'lucide-react'
import { db } from '../../lib/db'
import { deleteConversation, getLeadConversation, newThread, openAgentChat, renameConversation, sendDirect } from '../../lib/agents/chat'
import { getProvider, modelLabel } from '../../lib/llm/providers'
import type { Agent, Conversation, Role } from '../../lib/types'
import { cn, errorMessage, timeAgo } from '../../lib/utils'
import { useLive } from '../../stores/live'
import { useSettings } from '../../stores/settings'
import { useAgents, useConversations, useProfiles, useRoles } from '../../hooks/data'
import { AgentAvatar } from '../../components/agents/AgentAvatar'
import { ChatView } from '../../components/chat/ChatView'
import { Menu } from '../../components/ui/bits'
import { Input } from '../../components/ui/Field'
import { toast } from '../../components/ui/Toast'

/* ------------------------------------------------------------------ */
/*  Agent list                                                         */
/* ------------------------------------------------------------------ */

function AgentRow({ agent, role, latest, active, onClick }: { agent: Agent; role?: Role; latest?: Conversation; active: boolean; onClick: () => void }) {
  const running = useLive((s) => (latest ? !!s.running[latest.id] : false))
  return (
    <button
      onClick={onClick}
      className={cn('group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition', active ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]')}
    >
      <AgentAvatar agent={agent} size="md" active={running} status={running ? 'working' : agent.status === 'active' ? 'online' : 'bench'} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[14px] font-medium text-fg">{agent.name}</span>
          {latest?.preview && <span className="shrink-0 text-[11px] text-faint">{timeAgo(latest.updatedAt)}</span>}
        </div>
        <div className="truncate text-[12.5px] text-muted">{running ? <span className="text-warn">Typing…</span> : (latest?.preview ?? agent.title ?? role?.name)}</div>
      </div>
    </button>
  )
}

function AgentList({ activeAgentId, onPick }: { activeAgentId?: string; onPick: (a: Agent) => void }) {
  const agents = useAgents()
  const roles = useRoles()
  const conversations = useConversations()
  const [query, setQuery] = useState('')
  const [showBench, setShowBench] = useState(false)

  const latestFor = (a: Agent) => conversations.find((c) => (c.kind === 'direct' || c.kind === 'lead') && c.agentIds[0] === a.id)
  const q = query.trim().toLowerCase()
  const matches = (a: Agent) => !q || `${a.name} ${a.title ?? ''} ${roles.find((r) => r.id === a.roleId)?.name ?? ''}`.toLowerCase().includes(q)
  const lead = agents.find((a) => a.isLead)
  const onDuty = agents.filter((a) => a.status === 'active' && !a.isLead && matches(a)).sort((x, y) => (latestFor(y)?.updatedAt ?? 0) - (latestFor(x)?.updatedAt ?? 0))
  const bench = agents.filter((a) => a.status === 'bench' && matches(a))

  const row = (a: Agent) => (
    <AgentRow key={a.id} agent={a} role={roles.find((r) => r.id === a.roleId)} latest={latestFor(a)} active={a.id === activeAgentId} onClick={() => onPick(a)} />
  )

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-5 pb-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Direct</h1>
        <p className="text-[12.5px] text-muted">One-to-one with any agent</p>
        <Input icon={<Search />} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find an agent…" className="mt-3 h-9" />
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2 pb-6">
        {lead && matches(lead) && (
          <div>
            <div className="px-3 pb-1.5 text-[10.5px] font-semibold tracking-[0.16em] text-faint uppercase">Your lead</div>
            {row(lead)}
          </div>
        )}
        {onDuty.length > 0 && (
          <div>
            <div className="px-3 pb-1.5 text-[10.5px] font-semibold tracking-[0.16em] text-faint uppercase">On duty</div>
            {onDuty.map(row)}
          </div>
        )}
        {bench.length > 0 && (
          <div>
            <button
              onClick={() => setShowBench((v) => !v)}
              className="flex w-full items-center justify-between px-3 pb-1.5 text-[10.5px] font-semibold tracking-[0.16em] text-faint uppercase hover:text-muted"
            >
              On the bench · {bench.length}
              <span className="normal-case tracking-normal">{showBench || q ? 'Hide' : 'Show'}</span>
            </button>
            {(showBench || q) && bench.map(row)}
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Chat pane                                                          */
/* ------------------------------------------------------------------ */

function EmptyChat({ agent, role, onPick }: { agent: Agent; role?: Role; onPick: (text: string) => void }) {
  const firstName = useSettings((s) => s.settings.userName.trim().split(/\s+/)[0])
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-2 pt-8 pb-10 text-center md:pt-14">
      <div className="relative">
        <div className="absolute -inset-8 rounded-full opacity-40 blur-3xl" style={{ background: agent.color }} />
        <AgentAvatar agent={agent} size="xl" active />
      </div>
      <h2 className="mt-6 font-display text-3xl font-semibold tracking-tight">
        {firstName ? `Hi ${firstName}, ` : 'Hi, '}I’m {agent.name}.
      </h2>
      <p className="mt-2 max-w-md text-[14.5px] leading-relaxed text-soft">{role?.description}</p>
      {role && role.starters.length > 0 && (
        <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
          {role.starters.map((s) => (
            <button
              key={s}
              onClick={() => onPick(s)}
              className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 text-left text-[13.5px] text-soft transition hover:-translate-y-0.5 hover:border-white/[0.15] hover:bg-white/[0.06] hover:text-fg"
            >
              {s.trim().replace(/:$/, '…')}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ChatPane({ conversation, agent, role, onBack }: { conversation: Conversation; agent: Agent; role?: Role; onBack: () => void }) {
  const navigate = useNavigate()
  const conversations = useConversations()
  const profiles = useProfiles()
  const defaultId = useSettings((s) => s.settings.defaultProfileId)
  const running = useLive((s) => !!s.running[conversation.id])
  const [draft, setDraft] = useState('')
  const threads = conversations.filter((c) => (c.kind === 'direct' || c.kind === 'lead') && c.agentIds[0] === agent.id)
  const profile = profiles.find((p) => p.id === agent.profileId) ?? profiles.find((p) => p.id === defaultId) ?? profiles[0]

  const startNew = async () => {
    const c = await newThread(agent.id)
    navigate(`/comms/${c.id}`)
  }

  const remove = async () => {
    if (!window.confirm('Delete this chat? This can’t be undone.')) return
    await deleteConversation(conversation.id)
    const next = threads.find((t) => t.id !== conversation.id)
    navigate(next ? `/comms/${next.id}` : `/comms?agent=${agent.id}`, { replace: true })
  }

  const rename = async () => {
    const title = window.prompt('Name this chat', conversation.title)
    if (title) await renameConversation(conversation.id, title)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3 sm:px-6">
        <button onClick={onBack} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/[0.07] hover:text-fg md:hidden" aria-label="All agents">
          <ArrowLeft className="size-4" />
        </button>
        <AgentAvatar agent={agent} size="md" active={running} status={running ? 'working' : 'online'} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{agent.name}</span>
            <span className="hidden truncate text-[12.5px] text-muted sm:inline">· {agent.title || role?.name}</span>
          </div>
          <div className="truncate text-[12px] text-muted">
            {running ? (
              <span className="text-warn">Working on it…</span>
            ) : profile ? (
              `Thinks with ${getProvider(profile.provider).name} · ${modelLabel(profile.provider, profile.model)}`
            ) : (
              'Demo mode · sample answers'
            )}
            {threads.length > 1 && conversation.kind === 'direct' && conversation.title !== 'New chat' ? ` · ${conversation.title}` : ''}
          </div>
        </div>
        <button
          onClick={() => void startNew()}
          className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-soft transition hover:bg-white/[0.07] hover:text-fg"
          title="Start a new chat"
        >
          <SquarePen className="size-4" />
          <span className="hidden sm:inline">New chat</span>
        </button>
        {threads.length > 1 && (
          <Menu
            trigger={(open) => (
              <button
                onClick={open}
                className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-soft transition hover:bg-white/[0.07] hover:text-fg"
                title="Earlier chats"
              >
                <History className="size-4" />
                <span className="hidden sm:inline">{threads.length}</span>
              </button>
            )}
            items={threads.slice(0, 12).map((t) => ({
              label: (
                <span className="flex min-w-0 flex-col">
                  <span className={cn('truncate', t.id === conversation.id && 'text-[var(--accent)]')}>{t.kind === 'lead' ? 'Main chat' : t.title}</span>
                  <span className="text-[11px] text-faint">{timeAgo(t.updatedAt)}</span>
                </span>
              ),
              onSelect: () => navigate(`/comms/${t.id}`),
            }))}
          />
        )}
        <Menu
          trigger={(open) => (
            <button onClick={open} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/[0.07] hover:text-fg" aria-label="More">
              <MoreHorizontal className="size-4" />
            </button>
          )}
          items={[
            { label: `${agent.name}’s profile`, icon: <UserRound />, onSelect: () => navigate(`/agents/${agent.id}`) },
            { label: 'Rename chat', icon: <Pencil />, onSelect: () => void rename(), disabled: conversation.kind === 'lead' },
            { label: 'New chat', icon: <Plus />, onSelect: () => void startNew() },
            'divider',
            { label: 'Delete chat', icon: <Trash2 />, danger: true, onSelect: () => void remove() },
          ]}
        />
      </header>
      <div className="min-h-0 flex-1">
        <ChatView
          key={conversation.id}
          conversation={conversation}
          autoFocus
          draft={draft}
          empty={
            <EmptyChat
              agent={agent}
              role={role}
              onPick={(s) => {
                if (/[:\s]$/.test(s)) setDraft(s)
                else void sendDirect(conversation.id, s)
              }}
            />
          }
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function CommsPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const agents = useAgents()
  const roles = useRoles()
  const conversations = useConversations()
  const [missing, setMissing] = useState(false)
  const agentParam = params.get('agent')
  const listOnly = params.has('list')

  // /comms and /comms?agent=… resolve to a real conversation (except the mobile list view).
  useEffect(() => {
    if (id || listOnly) return
    let cancelled = false
    ;(async () => {
      try {
        const conv = agentParam ? await openAgentChat(agentParam) : await getLeadConversation()
        if (!cancelled) navigate(`/comms/${conv.id}`, { replace: true })
      } catch (err) {
        if (!cancelled) toast.error('Couldn’t open that chat', errorMessage(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, agentParam, listOnly, navigate])

  // A deleted or unknown chat falls back to the lead.
  useEffect(() => {
    if (!id) return
    let cancelled = false
    void db.conversations.get(id).then((c) => {
      if (cancelled) return
      if (!c) {
        setMissing(true)
        navigate('/comms', { replace: true })
      } else setMissing(false)
    })
    return () => {
      cancelled = true
    }
  }, [id, navigate])

  const conversation = useMemo(() => conversations.find((c) => c.id === id), [conversations, id])
  const agent = conversation ? agents.find((a) => a.id === conversation.agentIds[0]) : undefined
  const role = agent ? roles.find((r) => r.id === agent.roleId) : undefined
  const showList = !id || missing

  return (
    <div className="flex h-full min-h-0">
      <aside className={cn('w-full shrink-0 border-r border-white/[0.06] bg-black/10 md:block md:w-[300px] lg:w-[320px]', showList ? 'block' : 'hidden')}>
        <AgentList
          activeAgentId={agent?.id}
          onPick={async (a) => {
            const c = await openAgentChat(a.id)
            navigate(`/comms/${c.id}`)
          }}
        />
      </aside>
      <section className={cn('min-w-0 flex-1', showList ? 'hidden md:block' : 'block')}>
        {conversation && agent ? (
          <ChatPane conversation={conversation} agent={agent} role={role} onBack={() => navigate('/comms?list=1')} />
        ) : (
          <div className="grid h-full place-items-center text-sm text-muted">Pick someone to talk to.</div>
        )}
      </section>
    </div>
  )
}
