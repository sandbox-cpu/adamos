import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Brain, CalendarPlus, Check, CircleCheck, Copy, Flag, Gauge, ListPlus, Presentation, ShieldAlert, Target, Zap } from 'lucide-react'
import { milestonesToCalendar, planDate, planToMarkdown, pushActionsToBoard, savePlanToBrain } from '../../lib/agents/mastermind'
import { startDeckFromBrief } from '../../lib/decks/generate'
import type { Agent, MastermindSession, Priority } from '../../lib/types'
import { cn, copyText, errorMessage, parseDate } from '../../lib/utils'
import { useSettings } from '../../stores/settings'
import { useProjects } from '../../hooks/data'
import { AgentAvatar, UserAvatar } from '../../components/agents/AgentAvatar'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/bits'
import { Select } from '../../components/ui/Field'
import { toast } from '../../components/ui/Toast'

const PRIORITY_TONE: Record<Priority, 'bad' | 'warn' | 'neutral'> = { high: 'bad', medium: 'warn', low: 'neutral' }

function Owner({ name, agents, size = 'xs' }: { name: string; agents: Agent[]; size?: 'xs' | 'sm' }) {
  const userName = useSettings((s) => s.settings.userName)
  const agent = agents.find((a) => a.name.toLowerCase() === name.trim().toLowerCase())
  return (
    <span className="flex items-center gap-1.5 text-[12px] text-soft">
      {agent ? <AgentAvatar agent={agent} size={size} /> : <UserAvatar name={userName} size={size === 'xs' ? 22 : 30} />}
      {agent ? agent.name : name}
    </span>
  )
}

function Block({ title, icon, children, className }: { title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-3xl border border-white/[0.07] bg-white/[0.025] p-5', className)}>
      <h3 className="mb-4 flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-muted uppercase [&_svg]:size-4 [&_svg]:text-[var(--accent)]">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  )
}

