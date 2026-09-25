import { db } from '../db'
import { FriendlyError } from '../llm/errors'
import type { JSONSchema } from '../llm/types'
import { saveNewNote } from '../brain/vault-fs'
import { createEvent, createTask, findAgentByName, getAllRoles, getLeadAgent, logActivity, MINUTES_SAVED, roleFor } from '../ops'
import type { ActionPlan, Agent, Contribution, MastermindSession, PlanAction, Priority } from '../types'
import { dateFromNow, isAbortError, uid } from '../utils'
import { createStreamWriter, useLive } from '../../stores/live'
import { useSettings } from '../../stores/settings'
import { runAgent } from './runtime'

/* ------------------------------------------------------------------ */
/*  Session persistence with serialised updates                        */
/* ------------------------------------------------------------------ */

const locks = new Map<string, Promise<unknown>>()

async function mutate(id: string, fn: (s: MastermindSession) => MastermindSession): Promise<MastermindSession | undefined> {
  const prev = locks.get(id) ?? Promise.resolve()
  const next = prev.then(async () => {
    const s = await db.masterminds.get(id)
    if (!s) return undefined
    const updated = { ...fn(s), updatedAt: Date.now() }
    await db.masterminds.put(updated)
    return updated
  })
  locks.set(
    id,
    next.catch(() => undefined),
  )
  return next
}

/** A short session title from the objective, cut at a word boundary. */
function titleFrom(objective: string): string {
  const first = objective
    .trim()
    .split(/[.?!\n]/)[0]
    .trim()
  if (first.length <= 90) return first
  const cut = first.slice(0, 80)
  return `${cut.slice(0, cut.lastIndexOf(' ') > 40 ? cut.lastIndexOf(' ') : 80)}…`
}

export async function createMastermind(input: {
  title?: string
  objective: string
  context?: string
  projectId?: string
  participantIds: string[]
  depth: MastermindSession['depth']
}): Promise<MastermindSession> {
  const lead = await getLeadAgent()
  if (!lead) throw new FriendlyError('Choose a lead agent first.')
  const t = Date.now()
  const session: MastermindSession = {
    id: uid(),
    title: input.title?.trim() || titleFrom(input.objective),
    objective: input.objective.trim(),
    context: input.context?.trim() || undefined,
    projectId: input.projectId,
    participantIds: input.participantIds.filter((id) => id !== lead.id),
    leadId: lead.id,
    depth: input.depth,
    phase: 'setup',
    contributions: [],
    createdAt: t,
    updatedAt: t,
  }
  await db.masterminds.put(session)
  return session
}

export function liveKey(sessionId: string, part: string): string {
  return `mm:${sessionId}:${part}`
}

/* ------------------------------------------------------------------ */
/*  Orchestration                                                      */
/* ------------------------------------------------------------------ */

async function briefing(session: MastermindSession, agents: Agent[]): Promise<string> {
  const roles = await getAllRoles()
  const settings = useSettings.getState().settings
  const lines = [`Mastermind session: ${session.title}`, `Objective: ${session.objective}`]
  if (session.context) lines.push(`Background from ${settings.userName.split(' ')[0]}: ${session.context}`)
  if (session.projectId) {
    const p = await db.projects.get(session.projectId)
    if (p)
      lines.push(
        `Project: ${p.name}${p.client ? ` for ${p.client}` : ''}${p.dueDate ? `, due ${p.dueDate}` : ''}. ${p.description ?? ''} Goals: ${p.goals.join('; ') || 'not set'}.`,
      )
  }
  lines.push(`At the table: ${agents.map((a) => `${a.name} (${roleFor(roles, a).name})`).join(', ')}.`)
  return lines.join('\n')
}

