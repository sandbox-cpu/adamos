import { db } from '../db'
import { FriendlyError } from '../llm/errors'
import type { ChatTurn, JSONSchema } from '../llm/types'
import { getNote } from '../brain/search'
import { createTask, findAgentByName, getLeadAgent, logActivity, MINUTES_SAVED } from '../ops'
import type { Agent, Citation, Conversation, ConversationKind, Message, SummaryAction } from '../types'
import { dateFromNow, isAbortError, truncate, uid } from '../utils'
import { createStreamWriter, useLive } from '../../stores/live'
import { useSettings } from '../../stores/settings'
import { VaultLockedError } from '../../stores/vault'
import { runAgent, type AgentRunOptions } from './runtime'

/* ------------------------------------------------------------------ */
/*  Conversations                                                      */
/* ------------------------------------------------------------------ */

export async function startConversation(input: { kind: ConversationKind; agentIds: string[]; title?: string; topic?: string; projectId?: string }): Promise<Conversation> {
  const agents = await db.agents.bulkGet(input.agentIds)
  const names = agents.filter(Boolean).map((a) => a!.name)
  const t = Date.now()
  const conv: Conversation = {
    id: uid(),
    kind: input.kind,
    title: input.title?.trim() || (input.kind === 'group' ? input.topic?.trim() || names.join(', ') : names[0] ?? 'Chat'),
    agentIds: input.agentIds,
    topic: input.topic,
    projectId: input.projectId,
    createdAt: t,
    updatedAt: t,
  }
  await db.conversations.put(conv)
  return conv
}

/** The single long-running conversation with the lead agent. */
export async function getLeadConversation(): Promise<Conversation> {
  const lead = await getLeadAgent()
  if (!lead) throw new FriendlyError('No lead agent found.', 'Choose a lead on the Agents page.')
  const existing = (await db.conversations.where('kind').equals('lead').toArray()).sort((a, b) => b.updatedAt - a.updatedAt)[0]
  if (existing) {
    if (existing.agentIds[0] !== lead.id) await db.conversations.update(existing.id, { agentIds: [lead.id] })
    return { ...existing, agentIds: [lead.id] }
  }
  return startConversation({ kind: 'lead', agentIds: [lead.id], title: lead.name })
}

export async function deleteConversation(id: string): Promise<void> {
  await db.transaction('rw', db.conversations, db.messages, async () => {
    await db.messages.where('conversationId').equals(id).delete()
    await db.conversations.delete(id)
  })
}

async function messagesOf(conversationId: string): Promise<Message[]> {
  return db.messages.where('[conversationId+createdAt]').between([conversationId, 0], [conversationId, Infinity]).toArray()
}

async function touchConversation(id: string, preview: string) {
  await db.conversations.update(id, { updatedAt: Date.now(), preview: truncate(preview.replace(/\s+/g, ' '), 140) })
}

async function addUserMessage(conversationId: string, content: string): Promise<Message> {
  const msg: Message = { id: uid(), conversationId, role: 'user', content, status: 'done', createdAt: Date.now() }
  await db.messages.put(msg)
  await touchConversation(conversationId, content)
  return msg
}

/* ------------------------------------------------------------------ */
/*  Streaming an agent reply into a message                            */
/* ------------------------------------------------------------------ */

type StreamOptions = Omit<AgentRunOptions, 'agent' | 'handlers' | 'signal'>

