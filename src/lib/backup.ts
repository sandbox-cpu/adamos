import { db } from './db'

const TABLES = [
  'kv',
  'agents',
  'roles',
  'profiles',
  'secrets',
  'projects',
  'tasks',
  'conversations',
  'messages',
  'masterminds',
  'research',
  'decks',
  'sites',
  'content',
  'contacts',
  'coverage',
  'events',
  'calendars',
  'notes',
  'log',
] as const

type TableName = (typeof TABLES)[number]

/** Keys in the kv table that must never leave this device. */
const DEVICE_ONLY = new Set(['vault.deviceKey', 'brain.handle', 'vault.manualLock'])

export async function exportEverything(): Promise<string> {
  const out: Record<string, unknown[]> = {}
  for (const name of TABLES) {
    const rows = await db.table(name).toArray()
    out[name] = name === 'kv' ? rows.filter((r: { key: string }) => !DEVICE_ONLY.has(r.key)) : rows
  }
  return JSON.stringify({ format: 'agentic-os-backup', version: 1, exportedAt: new Date().toISOString(), tables: out })
}

export async function importEverything(json: string): Promise<number> {
  const parsed = JSON.parse(json) as { format?: string; tables?: Partial<Record<TableName, unknown[]>> }
  if (parsed.format !== 'agentic-os-backup' || !parsed.tables) throw new Error('That file is not a backup from this OS.')
  let count = 0
  await db.transaction(
    'rw',
    TABLES.map((t) => db.table(t)),
    async () => {
      for (const name of TABLES) {
        const rows = parsed.tables?.[name]
        if (!Array.isArray(rows)) continue
        const safe = name === 'kv' ? rows.filter((r) => !DEVICE_ONLY.has((r as { key: string }).key)) : rows
        await db.table(name).bulkPut(safe)
        count += safe.length
      }
    },
  )
  return count
}