async function runContribution(session: MastermindSession, agent: Agent, phase: Contribution['phase'], prompt: string, context: string, signal: AbortSignal) {
  const contribution: Contribution = { id: uid(), phase, agentId: agent.id, content: '', status: 'streaming' }
  await mutate(session.id, (s) => ({ ...s, contributions: [...s.contributions, contribution] }))
  const key = liveKey(session.id, contribution.id)
  useLive.getState().begin(key)
  const writer = createStreamWriter(key)
  const depth = session.depth === 'deep' ? 'deep' : session.depth === 'quick' ? 'quick' : 'balanced'
  try {
    const res = await runAgent({
      agent,
      prompt,
      context,
      mode: 'mastermind',
      toolAccess: 'read',
      webSearch: session.depth !== 'quick' && agent.tools.includes('web'),
      thinkingDepth: depth,
      maxTokens: 12000,
      signal,
      handlers: { onText: writer.text, onReset: writer.reset, onActivities: (activities) => useLive.getState().patch(key, { activities }) },
    })
    writer.flush()
    await mutate(session.id, (s) => ({
      ...s,
      contributions: s.contributions.map((c) => (c.id === contribution.id ? { ...c, content: res.text, status: 'done' } : c)),
    }))
  } catch (err) {
    writer.flush()
    const aborted = isAbortError(err)
    await mutate(session.id, (s) => ({
      ...s,
      contributions: s.contributions.map((c) =>
        c.id === contribution.id
          ? { ...c, content: writer.value || (aborted ? '_Stopped._' : err instanceof Error ? err.message : 'Failed'), status: aborted ? 'done' : 'error' }
          : c,
      ),
    }))
    if (aborted) throw err
  } finally {
    useLive.getState().end(key)
  }
}

/** Runs a few agents at a time to stay inside provider rate limits. */
async function inBatches<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn))
}

const PLAN_SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    objectives: { type: 'array', items: { type: 'string' } },
    workstreams: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, owner: { type: 'string' }, description: { type: 'string' } },
        required: ['name', 'owner', 'description'],
        additionalProperties: false,
      },
    },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          owner: { type: 'string' },
          workstream: { type: 'string' },
          dueInDays: { type: 'integer' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['title', 'description', 'owner', 'workstream', 'dueInDays', 'priority'],
        additionalProperties: false,
      },
    },
    milestones: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, dueInDays: { type: 'integer' } },
        required: ['title', 'dueInDays'],
        additionalProperties: false,
      },
    },
    risks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { risk: { type: 'string' }, impact: { type: 'string', enum: ['high', 'medium', 'low'] }, mitigation: { type: 'string' } },
        required: ['risk', 'impact', 'mitigation'],
        additionalProperties: false,
      },
    },
    kpis: {
      type: 'array',
      items: {
        type: 'object',
        properties: { metric: { type: 'string' }, target: { type: 'string' } },
        required: ['metric', 'target'],
        additionalProperties: false,
      },
    },
    nextSteps: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'summary', 'objectives', 'workstreams', 'actions', 'milestones', 'risks', 'kpis', 'nextSteps'],
  additionalProperties: false,
}

function normalisePlan(raw: unknown): ActionPlan {
  const r = (raw ?? {}) as Partial<ActionPlan> & { actions?: Partial<PlanAction>[] }
  const arr = <T>(v: T[] | undefined) => (Array.isArray(v) ? v : [])
  const prio = (p: unknown): Priority => (p === 'high' || p === 'low' ? p : 'medium')
  return {
    title: String(r.title ?? 'Action plan'),
    summary: String(r.summary ?? ''),
    objectives: arr(r.objectives).map(String),
    workstreams: arr(r.workstreams).map((w) => ({ name: String(w?.name ?? ''), owner: String(w?.owner ?? ''), description: String(w?.description ?? '') })),
    actions: arr(r.actions).map((a) => ({
      id: uid(),
      title: String(a?.title ?? 'Action'),
      description: String(a?.description ?? ''),
      owner: String(a?.owner ?? ''),
      workstream: String(a?.workstream ?? ''),
      dueInDays: Math.max(0, Math.round(Number(a?.dueInDays ?? 7)) || 0),
      priority: prio(a?.priority),
    })),
    milestones: arr(r.milestones).map((m) => ({ title: String(m?.title ?? ''), dueInDays: Math.max(0, Math.round(Number(m?.dueInDays ?? 14)) || 0) })),
    risks: arr(r.risks).map((k) => ({ risk: String(k?.risk ?? ''), impact: prio(k?.impact), mitigation: String(k?.mitigation ?? '') })),
    kpis: arr(r.kpis).map((k) => ({ metric: String(k?.metric ?? ''), target: String(k?.target ?? '') })),
    nextSteps: arr(r.nextSteps).map(String),
  }
}

