import { addDays, format, startOfDay } from 'date-fns'
import { db } from '../db'
import { buildSystemPrompt } from '../agents/prompts'
import { buildToolkit, type Toolkit } from '../agents/tools'
import { eventsBetween, getAllRoles, roleFor } from '../ops'
import type { ActivityItem, Agent } from '../types'
import { isoDate } from '../utils'
import { useSettings } from '../../stores/settings'

/** Persona plus a compact snapshot of today, so the live assistant knows the day. */
export async function liveInstructions(agent: Agent): Promise<string> {
  const settings = useSettings.getState().settings
  const roles = await getAllRoles()
  const agents = await db.agents.toArray()
  const team = agents.filter((a) => a.status === 'active').map((a) => ({ agent: a, role: roleFor(roles, a) }))
  const base = buildSystemPrompt({ agent, role: roleFor(roles, agent), settings, team, mode: 'voice', canDelegate: false })

  const today = startOfDay(new Date())
  const events = await eventsBetween(today, addDays(today, 2))
  const tasks = (await db.tasks.toArray()).filter((t) => t.status !== 'done' && t.dueDate && t.dueDate <= isoDate(addDays(new Date(), 3)))
  const projects = (await db.projects.toArray()).filter((p) => p.status === 'active' || p.status === 'pitch')

  const snapshot = [
    `Right now it is ${format(new Date(), 'EEEE d MMMM yyyy, HH:mm')}.`,
    events.length
      ? `Upcoming calendar:\n${events.map((e) => `- ${format(new Date(e.start), 'EEE HH:mm')} ${e.title}`).join('\n')}`
      : 'The calendar is clear for the next two days.',
    tasks.length ? `Tasks due soon:\n${tasks.map((t) => `- ${t.title} (due ${t.dueDate})`).join('\n')}` : '',
    projects.length ? `Current projects: ${projects.map((p) => `${p.name}${p.client ? ` (${p.client})` : ''}`).join('; ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  return `${base}\n\n## Workspace snapshot\n${snapshot}`
}

/** Tools the live assistant may use by voice: look things up and capture actions. */
export function liveToolkit(agent: Agent, report: (item: ActivityItem) => void): Toolkit {
  const settings = useSettings.getState().settings
  const restricted: Agent = {
    ...agent,
    tools: agent.tools.filter((t) => t === 'brain' || t === 'brain_write' || t === 'projects' || t === 'calendar'),
  }
  return buildToolkit({ agent: restricted, settings, depth: 1, report, delegateBudget: { remaining: 0 } }, { allowDelegate: false })
}
