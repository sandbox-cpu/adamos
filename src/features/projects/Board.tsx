import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CalendarClock, CheckSquare, Plus, Sparkles } from 'lucide-react'
import { createTask } from '../../lib/ops'
import { moveTask, taskLiveKey } from '../../lib/projects'
import type { Agent, Project, Task, TaskStatus } from '../../lib/types'
import { cn, dueLabel } from '../../lib/utils'
import { useLive } from '../../stores/live'
import { useSettings } from '../../stores/settings'
import { AgentAvatar, UserAvatar } from '../../components/agents/AgentAvatar'

export const COLUMNS: { id: TaskStatus; label: string; color: string; hint: string }[] = [
  { id: 'todo', label: 'To do', color: '#94a3b8', hint: 'Nothing here yet' },
  { id: 'doing', label: 'In progress', color: '#60a5fa', hint: 'Drag a task here when it starts' },
  { id: 'review', label: 'For review', color: '#f4c95d', hint: 'Agent work waiting for you' },
  { id: 'done', label: 'Done', color: '#34d399', hint: 'Finished work lands here' },
]

const PRIORITY_BAR: Record<Task['priority'], string> = { high: '#f87171', medium: '#fbbf24', low: 'transparent' }

function TaskCard({ task, agents, project, onOpen, overlay }: { task: Task; agents: Agent[]; project?: Project; onOpen?: () => void; overlay?: boolean }) {
  const userName = useSettings((s) => s.settings.userName)
  const working = useLive((s) => !!s.running[taskLiveKey(task.id)])
  const agent = task.assigneeId && task.assigneeId !== 'me' ? agents.find((a) => a.id === task.assigneeId) : undefined
  const due = task.status === 'done' ? null : dueLabel(task.dueDate)
  const checked = task.checklist.filter((c) => c.done).length
  return (
    <div
      onClick={onOpen}
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-850/90 p-3.5 transition hover:border-white/[0.15]',
        overlay && 'rotate-[1.5deg] border-white/20 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.9)]',
        task.status === 'done' && 'opacity-70',
      )}
    >
      <span className="absolute inset-y-3 left-0 w-[3px] rounded-r-full" style={{ background: PRIORITY_BAR[task.priority] }} />
      {project && (
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-muted">
          <span className="size-1.5 rounded-full" style={{ background: project.color }} />
          <span className="truncate">{project.name}</span>
        </div>
      )}
      <div className={cn('text-[13.5px] leading-snug font-medium text-fg', task.status === 'done' && 'line-through decoration-white/30')}>{task.title}</div>
      {working && (
        <div className="mt-2 flex items-center gap-1.5 text-[11.5px] text-warn">
          <span className="size-1.5 animate-pulse rounded-full bg-warn" /> {agent?.name ?? 'Agent'} is working on it…
        </div>
      )}
      {!working && task.output && task.status === 'review' && (
        <div className="mt-2 flex items-center gap-1.5 text-[11.5px] text-[color-mix(in_oklab,var(--accent)_70%,white)]">
          <Sparkles className="size-3" /> Work ready to review
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 text-[11.5px] text-muted">
          {due && (
            <span className={cn('flex items-center gap-1', due.tone === 'bad' ? 'text-bad' : due.tone === 'warn' ? 'text-warn' : '')}>
              <CalendarClock className="size-3.5" />
              {due.text}
            </span>
          )}
          {task.checklist.length > 0 && (
            <span className="flex items-center gap-1">
              <CheckSquare className="size-3.5" />
              {checked}/{task.checklist.length}
            </span>
          )}
        </div>
        {agent ? <AgentAvatar agent={agent} size="xs" active={working} /> : <UserAvatar name={userName} size={22} />}
      </div>
    </div>
  )
}

function SortableCard(props: { task: Task; agents: Agent[]; project?: Project; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.task.id, data: { column: props.task.status } })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && 'opacity-30')} {...attributes} {...listeners}>
      <TaskCard {...props} />
    </div>
  )
}