export function PlanView({ session, agents }: { session: MastermindSession; agents: Agent[] }) {
  const navigate = useNavigate()
  const projects = useProjects()
  const plan = session.plan!
  const [projectId, setProjectId] = useState(session.projectId ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const open = plan.actions.filter((a) => !a.taskId)

  const byStream = useMemo(() => {
    const groups = new Map<string, typeof plan.actions>()
    for (const a of plan.actions) {
      const key = a.workstream || 'General'
      groups.set(key, [...(groups.get(key) ?? []), a])
    }
    return [...groups.entries()]
  }, [plan.actions])

  const milestones = [...plan.milestones].sort((a, b) => a.dueInDays - b.dueInDays)
  const lastDay = Math.max(1, ...milestones.map((m) => m.dueInDays))

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    try {
      await fn()
    } catch (err) {
      toast.error('That didn’t work', errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-5">
      {/* Headline */}
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--accent)_16%,transparent),transparent_55%)] p-6">
        <Badge tone="accent">Plan of action</Badge>
        <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight">{plan.title}</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-soft">{plan.summary}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            variant="primary"
            icon={<ListPlus />}
            loading={busy === 'board'}
            disabled={!open.length}
            onClick={() =>
              void run('board', async () => {
                const n = await pushActionsToBoard(session.id, projectId || undefined)
                toast.success(`${n} actions on your board`, 'Each is assigned and dated.', {
                  label: 'View',
                  onClick: () => navigate(projectId ? `/projects/${projectId}` : '/projects'),
                })
              })
            }
          >
            {open.length ? `Add ${open.length} actions to board` : 'All actions on your board'}
          </Button>
          <Button
            variant="secondary"
            icon={<CalendarPlus />}
            loading={busy === 'cal'}
            onClick={() =>
              void run('cal', async () => {
                const n = await milestonesToCalendar(session.id)
                toast.success(`${n} milestones in your calendar`, undefined, { label: 'View', onClick: () => navigate('/calendar') })
              })
            }
          >
            Milestones to calendar
          </Button>
          <Button
            variant="secondary"
            icon={<Presentation />}
            loading={busy === 'deck'}
            onClick={() =>
              void run('deck', async () => {
                const md = await planToMarkdown(session)
                const deck = await startDeckFromBrief({
                  title: plan.title,
                  topic: `A client-ready presentation of this plan of action: ${plan.title}. ${plan.summary}`,
                  sources: md,
                  useWeb: false,
                  slideCount: 10,
                  projectId: session.projectId,
                  agentId: session.leadId,
                })
                toast.success('Your deck is being made', 'Watch it come together in Deck Studio.')
                navigate(`/decks/${deck.id}`)
              })
            }
          >
            Make it a deck
          </Button>
          <Button
            variant="ghost"
            icon={<Brain />}
            loading={busy === 'brain'}
            onClick={() =>
              void run('brain', async () => {
                const path = await savePlanToBrain(session.id)
                if (path) toast.success('Saved to your brain', path)
              })
            }
          >
            Save to brain
          </Button>
          <Button
            variant="ghost"
            icon={<Copy />}
            onClick={async () => {
              await copyText(await planToMarkdown(session))
              toast.success('Plan copied', 'Paste it into an email or document.')
            }}
          >
            Copy
          </Button>
        </div>
        {projects.length > 0 && open.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
            Add actions to
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="h-8 w-auto py-0 text-[12.5px]">
              <option value="">No project (general tasks)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.client ? `${p.client} · ${p.name}` : p.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Block title="Objectives" icon={<Target />}>
          <ol className="space-y-2.5">
            {plan.objectives.map((o, i) => (
              <li key={i} className="flex gap-3 text-[14px] text-soft">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/[0.06] text-[11px] font-semibold text-fg">{i + 1}</span>
                <span className="pt-0.5">{o}</span>
              </li>
            ))}
          </ol>
        </Block>
        <Block title="Next 48 hours" icon={<Zap />}>
          <ul className="space-y-2.5">
            {plan.nextSteps.map((n, i) => (
              <li key={i} className="flex gap-3 text-[14px] text-soft">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]" />
                {n}
              </li>
            ))}
          </ul>
        </Block>
      </div>

      {/* Milestone timeline */}
      {milestones.length > 0 && (
        <Block title="Milestones" icon={<Flag />}>
          <div className="relative pt-2 pb-1">
            <div className="absolute top-[22px] right-2 left-2 h-px bg-gradient-to-r from-[var(--accent)] via-white/20 to-white/5" />
            <div className="relative flex justify-between gap-2 overflow-x-auto no-scrollbar">
              {milestones.map((m, i) => {
                const date = parseDate(planDate(session, m.dueInDays))
                return (
                  <div key={i} className="flex min-w-[110px] flex-1 flex-col items-center text-center" style={{ opacity: 0.55 + 0.45 * (1 - m.dueInDays / (lastDay * 1.4)) }}>
                    <span className="grid size-[18px] place-items-center rounded-full border-2 border-[var(--accent)] bg-ink-900">
                      <span className="size-1.5 rounded-full bg-[var(--accent)]" />
                    </span>
                    <span className="mt-2 text-[11px] font-semibold tracking-wide text-[color-mix(in_oklab,var(--accent)_65%,white)] uppercase">{format(date, 'd MMM')}</span>
                    <span className="mt-1 text-[12.5px] leading-snug text-soft">{m.title}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </Block>
      )}

      {/* Actions */}
      <Block title={`Actions · ${plan.actions.length}`} icon={<ListPlus />}>
        <div className="space-y-5">
          {byStream.map(([stream, actions]) => {
            const ws = plan.workstreams.find((w) => w.name === stream)
            return (
              <div key={stream}>
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <span className="text-[14px] font-semibold">{stream}</span>
                    {ws?.description && <span className="ml-2 text-[12.5px] text-muted">{ws.description}</span>}
                  </div>
                  {ws?.owner && <Owner name={ws.owner} agents={agents} />}
                </div>
                <div className="divide-y divide-white/[0.05] overflow-hidden rounded-2xl border border-white/[0.06]">
                  {actions.map((a) => (
                    <div key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-white/[0.015] px-4 py-3">
                      <span className={cn('grid size-5 shrink-0 place-items-center rounded-md border', a.taskId ? 'border-transparent bg-good text-ink-950' : 'border-white/20')}>
                        {a.taskId && <Check className="size-3" strokeWidth={3} />}
                      </span>
                      <div className="min-w-0 flex-1 basis-60">
                        <div className="text-[13.5px] font-medium text-fg">{a.title}</div>
                        {a.description && <div className="mt-0.5 line-clamp-2 text-[12.5px] text-muted">{a.description}</div>}
                      </div>
                      <Owner name={a.owner} agents={agents} />
                      <span className="w-16 text-right text-[12px] text-muted">{format(parseDate(planDate(session, a.dueInDays)), 'd MMM')}</span>
                      <Badge tone={PRIORITY_TONE[a.priority]}>{a.priority}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </Block>

      <div className="grid gap-5 xl:grid-cols-2">
        <Block title="Risks" icon={<ShieldAlert />}>
          <div className="space-y-3">
            {plan.risks.map((r, i) => (
              <div key={i} className="rounded-2xl bg-white/[0.03] p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[13.5px] font-medium">{r.risk}</span>
                  <Badge tone={PRIORITY_TONE[r.impact]}>{r.impact} impact</Badge>
                </div>
                <p className="mt-1.5 flex gap-1.5 text-[12.5px] text-muted">
                  <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-good" />
                  {r.mitigation}
                </p>
              </div>
            ))}
          </div>
        </Block>
        <Block title="How we’ll measure it" icon={<Gauge />}>
          <div className="grid gap-3 sm:grid-cols-2">
            {plan.kpis.map((k, i) => (
              <div key={i} className="rounded-2xl bg-white/[0.03] p-4">
                <div className="font-display text-xl font-semibold tracking-tight text-fg">{k.target}</div>
                <div className="mt-1 text-[12.5px] text-muted">{k.metric}</div>
              </div>
            ))}
          </div>
        </Block>
      </div>
    </div>
  )
}
