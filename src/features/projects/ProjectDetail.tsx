import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import {
  ArrowLeft,
  BrainCircuit,
  CalendarDays,
  FileText,
  FlaskConical,
  LayoutDashboard,
  MessagesSquare,
  MoreHorizontal,
  NotebookPen,
  PanelsTopLeft,
  Presentation,
  Sparkles,
  SquareKanban,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react'
import { db } from '../../lib/db'
import { deleteProject, updateProject } from '../../lib/ops'
import { projectLinks } from '../../lib/projects'
import type { Agent, Project, TaskStatus } from '../../lib/types'
import { cn, dueLabel, parseDate } from '../../lib/utils'
import { useUI } from '../../stores/ui'
import { useDraftField } from '../../hooks/useDraftField'
import { useAgents, useProject, useTasks } from '../../hooks/data'
import { AgentAvatar } from '../../components/agents/AgentAvatar'
import { Button } from '../../components/ui/Button'
import { Menu, ProgressRing, Tabs } from '../../components/ui/bits'
import { Input, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { toast } from '../../components/ui/Toast'
import { projectProgress, STATUS_META } from './ProjectCard'
import { Board, COLUMNS } from './Board'
import { TaskDrawer } from './TaskDrawer'

type Tab = 'board' | 'overview'

function SquadModal({ project, open, onClose }: { project: Project; open: boolean; onClose: () => void }) {
  const agents = useAgents().filter((a) => a.status === 'active')
  const [squad, setSquad] = useState(project.squad)
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<UsersRound />}
      title="Who’s on this project?"
      subtitle="The squad is who your lead turns to first for this work."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={async () => {
              await updateProject(project.id, { squad })
              onClose()
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {agents.map((a) => {
          const on = squad.includes(a.id)
          return (
            <button
              key={a.id}
              onClick={() => setSquad(on ? squad.filter((x) => x !== a.id) : [...squad, a.id])}
              className={cn(
                'flex items-center gap-3 rounded-2xl border p-3 text-left transition',
                on ? 'border-transparent bg-white/[0.07]' : 'border-white/[0.07] hover:border-white/[0.15]',
              )}
              style={on ? { boxShadow: `inset 0 0 0 1.5px ${a.color}` } : undefined}
            >
              <AgentAvatar agent={a} size="sm" />
              <span className="text-[13.5px] font-medium">{a.name}</span>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}

/** Tasks by status as one segmented bar: part of a whole, labelled in words as well as colour. */
function StatusBar({ counts, total }: { counts: Record<TaskStatus, number>; total: number }) {
  if (!total) return <p className="text-[13px] text-muted">No tasks yet.</p>
  return (
    <div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
        {COLUMNS.filter((c) => counts[c.id] > 0).map((c) => (
          <div
            key={c.id}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${(counts[c.id] / total) * 100}%`, background: c.color }}
            title={`${c.label}: ${counts[c.id]}`}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {COLUMNS.map((c) => (
          <span key={c.id} className="flex items-center gap-1.5 text-[12.5px] text-soft">
            <span className="size-2 rounded-full" style={{ background: c.color }} />
            {c.label} <span className="text-muted">{counts[c.id]}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function Overview({ project }: { project: Project }) {
  const navigate = useNavigate()
  const tasks = useTasks(project.id)
  const links = useLiveQuery(() => projectLinks(project.id), [project.id])
  const [description, setDescription] = useDraftField(project.description ?? '', (v) => void updateProject(project.id, { description: v.trim() || undefined }))
  const [goal, setGoal] = useState('')
  const counts = COLUMNS.reduce((acc, c) => ({ ...acc, [c.id]: tasks.filter((t) => t.status === c.id).length }), {} as Record<TaskStatus, number>)

  const items = [
    ...(links?.decks ?? []).map((d) => ({ id: d.id, icon: <Presentation />, label: d.title, kind: 'Deck', to: `/decks/${d.id}` })),
    ...(links?.sites ?? []).map((s) => ({ id: s.id, icon: <PanelsTopLeft />, label: s.name, kind: 'Landing page', to: `/sites/${s.id}` })),
    ...(links?.research ?? []).map((r) => ({ id: r.id, icon: <FlaskConical />, label: r.title, kind: 'Research', to: `/research/${r.id}` })),
    ...(links?.masterminds ?? []).map((m) => ({ id: m.id, icon: <BrainCircuit />, label: m.plan?.title ?? m.title, kind: 'Mastermind', to: `/mastermind/${m.id}` })),
    ...(links?.content ?? []).map((c) => ({ id: c.id, icon: <FileText />, label: c.title, kind: 'Press office', to: `/press?item=${c.id}` })),
  ]
  const upcoming = (links?.events ?? []).filter((e) => e.end >= new Date().toISOString()).sort((a, b) => a.start.localeCompare(b.start))

  return (
    <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
      <div className="space-y-5">
        <section className="glass rounded-3xl p-5">
          <h3 className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">About</h3>
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What’s this project about?" />
        </section>
        <section className="glass rounded-3xl p-5">
          <h3 className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Goals</h3>
          <div className="space-y-2">
            {project.goals.map((g, i) => (
              <div key={i} className="group flex items-start gap-3 rounded-2xl bg-white/[0.03] px-4 py-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-ink-950" style={{ background: project.color }}>
                  {i + 1}
                </span>
                <span className="flex-1 pt-0.5 text-[13.5px] text-soft">{g}</span>
                <button
                  onClick={() => void updateProject(project.id, { goals: project.goals.filter((_, j) => j !== i) })}
                  className="text-faint opacity-0 group-hover:opacity-100 hover:text-fg"
                  aria-label="Remove goal"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
            <Input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && goal.trim()) {
                  void updateProject(project.id, { goals: [...project.goals, goal.trim()] })
                  setGoal('')
                }
              }}
              placeholder="Add a goal and press Enter"
            />
          </div>
        </section>
        <section className="glass rounded-3xl p-5">
          <h3 className="mb-4 text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Progress</h3>
          <StatusBar counts={counts} total={tasks.length} />
        </section>
      </div>
      <div className="space-y-5">
        <section className="glass rounded-3xl p-5">
          <h3 className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Coming up</h3>
          {upcoming.length ? (
            <div className="space-y-2">
              {upcoming.slice(0, 5).map((e) => (
                <button
                  key={e.id}
                  onClick={() => navigate(`/calendar?date=${e.start.slice(0, 10)}`)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white/[0.03] px-3.5 py-2.5 text-left hover:bg-white/[0.05]"
                >
                  <div className="w-11 shrink-0 text-center">
                    <div className="text-[10px] font-semibold text-muted uppercase">{format(parseDate(e.start), 'MMM')}</div>
                    <div className="font-display text-lg leading-none font-semibold">{format(parseDate(e.start), 'd')}</div>
                  </div>
                  <span className="text-[13px] text-soft">{e.title}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted">Nothing in the calendar for this project.</p>
          )}
        </section>
        <section className="glass rounded-3xl p-5">
          <h3 className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Work made for this project</h3>
          {items.length ? (
            <div className="space-y-1.5">
              {items.map((it) => (
                <button key={it.id} onClick={() => navigate(it.to)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-white/[0.04]">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-soft [&_svg]:size-4">{it.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-fg">{it.label}</span>
                    <span className="text-[11.5px] text-muted">{it.kind}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted">Decks, pages, research and plans linked to this project will show up here.</p>
          )}
        </section>
        {project.notes.length > 0 && (
          <section className="glass rounded-3xl p-5">
            <h3 className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Notes in your brain</h3>
            <div className="space-y-1.5">
              {project.notes.map((path) => (
                <button
                  key={path}
                  onClick={() => navigate(`/brain?note=${encodeURIComponent(path)}`)}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] text-soft hover:bg-white/[0.04] hover:text-fg"
                >
                  <NotebookPen className="size-4 shrink-0 text-muted" />
                  <span className="truncate">{path.replace(/\.md$/, '')}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const project = useProject(id)
  const tasks = useTasks(id)
  const agents = useAgents()
  const askLead = useUI((s) => s.askLead)
  const [tab, setTab] = useState<Tab>('board')
  const [squadOpen, setSquadOpen] = useState(false)
  const [name, setName] = useDraftField(project?.name ?? '', (v) => project && void updateProject(project.id, { name: v.trim() || project.name }))
  const [client, setClient] = useDraftField(project?.client ?? '', (v) => project && void updateProject(project.id, { client: v.trim() || undefined }))
  const taskId = params.get('task') ?? undefined

  // Unknown or deleted projects go back to the list.
  useEffect(() => {
    if (!id) return
    let cancelled = false
    void db.projects.get(id).then((p) => {
      if (!cancelled && !p) navigate('/projects', { replace: true })
    })
    return () => {
      cancelled = true
    }
  }, [id, navigate])

  if (!project) return null
  const squad = project.squad.map((sid) => agents.find((a) => a.id === sid)).filter((a): a is Agent => !!a)
  const due = dueLabel(project.dueDate)
  const progress = projectProgress(tasks)

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/projects')} className="flex items-center gap-1.5 text-[13px] text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> All projects
      </button>

      <div className="glass relative overflow-hidden rounded-[28px] p-6">
        <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(70% 120% at 0% 0%, ${project.color}30, transparent 60%)` }} />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <input
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="Add a client"
              aria-label="Client"
              className="w-full rounded-lg bg-transparent text-[13px] font-medium text-muted outline-none placeholder:text-faint focus:bg-white/[0.04]"
            />
            <div className="mt-1 flex items-center gap-2">
              {project.emoji && <span className="text-3xl">{project.emoji}</span>}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="Project name"
                className="w-full min-w-0 rounded-lg bg-transparent font-display text-3xl font-semibold tracking-tight outline-none focus:bg-white/[0.04] md:text-4xl"
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {(['active', 'pitch', 'on_hold', 'done'] as Project['status'][]).map((s) => (
                <button
                  key={s}
                  onClick={() => void updateProject(project.id, { status: s })}
                  className={cn(
                    'h-7 rounded-full border px-3 text-[12px] font-medium transition',
                    project.status === s ? 'border-transparent bg-white text-ink-950' : 'border-white/[0.08] text-muted hover:text-fg',
                  )}
                >
                  {STATUS_META[s].label}
                </button>
              ))}
              <label
                className={cn(
                  'ml-1 flex h-7 items-center gap-1.5 rounded-full border border-white/[0.08] px-3 text-[12px]',
                  due?.tone === 'bad' ? 'text-bad' : due?.tone === 'warn' ? 'text-warn' : 'text-muted',
                )}
              >
                <CalendarDays className="size-3.5" />
                <input
                  type="date"
                  value={project.dueDate ?? ''}
                  onChange={(e) => void updateProject(project.id, { dueDate: e.target.value || undefined })}
                  className="bg-transparent outline-none [color-scheme:dark]"
                  aria-label="Due date"
                />
              </label>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <button onClick={() => setSquadOpen(true)} className="flex flex-col items-start gap-2 rounded-2xl p-2 text-left transition hover:bg-white/[0.04]">
              <span className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Squad</span>
              <span className="flex -space-x-2">
                {squad.length ? (
                  squad.map((a) => <AgentAvatar key={a.id} agent={a} size="sm" className="ring-2 ring-ink-900 rounded-full" />)
                ) : (
                  <span className="text-[13px] text-muted">Add agents</span>
                )}
              </span>
            </button>
            <ProgressRing value={progress} size={72} stroke={6} color={project.color} label={<span className="text-[15px] font-semibold">{Math.round(progress * 100)}%</span>} />
          </div>
        </div>
        <div className="relative mt-6 flex flex-wrap gap-2 border-t border-white/[0.06] pt-5">
          <Button
            size="sm"
            variant="primary"
            icon={<Sparkles />}
            onClick={() => askLead(`Give me a quick status update on the “${project.name}” project: what’s done, what’s at risk and the three most important next steps.`)}
          >
            Status update
          </Button>
          <Button size="sm" variant="secondary" icon={<BrainCircuit />} onClick={() => navigate(`/mastermind?project=${project.id}`)}>
            Plan it in Mastermind
          </Button>
          <Button size="sm" variant="secondary" icon={<MessagesSquare />} onClick={() => navigate(`/huddle?project=${project.id}`)}>
            Huddle about it
          </Button>
          <Button size="sm" variant="secondary" icon={<Presentation />} onClick={() => navigate(`/decks?new=1&project=${project.id}`)}>
            Make a deck
          </Button>
          <div className="ml-auto">
            <Menu
              trigger={(open) => (
                <button onClick={open} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/[0.07] hover:text-fg" aria-label="More">
                  <MoreHorizontal className="size-4" />
                </button>
              )}
              items={[
                { label: 'Edit squad', icon: <UsersRound />, onSelect: () => setSquadOpen(true) },
                'divider',
                {
                  label: 'Delete project',
                  icon: <Trash2 />,
                  danger: true,
                  onSelect: async () => {
                    if (!window.confirm(`Delete “${project.name}” and its ${tasks.length} tasks?`)) return
                    await deleteProject(project.id)
                    toast.info('Project deleted')
                    navigate('/projects')
                  },
                },
              ]}
            />
          </div>
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: 'board', label: 'Board', icon: <SquareKanban />, count: tasks.filter((t) => t.status !== 'done').length },
          { id: 'overview', label: 'Overview', icon: <LayoutDashboard /> },
        ]}
      />
      {tab === 'board' ? (
        <Board
          tasks={tasks}
          agents={agents}
          projectId={project.id}
          onOpen={(t) =>
            setParams((prev) => {
              const next = new URLSearchParams(prev)
              next.set('task', t.id)
              return next
            })
          }
        />
      ) : (
        <Overview project={project} />
      )}
      <TaskDrawer
        taskId={taskId}
        onClose={() =>
          setParams((prev) => {
            const next = new URLSearchParams(prev)
            next.delete('task')
            return next
          })
        }
      />
      {squadOpen && <SquadModal project={project} open onClose={() => setSquadOpen(false)} />}
    </div>
  )
}
