import MiniSearch from 'minisearch'
import { db } from '../db'
import type { BrainNote } from '../types'
import { plainText } from './parse'

export interface BrainHit {
  path: string
  title: string
  folder: string
  tags: string[]
  score: number
  snippet: string
}

interface IndexCache {
  stamp: string
  index: MiniSearch<BrainNote>
  notes: Map<string, BrainNote>
}

let cache: IndexCache | null = null
let building: Promise<IndexCache> | null = null

async function currentStamp(): Promise<string> {
  const count = await db.notes.count()
  const newest = await db.notes.orderBy('mtime').last()
  return `${count}:${newest?.mtime ?? 0}:${newest?.path ?? ''}`
}

export function createIndex(notes: BrainNote[]): MiniSearch<BrainNote> {
  const index = new MiniSearch<BrainNote>({
    idField: 'path',
    fields: ['title', 'aliases', 'tags', 'content'],
    storeFields: ['path', 'title', 'folder', 'tags'],
    extractField: (doc, field) => {
      const value = (doc as unknown as Record<string, unknown>)[field]
      if (Array.isArray(value)) return value.join(' ')
      return typeof value === 'string' ? value : ''
    },
    searchOptions: {
      boost: { title: 4, aliases: 3, tags: 2, content: 1 },
      prefix: true,
      fuzzy: 0.15,
      combineWith: 'OR',
    },
  })
  index.addAll(notes)
  return index
}

export async function getBrainIndex(): Promise<IndexCache> {
  const stamp = await currentStamp()
  if (cache && cache.stamp === stamp) return cache
  if (building) return building
  building = (async () => {
    const notes = await db.notes.toArray()
    const next: IndexCache = { stamp, index: createIndex(notes), notes: new Map(notes.map((n) => [n.path, n])) }
    cache = next
    building = null
    return next
  })()
  return building
}

export function makeSnippet(content: string, query: string, size = 220): string {
  const text = plainText(content)
  const terms = query
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 2)
  const lower = text.toLowerCase()
  let pos = -1
  for (const t of terms) {
    const i = lower.indexOf(t)
    if (i !== -1 && (pos === -1 || i < pos)) pos = i
  }
  if (pos === -1) return text.slice(0, size) + (text.length > size ? '…' : '')
  const start = Math.max(0, pos - Math.floor(size / 3))
  const slice = text.slice(start, start + size)
  return (start > 0 ? '…' : '') + slice + (start + size < text.length ? '…' : '')
}

export async function searchBrain(query: string, limit = 8): Promise<BrainHit[]> {
  const q = query.trim()
  if (!q) return []
  const { index, notes } = await getBrainIndex()
  return index
    .search(q)
    .slice(0, limit)
    .map((r) => {
      const note = notes.get(String(r.id))
      return {
        path: String(r.id),
        title: note?.title ?? String(r.id),
        folder: note?.folder ?? '',
        tags: note?.tags ?? [],
        score: Math.round(r.score * 10) / 10,
        snippet: note ? makeSnippet(note.content, q) : '',
      }
    })
}

export async function getNote(path: string): Promise<BrainNote | undefined> {
  const direct = await db.notes.get(path)
  if (direct) return direct
  const { notes } = await getBrainIndex()
  const lower = path.toLowerCase().replace(/\.md$/i, '')
  for (const n of notes.values()) {
    const p = n.path.toLowerCase().replace(/\.md$/i, '')
    if (p === lower || p.endsWith('/' + lower) || n.title.toLowerCase() === lower) return n
  }
  return undefined
}

export function invalidateBrainIndex(): void {
  cache = null
}