export async function streamAgentMessage(conversationId: string, agent: Agent, opts: StreamOptions, signal: AbortSignal, extra: Partial<Message> = {}): Promise<Message> {
  const id = uid()
  const base: Message = { id, conversationId, role: 'agent', agentId: agent.id, content: '', status: 'streaming', createdAt: Date.now(), ...extra }
  await db.messages.put(base)
  const live = useLive.getState()
  live.begin(id)
  const writer = createStreamWriter(id)
  const citations: Citation[] = []
  const notices: string[] = []
  try {
    const result = await runAgent({
      ...opts,
      agent,
      signal,
      handlers: {
        onText: writer.text,
        onReset: writer.reset,
        onThinking: writer.thinking,
        onActivities: (activities) => useLive.getState().patch(id, { activities }),
        onCitation: (c) => {
          citations.push(c)
          useLive.getState().patch(id, { citations: [...citations] })
        },
        onNotice: (m) => {
          notices.push(m)
          useLive.getState().patch(id, { notices: [...notices] })
        },
      },
    })
    writer.flush()
    const final: Partial<Message> = {
      content: result.text,
      thinking: result.thinking || undefined,
      activities: result.activities.length ? result.activities : undefined,
      citations: result.citations.length ? result.citations : undefined,
      notices: notices.length ? notices : undefined,
      status: 'done',
      demo: result.demo || undefined,
    }
    await db.messages.update(id, final)
    await touchConversation(conversationId, result.text)
    const minutes = result.text.length > 900 ? MINUTES_SAVED.chat * 3 : MINUTES_SAVED.chat
    void logActivity('chat', `${agent.name} replied`, { agentId: agent.id, minutesSaved: result.demo ? 0 : minutes })
    return { ...base, ...final } as Message
  } catch (err) {
    writer.flush()
    const partial = writer.value
    if (isAbortError(err)) {
      const final: Partial<Message> = { content: partial || '_Stopped._', status: 'done' }
      await db.messages.update(id, final)
      return { ...base, ...final } as Message
    }
    const friendly = err instanceof FriendlyError || err instanceof VaultLockedError
    const final: Partial<Message> = {
      content: partial,
      status: 'error',
      error: friendly ? err.message : 'Something went wrong while talking to the AI.',
      hint: err instanceof FriendlyError ? err.hint : friendly ? undefined : err instanceof Error ? err.message : undefined,
    }
    await db.messages.update(id, final)
    return { ...base, ...final } as Message
  } finally {
    useLive.getState().end(id)
  }
}

function runWithController<T>(key: string, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  useLive.getState().setRunning(key, controller)
  return fn(controller.signal).finally(() => {
    if (useLive.getState().running[key] === controller) useLive.getState().setRunning(key, null)
  })
}

/* ------------------------------------------------------------------ */
/*  Direct chats                                                       */
/* ------------------------------------------------------------------ */

export interface Attachments {
  notes?: string[]
  projectId?: string
}

async function attachmentContext(att?: Attachments): Promise<string | undefined> {
  if (!att) return undefined
  const parts: string[] = []
  if (att.projectId) {
    const p = await db.projects.get(att.projectId)
    if (p) {
      const tasks = await db.tasks.where('projectId').equals(p.id).toArray()
      parts.push(
        `Project in focus: ${p.name}${p.client ? ` (client: ${p.client})` : ''}\nStatus: ${p.status}${p.dueDate ? `, due ${p.dueDate}` : ''}\n${p.description ?? ''}\nGoals: ${p.goals.join('; ') || 'not set'}\nOpen tasks: ${
          tasks.filter((t) => t.status !== 'done').map((t) => t.title).join('; ') || 'none'
        }`,
      )
    }
  }
  for (const path of att.notes ?? []) {
    const note = await getNote(path)
    if (note) parts.push(`Attached note "${note.title}" (${note.path}):\n${truncate(note.content, 8000)}`)
  }
  return parts.length ? parts.join('\n\n---\n\n') : undefined
}

function historyFor(messages: Message[], agentId: string): ChatTurn[] {
  const turns: ChatTurn[] = []
  for (const m of messages.slice(-40)) {
    if (m.status === 'error' || !m.content.trim()) continue
    if (m.role === 'user') turns.push({ role: 'user', content: m.content })
    else if (m.role === 'agent' && m.agentId === agentId) turns.push({ role: 'assistant', content: m.content })
  }
  return turns
}

export async function sendDirect(conversationId: string, text: string, att?: Attachments): Promise<void> {
  const conv = await db.conversations.get(conversationId)
  if (!conv) return
  const agent = await db.agents.get(conv.agentIds[0])
  if (!agent) return
  const history = historyFor(await messagesOf(conversationId), agent.id)
  await addUserMessage(conversationId, text)
  const context = await attachmentContext(att)
  await runWithController(conversationId, (signal) =>
    streamAgentMessage(conversationId, agent, { prompt: text, history, context, mode: conv.kind === 'lead' ? 'lead' : 'direct', latencySensitive: true }, signal),
  )
}

