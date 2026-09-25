import Dexie, { type Table } from 'dexie'
import type {
  Agent,
  AIProfile,
  BrainNote,
  CalEvent,
  CalendarSource,
  ContentPiece,
  Conversation,
  CoverageItem,
  Deck,
  LogEntry,
  MastermindSession,
  MediaContact,
  MediaItem,
  Message,
  Project,
  ResearchReport,
  Role,
  Site,
  Task,
  VaultSecret,
} from './types'

export interface KV {
  key: string
  value: unknown
}

export class OSDatabase extends Dexie {
  kv!: Table<KV, string>
  agents!: Table<Agent, string>
  roles!: Table<Role, string>
  profiles!: Table<AIProfile, string>
  secrets!: Table<VaultSecret, string>
  projects!: Table<Project, string>
  tasks!: Table<Task, string>
  conversations!: Table<Conversation, string>
  messages!: Table<Message, string>
  masterminds!: Table<MastermindSession, string>
  research!: Table<ResearchReport, string>
  decks!: Table<Deck, string>
  sites!: Table<Site, string>
  content!: Table<ContentPiece, string>
  contacts!: Table<MediaContact, string>
  coverage!: Table<CoverageItem, string>
  events!: Table<CalEvent, string>
  calendars!: Table<CalendarSource, string>
  notes!: Table<BrainNote, string>
  log!: Table<LogEntry, string>
  media!: Table<MediaItem, string>

  constructor(name = 'agentic-os') {
    super(name)
    this.version(1).stores({
      kv: 'key',
      agents: 'id, status, order, roleId',
      roles: 'id, category',
      profiles: 'id, provider',
      secrets: 'id, service',
      projects: 'id, status, updatedAt',
      tasks: 'id, projectId, status, dueDate, assigneeId, updatedAt',
      conversations: 'id, kind, updatedAt, projectId',
      messages: 'id, conversationId, createdAt, [conversationId+createdAt]',
      masterminds: 'id, projectId, updatedAt',
      research: 'id, projectId, updatedAt',
      decks: 'id, projectId, updatedAt',
      sites: 'id, projectId, updatedAt',
      content: 'id, kind, projectId, updatedAt',
      contacts: 'id, outlet, name',
      coverage: 'id, date, projectId',
      events: 'id, start, source, calendarId, projectId',
      calendars: 'id, kind',
      notes: 'path, folder, mtime, *tags',
      log: 'id, at, kind',
      media: 'id, kind, createdAt, projectId',
    })
  }
}

export const db = new OSDatabase()

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const row = await db.kv.get(key)
  return row?.value as T | undefined
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await db.kv.put({ key, value })
}

export async function kvDelete(key: string): Promise<void> {
  await db.kv.delete(key)
}
