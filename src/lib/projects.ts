import { db } from './db'
import { resolveProfile, runLLM } from './llm'
import type { JSONSchema } from './llm/types'
import { createProject, createTask, findAgentByName, getAllRoles, logActivity, MINUTES_SAVED, updateTask } from './ops'
import type { Agent, Priority, Project, TaskStatus } from './types'
import { dateFromNow, isAbortError, truncate } from './utils'
import { createStreamWriter, useLive } from '../stores/live'
import { trackJob } from '../stores/jobs'
import { useSettings } from '../stores/settings'
import { runAgent } from './agents/runtime'

/* ------------------------------------------------------------------ */
/*  Board ordering                                                     */
/* ------------------------------------------------------------------ */

/** Moves a task to a column, placing it before another card (or at the end). */
export async function moveTask(taskId: string, status: TaskStatus, beforeId?: string): Promise<void> {
  const task = await db.tasks.get(taskId)
  if (!task) return
  const column = (await db.tasks.filter((t) => t.status === status && t.projectId === task.projectId && t.id !== taskId).toArray()).sort((a, b) => a.order - b.order)
  const index = beforeId ? column.findIndex((t) => t.id === beforeId) : -1
  const ordered = index >= 0 ? [...column.slice(0, index), task, ...column.slice(index)] : [...column, task]
  await db.transaction('rw', db.tasks, async () => {
    for (const [i, t] of ordered.entries()) {
      if (t.id === taskId) await updateTask(t.id, { status, order: i })
      else if (t.order !== i) await db.tasks.update(t.id, { order: i })
    }
  })
}

/* ------------------------------------------------------------------ */
/*  Agents doing tasks                                                 */
/* ------------------------------------------------------------------ */

export function taskLiveKey(taskId: string): string {
  return `task:${taskId}`
}

/** Hands a task to an agent. They do the work, attach it to the task and move it to review. */
export async function runTaskWithAgent(taskId: string, agentId?: string): Promise<void> {
  const task = await db.tasks.get(taskId)
  if (!task) return
  const agent = (agentId ? await db.agents.get(agentId) : undefined) ?? (task.assigneeId && task.assigneeId !== 'me' ? await db.agents.get(task.assigneeId) : undefined)
  if (!agent) return
  const project = task.projectId ? await db.projects.get(task.projectId) : undefined
  const user = useSettings.getState().settings.userName.split(' ')[0]
  const key = taskLiveKey(taskId)
  const controller = new AbortController()
  const live = useLive.getState()
  live.setRunning(key, controller)
  live.begin(key)
  const writer = createStreamWriter(key)
  await updateTask(taskId, { assigneeId: agent.id, status: 'doing' })

  const context = [
    project
      ? `Project: ${project.name}${project.client ? ` for ${project.client}` : ''}. ${project.description ?? ''}${project.goals.length ? ` Goals: ${project.goals.join('; ')}.` : ''}`
      : '',
    task.description ? `Task notes from ${user}: ${task.description}` : '',
    task.checklist.length ? `Checklist:\n${task.checklist.map((c) => `- [${c.done ? 'x' : ' '}] ${c.text}`).join('\n')}` : '',
    task.dueDate ? `Due: ${task.dueDate}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  try {
    await trackJob(
      {
        id: `task-${taskId}`,
        kind: 'task',
        title: truncate(task.title, 60),
        stage: `${agent.name} is on it`,
        agentId: agent.id,
        link: project ? `/projects/${project.id}` : '/projects',
      },
      async () => {
        const res = await runAgent({
          agent,
          mode: 'task',
          prompt: `${user} has assigned you this task: "${task.title}".\n\nDo the work now and deliver the finished result, ready for ${user} to review and use. If it is a writing task, write it in full. If it needs research, research it and cite sources. If something only ${user} can do, prepare everything they need and say exactly what is left for them. End with one line starting "Next:" suggesting the follow-up.`,
          context,
          toolAccess: 'read',
          maxTokens: 16000,
          signal: controller.signal,
          handlers: { onText: writer.text, onReset: writer.reset, onActivities: (activities) => useLive.getState().patch(key, { activities }) },
        })
        writer.flush()
        await updateTask(taskId, { output: res.text, status: 'review' })
        void logActivity('task', `${agent.name} completed “${truncate(task.title, 60)}” for review`, {
          agentId: agent.id,
          minutesSaved: res.demo ? 0 : MINUTES_SAVED.task,
          link: project ? `/projects/${project.id}` : '/projects',
        })
      },
    )
  } catch (err) {
    writer.flush()
    await updateTask(taskId, { status: isAbortError(err) ? 'todo' : task.status })
    if (!isAbortError(err)) throw err
  } finally {
    useLive.getState().end(key)
    useLive.getState().setRunning(key, null)
  }
}

export function stopTask(taskId: string): void {
  useLive.getState().stop(taskLiveKey(taskId))
}

/* ------------------------------------------------------------------ */
/*  Projects drafted from a description                                */
/* ------------------------------------------------------------------ */

export interface ProjectDraft {
  name: string
  client: string
  emoji: string
  description: string
  goals: string[]
  dueInDays: number
  squad: string[]
  tasks: { title: string; owner: string; dueInDays: number; priority: Priority }[]
}

const DRAFT_SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Short project name, two to five words' },
    client: { type: 'string', description: 'Client or organisation, or an empty string' },
    emoji: { type: 'string', description: 'One emoji that suits the project' },
    description: { type: 'string', description: 'Two sentences' },
    goals: { type: 'array', items: { type: 'string' } },
    dueInDays: { type: 'integer' },
    squad: { type: 'array', items: { type: 'string' }, description: 'Names of the agents best placed to help' },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          owner: { type: 'string' },
          dueInDays: { type: 'integer' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['title', 'owner', 'dueInDays', 'priority'],
        additionalProperties: false,
      },
    },
  },
  required: ['name', 'client', 'emoji', 'description', 'goals', 'dueInDays', 'squad', 'tasks'],
  additionalProperties: false,
}

function demoDraft(idea: string, agents: Agent[], user: string): ProjectDraft {
  const clean = idea.trim().replace(/[.!?]+$/, '')
  const name = clean.split(/\s+/).slice(0, 5).join(' ')
  // Hand each starter task to whoever's role fits it best.
  const byRole = (...roleIds: string[]) => agents.find((a) => roleIds.includes(a.roleId))?.name ?? agents[0]?.name ?? user
  const research = byRole('competitor', 'research')
  const story = byRole('pr-media', 'copywriter')
  const creative = byRole('creative', 'copywriter')
  const media = byRole('pr-media', 'influencer', 'social')
  return {
    name: name.slice(0, 1).toUpperCase() + name.slice(1),
    client: '',
    emoji: '✨',
    description: `${clean.slice(0, 1).toUpperCase() + clean.slice(1)}. A focused project with clear owners and dates.`,
    goals: ['Agree what success looks like', 'Deliver on time and on budget', 'Show measurable results'],
    dueInDays: 42,
    squad: [...new Set([research, story, creative, media])].filter((n) => n !== user),
    tasks: [
      { title: 'Kick-off: confirm objectives, budget and timings', owner: user, dueInDays: 2, priority: 'high' },
      { title: 'Research the audience and competitors', owner: research, dueInDays: 5, priority: 'high' },
      { title: 'Develop the core story and key messages', owner: story, dueInDays: 9, priority: 'medium' },
      { title: 'Creative routes for review', owner: creative, dueInDays: 14, priority: 'medium' },
      { title: 'Build the media and influencer target list', owner: media, dueInDays: 16, priority: 'medium' },
      { title: 'Launch and first results readout', owner: user, dueInDays: 42, priority: 'high' },
    ],
  }
}

export async function draftProject(idea: string, signal?: AbortSignal): Promise<ProjectDraft & { demo: boolean }> {
  const settings = useSettings.getState().settings
  const user = settings.userName.split(' ')[0]
  const agents = (await db.agents.toArray()).filter((a) => a.status === 'active' && !a.isLead)
  const allRoles = await getAllRoles()
  const team = agents.map((a) => `${a.name} (${allRoles.find((r) => r.id === a.roleId)?.name ?? 'Specialist'})`).join(', ')
  const profile = await resolveProfile()
  const res = await runLLM(profile, {
    system: `You set up projects for ${settings.companyName || 'a PR agency'}. Today is ${dateFromNow(0)}. Turn the user's description into a practical project: a short name, the client if one is mentioned, a two-sentence description, three or four measurable goals, a realistic deadline in days, the two to four teammates best placed to help, and six to ten concrete first tasks. Owners must be ${user} or one of: ${team}. Write in plain, friendly English.`,
    messages: [{ role: 'user', content: idea }],
    json: { name: 'project', schema: DRAFT_SCHEMA },
    depth: 'quick',
    maxTokens: 6000,
    signal,
    demo: { json: () => demoDraft(idea, agents, user) },
  })
  const d = (res.json ?? demoDraft(idea, agents, user)) as ProjectDraft
  return { ...d, tasks: (d.tasks ?? []).slice(0, 14), goals: (d.goals ?? []).slice(0, 6), squad: d.squad ?? [], demo: !!res.demo }
}