/** Re-runs the last agent reply in a direct chat. */
export async function regenerateLast(conversationId: string): Promise<void> {
  const conv = await db.conversations.get(conversationId)
  if (!conv) return
  const agent = await db.agents.get(conv.agentIds[0])
  if (!agent) return
  const msgs = await messagesOf(conversationId)
  const lastUser = [...msgs].reverse().find((m) => m.role === 'user')
  if (!lastUser) return
  const after = msgs.filter((m) => m.createdAt > lastUser.createdAt)
  await db.messages.bulkDelete(after.map((m) => m.id))
  const history = historyFor(
    msgs.filter((m) => m.createdAt < lastUser.createdAt),
    agent.id,
  )
  await runWithController(conversationId, (signal) =>
    streamAgentMessage(conversationId, agent, { prompt: lastUser.content, history, mode: conv.kind === 'lead' ? 'lead' : 'direct', latencySensitive: true }, signal),
  )
}

export function stopConversation(conversationId: string): void {
  useLive.getState().stop(conversationId)
}

/* ------------------------------------------------------------------ */
/*  Group huddles                                                      */
/* ------------------------------------------------------------------ */

export const MAX_GROUP = 4

async function groupTranscript(conv: Conversation, agents: Agent[]): Promise<string> {
  const settings = useSettings.getState().settings
  const user = settings.userName.split(' ')[0]
  const msgs = (await messagesOf(conv.id)).filter((m) => m.status !== 'error' && m.content.trim()).slice(-30)
  const nameOf = (m: Message) => {
    if (m.role === 'user') return user
    const a = agents.find((x) => x.id === m.agentId)
    return a ? a.name : 'Teammate'
  }
  return msgs.map((m) => `${nameOf(m)}: ${truncate(m.content, 2500)}`).join('\n\n')
}

async function participants(conv: Conversation): Promise<Agent[]> {
  const list = await db.agents.bulkGet(conv.agentIds)
  return list.filter((a): a is Agent => !!a)
}

async function groupRound(conv: Conversation, speakers: Agent[], signal: AbortSignal, followUp: boolean) {
  const settings = useSettings.getState().settings
  const user = settings.userName.split(' ')[0]
  const everyone = await participants(conv)
  for (const agent of speakers) {
    if (signal.aborted) break
    const transcript = await groupTranscript(conv, everyone)
    const others = everyone.filter((a) => a.id !== agent.id).map((a) => a.name)
    const prompt = [
      conv.topic ? `Discussion topic: ${conv.topic}` : '',
      `Participants: ${user} (who you work for), ${everyone.map((a) => a.name).join(', ')}.`,
      `Conversation so far:\n\n${transcript}`,
      followUp
        ? `${user} has asked the team to keep discussing. It is your turn, ${agent.name}. React to what ${others.join(', ')} said: build on it, challenge it or resolve disagreements. Move the conversation forward. Keep it to 60–160 words.`
        : `It is your turn, ${agent.name}. Respond to ${user}'s latest message from your area of expertise. Refer to teammates by name where useful, add something new and don't repeat others. Keep it to 60–180 words unless ${user} asked for more.`,
    ]
      .filter(Boolean)
      .join('\n\n')
    await streamAgentMessage(conv.id, agent, { prompt, mode: 'group', toolAccess: 'read', maxTokens: 8000, thinkingDepth: 'quick' }, signal)
  }
}

export async function sendGroup(conversationId: string, text: string): Promise<void> {
  const conv = await db.conversations.get(conversationId)
  if (!conv) return
  await addUserMessage(conversationId, text)
  const everyone = await participants(conv)
  const mentioned = everyone.filter((a) => new RegExp(`@${a.name}\\b`, 'i').test(text))
  const speakers = mentioned.length ? mentioned : everyone
  await runWithController(conversationId, (signal) => groupRound(conv, speakers, signal, false))
}

export async function continueGroup(conversationId: string): Promise<void> {
  const conv = await db.conversations.get(conversationId)
  if (!conv) return
  const everyone = await participants(conv)
  await runWithController(conversationId, (signal) => groupRound(conv, everyone, signal, true))
}

const SUMMARY_SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'Three to five sentence summary of the discussion' },
    decisions: { type: 'array', items: { type: 'string' } },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          owner: { type: 'string', description: 'A participant name, or "me" for the principal' },
          due_in_days: { type: 'integer' },
        },
        required: ['title', 'owner', 'due_in_days'],
        additionalProperties: false,
      },
    },
    open_questions: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'decisions', 'actions', 'open_questions'],
  additionalProperties: false,
}