function demoPlan(session: MastermindSession, agents: Agent[], user: string): ActionPlan {
  const owners = [user, ...agents.map((a) => a.name)]
  const o = (i: number) => owners[i % owners.length]
  const topic = session.title
  return {
    title: `${topic}: action plan`,
    summary: `A focused, phased plan to deliver “${session.objective}”. We lead with one sharp idea, build proof early and keep the budget flexible for what works.`,
    objectives: ['Land one clear, ownable idea', 'Earn attention before paying for it', 'Prove results within six weeks'],
    workstreams: [
      { name: 'Strategy & insight', owner: o(1), description: 'Sharpen the audience insight and the core message.' },
      { name: 'Creative & content', owner: o(2), description: 'Develop the idea, assets and copy.' },
      { name: 'Media & partners', owner: o(3), description: 'Secure coverage, partners and creators.' },
    ],
    actions: [
      ['Agree objective, budget and success measures', 0, 1, 'high', 'Strategy & insight'],
      ['Audience and competitor snapshot', 1, 3, 'high', 'Strategy & insight'],
      ['Three creative routes for review', 2, 5, 'high', 'Creative & content'],
      ['Pick the lead idea with the team', 0, 7, 'high', 'Creative & content'],
      ['Draft press materials and key messages', 3, 10, 'medium', 'Media & partners'],
      ['Target media and creator list', 3, 10, 'medium', 'Media & partners'],
      ['Legal and compliance check', 4, 12, 'medium', 'Strategy & insight'],
      ['Launch and first results readout', 0, 21, 'high', 'Media & partners'],
    ].map(([title, owner, due, priority, ws]) => ({
      id: uid(),
      title: String(title),
      description: '',
      owner: o(Number(owner)),
      workstream: String(ws),
      dueInDays: Number(due),
      priority: priority as Priority,
    })),
    milestones: [
      { title: 'Strategy signed off', dueInDays: 5 },
      { title: 'Creative approved', dueInDays: 10 },
      { title: 'Launch', dueInDays: 21 },
      { title: 'Results review', dueInDays: 42 },
    ],
    risks: [
      { risk: 'Idea feels too similar to competitors', impact: 'high', mitigation: 'Test routes against the competitor snapshot before choosing.' },
      { risk: 'Approvals slow the timeline', impact: 'medium', mitigation: 'Agree approvers and turnaround times at kickoff.' },
      { risk: 'Budget spread too thin', impact: 'medium', mitigation: 'Fund one hero moment properly, then scale what works.' },
    ],
    kpis: [
      { metric: 'Quality coverage', target: '25+ pieces in target titles' },
      { metric: 'Share of voice', target: '+10% vs. main competitor' },
      { metric: 'Website visits from earned media', target: '+30% during campaign' },
    ],
    nextSteps: ['Confirm the objective and budget', 'Book the creative review', 'Brief the media team'],
  }
}

