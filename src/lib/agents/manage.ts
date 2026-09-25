import { db } from '../db'
import { resolveProfile, runLLM } from '../llm'
import type { JSONSchema } from '../llm/types'
import { getAllRoles, logActivity } from '../ops'
import type { Agent, AgentTool, Role, RoleCategory } from '../types'
import { uid } from '../utils'
import { useSettings } from '../../stores/settings'
import { ROLE_BANK, ROLE_CATEGORIES } from './roles'
import { AGENT_COLORS, AGENT_NAME_IDEAS } from './defaults'
import { ICON_NAMES } from '../../components/ui/Icon'

/** Plain-English labels for each ability an agent can be given. */
export const TOOL_INFO: Record<AgentTool, { label: string; description: string }> = {
  web: { label: 'Research the web', description: 'Look things up online and cite sources (when your AI supports it).' },
  brain: { label: 'Read your brain', description: 'Search and read the notes in your linked brain.' },
  brain_write: { label: 'Write to your brain', description: 'Save new notes and add to your daily note. Never overwrites.' },
  projects: { label: 'Projects and tasks', description: 'See, create and update projects and tasks.' },
  calendar: { label: 'Calendar', description: 'See your schedule and add events.' },
  delegate: { label: 'Hand work to teammates', description: 'Brief other agents and bring their answers back.' },
  studios: { label: 'Use the studios', description: 'Make decks, landing pages and images.' },
}

export const TOOL_ORDER: AgentTool[] = ['web', 'brain', 'brain_write', 'projects', 'calendar', 'studios', 'delegate']

export function suggestAgentName(taken: string[]): string {
  const used = new Set(taken.map((n) => n.toLowerCase()))
  const free = AGENT_NAME_IDEAS.filter((n) => !used.has(n.toLowerCase()))
  const pool = free.length ? free : AGENT_NAME_IDEAS
  return pool[Math.floor(Math.random() * pool.length)]
}

/* ------------------------------------------------------------------ */
/*  Agents                                                             */
/* ------------------------------------------------------------------ */

export async function hireAgent(input: { name: string; roleId: string; color?: string; status?: Agent['status'] }): Promise<Agent> {
  const roles = await getAllRoles()
  const role = roles.find((r) => r.id === input.roleId) ?? ROLE_BANK[1]
  const all = await db.agents.toArray()
  const t = Date.now()
  const agent: Agent = {
    id: uid(),
    name: input.name.trim() || suggestAgentName(all.map((a) => a.name)),
    roleId: role.id,
    color: input.color ?? role.color,
    personality: { formality: 50, detail: 50, boldness: 50 },
    instructions: '',
    memory: [],
    tools: role.tools.filter((t) => t !== 'delegate'),
    status: input.status ?? 'active',
    order: Math.max(0, ...all.map((a) => a.order)) + 1,
    createdAt: t,
    updatedAt: t,
  }
  await db.agents.put(agent)
  void logActivity('system', `${agent.name} joined the team as ${role.name}`, { agentId: agent.id })
  return agent
}

export async function updateAgent(id: string, patch: Partial<Agent>): Promise<void> {
  await db.agents.update(id, { ...patch, updatedAt: Date.now() })
}

/** Gives an agent a new role. Abilities are reset to suit the new role unless asked not to. */
export async function changeRole(id: string, roleId: string, opts: { resetTools?: boolean; recolor?: boolean } = {}): Promise<void> {
  const agent = await db.agents.get(id)
  const role = (await getAllRoles()).find((r) => r.id === roleId)
  if (!agent || !role) return
  const patch: Partial<Agent> = { roleId, title: undefined, icon: undefined }
  if (opts.resetTools !== false) {
    const tools = role.tools.filter((t) => t !== 'delegate')
    patch.tools = agent.isLead ? [...new Set<AgentTool>([...tools, 'delegate'])] : tools
  }
  if (opts.recolor) patch.color = role.color
  await updateAgent(id, patch)
  void logActivity('system', `${agent.name} is now your ${role.name}`, { agentId: id })
}

