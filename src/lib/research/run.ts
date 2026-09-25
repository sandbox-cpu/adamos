import { db } from '../db'
import { saveNewNote } from '../brain/vault-fs'
import { getLeadAgent, logActivity } from '../ops'
import type { Agent, Citation, ResearchReport } from '../types'
import { isAbortError, uid } from '../utils'
import { trackJob } from '../../stores/jobs'
import { createStreamWriter, useLive } from '../../stores/live'
import { useSettings } from '../../stores/settings'
import { runAgent } from '../agents/runtime'
import { templateById } from './templates'

export function researchLiveKey(id: string): string {
  return `research:${id}`
}

async function pickAgent(roleId: string, agentId?: string): Promise<Agent> {
  if (agentId) {
    const a = await db.agents.get(agentId)
    if (a) return a
  }
  const agents = await db.agents.toArray()
  return (
    agents.find((a) => a.roleId === roleId && a.status === 'active') ??
    agents.find((a) => a.roleId === roleId) ??
    agents.find((a) => a.roleId === 'research') ??
    (await getLeadAgent())!
  )
}

export async function startResearch(input: {
  templateId: string
  subject: string
  context?: string
  agentId?: string
  projectId?: string
  depth?: 'quick' | 'balanced' | 'deep'
}): Promise<ResearchReport> {
  const template = templateById(input.templateId)
  const agent = await pickAgent(template.roleId, input.agentId)
  const t = Date.now()
  const report: ResearchReport = {
    id: uid(),
    title: `${template.name}: ${input.subject}`,
    templateId: template.id,
    subject: input.subject,
    context: input.context,
    agentId: agent.id,
    content: '',
    citations: [],
    status: 'running',
    usedWeb: false,
    projectId: input.projectId,
    createdAt: t,
    updatedAt: t,
  }
  await db.research.put(report)
  void runResearch(report.id, input.depth ?? 'balanced').catch(() => undefined)
  return report
}

export async function runResearch(reportId: string, depth: 'quick' | 'balanced' | 'deep' = 'balanced'): Promise<void> {
  const report = await db.research.get(reportId)
  if (!report) return
  const template = templateById(report.templateId)
  const agent = (await db.agents.get(report.agentId)) ?? (await pickAgent(template.roleId))
  const key = researchLiveKey(reportId)
  const controller = new AbortController()
  useLive.getState().setRunning(key, controller)
  useLive.getState().begin(key)
  const writer = createStreamWriter(key)
  const citations: Citation[] = []
  let usedWeb = false
  const settings = useSettings.getState().settings
  try {
    await trackJob({ id: key, kind: 'research', title: report.title, stage: `${agent.name} is researching`, agentId: agent.id, link: `/research/${reportId}` }, async () => {
      const res = await runAgent({
        agent,
        mode: 'studio',
        prompt: `Research task: ${template.name}\nSubject: ${report.subject}\n${report.context ? `Extra context from ${settings.userName.split(' ')[0]}: ${report.context}\n` : ''}\nFirst check the brain for anything we already know about this. Research live sources for everything current and cite them inline as Markdown links.\n\n${template.instructions}\n\nMatch the length to the task: cover the substance without padding. Label anything you could not verify.`,
        toolAccess: 'read',
        webSearch: true,
        thinkingDepth: depth,
        maxTokens: 32000,
        signal: controller.signal,
        handlers: {
          onText: writer.text,
          onReset: writer.reset,
          onActivities: (activities) => {
            if (activities.some((a) => a.kind === 'web')) usedWeb = true
            useLive.getState().patch(key, { activities })
          },
          onCitation: (c) => {
            usedWeb = true
            citations.push(c)
            useLive.getState().patch(key, { citations: [...citations] })
          },
          onNotice: (m) => useLive.getState().patch(key, { notices: [...(useLive.getState().messages[key]?.notices ?? []), m] }),
        },
        demo: {
          text: `> Demo report. Connect Claude or Gemini in **Settings → AI** for live web research with sources.\n\n## Executive summary\nA first look at **${report.subject}** using the ${template.name.toLowerCase()} framework. With a live AI connected, this report is researched from current sources and every claim is cited.\n\n## What we’d look at\n- The latest data and reports on ${report.subject}\n- Recent news and announcements from the key players\n- What audiences are saying and sharing\n- What this means for your clients\n\n## Early recommendations\n1. Lead with one sharp, evidenced insight\n2. Move quickly on the most timely opportunity\n3. Track results against two or three clear measures`,
        },
      })
      writer.flush()
      const merged = [...citations, ...res.citations].filter((c, i, arr) => arr.findIndex((x) => x.url === c.url) === i)
      await db.research.update(reportId, { content: res.text, citations: merged, status: 'done', usedWeb: usedWeb || merged.length > 0, updatedAt: Date.now() })
      void logActivity('research', `${agent.name} finished “${report.title}”`, { agentId: agent.id, minutesSaved: res.demo ? 0 : template.minutes, link: `/research/${reportId}` })
    })
  } catch (err) {
    writer.flush()
    const aborted = isAbortError(err)
    await db.research.update(reportId, {
      content: writer.value,
      status: aborted && writer.value ? 'done' : 'error',
      error: aborted ? 'Stopped before finishing.' : err instanceof Error ? err.message : 'Research failed',
      updatedAt: Date.now(),
    })
  } finally {
    useLive.getState().end(key)
    useLive.getState().setRunning(key, null)
  }
}

export async function saveResearchToBrain(reportId: string): Promise<string | undefined> {
  const r = await db.research.get(reportId)
  if (!r) return undefined
  const settings = useSettings.getState().settings
  const sources = r.citations.length ? `\n\n## Sources\n${r.citations.map((c) => `- [${c.title ?? c.url}](${c.url})`).join('\n')}` : ''
  const body = `---\ntags: [research]\ncreated: ${new Date(r.createdAt).toISOString().slice(0, 10)}\n---\n# ${r.title}\n\n${r.content}${sources}`
  const res = await saveNewNote(`${settings.brain.writeFolder}/Research`, r.title, body)
  return res.path
}