export async function runMastermind(sessionId: string): Promise<void> {
  const session = await db.masterminds.get(sessionId)
  if (!session) return
  const controller = new AbortController()
  useLive.getState().setRunning(sessionId, controller)
  const signal = controller.signal
  const settings = useSettings.getState().settings
  const user = settings.userName.split(' ')[0]
  try {
    const lead = (await db.agents.get(session.leadId)) ?? (await getLeadAgent())!
    const agents = (await db.agents.bulkGet(session.participantIds)).filter((a): a is Agent => !!a)
    if (!agents.length) throw new FriendlyError('Add at least one specialist to the mastermind.')
    const context = await briefing(session, [lead, ...agents])

    // Phase 1 – opening positions
    await mutate(sessionId, (s) => ({ ...s, phase: 'opening', error: undefined }))
    await inBatches(agents, 3, (agent) =>
      runContribution(
        session,
        agent,
        'opening',
        `Give your opening position on the objective from your expertise as ${agent.name}. Cover:\n- your key insight or angle\n- your top three specific, actionable recommendations\n- the biggest risk or blind spot you see\nKeep it to 150–250 words with short bullets.`,
        context,
        signal,
      ),
    )

    // Phase 2 – challenge and build
    if (session.depth !== 'quick') {
      await mutate(sessionId, (s) => ({ ...s, phase: 'challenge' }))
      const openings = (await db.masterminds.get(sessionId))!.contributions.filter((c) => c.phase === 'opening' && c.status === 'done')
      const table = openings.map((c) => `### ${agents.find((a) => a.id === c.agentId)?.name ?? 'Teammate'}\n${c.content}`).join('\n\n')
      await inBatches(agents, 3, (agent) =>
        runContribution(
          session,
          agent,
          'challenge',
          `Here are everyone’s opening positions:\n\n${table}\n\nNow respond as ${agent.name}. Where do you agree or disagree with colleagues (name them)? What is missing? What would you change? Finish with your refined top recommendation. Keep it to 120–220 words.`,
          context,
          signal,
        ),
      )
    }

    const done = (await db.masterminds.get(sessionId))!.contributions.filter((c) => c.status === 'done')
    const transcript = done
      .map((c) => `### ${agents.find((a) => a.id === c.agentId)?.name ?? 'Teammate'} (${c.phase === 'opening' ? 'opening position' : 'response'})\n${c.content}`)
      .join('\n\n')

    // Phase 3 – synthesis by the lead
    await mutate(sessionId, (s) => ({ ...s, phase: 'synthesis' }))
    const synthKey = liveKey(sessionId, 'synthesis')
    useLive.getState().begin(synthKey)
    const writer = createStreamWriter(synthKey)
    let synthesis = ''
    try {
      const res = await runAgent({
        agent: lead,
        prompt: `You are chairing this mastermind. Here is the full discussion:\n\n${transcript}\n\nSynthesise it into one recommended strategy for ${user} using these sections:\n## The recommendation\n(two or three sentences)\n## Key decisions\n## How the team’s views fit together\n(agreements, trade-offs, what we are deliberately not doing)\n## Open questions for ${user}\nKeep it to 250–400 words.`,
        context,
        mode: 'mastermind',
        toolAccess: 'none',
        webSearch: false,
        thinkingDepth: session.depth === 'quick' ? 'balanced' : 'deep',
        maxTokens: 16000,
        signal,
        handlers: { onText: writer.text, onReset: writer.reset },
      })
      synthesis = res.text
    } finally {
      writer.flush()
      useLive.getState().end(synthKey)
    }
    await mutate(sessionId, (s) => ({ ...s, synthesis, phase: 'plan' }))

    // Phase 4 – structured action plan
    const owners = [user, ...agents.map((a) => a.name), lead.name]
    const planRes = await runAgent({
      agent: lead,
      prompt: `Turn the agreed strategy into a practical action plan.\n\nStrategy:\n${synthesis}\n\nRules:\n- Owners must be one of: ${owners.join(', ')} (use "${user}" for tasks only ${user} can do).\n- Give due dates as dueInDays counted from today.\n- 8–16 actions, 3–6 milestones, 3–6 risks, 3–5 KPIs and 3–5 next steps for the next 48 hours.\n- Keep every item specific and short.`,
      context,
      mode: 'mastermind',
      toolAccess: 'none',
      webSearch: false,
      thinkingDepth: 'balanced',
      maxTokens: 16000,
      json: { name: 'action_plan', schema: PLAN_SCHEMA },
      demo: { json: () => demoPlan(session, agents, user) },
      signal,
    })
    const plan = normalisePlan(planRes.json)
    await mutate(sessionId, (s) => ({ ...s, plan, phase: 'done' }))
    void logActivity('plan', `Mastermind “${session.title}” produced an action plan`, {
      agentId: lead.id,
      minutesSaved: planRes.demo ? 0 : MINUTES_SAVED.plan,
      link: `/mastermind/${sessionId}`,
    })
  } catch (err) {
    if (isAbortError(err)) await mutate(sessionId, (s) => ({ ...s, phase: s.plan ? 'done' : 'error', error: s.plan ? undefined : 'Stopped before finishing.' }))
    else {
      await mutate(sessionId, (s) => ({
        ...s,
        phase: 'error',
        error: err instanceof FriendlyError ? `${err.message}${err.hint ? ` ${err.hint}` : ''}` : err instanceof Error ? err.message : 'Something went wrong',
      }))
    }
  } finally {
    useLive.getState().setRunning(sessionId, null)
  }
}

export function stopMastermind(sessionId: string) {
  useLive.getState().stop(sessionId)
}

/** Clears a session's discussion and runs it again from the top. */
export async function restartMastermind(sessionId: string): Promise<void> {
  await mutate(sessionId, (s) => ({ ...s, contributions: [], synthesis: undefined, plan: undefined, phase: 'setup', error: undefined, createdAt: Date.now() }))
  await runMastermind(sessionId)
}

export async function deleteMastermind(sessionId: string): Promise<void> {
  stopMastermind(sessionId)
  await db.masterminds.delete(sessionId)
}

