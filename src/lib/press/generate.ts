import { db } from '../db'
import { getLeadAgent, logActivity, MINUTES_SAVED } from '../ops'
import type { Agent, ContentKind, ContentPiece } from '../types'
import { isAbortError, truncate, uid } from '../utils'
import { trackJob } from '../../stores/jobs'
import { createStreamWriter, useLive } from '../../stores/live'
import { runAgent } from '../agents/runtime'
import { contentTemplate } from './templates'

export function contentLiveKey(id: string): string {
  return `content:${id}`
}

async function agentFor(roleId: string, agentId?: string): Promise<Agent> {
  if (agentId) {
    const a = await db.agents.get(agentId)
    if (a) return a
  }
  const agents = await db.agents.toArray()
  return agents.find((a) => a.roleId === roleId && a.status === 'active') ?? agents.find((a) => a.roleId === roleId) ?? agents.find((a) => a.roleId === 'copywriter') ?? (await getLeadAgent())!
}

export async function startContent(input: { kind: ContentKind; brief: Record<string, string>; agentId?: string; projectId?: string; useWeb?: boolean }): Promise<ContentPiece> {
  const tpl = contentTemplate(input.kind)
  const agent = await agentFor(tpl.roleId, input.agentId)
  const first = Object.values(input.brief).find((v) => v.trim()) ?? tpl.name
  const t = Date.now()
  const piece: ContentPiece = {
    id: uid(),
    kind: input.kind,
    title: truncate(first.replace(/\s+/g, ' '), 80),
    brief: input.brief,
    content: '',
    agentId: agent.id,
    status: 'generating',
    projectId: input.projectId,
    createdAt: t,
    updatedAt: t,
  }
  await db.content.put(piece)
  void writeContent(piece.id, undefined, input.useWeb).catch(() => undefined)
  return piece
}

/** Writes (or rewrites, with an instruction) a Press Office document. */
export async function writeContent(id: string, instruction?: string, useWeb = false): Promise<void> {
  const piece = await db.content.get(id)
  if (!piece) return
  const tpl = contentTemplate(piece.kind)
  const agent = await agentFor(tpl.roleId, piece.agentId)
  const key = contentLiveKey(id)
  const controller = new AbortController()
  useLive.getState().setRunning(key, controller)
  useLive.getState().begin(key)
  const writer = createStreamWriter(key)
  await db.content.update(id, { status: 'generating' })
  const briefLines = tpl.fields
    .map((f) => (piece.brief[f.key]?.trim() ? `${f.label}: ${piece.brief[f.key].trim()}` : ''))
    .filter(Boolean)
    .join('\n')
  try {
    await trackJob({ id: key, kind: 'content', title: `${tpl.name}: ${piece.title}`, stage: `${agent.name} is writing`, agentId: agent.id, link: `/press?doc=${id}` }, async () => {
      const prompt = instruction
        ? `Here is the current ${tpl.name.toLowerCase()}:\n\n${piece.content}\n\nChange request: ${instruction}\n\nReturn the complete updated document only.`
        : `Write a ${tpl.name.toLowerCase()}.\n\n${briefLines}\n\n${tpl.instructions}\n\nCheck the brain for relevant background (client details, tone of voice, past work) before writing. Return the finished document in Markdown, ready to use, with no preamble.`
      const res = await runAgent({
        agent,
        mode: 'studio',
        prompt,
        toolAccess: 'read',
        webSearch: useWeb,
        thinkingDepth: 'balanced',
        maxTokens: 16000,
        signal: controller.signal,
        handlers: { onText: writer.text, onReset: writer.reset, onActivities: (activities) => useLive.getState().patch(key, { activities }) },
        demo: {
          text: instruction
            ? `${piece.content}\n\n_(Demo mode: connect an AI provider to apply “${instruction}”.)_`
            : `# ${piece.title}\n\n_This is a demo draft. Connect an AI provider in **Settings → AI** and ${agent.name} will write the real thing._\n\n${briefLines
                .split('\n')
                .map((l) => `- ${l}`)
                .join('\n')}\n\n[FIRST PARAGRAPH]\n\n[SUPPORTING DETAIL]\n\n[QUOTE]\n\n[CALL TO ACTION]`,
        },
      })
      writer.flush()
      await db.content.update(id, { content: res.text, status: 'ready', error: undefined, updatedAt: Date.now() })
      if (!instruction) void logActivity('content', `${agent.name} wrote a ${tpl.name.toLowerCase()}`, { agentId: agent.id, minutesSaved: res.demo ? 0 : MINUTES_SAVED.content, link: `/press?doc=${id}` })
    })
  } catch (err) {
    writer.flush()
    const aborted = isAbortError(err)
    await db.content.update(id, {
      status: aborted || piece.content ? 'ready' : 'error',
      content: writer.value || piece.content,
      error: aborted ? undefined : err instanceof Error ? err.message : 'Writing failed',
    })
  } finally {
    useLive.getState().end(key)
    useLive.getState().setRunning(key, null)
  }
}
