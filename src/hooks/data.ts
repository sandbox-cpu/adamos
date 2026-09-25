import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from '../lib/db'
import { ROLE_BANK } from '../lib/agents/roles'
import type { Agent, CalEvent, ConversationKind, Role } from '../lib/types'

export function useAgents(): Agent[] {
  return useLiveQuery(() => db.agents.orderBy('order').toArray(), [], [] as Agent[])
}

export function useActiveAgents(): Agent[] {
  const agents = useAgents()
  return useMemo(() => agents.filter((a) => a.status === 'active'), [agents])
}

export function useLead(): Agent | undefined {
  const agents = useAgents()
  return useMemo(() => agents.find((a) => a.isLead) ?? agents.find((a) => a.status === 'active'), [agents])
}

export function useAgent(id?: string): Agent | undefined {
  return useLiveQuery(() => (id ? db.agents.get(id) : undefined), [id])
}

export function useRoles(): Role[] {
  const custom = useLiveQuery(() => db.roles.toArray(), [], [] as Role[])
  return useMemo(() => [...ROLE_BANK, ...custom], [custom])
}

export function useRoleOf(agent?: Agent): Role | undefined {
  const roles = useRoles()
  return useMemo(() => (agent ? roles.find((r) => r.id === agent.roleId) : undefined), [roles, agent])
}

export function useProfiles() {
  return useLiveQuery(() => db.profiles.toArray(), [], [])
}

export function useSecrets() {
  return useLiveQuery(() => db.secrets.toArray(), [], [])
}

export function useProjects() {
  return useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray(), [], [])
}

export function useProject(id?: string) {
  return useLiveQuery(() => (id ? db.projects.get(id) : undefined), [id])
}

export function useTasks(projectId?: string) {
  return useLiveQuery(() => (projectId ? db.tasks.where('projectId').equals(projectId).toArray() : db.tasks.toArray()), [projectId], [])
}

export function useEventsBetween(start: Date, end: Date): CalEvent[] {
  const s = start.toISOString()
  const e = end.toISOString()
  return useLiveQuery(
    async () => {
      const disabled = new Set((await db.calendars.toArray()).filter((c) => !c.enabled).map((c) => c.id))
      const rows = await db.events.where('start').below(e).toArray()
      return rows.filter((ev) => ev.end > s && !(ev.calendarId && disabled.has(ev.calendarId))).sort((a, b) => a.start.localeCompare(b.start))
    },
    [s, e],
    [] as CalEvent[],
  )
}

export function useCalendars() {
  return useLiveQuery(() => db.calendars.toArray(), [], [])
}

export function useConversations(kind?: ConversationKind) {
  return useLiveQuery(
    async () => {
      const rows = kind ? await db.conversations.where('kind').equals(kind).toArray() : await db.conversations.toArray()
      return rows.sort((a, b) => b.updatedAt - a.updatedAt)
    },
    [kind],
    [],
  )
}

export function useMessages(conversationId?: string) {
  return useLiveQuery(
    () => (conversationId ? db.messages.where('[conversationId+createdAt]').between([conversationId, 0], [conversationId, Infinity]).toArray() : []),
    [conversationId],
    [],
  )
}

export function useMasterminds() {
  return useLiveQuery(() => db.masterminds.orderBy('updatedAt').reverse().toArray(), [], [])
}

export function useMastermind(id?: string) {
  return useLiveQuery(() => (id ? db.masterminds.get(id) : undefined), [id])
}

export function useResearch() {
  return useLiveQuery(() => db.research.orderBy('updatedAt').reverse().toArray(), [], [])
}

export function useDecks() {
  return useLiveQuery(() => db.decks.orderBy('updatedAt').reverse().toArray(), [], [])
}

export function useDeck(id?: string) {
  return useLiveQuery(() => (id ? db.decks.get(id) : undefined), [id])
}

export function useSites() {
  return useLiveQuery(() => db.sites.orderBy('updatedAt').reverse().toArray(), [], [])
}

export function useSite(id?: string) {
  return useLiveQuery(() => (id ? db.sites.get(id) : undefined), [id])
}

export function useContent() {
  return useLiveQuery(() => db.content.orderBy('updatedAt').reverse().toArray(), [], [])
}

export function useContacts() {
  return useLiveQuery(() => db.contacts.orderBy('name').toArray(), [], [])
}

export function useCoverage() {
  return useLiveQuery(() => db.coverage.orderBy('date').reverse().toArray(), [], [])
}

export function useMedia() {
  return useLiveQuery(() => db.media.orderBy('createdAt').reverse().toArray(), [], [])
}

export function useNoteCount(): number {
  return useLiveQuery(() => db.notes.count(), [], 0)
}

export function useLog(limit = 40) {
  return useLiveQuery(() => db.log.orderBy('at').reverse().limit(limit).toArray(), [limit], [])
}

export function useMinutesSaved(sinceDays = 7): number {
  return useLiveQuery(
    async () => {
      const since = Date.now() - sinceDays * 86_400_000
      const rows = await db.log.where('at').above(since).toArray()
      return rows.reduce((sum, r) => sum + (r.minutesSaved ?? 0), 0)
    },
    [sinceDays],
    0,
  )
}
