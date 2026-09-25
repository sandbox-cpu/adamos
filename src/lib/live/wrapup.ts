import { format } from 'date-fns'
import { db } from '../db'
import type { JSONSchema } from '../llm/types'
import { saveNewNote } from '../brain/vault-fs'
import { createTask, findAgentByName, logActivity, MINUTES_SAVED } from '../ops'
import type { Agent } from '../types'
import { dateFromNow, truncate } from '../utils'
import { runAgent } from '../agents/runtime'
import { useSettings } from '../../stores/settings'
import type { TranscriptEntry } from './types'

export interface CallAction {
  title: string
  owner: string
  dueInDays: number
}

export interface CallSummary {
  summary: string
  actions: CallAction[]
}

const SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'Two to four sentences on what was discussed and decided' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'A clear, doable task starting with a verb' },
          owner: { type: 'string', description: '"me" for the user, or the name of an agent' },
          dueInDays: { type: 'number' },
        },
        required: ['title', 'owner', 'dueInDays'],
        additionalProperties: false,
      },
    },
  },
  required: ['summary', 'actions'],
  additionalProperties: false,
}

/** The conversation as plain text, speaker by speaker. */
export function transcriptText(entries: TranscriptEntry[], agentName: string, userName: string): string {
  return entries
    .filter((e) => e.role !== 'event' && e.text.trim())
    .map((e) => `${e.role === 'user' ? userName : agentName}: ${e.text.trim()}`)
    .join('\n')
}

function demoSummary(entries: TranscriptEntry[]): CallSummary {
  const said = entries.filter((e) => e.role === 'user' && e.text.trim()).map((e) => e.text.trim())
  const actions = said
    .flatMap((s) => s.match(/[^.!?]+[.!?]*/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => !s.endsWith('?') && /\b(i'll|i will|we need to|remind me to|let's|we should|please)\b/i.test(s))
    .slice(0, 5)
    .map((s) => {
      const title = s
        .replace(/^(so|and|ok|okay|right)[,\s]+/i, '')
        .replace(/^(i'll|i will|we need to|we should|let's|please)\s+/i, '')
        .replace(/[.!]+$/, '')
      return { title: truncate(title.charAt(0).toUpperCase() + title.slice(1), 90), owner: 'me', dueInDays: 2 }
    })
  return {
    summary: said.length
      ? `You talked through ${said.length} point${said.length === 1 ? '' : 's'}, starting with “${truncate(said[0], 80)}”.`
      : 'A short call with no decisions recorded.',
    actions,
  }
}

/** Sums up a live call and pulls out the actions agreed. */
export async function summariseCall(agent: Agent, entries: TranscriptEntry[], signal?: AbortSignal): Promise<CallSummary> {
  const userName = useSettings.getState().settings.userName.split(' ')[0] || 'Me'
  const text = transcriptText(entries, agent.name, userName)
  if (!text) return { summary: 'Nothing was said on this call.', actions: [] }
  const res = await runAgent({
    agent,
    prompt: `Here is the transcript of a live call between ${userName} and you (${agent.name}).\n\n${truncate(text, 40000)}\n\nSum up what was discussed and decided, and list every action that was agreed or clearly needed. Use "me" as the owner for anything ${userName} will do. Don't invent actions that weren't discussed.`,
    toolAccess: 'none',
    webSearch: false,
    thinkingDepth: 'quick',
    maxTokens: 6000,
    json: { name: 'call_summary', schema: SCHEMA },
    demo: { json: () => demoSummary(entries) },
    signal,
  })
  const data = (res.json ?? {}) as Partial<CallSummary>
  return {
    summary: typeof data.summary === 'string' ? data.summary.trim() : '',
    actions: (Array.isArray(data.actions) ? data.actions : [])
      .filter((a) => a && typeof a.title === 'string' && a.title.trim())
      .slice(0, 12)
      .map((a) => ({
        title: a.title.trim(),
        owner: typeof a.owner === 'string' ? a.owner : 'me',
        dueInDays: Number.isFinite(a.dueInDays) ? Math.max(0, Math.round(a.dueInDays)) : 2,
      })),
  }
}

/** Adds the agreed actions to the task board. */
export async function addCallActions(actions: CallAction[]): Promise<number> {
  let count = 0
  for (const a of actions) {
    const owner = a.owner.toLowerCase() === 'me' ? undefined : await findAgentByName(a.owner)
    await createTask({ title: a.title, dueDate: dateFromNow(a.dueInDays), assigneeId: owner?.id ?? 'me', source: 'Live call' })
    count++
  }
  return count
}

/** Saves the call, with its summary, as a note in the brain. */
export async function saveCallToBrain(agent: Agent, entries: TranscriptEntry[], startedAt: number, summary?: CallSummary): Promise<string> {
  const settings = useSettings.getState().settings
  const userName = settings.userName.split(' ')[0] || 'Me'
  const when = new Date(startedAt)
  const title = `Call with ${agent.name} ${format(when, 'd MMM yyyy HH.mm')}`
  const parts = [
    `---\ntags: [call]\ncreated: ${format(when, 'yyyy-MM-dd')}\n---`,
    `# Call with ${agent.name}`,
    `${format(when, 'EEEE d MMMM yyyy, HH:mm')}`,
    summary?.summary ? `## Summary\n${summary.summary}` : '',
    summary?.actions.length ? `## Actions\n${summary.actions.map((a) => `- [ ] ${a.title}${a.owner.toLowerCase() === 'me' ? '' : ` (${a.owner})`}`).join('\n')}` : '',
    `## Transcript\n${transcriptText(entries, agent.name, userName)
      .split('\n')
      .map((line) => line.replace(/^([^:]+):/, '**$1:**'))
      .join('\n\n')}`,
  ]
  const res = await saveNewNote(`${settings.brain.writeFolder}/Calls`, title, parts.filter(Boolean).join('\n\n'))
  return res.path
}

/** Records the call in the activity feed. */
export async function logCall(agent: Agent, minutes: number): Promise<void> {
  const mins = Math.max(1, Math.round(minutes))
  await logActivity('meeting', `Live call with ${agent.name} (${mins} min)`, { agentId: agent.id, minutesSaved: Math.min(MINUTES_SAVED.meeting, mins), link: '/live' })
}

/** The agents that can join a live call. */
export async function liveAgents(): Promise<Agent[]> {
  return (await db.agents.toArray()).filter((a) => a.status === 'active')
}