export async function setLead(id: string): Promise<void> {
  await db.transaction('rw', db.agents, async () => {
    const all = await db.agents.toArray()
    for (const a of all) {
      if (a.id === id) {
        await db.agents.update(a.id, { isLead: true, status: 'active', tools: [...new Set<AgentTool>([...a.tools, 'delegate'])], updatedAt: Date.now() })
      } else if (a.isLead) {
        await db.agents.update(a.id, { isLead: false, tools: a.tools.filter((t) => t !== 'delegate'), updatedAt: Date.now() })
      }
    }
  })
}

export async function setDuty(id: string, status: Agent['status']): Promise<void> {
  const agent = await db.agents.get(id)
  if (!agent || (agent.isLead && status === 'bench')) return
  await updateAgent(id, { status })
}

/** Puts a benched agent on duty in place of an active one, keeping the roster order. */
export async function swapAgents(activeId: string, benchId: string): Promise<void> {
  await db.transaction('rw', db.agents, async () => {
    const [a, b] = await db.agents.bulkGet([activeId, benchId])
    if (!a || !b || a.isLead) return
    const t = Date.now()
    await db.agents.update(a.id, { status: 'bench', order: b.order, updatedAt: t })
    await db.agents.update(b.id, { status: 'active', order: a.order, updatedAt: t })
  })
}

export async function reorderAgents(ids: string[]): Promise<void> {
  await db.transaction('rw', db.agents, async () => {
    for (const [i, id] of ids.entries()) await db.agents.update(id, { order: i })
  })
}

export async function duplicateAgent(id: string): Promise<Agent | undefined> {
  const agent = await db.agents.get(id)
  if (!agent) return
  const all = await db.agents.toArray()
  const t = Date.now()
  const copy: Agent = {
    ...agent,
    id: uid(),
    name: suggestAgentName(all.map((a) => a.name)),
    isLead: false,
    tools: agent.tools.filter((x) => x !== 'delegate'),
    status: 'bench',
    order: Math.max(0, ...all.map((a) => a.order)) + 1,
    createdAt: t,
    updatedAt: t,
  }
  await db.agents.put(copy)
  return copy
}

/** Removes an agent. Their one-to-one chats go too; group chats and tasks are tidied up. */
export async function removeAgent(id: string): Promise<void> {
  const agent = await db.agents.get(id)
  if (!agent || agent.isLead) return
  await db.transaction('rw', [db.agents, db.conversations, db.messages, db.tasks, db.projects], async () => {
    const convs = await db.conversations.filter((c) => c.agentIds.includes(id)).toArray()
    for (const c of convs) {
      if (c.kind === 'group' && c.agentIds.length > 1) {
        await db.conversations.update(c.id, { agentIds: c.agentIds.filter((x) => x !== id) })
      } else {
        await db.messages.where('conversationId').equals(c.id).delete()
        await db.conversations.delete(c.id)
      }
    }
    await db.tasks.where('assigneeId').equals(id).modify({ assigneeId: 'me' })
    await db.projects
      .filter((p) => p.squad.includes(id))
      .modify((p) => {
        p.squad = p.squad.filter((x) => x !== id)
      })
    await db.agents.delete(id)
  })
  void logActivity('system', `${agent.name} left the team`)
}

/* ------------------------------------------------------------------ */
/*  Custom roles                                                       */
/* ------------------------------------------------------------------ */

export async function saveCustomRole(role: Omit<Role, 'id' | 'custom' | 'createdAt'> & { id?: string }): Promise<Role> {
  const existing = role.id ? await db.roles.get(role.id) : undefined
  const saved: Role = {
    ...role,
    id: existing?.id ?? `custom-${uid()}`,
    custom: true,
    createdAt: existing?.createdAt ?? Date.now(),
  }
  await db.roles.put(saved)
  return saved
}

/** Deletes a custom role. Anyone using it moves to the Research Analyst role. */
export async function deleteCustomRole(id: string): Promise<number> {
  const users = await db.agents.where('roleId').equals(id).toArray()
  await db.transaction('rw', db.agents, db.roles, async () => {
    for (const a of users) await db.agents.update(a.id, { roleId: 'research', icon: undefined, updatedAt: Date.now() })
    await db.roles.delete(id)
  })
  return users.length
}

