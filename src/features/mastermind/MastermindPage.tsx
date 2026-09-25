import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, BrainCircuit, Check, ChevronDown, CircleStop, Lightbulb, RotateCcw, Sparkles, Swords, Trash2, TriangleAlert, Wand2 } from 'lucide-react'
import { createMastermind, deleteMastermind, liveKey, restartMastermind, runMastermind, stopMastermind } from '../../lib/agents/mastermind'
import { suggestParticipants } from '../../lib/agents/chat'
import type { Agent, Contribution, MastermindSession } from '../../lib/types'
import { cn, errorMessage, timeAgo } from '../../lib/utils'
import { useLive } from '../../stores/live'
import { useAgents, useLead, useMastermind, useMasterminds, useProjects, useRoles } from '../../hooks/data'
import { AgentAvatar, AvatarStack } from '../../components/agents/AgentAvatar'
import { PageHeader } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Badge, Tabs } from '../../components/ui/bits'
import { Select, Textarea } from '../../components/ui/Field'
import { Markdown } from '../../components/ui/Markdown'
import { toast } from '../../components/ui/Toast'
import { PhaseStepper, RoundTable } from './RoundTable'
import { PlanView } from './PlanView'

const MAX_SEATS = 6

const DEPTHS: { id: MastermindSession['depth']; name: string; time: string; body: string }[] = [
  { id: 'quick', name: 'Quick', time: 'About a minute', body: 'Everyone gives their view, then your lead writes the plan.' },
  { id: 'standard', name: 'Standard', time: 'A few minutes', body: 'Adds a round of debate so ideas get challenged and improved.' },
  { id: 'deep', name: 'Deep', time: 'Five minutes or so', body: 'Debate plus live web research and deeper thinking.' },
]

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

