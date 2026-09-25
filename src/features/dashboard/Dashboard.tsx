import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { addDays, format, isSameDay, startOfDay, subDays } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowRight,
  ArrowUp,
  Brain,
  BrainCircuit,
  CalendarDays,
  Check,
  Clock3,
  FlaskConical,
  ImagePlus,
  KeyRound,
  ListChecks,
  MapPin,
  Newspaper,
  PanelsTopLeft,
  Presentation,
  Radio,
  RefreshCw,
  Sparkles,
  Timer,
} from 'lucide-react'
import { db } from '../../lib/db'
import { useActiveAgents, useEventsBetween, useLead, useLog, useProjects, useRoles, useTasks } from '../../hooks/data'
import { useSettings } from '../../stores/settings'
import { useUI } from '../../stores/ui'
import { useLive } from '../../stores/live'
import { useJobs } from '../../stores/jobs'
import { BRIEF_KEY, generateBrief } from '../../lib/agents/brief'
import { updateTask } from '../../lib/ops'
import { AgentAvatar } from '../../components/agents/AgentAvatar'
import { Panel, PanelHeader } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Empty, SectionLabel } from '../../components/ui/bits'
import { Markdown } from '../../components/ui/Markdown'
import { Sparkline } from '../../components/charts/Charts'
import { ProjectCard } from '../projects/ProjectCard'
import { cn, dueLabel, isoDate, timeAgo, timeOfDay } from '../../lib/utils'
import type { Task } from '../../lib/types'