interface SummaryJson {
  summary: string
  decisions: string[]
  actions: { title: string; owner: string; due_in_days: number }[]
  open_questions: string[]
}

export async function summarizeGroup(conversationId: string): Promise<void> {
  const conv = await db.conversations.get(conversationId)
  if (!conv) return
  const lead = (await getLeadAgent())!
  const everyone = await participants(conv)
  const transcript = await groupTranscript(conv, everyone)
  const settings = useSettings.getState().settings
  const user = settings.userName.split(' ')[0]
  await runWithController(conversationId, async (signal) => {
    const id = uid()
    const msg: Message = { id, conversationId, role: 'agent', agentId: lead.id, content: '', status: 'streaming', createdAt: Date.now() }
    await db.messages.put(msg)
    useLive.getState().begin(id)
    try {
      const res = await runAgent({
        agent: lead,
        prompt: `Summarise this team discussion for ${user}. Capture the key points, decisions made, concrete next actions with an owner (a participant's name or "me" for ${user}) and a sensible due date in days, and any open questions.\n\n${conv.topic ? `Topic: ${conv.topic}\n\n` : ''}${transcript}`,
        toolAccess: 'none',
        webSearch: false,
        json: { name: 'discussion_summary', schema: SUMMARY_SCHEMA },
        demo: {
          json: (): SummaryJson => ({
            summary: `The team explored ${conv.topic || 'the brief'} from every angle and agreed a clear direction with a few open points to resolve.`,
            decisions: ['Lead with one sharp, newsworthy angle', 'Keep the first phase lean and measurable'],
            actions: everyone.slice(0, 3).map((a, i) => ({ title: `Draft next step for ${conv.topic || 'the project'} (${a.name})`, owner: a.name, due_in_days: 2 + i * 2 })),
            open_questions: ['What budget is available for phase two?'],
          }),
        },
        signal,
      })
      const data = res.json as SummaryJson
      const content = [
        `### Summary\n${data.summary}`,
        data.decisions?.length ? `### Decisions\n${data.decisions.map((d) => `- ${d}`).join('\n')}` : '',
        data.actions?.length ? `### Next actions\n${data.actions.map((a) => `- **${a.title}** · ${a.owner} · in ${a.due_in_days} days`).join('\n')}` : '',
        data.open_questions?.length ? `### Open questions\n${data.open_questions.map((q) => `- ${q}`).join('\n')}` : '',
      ]
        .filter(Boolean)
        .join('\n\n')
      const actions: SummaryAction[] = (data.actions ?? []).map((a) => ({ title: a.title, owner: a.owner, dueInDays: a.due_in_days }))
      await db.messages.update(id, { content, status: 'done', summary: { actions }, demo: res.demo || undefined })
      await touchConversation(conversationId, data.summary)
      void logActivity('meeting', `${lead.name} summarised “${conv.title}”`, { agentId: lead.id, minutesSaved: res.demo ? 0 : MINUTES_SAVED.meeting })
    } catch (err) {
      const aborted = isAbortError(err)
      await db.messages.update(id, {
        status: aborted ? 'done' : 'error',
        content: aborted ? '_Stopped._' : '',
        error: aborted ? undefined : err instanceof Error ? err.message : 'Summary failed',
        hint: err instanceof FriendlyError ? err.hint : undefined,
      })
    } finally {
      useLive.getState().end(id)
    }
  })
}

export async function addSummaryActionsToBoard(messageId: string, projectId?: string): Promise<number> {
  const msg = await db.messages.get(messageId)
  if (!msg?.summary || msg.summary.added) return 0
  let count = 0
  for (const a of msg.summary.actions) {
    const owner = a.owner.toLowerCase() === 'me' ? undefined : await findAgentByName(a.owner)
    await createTask({ title: a.title, projectId, dueDate: dateFromNow(Math.max(0, a.dueInDays)), assigneeId: owner?.id ?? 'me', source: 'Huddle summary' })
    count++
  }
  await db.messages.update(messageId, { summary: { ...msg.summary, added: true } })
  return count
}
