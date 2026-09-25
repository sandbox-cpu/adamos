import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlarmClock, CalendarClock, FolderKanban, FolderPlus, LayoutGrid, ListTodo, Search, SquareKanban } from 'lucide-react'
import type { Project, Task } from '../../lib/types'
import { cn, isoDate } from '../../lib/utils'
import { useAgents, useProjects, useTasks } from '../../hooks/data'
import { PageHeader } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Tabs } from '../../components/ui/bits'
import { Input } from '../../components/ui/Field'
import { ProjectCard, STATUS_META } from './ProjectCard'
import { Board } from './Board'
import { TaskDrawer } from './TaskDrawer'
import { NewProjectModal } from './NewProject'

type Tab = 'projects' | 'tasks'
type StatusFilter = Project['status'] | 'all'
type WhoFilter = 'all' | 'me' | 'agents'

const STATUS_ORDER: Project['status'][] = ['active', 'pitch', 'on_hold', 'done']

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone?: 'bad' | 'warn' }) {
  return (
    <div className="glass flex items-center gap-4 rounded-3xl px-5 py-4">
      <span className={cn('grid size-10 place-items-center rounded-2xl bg-white/[0.05] [&_svg]:size-5', tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-soft')}>
        {icon}
      </span>
      <div>
        <div className="font-display text-2xl leading-none font-semibold tracking-tight">{value}</div>
        <div className="mt-1 text-[12.5px] text-muted">{label}</div>
      </div>
    </div>
  )
}

export default function ProjectsPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const projects = useProjects()
  const tasks = useTasks()
  const agents = useAgents()
  const [tab, setTab] = useState<Tab>(params.get('view') === 'tasks' ? 'tasks' : 'projects')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [who, setWho] = useState<WhoFilter>('all')
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState<number | null>(params.has('new') ? Date.now() : null)
  const taskId = params.get('task') ?? undefined

  const today = isoDate()
  const weekAhead = isoDate(new Date(Date.now() + 7 * 86_400_000))
  const open = tasks.filter((t) => t.status !== 'done')
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today)
  const dueThisWeek = open.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= weekAhead)

  const q = query.trim().toLowerCase()
  const visible = useMemo(
    () =>
      projects
        .filter((p) => (status === 'all' ? true : p.status === status))
        .filter((p) => !q || `${p.name} ${p.client ?? ''} ${p.description ?? ''}`.toLowerCase().includes(q))
        .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')),
    [projects, status, q],
  )

  const boardTasks = useMemo(
    () =>
      tasks
        .filter((t) => (who === 'me' ? !t.assigneeId || t.assigneeId === 'me' : who === 'agents' ? !!t.assigneeId && t.assigneeId !== 'me' : true))
        .filter((t) => !q || t.title.toLowerCase().includes(q))
        .filter((t) => t.status !== 'done' || (t.completedAt ?? t.updatedAt) > Date.now() - 14 * 86_400_000),
    [tasks, who, q],
  )

  const tasksOf = (p: Project): Task[] => tasks.filter((t) => t.projectId === p.id)
  const openTask = (t: Task) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('task', t.id)
      return next
    })
  const closeTask = () =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('task')
      return next
    })

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Work"
        title="Projects"
        subtitle="Everything in flight, who’s on it and what’s next."
        actions={
          <Button variant="primary" icon={<FolderPlus />} onClick={() => setCreating(Date.now())}>
            New project
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<FolderKanban />} label="Live projects" value={projects.filter((p) => p.status === 'active').length} />
        <Stat icon={<ListTodo />} label="Open tasks" value={open.length} />
        <Stat icon={<CalendarClock />} label="Due in the next 7 days" value={dueThisWeek.length} tone={dueThisWeek.length ? 'warn' : undefined} />
        <Stat icon={<AlarmClock />} label="Overdue" value={overdue.length} tone={overdue.length ? 'bad' : undefined} />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { id: 'projects', label: 'Projects', icon: <LayoutGrid />, count: projects.length },
            { id: 'tasks', label: 'All tasks', icon: <SquareKanban />, count: open.length },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {tab === 'projects'
              ? (['all', ...STATUS_ORDER] as StatusFilter[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={cn(
                      'h-8 shrink-0 rounded-full border px-3.5 text-[12.5px] font-medium transition',
                      status === s ? 'border-transparent bg-white text-ink-950' : 'border-white/[0.08] text-muted hover:text-fg',
                    )}
                  >
                    {s === 'all' ? 'All' : STATUS_META[s].label}
                  </button>
                ))
              : (
                  [
                    ['all', 'Everyone'],
                    ['me', 'Mine'],
                    ['agents', 'Agents'],
                  ] as [WhoFilter, string][]
                ).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setWho(id)}
                    className={cn(
                      'h-8 shrink-0 rounded-full border px-3.5 text-[12.5px] font-medium transition',
                      who === id ? 'border-transparent bg-white text-ink-950' : 'border-white/[0.08] text-muted hover:text-fg',
                    )}
                  >
                    {label}
                  </button>
                ))}
          </div>
          <Input
            icon={<Search />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === 'projects' ? 'Find a project…' : 'Find a task…'}
            className="h-9 sm:w-60"
          />
        </div>
      </div>

      {tab === 'projects' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => (
            <ProjectCard key={p.id} project={p} tasks={tasksOf(p)} agents={agents} />
          ))}
          <button
            onClick={() => setCreating(Date.now())}
            className="flex min-h-[190px] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/[0.12] text-muted transition hover:border-white/[0.24] hover:text-fg"
          >
            <span className="grid size-12 place-items-center rounded-full bg-white/[0.05]">
              <FolderPlus className="size-5" />
            </span>
            <span className="text-sm font-medium">Start a project</span>
            <span className="max-w-[220px] text-center text-[12px] text-faint">Describe it in a sentence and your lead sets up the tasks.</span>
          </button>
        </div>
      ) : (
        <Board tasks={boardTasks} agents={agents} projects={projects} onOpen={openTask} />
      )}

      <TaskDrawer taskId={taskId} onClose={closeTask} />
      {creating !== null && (
        <NewProjectModal
          key={creating}
          open
          onClose={() => setCreating(null)}
          onCreated={(p) => {
            setCreating(null)
            navigate(`/projects/${p.id}`)
          }}
        />
      )}
    </div>
  )
}