function Setup() {
  const navigate = useNavigate()
  const agents = useAgents()
  const roles = useRoles()
  const lead = useLead()
  const projects = useProjects()
  const [objective, setObjective] = useState('')
  const [context, setContext] = useState('')
  const [showContext, setShowContext] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [depth, setDepth] = useState<MastermindSession['depth']>('standard')
  const [seats, setSeats] = useState<string[]>([])
  const [starting, setStarting] = useState(false)
  const pool = agents.filter((a) => a.status === 'active' && !a.isLead)

  const ideas = useMemo(() => {
    const live = projects.filter((p) => p.status !== 'done').slice(0, 2)
    return [
      ...live.map((p) => `Make ${p.name}${p.client && !/internal/i.test(p.client) ? ` for ${p.client}` : ''} a standout success`),
      'Win a new retail client worth £250k a year within six months',
      'Raise our agency’s profile so inbound enquiries double this year',
    ].slice(0, 4)
  }, [projects])

  const toggle = (a: Agent) => {
    if (seats.includes(a.id)) setSeats(seats.filter((x) => x !== a.id))
    else if (seats.length < MAX_SEATS) setSeats([...seats, a.id])
    else toast.info(`Up to ${MAX_SEATS} specialists`, 'Take someone out to make room.')
  }

  const start = async () => {
    if (!objective.trim() || !seats.length) return
    setStarting(true)
    try {
      const project = projects.find((p) => p.id === projectId)
      const s = await createMastermind({
        objective,
        context: [context, project ? `Linked project: ${project.name}` : ''].filter(Boolean).join('\n'),
        projectId: projectId || undefined,
        participantIds: seats,
        depth,
      })
      void runMastermind(s.id)
      navigate(`/mastermind/${s.id}`)
    } catch (err) {
      toast.error('Couldn’t start the mastermind', errorMessage(err))
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="glass space-y-7 rounded-[28px] p-6 md:p-7">
      <div>
        <label className="mb-2 block text-[13px] font-medium text-soft">What do you want a plan for?</label>
        <Textarea
          autoFocus
          rows={3}
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="e.g. Launch Northwind’s Autumn Blend with national coverage and 2,000 pre-orders"
          className="text-[15px]"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {ideas.map((i) => (
            <button
              key={i}
              onClick={() => setObjective(i)}
              className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-left text-[12.5px] text-soft transition hover:border-white/[0.16] hover:text-fg"
            >
              {i}
            </button>
          ))}
        </div>
        <button onClick={() => setShowContext((v) => !v)} className="mt-4 flex items-center gap-1 text-[13px] text-muted hover:text-fg">
          <ChevronDown className={cn('size-4 transition', showContext && 'rotate-180')} /> Add background, budget or constraints
        </button>
        {showContext && (
          <Textarea
            rows={3}
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="e.g. Budget £40k. Launch date 14 October. The client hates stunts that feel gimmicky."
            className="mt-2"
          />
        )}
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[13px] font-medium text-soft">
            Who’s at the table?{' '}
            <span className="text-muted">
              {seats.length} of {MAX_SEATS}
            </span>
            {lead && <span className="ml-2 text-[12px] text-muted">· chaired by {lead.name}</span>}
          </div>
          <Button
            size="sm"
            variant="secondary"
            icon={<Wand2 />}
            onClick={() => setSeats(suggestParticipants(objective || 'campaign launch media strategy', agents, roles, 4).map((a) => a.id))}
          >
            {lead ? `Let ${lead.name} pick` : 'Pick for me'}
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {pool.map((a) => {
            const on = seats.includes(a.id)
            return (
              <button
                key={a.id}
                onClick={() => toggle(a)}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border p-3 text-left transition',
                  on ? 'border-transparent bg-white/[0.07]' : 'border-white/[0.07] bg-white/[0.025] hover:border-white/[0.15]',
                )}
                style={on ? { boxShadow: `inset 0 0 0 1.5px ${a.color}` } : undefined}
              >
                <AgentAvatar agent={a} size="sm" active={on} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium">{a.name}</div>
                  <div className="truncate text-[11.5px] text-muted">{a.title || roles.find((r) => r.id === a.roleId)?.name}</div>
                </div>
                {on && <Check className="size-4 shrink-0" style={{ color: a.color }} />}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <div className="mb-3 text-[13px] font-medium text-soft">How deep should they go?</div>
        <div className="grid gap-2 sm:grid-cols-3">
          {DEPTHS.map((d) => (
            <button
              key={d.id}
              onClick={() => setDepth(d.id)}
              className={cn(
                'rounded-2xl border p-4 text-left transition',
                depth === d.id ? 'border-[color-mix(in_oklab,var(--accent)_60%,transparent)] bg-white/[0.06]' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.15]',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{d.name}</span>
                <span className="text-[11px] text-muted">{d.time}</span>
              </div>
              <p className="mt-1 text-[12.5px] leading-snug text-muted">{d.body}</p>
            </button>
          ))}
        </div>
      </div>

      {projects.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <div className="text-[13px] font-medium text-soft">Link to a project</div>
            <div className="text-[12px] text-muted">The team gets the project’s details and the plan’s actions can go on its board.</div>
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
        <AvatarStack agents={[...(lead ? [lead] : []), ...agents.filter((a) => seats.includes(a.id))]} size="sm" max={7} />
        <Button variant="primary" size="lg" icon={<BrainCircuit />} loading={starting} disabled={!objective.trim() || !seats.length} onClick={() => void start()}>
          Start the mastermind
        </Button>
      </div>
    </div>
  )
}

const PHASE_BADGE: Record<MastermindSession['phase'], { label: string; tone: 'good' | 'warn' | 'bad' | 'accent' | 'neutral' }> = {
  setup: { label: 'Starting', tone: 'neutral' },
  opening: { label: 'In session', tone: 'accent' },
  challenge: { label: 'In session', tone: 'accent' },
  synthesis: { label: 'In session', tone: 'accent' },
  plan: { label: 'Drafting plan', tone: 'accent' },
  done: { label: 'Plan ready', tone: 'good' },
  error: { label: 'Paused', tone: 'bad' },
}

function PastSessions() {
  const sessions = useMasterminds()
  const agents = useAgents()
  const navigate = useNavigate()
  if (!sessions.length)
    return (
      <div className="rounded-[28px] border border-dashed border-white/[0.1] p-8 text-center">
        <BrainCircuit className="mx-auto size-8 text-faint" />
        <p className="mt-3 text-sm font-medium">No sessions yet</p>
        <p className="mt-1 text-[13px] text-muted">Your plans will be kept here.</p>
      </div>
    )
  return (
    <div className="space-y-2">
      {sessions.map((s) => {
        const people = s.participantIds.map((id) => agents.find((a) => a.id === id)).filter((a): a is Agent => !!a)
        const badge = PHASE_BADGE[s.phase]
        return (
          <button
            key={s.id}
            onClick={() => navigate(`/mastermind/${s.id}`)}
            className="flex w-full flex-col gap-2.5 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4 text-left transition hover:border-white/[0.14] hover:bg-white/[0.045]"
          >
            <div className="flex items-center justify-between gap-2">
              <Badge tone={badge.tone} dot>
                {badge.label}
              </Badge>
              <span className="text-[11px] text-faint">{timeAgo(s.updatedAt)}</span>
            </div>
            <div className="line-clamp-2 text-[14px] font-medium">{s.plan?.title ?? s.title}</div>
            <div className="flex items-center justify-between gap-2">
              <AvatarStack agents={people} size="xs" max={5} />
              {s.plan && <span className="text-[12px] text-muted">{s.plan.actions.length} actions</span>}
            </div>
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Session                                                            */
/* ------------------------------------------------------------------ */

function ContributionCard({ session, c, agent, roleName }: { session: MastermindSession; c: Contribution; agent?: Agent; roleName?: string }) {
  const live = useLive((s) => s.messages[liveKey(session.id, c.id)])
  const text = c.status === 'streaming' ? (live?.text ?? '') : c.content
  return (
    <div className="rounded-3xl border border-white/[0.07] bg-white/[0.025] p-5" style={agent ? { boxShadow: `inset 3px 0 0 ${agent.color}` } : undefined}>
      <div className="mb-3 flex items-center gap-3">
        {agent && <AgentAvatar agent={agent} size="sm" active={c.status === 'streaming'} />}
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold">{agent?.name ?? 'Teammate'}</div>
          <div className="text-[11.5px] text-muted">{roleName}</div>
        </div>
        {c.status === 'streaming' && <span className="text-[11.5px] text-[color-mix(in_oklab,var(--accent)_70%,white)]">thinking out loud…</span>}
        {c.status === 'error' && <Badge tone="bad">Didn’t finish</Badge>}
      </div>
      {text ? (
        <Markdown className={cn('text-[13.5px]', c.status === 'streaming' && 'caret-live')}>{text}</Markdown>
      ) : (
        <div className="space-y-2">
          <div className="skeleton h-3 w-11/12 rounded" />
          <div className="skeleton h-3 w-9/12 rounded" />
          <div className="skeleton h-3 w-10/12 rounded" />
        </div>
      )}
    </div>
  )
}

function Synthesis({ session }: { session: MastermindSession }) {
  const live = useLive((s) => s.messages[liveKey(session.id, 'synthesis')])
  const text = session.synthesis ?? live?.text ?? ''
  if (!text) return <p className="py-10 text-center text-sm text-muted">Your lead will pull everyone’s views together once the discussion ends.</p>
  return (
    <div className="rounded-3xl border border-white/[0.07] bg-white/[0.025] p-6">
      <Markdown className={cn(!session.synthesis && 'caret-live')}>{text}</Markdown>
    </div>
  )
}

type SessionTab = 'discussion' | 'strategy' | 'plan'

function SessionView({ session }: { session: MastermindSession }) {
  const navigate = useNavigate()
  const agents = useAgents()
  const roles = useRoles()
  const running = useLive((s) => !!s.running[session.id])
  const lead = agents.find((a) => a.id === session.leadId)
  const people = session.participantIds.map((id) => agents.find((a) => a.id === id)).filter((a): a is Agent => !!a)
  const speaking = new Set(session.contributions.filter((c) => c.status === 'streaming').map((c) => c.agentId))
  const [tab, setTab] = useState<SessionTab>(session.plan ? 'plan' : 'discussion')
  const roleName = (a?: Agent) => (a ? a.title || roles.find((r) => r.id === a.roleId)?.name : undefined)

  // Follow the session as it moves through its phases.
  useEffect(() => {
    if (session.phase === 'synthesis') setTab('strategy')
    if (session.phase === 'done' && session.plan) setTab('plan')
  }, [session.phase, session.plan])

  const openings = session.contributions.filter((c) => c.phase === 'opening')
  const debate = session.contributions.filter((c) => c.phase === 'challenge')
  const interrupted = !running && !['done', 'error'].includes(session.phase)

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/mastermind')} className="flex items-center gap-1.5 text-[13px] text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> All sessions
      </button>
      <div className="grid gap-6 lg:grid-cols-[400px_1fr] xl:grid-cols-[440px_1fr]">
        <aside className="space-y-5 lg:sticky lg:top-4 lg:self-start">
          <div className="glass rounded-[28px] p-5">
            <div className="text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">Mastermind</div>
            <h1 className="mt-1.5 font-display text-2xl leading-tight font-semibold tracking-tight">{session.title}</h1>
            {session.objective.trim() !== session.title && <p className="mt-2 text-[13.5px] text-soft">{session.objective}</p>}
            <div className="mt-5">
              <RoundTable session={session} lead={lead} agents={people} speaking={speaking} size={340} />
            </div>
            <div className="mt-5">
              <PhaseStepper session={session} />
            </div>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {running ? (
                <Button variant="secondary" icon={<CircleStop />} onClick={() => stopMastermind(session.id)}>
                  Stop
                </Button>
              ) : (
                <>
                  {(session.phase === 'error' || interrupted) && (
                    <Button variant="primary" icon={<RotateCcw />} onClick={() => void restartMastermind(session.id)}>
                      Run it again
                    </Button>
                  )}
                  {session.phase === 'done' && (
                    <Button
                      variant="secondary"
                      icon={<RotateCcw />}
                      onClick={() => window.confirm('Run the whole session again? The current plan will be replaced.') && void restartMastermind(session.id)}
                    >
                      Re-run
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    icon={<Trash2 />}
                    onClick={async () => {
                      if (!window.confirm('Delete this mastermind session?')) return
                      await deleteMastermind(session.id)
                      navigate('/mastermind')
                    }}
                  >
                    Delete
                  </Button>
                </>
              )}
            </div>
          </div>
          {session.error && (
            <div className="flex gap-3 rounded-2xl border border-bad/25 bg-bad/[0.06] p-4 text-[13px]">
              <TriangleAlert className="size-4 shrink-0 text-bad" />
              <div>
                <div className="font-medium">{session.error}</div>
                <button onClick={() => navigate('/settings?tab=ai')} className="mt-1 text-muted underline-offset-4 hover:text-fg hover:underline">
                  Check AI settings
                </button>
              </div>
            </div>
          )}
          {interrupted && !session.error && <p className="text-center text-[12.5px] text-muted">This session was interrupted before it finished.</p>}
        </aside>

        <div className="min-w-0 space-y-5">
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { id: 'discussion', label: 'Discussion', icon: <Lightbulb />, count: session.contributions.length },
              { id: 'strategy', label: 'Strategy', icon: <Sparkles /> },
              { id: 'plan', label: 'Action plan', icon: <Check />, count: session.plan?.actions.length },
            ]}
          />
          {tab === 'discussion' && (
            <div className="space-y-6">
              {openings.length === 0 && <p className="py-10 text-center text-sm text-muted">Everyone is taking their seats…</p>}
              {openings.length > 0 && (
                <section>
                  <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">
                    <Lightbulb className="size-4" /> Opening ideas
                  </h3>
                  <div className="grid gap-4 2xl:grid-cols-2">
                    {openings.map((c) => {
                      const a = agents.find((x) => x.id === c.agentId)
                      return <ContributionCard key={c.id} session={session} c={c} agent={a} roleName={roleName(a)} />
                    })}
                  </div>
                </section>
              )}
              {debate.length > 0 && (
                <section>
                  <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">
                    <Swords className="size-4" /> Debate
                  </h3>
                  <div className="grid gap-4 2xl:grid-cols-2">
                    {debate.map((c) => {
                      const a = agents.find((x) => x.id === c.agentId)
                      return <ContributionCard key={c.id} session={session} c={c} agent={a} roleName={roleName(a)} />
                    })}
                  </div>
                </section>
              )}
            </div>
          )}
          {tab === 'strategy' && <Synthesis session={session} />}
          {tab === 'plan' &&
            (session.plan ? (
              <PlanView session={session} agents={agents} />
            ) : (
              <p className="py-10 text-center text-sm text-muted">{running ? 'The plan will appear here as soon as it’s ready.' : 'No plan yet.'}</p>
            ))}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function MastermindPage() {
  const { id } = useParams()
  const session = useMastermind(id)
  if (id) return session ? <SessionView key={session.id} session={session} /> : null
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Work"
        title="Mastermind"
        subtitle="Put a goal in front of your whole team. They share ideas, challenge each other, your lead pulls it together, and you get a plan of action you can put straight to work."
      />
      <div className="grid gap-8 xl:grid-cols-[1fr_360px]">
        <Setup />
        <div>
          <div className="mb-3 text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">Past sessions</div>
          <PastSessions />
        </div>
      </div>
    </div>
  )
}
