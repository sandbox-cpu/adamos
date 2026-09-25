import { db } from './db'
import { ROLE_BANK } from './agents/roles'
import type { Agent, CalEvent, LogEntry, LogKind, Priority, Project, ProjectStatus, Role, Task, TaskStatus } from './types'
import { uid } from './utils'

/* ------------------------------------------------------------------ */
/*  Roles & agents                                                     */
/* ------------------------------------------------------------------ */

export async function getAllRoles(): Promise<Role[]> {
  const custom = await db.roles.toArray()
  return [...ROLE_BANK, ...custom]
}

export function roleFor(roles: Role[], agent: Agent): Role {
  return roles.find((r) => r.id === agent.roleId) ?? ROLE_BANK[0]
}

export async function getLeadAgent(): Promise<Agent | undefined> {
  const all = await db.agents.toArray()
  return all.find((a) => a.isLead) ?? all.find((a) => a.status === 'active')
}

export async function findAgentByName(name: string): Promise<Agent | undefined> {
  const n = name.trim().toLowerCase().replace(/^@/, '')
  const all = await db.agents.toArray()
  return (
    all.find((a) => a.name.toLowerCase() === n) ??
    all.find((a) => a.id === n) ??
    all.find((a) => n.startsWith(a.name.toLowerCase())) ??
    all.find((a) => a.name.toLowerCase().startsWith(n))
  )
}

/* ------------------------------------------------------------------ */
/*  Projects                                                           */
/* ------------------------------------------------------------------ */

const PROJECT_COLORS = ['#8b6cff', '#22d3ee', '#f59e0b', '#f472b6', '#34d399', '#60a5fa', '#fb923c', '#a78bfa', '#f87171', '#2dd4bf']

export async function findProject(nameOrId: string): Promise<Project | undefined> {
  const q = nameOrId.trim().toLowerCase()
  if (!q) return undefined
  const direct = await db.projects.get(nameOrId)
  if (direct) return direct
  const all = await db.projects.toArray()
  return (
    all.find((p) => p.name.toLowerCase() === q) ??
    all.find((p) => `${p.client ?? ''} ${p.name}`.toLowerCase().includes(q)) ??
    all.find((p) => q.includes(p.name.toLowerCase())) ??
    all.find((p) => !!p.client && q.includes(p.client.toLowerCase()))
  )
}

export interface NewProject {
  name: string
  client?: string
  description?: string
  dueDate?: string
  status?: ProjectStatus
  priority?: Priority
  squad?: string[]
  emoji?: string
}

export async function createProject(input: NewProject): Promise<Project> {
  const count = await db.projects.count()
  const t = Date.now()
  const project: Project = {
    id: uid(),
    name: input.name.trim() || 'Untitled project',
    client: input.client?.trim() || undefined,
    status: input.status ?? 'active',
    priority: input.priority ?? 'medium',
    color: PROJECT_COLORS[count % PROJECT_COLORS.length],
    emoji: input.emoji,
    description: input.description?.trim() || undefined,
    goals: [],
    startDate: new Date().toISOString().slice(0, 10),
    dueDate: input.dueDate,
    squad: input.squad ?? [],
    notes: [],
    createdAt: t,
    updatedAt: t,
  }
  await db.projects.put(project)
  return project
}

export async function updateProject(id: string, patch: Partial<Project>): Promise<void> {
  await db.projects.update(id, { ...patch, updatedAt: Date.now() })
}

export async function deleteProject(id: string): Promise<void> {
  await db.transaction('rw', db.projects, db.tasks, async () => {
    await db.tasks.where('projectId').equals(id).delete()
    await db.projects.delete(id)
  })
}

/* ------------------------------------------------------------------ */
/*  Tasks                                                              */
/* ------------------------------------------------------------------ */

export interface NewTask {
  title: string
  projectId?: string
  description?: string
  dueDate?: string
  priority?: Priority
  assigneeId?: string
  status?: TaskStatus
  source?: string
}

export async function createTask(input: NewTask): Promise<Task> {
  const t = Date.now()
  const last = await db.tasks.orderBy('updatedAt').last()
  const task: Task = {
    id: uid(),
    projectId: input.projectId,
    title: input.title.trim() || 'Untitled task',
    description: input.description?.trim() || undefined,
    status: input.status ?? 'todo',
    priority: input.priority ?? 'medium',
    dueDate: input.dueDate,
    assigneeId: input.assigneeId ?? 'me',
    order: (last?.order ?? 0) + 1,
    checklist: [],
    source: input.source,
    createdAt: t,
    updatedAt: t,
  }
  await db.tasks.put(task)
  if (input.projectId) await db.projects.update(input.projectId, { updatedAt: t })
  return task
}

export async function updateTask(id: string, patch: Partial<Task>): Promise<void> {
  const next: Partial<Task> = { ...patch, updatedAt: Date.now() }
  if (patch.status === 'done') next.completedAt = Date.now()
  else if (patch.status) next.completedAt = undefined
  await db.tasks.update(id, next)
}

export async function findTask(titleOrId: string): Promise<Task | undefined> {
  const direct = await db.tasks.get(titleOrId)
  if (direct) return direct
  const q = titleOrId.trim().toLowerCase()
  const all = await db.tasks.toArray()
  return all.find((t) => t.title.toLowerCase() === q) ?? all.find((t) => t.title.toLowerCase().includes(q)) ?? all.find((t) => q.includes(t.title.toLowerCase()))
}

/* ------------------------------------------------------------------ */
/*  Calendar                                                           */
/* ------------------------------------------------------------------ */

export async function createEvent(input: Omit<CalEvent, 'id' | 'source'> & { source?: CalEvent['source'] }): Promise<CalEvent> {
  const event: CalEvent = { id: uid(), source: 'local', ...input }
  await db.events.put(event)
  return event
}

export async function eventsBetween(start: Date, end: Date): Promise<CalEvent[]> {
  const sources = await db.calendars.toArray()
  const disabled = new Set(sources.filter((s) => !s.enabled).map((s) => s.id))
  const all = await db.events.where('start').below(end.toISOString()).toArray()
  return all.filter((e) => new Date(e.end).getTime() > start.getTime() && !(e.calendarId && disabled.has(e.calendarId))).sort((a, b) => a.start.localeCompare(b.start))
}

/* ------------------------------------------------------------------ */
/*  Activity log                                                       */
/* ------------------------------------------------------------------ */

export async function logActivity(kind: LogKind, text: string, opts: { agentId?: string; minutesSaved?: number; link?: string } = {}): Promise<void> {
  const entry: LogEntry = { id: uid(), at: Date.now(), kind, text, ...opts }
  await db.log.put(entry)
}

/** Rough, deliberately conservative estimates of time an agent saved. */
export const MINUTES_SAVED: Record<LogKind, number> = {
  chat: 4,
  task: 20,
  research: 75,
  deck: 150,
  site: 120,
  plan: 90,
  content: 35,
  brief: 15,
  meeting: 20,
  delegation: 15,
  note: 5,
  system: 0,
}
