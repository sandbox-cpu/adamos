import { parse as parseYaml } from 'yaml'
import type { BrainNote } from '../types'

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/
const WIKILINK = /(!?)\[\[([^\]\n]+?)\]\]/g
const MD_LINK = /\[[^\]\n]*\]\(([^)\s]+?\.md)(?:#[^)]*)?\)/gi
const TAG = /(^|[\s(])#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/gu
const ATTACHMENT = /\.(png|jpe?g|gif|webp|svg|pdf|mp3|mp4|mov|wav|m4a|webm|excalidraw|canvas)$/i

export interface ParsedNote {
  frontmatter?: Record<string, unknown>
  body: string
  tags: string[]
  links: string[]
  aliases: string[]
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean)
  if (typeof value === 'string') return value.split(/[,\s]+/).filter(Boolean)
  return []
}

/** Removes fenced and inline code so tags and links inside code are ignored. */
function stripCode(text: string): string {
  return text.replace(/```[\s\S]*?```/g, ' ').replace(/~~~[\s\S]*?~~~/g, ' ').replace(/`[^`\n]*`/g, ' ')
}

export function parseMarkdown(raw: string): ParsedNote {
  let body = raw
  let frontmatter: Record<string, unknown> | undefined
  const fm = FRONTMATTER.exec(raw)
  if (fm) {
    body = raw.slice(fm[0].length)
    try {
      const data = parseYaml(fm[1])
      if (data && typeof data === 'object' && !Array.isArray(data)) frontmatter = data as Record<string, unknown>
    } catch {
      frontmatter = undefined
    }
  }

  const tags = new Set<string>()
  for (const t of toStringList(frontmatter?.tags ?? frontmatter?.tag)) tags.add(t.replace(/^#/, '').toLowerCase())
  const aliases = toStringList(frontmatter?.aliases ?? frontmatter?.alias)

  const scan = stripCode(body)
  for (const m of scan.matchAll(TAG)) tags.add(m[2].toLowerCase())

  const links = new Set<string>()
  for (const m of scan.matchAll(WIKILINK)) {
    const target = normaliseLinkTarget(m[2])
    if (target && !ATTACHMENT.test(target)) links.add(target)
  }
  for (const m of scan.matchAll(MD_LINK)) {
    if (/^[a-z]+:\/\//i.test(m[1])) continue
    let target = m[1]
    try {
      target = decodeURIComponent(target)
    } catch {
      /* keep the raw target */
    }
    links.add(target.replace(/^\.\//, '').replace(/\.md$/i, ''))
  }

  return { frontmatter, body, tags: [...tags], links: [...links], aliases }
}

/** "Folder/Note#Heading|Alias" → "Folder/Note" */
export function normaliseLinkTarget(inner: string): string {
  return inner.split('|')[0].split('#')[0].split('^')[0].trim().replace(/\.md$/i, '')
}

export function noteTitleFromPath(path: string): string {
  const base = path.split('/').pop() ?? path
  return base.replace(/\.md$/i, '')
}

export function folderOf(path: string): string {
  const parts = path.split('/')
  parts.pop()
  return parts.join('/')
}

export function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}’']+/gu)
  return m ? m.length : 0
}

export function buildNote(path: string, raw: string, mtime: number, extra?: Partial<BrainNote>): BrainNote {
  const parsed = parseMarkdown(raw)
  return {
    path,
    title: noteTitleFromPath(path),
    folder: folderOf(path),
    content: raw,
    tags: parsed.tags,
    links: parsed.links,
    aliases: parsed.aliases,
    frontmatter: parsed.frontmatter,
    mtime,
    size: raw.length,
    words: countWords(parsed.body),
    ...extra,
  }
}

/** Plain text preview with markdown syntax removed. */
export function plainText(markdown: string): string {
  return markdown
    .replace(FRONTMATTER, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[\[[^\]]*\]\]/g, ' ')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~`>]/g, '')
    .replace(/^\s*[-+]\s+\[[ xX]\]\s+/gm, '')
    .replace(/^\s*[-+*]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}