export async function createProjectFromDraft(d: ProjectDraft, extra: { status?: Project['status'] } = {}): Promise<Project> {
  const user = useSettings.getState().settings.userName.split(' ')[0].toLowerCase()
  const squad: string[] = []
  for (const name of d.squad) {
    const a = await findAgentByName(name)
    if (a && !squad.includes(a.id)) squad.push(a.id)
  }
  const project = await createProject({
    name: d.name,
    client: d.client || undefined,
    description: d.description,
    dueDate: d.dueInDays > 0 ? dateFromNow(d.dueInDays) : undefined,
    status: extra.status ?? 'active',
    emoji: d.emoji || undefined,
    squad,
  })
  await db.projects.update(project.id, { goals: d.goals })
  for (const t of d.tasks) {
    const owner = t.owner.toLowerCase() === user || t.owner.toLowerCase() === 'me' ? undefined : await findAgentByName(t.owner)
    await createTask({
      title: t.title,
      projectId: project.id,
      dueDate: dateFromNow(Math.max(0, t.dueInDays)),
      priority: t.priority,
      assigneeId: owner?.id ?? 'me',
      source: 'Project setup',
    })
  }
  void logActivity('task', `Set up “${project.name}” with ${d.tasks.length} tasks`, { minutesSaved: 25, link: `/projects/${project.id}` })
  return project
}

/** Everything connected to a project across the OS, for its overview. */
export async function projectLinks(projectId: string) {
  const [decks, sites, research, masterminds, content, events] = await Promise.all([
    db.decks.where('projectId').equals(projectId).toArray(),
    db.sites.where('projectId').equals(projectId).toArray(),
    db.research.where('projectId').equals(projectId).toArray(),
    db.masterminds.where('projectId').equals(projectId).toArray(),
    db.content.where('projectId').equals(projectId).toArray(),
    db.events.where('projectId').equals(projectId).toArray(),
  ])
  return { decks, sites, research, masterminds, content, events }
}