function Greeting() {
  const settings = useSettings((s) => s.settings)
  const lead = useLead()
  const askLead = useUI((s) => s.askLead)
  const [text, setText] = useState('')
  const first = settings.userName.split(' ')[0]
  const chips = ['Plan my day', 'What’s overdue?', 'Prep my next meeting', 'Draft a press release about ']
  const submit = (value: string) => {
    if (!value.trim()) return
    askLead(value.trim())
    setText('')
  }
  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-white/[0.08] p-6 sm:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_120%_at_0%_0%,color-mix(in_oklab,var(--accent)_26%,transparent),transparent_60%),radial-gradient(70%_100%_at_100%_100%,color-mix(in_oklab,var(--accent-2)_16%,transparent),transparent_60%)]" />
      <div className="grid-lines pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_70%)]" />
      <div className="relative">
        <div className="mb-2 text-[11px] font-semibold tracking-[0.2em] text-soft uppercase">{format(new Date(), 'EEEE d MMMM')}</div>
        <h1 className="font-display text-[clamp(30px,4.2vw,52px)] leading-[1.02] font-semibold tracking-[-0.03em]">
          Good {timeOfDay()}, <span className="text-gradient">{first}</span>.
        </h1>
        <p className="mt-2 max-w-xl text-[15px] text-soft">What should we take off your plate today?</p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit(text)
          }}
          className="mt-6 flex items-center gap-2 rounded-2xl border border-white/[0.1] bg-ink-950/50 p-2 pl-3 backdrop-blur-xl focus-within:border-[color-mix(in_oklab,var(--accent)_50%,transparent)]"
        >
          {lead && <AgentAvatar agent={lead} size="sm" active />}
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Tell ${lead?.name ?? 'your lead'} what you need… e.g. “Set up a project for the Kestrel pitch next Friday”`}
            className="h-10 min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-faint"
          />
          <Button type="submit" variant="primary" size="md" className="shrink-0 px-3.5" aria-label="Send">
            <ArrowUp className="size-4" />
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c}
              onClick={() => (c.endsWith(' ') ? setText(c) : submit(c))}
              className="rounded-full border border-white/[0.09] bg-white/[0.04] px-3.5 py-1.5 text-xs text-soft transition hover:border-white/20 hover:text-fg"
            >
              {c.trim()}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function Reclaimed() {
  const logs = useLiveQuery(() => db.log.where('at').above(Date.now() - 14 * 86_400_000).toArray(), [], [])
  const days = useMemo(() => {
    const out: { label: string; minutes: number }[] = []
    for (let i = 13; i >= 0; i--) {
      const day = subDays(startOfDay(new Date()), i)
      out.push({ label: format(day, 'EEE d'), minutes: logs.filter((l) => isSameDay(l.at, day)).reduce((s, l) => s + (l.minutesSaved ?? 0), 0) })
    }
    return out
  }, [logs])
  const thisWeek = days.slice(7).reduce((s, d) => s + d.minutes, 0)
  const lastWeek = days.slice(0, 7).reduce((s, d) => s + d.minutes, 0)
  const delta = thisWeek - lastWeek
  const hours = (m: number) => `${(m / 60).toFixed(m >= 600 ? 0 : 1).replace(/\.0$/, '')}h`
  return (
    <Panel className="flex flex-col p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] text-soft">
          <Timer className="size-4 text-muted" /> Time reclaimed this week
        </div>
        <span className="text-[10px] tracking-wider text-faint uppercase">Estimate</span>
      </div>
      <div className="mt-3 flex items-end gap-3">
        <div className="text-[48px] leading-none font-semibold tracking-tight">{hours(thisWeek)}</div>
        {lastWeek > 0 && (
          <div className={cn('mb-1.5 text-xs font-medium', delta >= 0 ? 'text-good' : 'text-muted')}>
            {delta >= 0 ? '+' : '−'}
            {hours(Math.abs(delta))} vs last week
          </div>
        )}
      </div>
      <div className="mt-4">
        <Sparkline values={days.map((d) => Math.round(d.minutes))} labels={days.map((d) => d.label)} format={(v) => `${v} min`} caption="Minutes saved per day, last 14 days" />
      </div>
      <p className="mt-2 text-[11px] text-faint">Based on the work your agents completed. Today is highlighted.</p>
    </Panel>
  )
}

function Schedule() {
  const today = useMemo(() => startOfDay(new Date()), [])
  const events = useEventsBetween(today, addDays(today, 1))
  const askLead = useUI((s) => s.askLead)
  const navigate = useNavigate()
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])
  const nextIdx = events.findIndex((e) => new Date(e.end) > now)
  return (
    <Panel className="flex flex-col">
      <PanelHeader
        title="Today"
        icon={<CalendarDays />}
        subtitle={events.length ? `${events.length} event${events.length === 1 ? '' : 's'}` : 'Nothing booked'}
        actions={
          <Button size="xs" variant="ghost" onClick={() => navigate('/calendar')} iconRight={<ArrowRight />}>
            Calendar
          </Button>
        }
      />
      <div className="flex-1 px-3 pb-4">
        {events.length === 0 && <Empty className="mx-2 py-8" icon={<CalendarDays />} title="A clear day" body="Perfect for deep work. Ask your lead to protect some focus time." />}
        <div className="relative">
          {events.map((e, i) => {
            const start = new Date(e.start)
            const end = new Date(e.end)
            const past = end < now
            const current = start <= now && end > now
            const isNext = i === nextIdx
            return (
              <div key={e.id} className={cn('group relative flex gap-3 rounded-2xl px-2 py-2.5 transition', isNext && 'bg-white/[0.04]', past && 'opacity-45')}>
                <div className="w-12 shrink-0 pt-0.5 text-right">
                  <div className="text-[13px] font-medium tabular-nums text-fg">{e.allDay ? 'All day' : format(start, 'HH:mm')}</div>
                  {!e.allDay && <div className="text-[11px] tabular-nums text-faint">{format(end, 'HH:mm')}</div>}
                </div>
                <div className="w-[3px] shrink-0 rounded-full" style={{ background: e.color ?? 'var(--accent)' }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-[13.5px] font-medium text-fg">{e.title}</div>
                    {current && <span className="shrink-0 rounded-full bg-good/15 px-2 py-0.5 text-[10px] font-semibold text-good">NOW</span>}
                    {isNext && !current && <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-soft">NEXT</span>}
                  </div>
                  {e.location && (
                    <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted">
                      <MapPin className="size-3" />
                      {e.location}
                    </div>
                  )}
                </div>
                {!past && (
                  <button
                    onClick={() =>
                      askLead(
                        `Prep me for "${e.title}" at ${format(start, 'HH:mm')}${e.location ? ` (${e.location})` : ''}. Pull anything relevant from my brain and projects, then give me a one-page brief: context, what I want out of it, talking points, smart questions to ask and anything to be careful about.`,
                      )
                    }
                    className="self-center rounded-lg px-2.5 py-1 text-[11px] font-medium text-muted opacity-0 transition group-hover:opacity-100 hover:bg-white/[0.07] hover:text-fg max-md:opacity-100"
                  >
                    Prep me
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </Panel>
  )
}

function DailyBrief() {
  const brief = useSettings((s) => s.settings.brief)
  const live = useLive((s) => s.messages[BRIEF_KEY])
  const running = useLive((s) => !!s.running[BRIEF_KEY])
  const lead = useLead()
  const isToday = brief?.date === isoDate()
  const text = running ? (live?.text ?? '') : isToday ? brief?.content : ''
  return (
    <Panel className="flex flex-col">
      <PanelHeader
        title="Morning brief"
        icon={<Sparkles />}
        subtitle={lead ? `Prepared by ${lead.name}` : undefined}
        actions={
          <Button size="xs" variant={isToday ? 'ghost' : 'primary'} onClick={() => void generateBrief()} loading={running} icon={isToday ? <RefreshCw /> : <Sparkles />}>
            {isToday ? 'Refresh' : 'Brief me'}
          </Button>
        }
      />
      <div className="min-h-[180px] flex-1 px-5 pb-5">
        {text ? (
          <Markdown className={cn('text-[13.5px]', running && 'caret-live')}>{text}</Markdown>
        ) : running ? (
          <div className="space-y-2 pt-1">
            {(live?.activities ?? []).map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-xs text-muted">
                <span className="size-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
                {a.label}
              </div>
            ))}
            <div className="skeleton h-4 w-3/4" />
            <div className="skeleton h-4 w-2/3" />
            <div className="skeleton h-4 w-1/2" />
          </div>
        ) : (
          <div className="flex h-full flex-col items-start justify-center gap-3 py-4">
            {lead && <AgentAvatar agent={lead} size="lg" active />}
            <p className="max-w-sm text-sm text-muted">{lead?.name ?? 'Your lead'} will read your calendar, tasks, projects and brain, then give you a crisp plan for the day.</p>
          </div>
        )}
      </div>
    </Panel>
  )
}

function FocusTasks() {
  const tasks = useTasks()
  const projects = useProjects()
  const navigate = useNavigate()
  const focus = useMemo(() => {
    const open = tasks.filter((t) => t.status !== 'done' && (t.assigneeId === 'me' || !t.assigneeId))
    const score = (t: Task) => (t.dueDate ?? '9999-99-99') + (t.priority === 'high' ? 'a' : t.priority === 'medium' ? 'b' : 'c')
    return open.sort((a, b) => score(a).localeCompare(score(b))).slice(0, 7)
  }, [tasks])
  return (
    <Panel className="flex flex-col">
      <PanelHeader
        title="Your focus"
        icon={<ListChecks />}
        subtitle={`${focus.length} things only you can do`}
        actions={
          <Button size="xs" variant="ghost" onClick={() => navigate('/projects')} iconRight={<ArrowRight />}>
            Board
          </Button>
        }
      />
      <div className="px-3 pb-4">
        {focus.length === 0 && <Empty className="mx-2 py-8" icon={<Check />} title="All clear" body="Nothing assigned to you. Enjoy it." />}
        {focus.map((t) => {
          const due = dueLabel(t.dueDate)
          const project = projects.find((p) => p.id === t.projectId)
          return (
            <div key={t.id} className="group flex items-center gap-3 rounded-2xl px-2 py-2 transition hover:bg-white/[0.03]">
              <button
                onClick={() => void updateTask(t.id, { status: 'done' })}
                className="grid size-5 shrink-0 place-items-center rounded-md border border-white/20 text-transparent transition hover:border-good hover:bg-good/15 hover:text-good"
                aria-label="Mark done"
              >
                <Check className="size-3.5" />
              </button>
              <button onClick={() => project && navigate(`/projects/${project.id}`)} className="min-w-0 flex-1 text-left">
                <div className="truncate text-[13.5px] text-fg">{t.title}</div>
                {project && (
                  <div className="flex items-center gap-1 truncate text-[11px] text-faint">
                    <span className="size-1.5 rounded-full" style={{ background: project.color }} />
                    {project.name}
                  </div>
                )}
              </button>
              {t.priority === 'high' && <span className="size-1.5 shrink-0 rounded-full bg-bad" title="High priority" />}
              {due && <span className={cn('shrink-0 text-[11px] font-medium', due.tone === 'bad' ? 'text-bad' : due.tone === 'warn' ? 'text-warn' : 'text-muted')}>{due.text}</span>}
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

function Team() {
  const agents = useActiveAgents()
  const roles = useRoles()
  const jobs = useJobs((s) => s.jobs)
  const navigate = useNavigate()
  const busy = new Set(jobs.filter((j) => j.status === 'running').map((j) => j.agentId))
  return (
    <Panel className="flex flex-col">
      <PanelHeader
        title="Your team"
        icon={<Sparkles />}
        subtitle={`${agents.length} agents on duty`}
        actions={
          <Button size="xs" variant="ghost" onClick={() => navigate('/agents')} iconRight={<ArrowRight />}>
            Manage
          </Button>
        }
      />
      <div className="grid grid-cols-4 gap-y-4 px-4 pb-5">
        {agents.map((a) => {
          const working = busy.has(a.id)
          return (
            <button key={a.id} onClick={() => navigate(`/agents/${a.id}`)} className="group flex flex-col items-center gap-1.5 rounded-2xl py-1 transition hover:bg-white/[0.03]" title={roles.find((r) => r.id === a.roleId)?.name}>
              <AgentAvatar agent={a} size="md" active={working} status={working ? 'working' : 'online'} />
              <span className="text-[12px] font-medium text-soft group-hover:text-fg">{a.name}</span>
            </button>
          )
        })}
      </div>
    </Panel>
  )
}

function Activity() {
  const log = useLog(8)
  const agents = useActiveAgents()
  const navigate = useNavigate()
  return (
    <Panel className="flex flex-col">
      <PanelHeader title="Recent agent work" icon={<Clock3 />} />
      <div className="px-3 pb-4">
        {log.length === 0 && <p className="px-2 py-6 text-sm text-muted">Agent work will show up here.</p>}
        {log.map((l) => {
          const agent = agents.find((a) => a.id === l.agentId)
          return (
            <button key={l.id} onClick={() => l.link && navigate(l.link)} className="flex w-full items-start gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-white/[0.03]">
              {agent ? <AgentAvatar agent={agent} size="xs" className="mt-0.5" /> : <span className="mt-1.5 size-2 rounded-full bg-[var(--accent)]" />}
              <div className="min-w-0 flex-1">
                <div className="text-[13px] leading-snug text-soft">{l.text}</div>
                <div className="text-[11px] text-faint">
                  {timeAgo(l.at)}
                  {l.minutesSaved ? ` · saved ~${l.minutesSaved} min` : ''}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </Panel>
  )
}

function BrainTile() {
  const stats = useLiveQuery(async () => {
    const notes = await db.notes.toArray()
    return { notes: notes.length, links: notes.reduce((n, x) => n + x.links.length, 0), tags: new Set(notes.flatMap((n) => n.tags)).size }
  }, [])
  const mode = useSettings((s) => s.settings.brain.mode)
  const navigate = useNavigate()
  return (
    <button onClick={() => navigate('/brain')} className="glass group relative flex w-full flex-col overflow-hidden rounded-3xl p-5 text-left">
      <div className="pointer-events-none absolute -top-10 -right-10 size-48 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--accent)_40%,transparent),transparent_65%)] blur-xl transition group-hover:scale-110" />
      <svg className="pointer-events-none absolute right-4 bottom-4 size-28 opacity-60" viewBox="0 0 100 100" aria-hidden>
        {[
          [20, 30, 50, 50],
          [50, 50, 80, 25],
          [50, 50, 70, 80],
          [50, 50, 25, 75],
          [20, 30, 25, 75],
          [80, 25, 70, 80],
        ].map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--accent-2)" strokeWidth="0.8" opacity="0.6" />
        ))}
        {[
          [20, 30, 3],
          [50, 50, 5],
          [80, 25, 3.5],
          [70, 80, 3],
          [25, 75, 2.5],
        ].map(([cx, cy, r], i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="var(--accent)" className="animate-pulse-soft" style={{ animationDelay: `${i * 0.3}s` }} />
        ))}
      </svg>
      <div className="relative flex items-center gap-2 text-[13px] text-soft">
        <Brain className="size-4 text-muted" /> Second brain
      </div>
      <div className="relative mt-3 text-[40px] leading-none font-semibold">{stats?.notes.toLocaleString() ?? '—'}</div>
      <div className="relative mt-1 text-sm text-muted">
        notes · {stats?.links.toLocaleString() ?? 0} links · {stats?.tags ?? 0} tags
      </div>
      <div className="relative mt-4 flex items-center gap-1.5 text-xs font-medium text-[color-mix(in_oklab,var(--accent)_55%,white)]">
        {mode === 'none' ? 'Link your Obsidian vault' : 'Explore in 3D'} <ArrowRight className="size-3.5 transition group-hover:translate-x-1" />
      </div>
    </button>
  )
}

const LAUNCHERS = [
  { to: '/mastermind?new=1', label: 'Mastermind', hint: 'Plan with the team', icon: BrainCircuit, color: '#a78bfa' },
  { to: '/decks?new=1', label: 'New deck', hint: 'Slides in minutes', icon: Presentation, color: '#fb923c' },
  { to: '/sites?new=1', label: 'Landing page', hint: 'Launch-ready', icon: PanelsTopLeft, color: '#38bdf8' },
  { to: '/research?new=1', label: 'Research', hint: 'With live sources', icon: FlaskConical, color: '#34d399' },
  { to: '/media', label: 'Create image', hint: 'Free image studio', icon: ImagePlus, color: '#f472b6' },
  { to: '/press?new=press_release', label: 'Press release', hint: 'Newsroom-ready', icon: Newspaper, color: '#fbbf24' },
  { to: '/live', label: 'Go live', hint: 'Talk & share screen', icon: Radio, color: '#f87171' },
]

function Launchers() {
  const navigate = useNavigate()
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
      {LAUNCHERS.map((l, i) => (
        <motion.button
          key={l.to}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 * i }}
          whileHover={{ y: -3 }}
          onClick={() => navigate(l.to)}
          className="glass group flex flex-col items-start gap-3 rounded-3xl p-4 text-left"
        >
          <span className="grid size-10 place-items-center rounded-2xl" style={{ background: `${l.color}22`, color: l.color, boxShadow: `inset 0 0 0 1px ${l.color}33` }}>
            <l.icon className="size-5" />
          </span>
          <span>
            <span className="block text-[13.5px] font-semibold text-fg">{l.label}</span>
            <span className="block text-[11.5px] text-muted">{l.hint}</span>
          </span>
        </motion.button>
      ))}
    </div>
  )
}

function SetupChecklist() {
  const profiles = useLiveQuery(() => db.profiles.count(), [], 0)
  const brainMode = useSettings((s) => s.settings.brain.mode)
  const calendars = useLiveQuery(() => db.calendars.count(), [], 0)
  const navigate = useNavigate()
  const steps = [
    { done: profiles > 0, label: 'Connect an AI provider', hint: 'Bring your agents to life', to: '/settings?tab=ai', icon: KeyRound },
    { done: brainMode !== 'none', label: 'Link your Obsidian brain', hint: 'So every agent knows your world', to: '/brain', icon: Brain },
    { done: calendars > 0, label: 'Connect your calendar', hint: 'Google Calendar or any iCal link', to: '/calendar?connect=1', icon: CalendarDays },
  ]
  if (steps.every((s) => s.done)) return null
  return (
    <Panel className="p-5">
      <div>
        <h3 className="font-display text-[15px] font-semibold">Finish setting up</h3>
        <p className="text-xs text-muted">
          {steps.filter((s) => s.done).length} of {steps.length} done
        </p>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {steps.map((s) => (
          <button
            key={s.label}
            disabled={s.done}
            onClick={() => navigate(s.to)}
            className={cn('flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition', s.done ? 'border-good/20 bg-good/[0.05]' : 'border-white/[0.08] bg-white/[0.03] hover:border-white/20')}
          >
            <span className={cn('grid size-8 shrink-0 place-items-center rounded-xl', s.done ? 'bg-good/15 text-good' : 'bg-white/[0.06] text-soft')}>{s.done ? <Check className="size-4" /> : <s.icon className="size-4" />}</span>
            <span className="min-w-0">
              <span className={cn('block text-[13px] font-medium', s.done ? 'text-muted line-through' : 'text-fg')}>{s.label}</span>
              <span className="block truncate text-[11px] text-faint">{s.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </Panel>
  )
}

export default function Dashboard() {
  const projects = useProjects()
  const tasks = useTasks()
  const agents = useActiveAgents()
  const current = projects.filter((p) => p.status === 'active' || p.status === 'pitch').slice(0, 6)
  const navigate = useNavigate()
  return (
    <div className="space-y-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Greeting />
        <Reclaimed />
      </div>

      <SetupChecklist />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Schedule />
        <DailyBrief />
      </div>

      <div>
        <SectionLabel
          action={
            <Button size="xs" variant="ghost" onClick={() => navigate('/projects')} iconRight={<ArrowRight />}>
              All projects
            </Button>
          }
        >
          Current projects
        </SectionLabel>
        {current.length === 0 ? (
          <Empty icon={<Sparkles />} title="No live projects" body="Tell your lead about a new client or campaign and it will set one up." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {current.map((p) => (
              <ProjectCard key={p.id} project={p} tasks={tasks.filter((t) => t.projectId === p.id)} agents={agents} />
            ))}
          </div>
        )}
      </div>

      <div>
        <SectionLabel>Start something</SectionLabel>
        <Launchers />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <FocusTasks />
        <div className="space-y-5">
          <Team />
          <BrainTile />
        </div>
        <Activity />
      </div>
    </div>
  )
}