const ROLE_SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Short job title, two to four words' },
    category: { type: 'string', enum: [...ROLE_CATEGORIES] },
    tagline: { type: 'string', description: 'One line, under nine words' },
    description: { type: 'string', description: 'Two sentences describing what this specialist does for the user' },
    prompt: { type: 'string', description: 'The full working brief for the AI agent in the second person' },
    skills: { type: 'array', items: { type: 'string' } },
    starters: { type: 'array', items: { type: 'string' } },
    icon: { type: 'string', enum: ICON_NAMES },
    tools: { type: 'array', items: { type: 'string', enum: ['web', 'brain', 'brain_write', 'projects', 'calendar', 'studios'] } },
  },
  required: ['name', 'category', 'tagline', 'description', 'prompt', 'skills', 'starters', 'icon', 'tools'],
  additionalProperties: false,
}

export interface RoleDraft {
  name: string
  category: RoleCategory
  tagline: string
  description: string
  prompt: string
  skills: string[]
  starters: string[]
  icon: string
  tools: AgentTool[]
  color: string
}

function demoRole(idea: string): RoleDraft {
  const clean = idea
    .trim()
    .replace(/\.$/, '')
    .replace(/^(a|an|someone|somebody)\s+(who\s+)?/i, '')
  const lower = clean.slice(0, 1).toLowerCase() + clean.slice(1)
  const name = clean
    .split(/\s+/)
    .slice(0, 3)
    .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1))
    .join(' ')
  return {
    name: name || 'Specialist',
    category: 'Specialist',
    tagline: clean.slice(0, 1).toUpperCase() + clean.slice(1),
    description: 'Brings focused expertise to your work and gives clear, practical help you can use straight away.',
    prompt: `You are an expert ${lower}.\n\nHow you work:\n- Start with the answer or recommendation, then the reasoning.\n- Tailor advice to a busy PR agency and its clients.\n- Offer practical next steps and templates the principal can use straight away.\n- Flag risks and assumptions briefly.\n- Never invent facts. Use clear placeholders when details are missing.`,
    skills: ['Advice', 'Planning', 'Drafting', 'Review'],
    starters: ['Give me a quick plan for this', 'What should I watch out for?', 'Draft something I can send today'],
    icon: 'Sparkles',
    tools: ['brain', 'web', 'projects'],
    color: AGENT_COLORS[Math.floor(Math.random() * AGENT_COLORS.length)],
  }
}

/** Turns a one-line idea ("someone who handles award entries") into a full role. */
export async function draftRole(idea: string, signal?: AbortSignal): Promise<RoleDraft & { demo: boolean }> {
  const settings = useSettings.getState().settings
  const profile = await resolveProfile()
  const res = await runLLM(profile, {
    system: `You design specialist AI teammates for ${settings.companyName || 'a PR and communications agency'}. Write roles in plain, warm, professional English. The "prompt" is the agent's working brief: open with "You are ..." describing their expertise, then a "How you work:" list of five or six specific, practical behaviours. Always include a behaviour about never inventing facts and using clear placeholders instead. Skills are two or three words each (four to six of them). Starters are three or four things the user might ask this specialist, written in the user's voice.`,
    messages: [{ role: 'user', content: `Create a specialist role for: ${idea}` }],
    json: { name: 'role', schema: ROLE_SCHEMA },
    depth: 'quick',
    maxTokens: 6000,
    signal,
    demo: { json: () => demoRole(idea) },
  })
  const data = (res.json ?? demoRole(idea)) as Partial<RoleDraft>
  const fallback = demoRole(idea)
  const category = ROLE_CATEGORIES.includes(data.category as RoleCategory) ? (data.category as RoleCategory) : 'Specialist'
  return {
    name: data.name?.trim() || fallback.name,
    category,
    tagline: data.tagline?.trim() || fallback.tagline,
    description: data.description?.trim() || fallback.description,
    prompt: data.prompt?.trim() || fallback.prompt,
    skills: (data.skills ?? fallback.skills).slice(0, 6),
    starters: (data.starters ?? fallback.starters).slice(0, 4),
    icon: data.icon && ICON_NAMES.includes(data.icon) ? data.icon : 'Sparkles',
    tools: (data.tools ?? fallback.tools).filter((t): t is AgentTool => t in TOOL_INFO && t !== 'delegate'),
    color: fallback.color,
    demo: !!res.demo,
  }
}
