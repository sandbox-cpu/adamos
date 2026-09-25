import { db, kvDelete, kvGet, kvSet } from '../db'
import type { BrainNote } from '../types'
import { isoDate, safeFileName } from '../utils'
import { buildNote } from './parse'
import { invalidateBrainIndex } from './search'

const HANDLE_KEY = 'brain.handle'
const SKIP_DIRS = new Set(['.obsidian', '.trash', '.git', 'node_modules', '.github'])

type PermissionMode = 'read' | 'readwrite'

interface PermissionCapableHandle extends FileSystemDirectoryHandle {
  queryPermission?: (desc: { mode: PermissionMode }) => Promise<PermissionState>
  requestPermission?: (desc: { mode: PermissionMode }) => Promise<PermissionState>
}

declare global {
  interface Window {
    showDirectoryPicker?: (options?: { id?: string; mode?: PermissionMode; startIn?: string }) => Promise<FileSystemDirectoryHandle>
  }
}

export function canLinkFolders(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

export async function pickVaultFolder(): Promise<FileSystemDirectoryHandle> {
  if (!window.showDirectoryPicker) throw new Error('This browser cannot link folders directly. Use Chrome, Edge, Arc or Brave, or upload a copy of your vault instead.')
  const handle = await window.showDirectoryPicker({ id: 'obsidian-vault', mode: 'readwrite' })
  await kvSet(HANDLE_KEY, handle)
  return handle
}

export async function getSavedHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  return kvGet<FileSystemDirectoryHandle>(HANDLE_KEY)
}

export async function forgetVault(): Promise<void> {
  await kvDelete(HANDLE_KEY)
}

export async function hasPermission(handle: FileSystemDirectoryHandle, mode: PermissionMode = 'read'): Promise<boolean> {
  const h = handle as PermissionCapableHandle
  if (!h.queryPermission) return true
  return (await h.queryPermission({ mode })) === 'granted'
}

/** Must be called from a user gesture (click) when permission is not already granted. */
export async function ensurePermission(handle: FileSystemDirectoryHandle, mode: PermissionMode = 'read'): Promise<boolean> {
  const h = handle as PermissionCapableHandle
  if (!h.queryPermission || !h.requestPermission) return true
  if ((await h.queryPermission({ mode })) === 'granted') return true
  return (await h.requestPermission({ mode })) === 'granted'
}

export interface ScanProgress {
  found: number
  read: number
  current?: string
}

async function collectMarkdown(dir: FileSystemDirectoryHandle, prefix: string, out: { path: string; handle: FileSystemFileHandle }[]) {
  for await (const entry of dir.values()) {
    if (entry.kind === 'directory') {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
      await collectMarkdown(entry as FileSystemDirectoryHandle, prefix + entry.name + '/', out)
    } else if (entry.name.toLowerCase().endsWith('.md')) {
      out.push({ path: prefix + entry.name, handle: entry as FileSystemFileHandle })
    }
  }
}

export async function scanFolder(handle: FileSystemDirectoryHandle, onProgress?: (p: ScanProgress) => void): Promise<BrainNote[]> {
  const files: { path: string; handle: FileSystemFileHandle }[] = []
  await collectMarkdown(handle, '', files)
  onProgress?.({ found: files.length, read: 0 })
  const notes: BrainNote[] = []
  let read = 0
  const batch = 24
  for (let i = 0; i < files.length; i += batch) {
    const slice = files.slice(i, i + batch)
    const results = await Promise.all(
      slice.map(async (f) => {
        try {
          const file = await f.handle.getFile()
          const text = await file.text()
          return buildNote(f.path, text, file.lastModified)
        } catch {
          return null
        }
      }),
    )
    for (const r of results) if (r) notes.push(r)
    read += slice.length
    onProgress?.({ found: files.length, read, current: slice[slice.length - 1]?.path })
  }
  return notes
}