function Column({
  column,
  tasks,
  agents,
  projects,
  onOpen,
  onAdd,
}: {
  column: (typeof COLUMNS)[number]
  tasks: Task[]
  agents: Agent[]
  projects?: Project[]
  onOpen: (t: Task) => void
  onAdd: (title: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${column.id}`, data: { column: column.id } })
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const submit = () => {
    if (title.trim()) onAdd(title.trim())
    setTitle('')
  }
  return (
    <div
      className={cn(
        'flex min-h-[200px] w-[284px] shrink-0 flex-col rounded-3xl border border-white/[0.05] bg-white/[0.02] p-2.5 transition lg:w-auto lg:min-w-0 lg:flex-1',
        isOver && 'border-white/[0.14] bg-white/[0.04]',
      )}
    >
      <div className="flex items-center justify-between px-2 pt-1 pb-3">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: column.color, boxShadow: `0 0 10px ${column.color}` }} />
          <span className="text-[13px] font-semibold">{column.label}</span>
          <span className="rounded-full bg-white/[0.06] px-1.5 text-[11px] text-muted">{tasks.length}</span>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="grid size-7 place-items-center rounded-lg text-muted transition hover:bg-white/[0.07] hover:text-fg"
          aria-label={`Add to ${column.label}`}
        >
          <Plus className="size-4" />
        </button>
      </div>
      <div ref={setNodeRef} className="flex flex-1 flex-col gap-2">
        {adding && (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') {
                setAdding(false)
                setTitle('')
              }
            }}
            onBlur={() => {
              submit()
              setAdding(false)
            }}
            placeholder="What needs doing?"
            className="rounded-2xl border border-[color-mix(in_oklab,var(--accent)_40%,transparent)] bg-ink-850 px-3.5 py-3 text-[13.5px] outline-none placeholder:text-faint"
          />
        )}
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => (
            <SortableCard key={t.id} task={t} agents={agents} project={projects?.find((p) => p.id === t.projectId)} onOpen={() => onOpen(t)} />
          ))}
        </SortableContext>
        {tasks.length === 0 && !adding && (
          <div className="grid flex-1 place-items-center rounded-2xl border border-dashed border-white/[0.06] px-3 py-6 text-center text-[12px] text-faint">{column.hint}</div>
        )}
      </div>
    </div>
  )
}

type Grouped = Record<TaskStatus, Task[]>

function group(tasks: Task[]): Grouped {
  const out: Grouped = { todo: [], doing: [], review: [], done: [] }
  for (const t of tasks) out[t.status].push(t)
  for (const k of Object.keys(out) as TaskStatus[]) out[k].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
  return out
}

/** A drag-and-drop task board. Pass `projects` to show every project's tasks with a label on each card. */
export function Board({ tasks, agents, projects, projectId, onOpen }: { tasks: Task[]; agents: Agent[]; projects?: Project[]; projectId?: string; onOpen: (t: Task) => void }) {
  const [columns, setColumns] = useState<Grouped>(() => group(tasks))
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  // Follow the database, except mid-drag and just after a drop while the move is being saved.
  const settling = useRef(false)
  useEffect(() => {
    if (activeId) return
    if (settling.current) {
      settling.current = false
      return
    }
    setColumns(group(tasks))
  }, [tasks, activeId])

  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
  const columnOf = (id: string): TaskStatus | undefined => {
    if (id.startsWith('col:')) return id.slice(4) as TaskStatus
    return (Object.keys(columns) as TaskStatus[]).find((k) => columns[k].some((t) => t.id === id))
  }

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id))

  // Crossing into another column moves the card there straight away.
  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e
    if (!over) return
    const from = columnOf(String(active.id))
    const to = columnOf(String(over.id))
    if (!from || !to || from === to) return
    setColumns((prev) => {
      const moving = prev[from].find((t) => t.id === active.id)
      if (!moving) return prev
      const target = prev[to].filter((t) => t.id !== active.id)
      const overIndex = target.findIndex((t) => t.id === over.id)
      const index = overIndex >= 0 ? overIndex : target.length
      return { ...prev, [from]: prev[from].filter((t) => t.id !== active.id), [to]: [...target.slice(0, index), { ...moving, status: to }, ...target.slice(index)] }
    })
  }

  // Dropping settles the order within the column and saves it.
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    const id = String(active.id)
    const to = columnOf(id)
    if (!over || !to) {
      setActiveId(null)
      return
    }
    let list = columns[to]
    const from = list.findIndex((t) => t.id === id)
    const overIndex = String(over.id).startsWith('col:') ? list.length - 1 : list.findIndex((t) => t.id === over.id)
    if (from >= 0 && overIndex >= 0 && from !== overIndex) list = arrayMove(list, from, overIndex)
    const index = list.findIndex((t) => t.id === id)
    settling.current = true
    setColumns((prev) => ({ ...prev, [to]: list }))
    setActiveId(null)
    void moveTask(id, to, list[index + 1]?.id)
  }

  const active = activeId ? byId.get(activeId) : undefined

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
        {COLUMNS.map((c) => (
          <Column
            key={c.id}
            column={c}
            tasks={columns[c.id]}
            agents={agents}
            projects={projects}
            onOpen={onOpen}
            onAdd={(title) => void createTask({ title, projectId, status: c.id })}
          />
        ))}
      </div>
      <DragOverlay>{active ? <TaskCard task={active} agents={agents} project={projects?.find((p) => p.id === active.projectId)} overlay /> : null}</DragOverlay>
    </DndContext>
  )
}