/** The calendar date an action or milestone falls on, counted from when the plan was made. */
export function planDate(session: MastermindSession, dueInDays: number): string {
  return dateFromNow(dueInDays, new Date(session.createdAt))
}

/* ------------------------------------------------------------------ */
/*  Using the plan                                                     */
/* ------------------------------------------------------------------ */

export async function pushActionsToBoard(sessionId: string, projectId: string | undefined, actionIds?: string[]): Promise<number> {
  const session = await db.masterminds.get(sessionId)
  if (!session?.plan) return 0
  const settings = useSettings.getState().settings
  const user = settings.userName.split(' ')[0].toLowerCase()
  let created = 0
  const actions = [...session.plan.actions]
  for (const a of actions) {
    if (a.taskId) continue
    if (actionIds && !actionIds.includes(a.id)) continue
    const owner = a.owner.toLowerCase() === user || a.owner.toLowerCase() === 'me' ? undefined : await findAgentByName(a.owner)
    const task = await createTask({
      title: a.title,
      description: a.description || undefined,
      projectId,
      dueDate: dateFromNow(a.dueInDays, new Date(session.createdAt)),
      priority: a.priority,
      assigneeId: owner?.id ?? 'me',
      source: `Mastermind: ${session.title}`,
    })
    a.taskId = task.id
    created++
  }
  await mutate(sessionId, (s) => ({ ...s, plan: s.plan ? { ...s.plan, actions } : s.plan, projectId: s.projectId ?? projectId }))
  void logActivity('task', `${created} actions added to the board from “${session.title}”`, { minutesSaved: created * 2 })
  return created
}

export async function milestonesToCalendar(sessionId: string): Promise<number> {
  const session = await db.masterminds.get(sessionId)
  if (!session?.plan) return 0
  for (const m of session.plan.milestones) {
    const date = dateFromNow(m.dueInDays, new Date(session.createdAt))
    await createEvent({
      title: `Milestone: ${m.title}`,
      start: new Date(`${date}T00:00:00`).toISOString(),
      end: new Date(`${date}T23:59:00`).toISOString(),
      allDay: true,
      projectId: session.projectId,
      color: '#f4c95d',
      description: `From the mastermind “${session.title}”.`,
    })
  }
  return session.plan.milestones.length
}

export async function planToMarkdown(session: MastermindSession): Promise<string> {
  const plan = session.plan
  if (!plan) return ''
  const agents = await db.agents.toArray()
  const roles = await getAllRoles()
  const participants = session.participantIds.map((id) => agents.find((a) => a.id === id)).filter((a): a is Agent => !!a)
  const lines = [
    `---\ntags: [plan, mastermind]\ncreated: ${new Date(session.createdAt).toISOString().slice(0, 10)}\n---`,
    `# ${plan.title}`,
    `> ${session.objective}`,
    `**Team:** ${participants.map((a) => `${a.name} (${roleFor(roles, a).name})`).join(', ')}`,
    `## Summary\n${plan.summary}`,
    `## Objectives\n${plan.objectives.map((o) => `- ${o}`).join('\n')}`,
    `## Workstreams\n${plan.workstreams.map((w) => `- **${w.name}** (${w.owner}): ${w.description}`).join('\n')}`,
    `## Actions\n${plan.actions.map((a) => `- [ ] ${a.title} · ${a.owner} · due ${dateFromNow(a.dueInDays, new Date(session.createdAt))} · ${a.priority}`).join('\n')}`,
    `## Milestones\n${plan.milestones.map((m) => `- ${dateFromNow(m.dueInDays, new Date(session.createdAt))}: ${m.title}`).join('\n')}`,
    `## Risks\n${plan.risks.map((r) => `- **${r.risk}** (${r.impact}): ${r.mitigation}`).join('\n')}`,
    `## KPIs\n${plan.kpis.map((k) => `- ${k.metric}: ${k.target}`).join('\n')}`,
    `## Next 48 hours\n${plan.nextSteps.map((n) => `- ${n}`).join('\n')}`,
  ]
  if (session.synthesis) lines.push(`## Strategy\n${session.synthesis}`)
  return lines.join('\n\n')
}

export async function savePlanToBrain(sessionId: string): Promise<string | undefined> {
  const session = await db.masterminds.get(sessionId)
  if (!session?.plan) return undefined
  const settings = useSettings.getState().settings
  const res = await saveNewNote(`${settings.brain.writeFolder}/Plans`, session.plan.title, await planToMarkdown(session))
  return res.path
}