/** Reads a vault chosen with <input type="file" webkitdirectory>. */
export async function scanUploadedFiles(files: FileList | File[], onProgress?: (p: ScanProgress) => void): Promise<{ notes: BrainNote[]; vaultName: string }> {
  const list = Array.from(files).filter((f) => f.name.toLowerCase().endsWith('.md'))
  const notes: BrainNote[] = []
  let vaultName = 'Uploaded vault'
  let read = 0
  for (const f of list) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
    const parts = rel.split('/')
    if (parts.length > 1) vaultName = parts[0]
    const inner = parts.length > 1 ? parts.slice(1) : parts
    if (inner.some((p) => p.startsWith('.') || SKIP_DIRS.has(p))) continue
    const path = inner.join('/')
    notes.push(buildNote(path, await f.text(), f.lastModified))
    read++
    if (read % 25 === 0) onProgress?.({ found: list.length, read, current: path })
  }
  onProgress?.({ found: list.length, read })
  return { notes, vaultName }
}

/** Replaces the stored notes with a fresh scan (demo notes are removed). */
export async function replaceNotes(notes: BrainNote[]): Promise<void> {
  await db.transaction('rw', db.notes, async () => {
    await db.notes.clear()
    await db.notes.bulkPut(notes)
  })
  invalidateBrainIndex()
}

async function getDir(root: FileSystemDirectoryHandle, folder: string): Promise<FileSystemDirectoryHandle> {
  let dir = root
  for (const part of folder.split('/').filter(Boolean)) {
    dir = await dir.getDirectoryHandle(part, { create: true })
  }
  return dir
}

async function fileExists(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await dir.getFileHandle(name)
    return true
  } catch {
    return false
  }
}

async function writeFile(dir: FileSystemDirectoryHandle, name: string, content: string) {
  const fh = await dir.getFileHandle(name, { create: true })
  const writable = await fh.createWritable()
  await writable.write(content)
  await writable.close()
}

export interface SaveResult {
  path: string
  savedToDisk: boolean
}

/**
 * Creates a new note. Existing notes are never overwritten: a numbered
 * suffix is added when the name is taken. Without a linked folder the note is
 * kept inside the OS brain only.
 */
export async function saveNewNote(folder: string, title: string, content: string): Promise<SaveResult> {
  const base = safeFileName(title)
  const handle = await getSavedHandle()
  if (handle && (await hasPermission(handle, 'readwrite'))) {
    const dir = await getDir(handle, folder)
    let name = `${base}.md`
    let n = 2
    while (await fileExists(dir, name)) name = `${base} ${n++}.md`
    await writeFile(dir, name, content)
    const path = folder ? `${folder}/${name}` : name
    await db.notes.put(buildNote(path, content, Date.now()))
    invalidateBrainIndex()
    return { path, savedToDisk: true }
  }
  let path = folder ? `${folder}/${base}.md` : `${base}.md`
  let n = 2
  while (await db.notes.get(path)) path = folder ? `${folder}/${base} ${n++}.md` : `${base} ${n++}.md`
  await db.notes.put(buildNote(path, content, Date.now()))
  invalidateBrainIndex()
  return { path, savedToDisk: false }
}

/** Appends a block to today's daily note, creating it if needed. */
export async function appendToDailyNote(dailyFolder: string, block: string): Promise<SaveResult> {
  const name = `${isoDate()}.md`
  const path = dailyFolder ? `${dailyFolder}/${name}` : name
  const handle = await getSavedHandle()
  if (handle && (await hasPermission(handle, 'readwrite'))) {
    const dir = await getDir(handle, dailyFolder)
    let existing = ''
    if (await fileExists(dir, name)) existing = await (await (await dir.getFileHandle(name)).getFile()).text()
    const next = (existing ? existing.replace(/\s*$/, '') + '\n\n' : `# ${isoDate()}\n\n`) + block + '\n'
    await writeFile(dir, name, next)
    await db.notes.put(buildNote(path, next, Date.now()))
    invalidateBrainIndex()
    return { path, savedToDisk: true }
  }
  const current = await db.notes.get(path)
  const next = (current ? current.content.replace(/\s*$/, '') + '\n\n' : `# ${isoDate()}\n\n`) + block + '\n'
  await db.notes.put(buildNote(path, next, Date.now()))
  invalidateBrainIndex()
  return { path, savedToDisk: false }
}

export function obsidianUri(vaultName: string | undefined, path: string): string | undefined {
  if (!vaultName) return undefined
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(path.replace(/\.md$/i, ''))}`
}
