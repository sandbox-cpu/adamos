import { db } from '../db'
import { resolveProfile, runLLM } from '../llm'
import { getProvider } from '../llm/providers'
import type { ChatTurn, DemoScript, ImageInput, JSONSchema } from '../llm/types'
import { getAllRoles, roleFor } from '../ops'
import type { ActivityItem, Agent, Citation, Depth } from '../types'
import { truncate } from '../utils'
import { useSettings } from '../../stores/settings'
import { buildDemoReply } from './demo'
import { buildSystemPrompt, contextHeader, type AgentMode } from './prompts'
import { buildToolkit, type ToolContext } from './tools'

export interface AgentHandlers {
  onText?: (delta: string) => void
  onReset?: () => void
  onThinking?: (delta: string) => void
  onActivities?: (items: ActivityItem[]) => void
  onCitation?: (c: Citation) => void
  onNotice?: (message: string) => void
}

export interface AgentRunOptions {
  agent: Agent
  prompt: string
  history?: ChatTurn[]
  mode?: AgentMode
  /** Extra context placed above the prompt (attached notes, project details…). */
  context?: string
  signal?: AbortSignal
  depth?: number
  toolAccess?: 'full' | 'read' | 'none'
  webSearch?: boolean
  thinkingDepth?: Depth
  maxTokens?: number
  json?: { name: string; schema: JSONSchema }
  demo?: DemoScript
  latencySensitive?: boolean
  images?: ImageInput[]
  handlers?: AgentHandlers
}

export interface AgentRunResult {
  text: string
  thinking: string
  citations: Citation[]
  activities: ActivityItem[]
  demo: boolean
  json?: unknown
}

/** Runs one agent turn: persona, tools, delegation and streaming. */
export async function runAgent(o: AgentRunOptions): Promise<AgentRunResult> {
  const settings = useSettings.getState().settings
  const roles = await getAllRoles()
  const role = roleFor(roles, o.agent)
  const agents = await db.agents.toArray()
  const team = agents.filter((a) => a.status === 'active' || a.id === o.agent.id).map((a) => ({ agent: a, role: roleFor(roles, a) }))
  const profile = await resolveProfile(o.agent.profileId)
  const depth = o.depth ?? 0
  const mode = o.mode ?? 'direct'
  const access = o.toolAccess ?? 'full'
  const canDelegate = !!o.agent.isLead && o.agent.tools.includes('delegate') && depth === 0 && access === 'full'

  const system = buildSystemPrompt({ agent: o.agent, role, settings, team, mode, canDelegate })

  const activities: ActivityItem[] = []
  const report = (item: ActivityItem) => {
    const i = activities.findIndex((a) => a.id === item.id)
    if (i === -1) activities.push(item)
    else activities[i] = { ...activities[i], ...item }
    o.handlers?.onActivities?.(activities.map((a) => ({ ...a })))
  }

  const toolCtx: ToolContext = {
    agent: o.agent,
    settings,
    depth,
    signal: o.signal,
    report,
    delegateBudget: { remaining: 4 },
    runDelegate: async (teammate, task, context, item) => {
      let out = ''
      const res = await runAgent({
        agent: teammate,
        prompt: task,
        context: context ? `Context from ${o.agent.name}:\n${context}` : undefined,
        mode: 'delegate',
        depth: depth + 1,
        signal: o.signal,
        handlers: {
          onText: (d) => {
            out += d
            report({ ...item, output: out })
          },
          onReset: () => {
            out = ''
            report({ ...item, output: '' })
          },
        },
      })
      report({ ...item, status: 'done', output: res.text })
      return res.text
    },
  }

  const toolkit = access === 'none' ? null : buildToolkit(toolCtx, { readOnly: access === 'read', allowDelegate: canDelegate })
  const providerWeb = profile ? getProvider(profile.provider).webSearch && profile.webSearch : false
  const webSearch = (o.webSearch ?? o.agent.tools.includes('web')) && providerWeb

  const messages: ChatTurn[] = [...(o.history ?? []), { role: 'user', content: `${contextHeader(o.context)}\n\n${o.prompt}` }]

  let demo = o.demo
  if (!profile && !demo) demo = { text: await buildDemoReply(o.agent, role, o.prompt, settings) }

  const webActivities = new Map<string, ActivityItem>()
  const result = await runLLM(profile, {
    system,
    messages,
    images: o.images,
    tools: toolkit?.specs.length ? toolkit.specs : undefined,
    runTool: toolkit?.specs.length ? toolkit.run : undefined,
    webSearch,
    json: o.json,
    depth: o.thinkingDepth,
    maxTokens: o.maxTokens,
    signal: o.signal,
    latencySensitive: o.latencySensitive,
    demo,
    onEvent: (e) => {
      switch (e.type) {
        case 'text':
          o.handlers?.onText?.(e.delta)
          break
        case 'reset':
          o.handlers?.onReset?.()
          break
        case 'thinking':
          o.handlers?.onThinking?.(e.delta)
          break
        case 'citation':
          o.handlers?.onCitation?.(e.citation)
          break
        case 'notice':
          o.handlers?.onNotice?.(e.message)
          break
        case 'web_search': {
          const item: ActivityItem = { id: e.id, kind: 'web', label: e.query ? `Searching the web for “${truncate(e.query, 56)}”` : 'Searching the web', status: 'running' }
          webActivities.set(e.id, item)
          report(item)
          break
        }
        case 'web_results': {
          const item = webActivities.get(e.id)
          if (item)
            report({
              ...item,
              status: 'done',
              detail: `${e.results.length} results`,
              output: e.results
                .slice(0, 4)
                .map((r) => r.title ?? r.url)
                .join(' · '),
            })
          break
        }
      }
    },
  })

  for (const a of activities) if (a.status === 'running') report({ ...a, status: 'done' })
  return { text: result.text, thinking: result.thinking, citations: result.citations, activities, demo: !!result.demo, json: result.json }
}

/** Whether any real AI profile is configured (otherwise the OS runs in demo mode). */
export async function hasLiveAI(): Promise<boolean> {
  return (await db.profiles.count()) > 0
}
