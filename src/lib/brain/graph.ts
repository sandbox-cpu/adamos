import type { BrainNote } from '../types'

export interface GraphNode {
  id: string
  title: string
  folder: string
  group: string
  tags: string[]
  degree: number
  words: number
  ghost?: boolean
}

export interface GraphLink {
  source: string
  target: string
}

export interface BrainGraph {
  nodes: GraphNode[]
  links: GraphLink[]
  groups: string[]
  resolver: LinkResolver
}

export class LinkResolver {
  private byPath = new Map<string, string>()
  private byName = new Map<string, string[]>()

  constructor(notes: Pick<BrainNote, 'path' | 'aliases'>[]) {
    for (const n of notes) {
      const noExt = n.path.replace(/\.md$/i, '').toLowerCase()
      this.byPath.set(noExt, n.path)
      const base = noExt.split('/').pop() ?? noExt
      this.addName(base, n.path)
      for (const a of n.aliases ?? []) this.addName(a.toLowerCase(), n.path)
    }
  }

  private addName(name: string, path: string) {
    const list = this.byName.get(name)
    if (list) {
      if (!list.includes(path)) list.push(path)
    } else this.byName.set(name, [path])
  }

  /** Resolves a link target the way Obsidian does: exact path first, then shortest matching name. */
  resolve(target: string, fromPath?: string): string | undefined {
    const t = target.trim().replace(/\.md$/i, '').replace(/^\/+/, '').toLowerCase()
    if (!t) return undefined
    const exact = this.byPath.get(t)
    if (exact) return exact
    if (t.includes('/')) {
      for (const [key, path] of this.byPath) if (key.endsWith('/' + t)) return path
    }
    const base = t.split('/').pop() ?? t
    const candidates = this.byName.get(base)
    if (!candidates?.length) return undefined
    if (candidates.length === 1) return candidates[0]
    const fromFolder = fromPath ? fromPath.split('/').slice(0, -1).join('/') : ''
    const sameFolder = candidates.find((c) => c.split('/').slice(0, -1).join('/') === fromFolder)
    return sameFolder ?? [...candidates].sort((a, b) => a.length - b.length)[0]
  }
}

export function topGroup(folder: string): string {
  return folder ? folder.split('/')[0] : 'Root'
}

export function buildGraph(notes: BrainNote[], opts: { includeGhosts?: boolean } = {}): BrainGraph {
  const resolver = new LinkResolver(notes)
  const nodes = new Map<string, GraphNode>()
  for (const n of notes) {
    nodes.set(n.path, {
      id: n.path,
      title: n.title,
      folder: n.folder,
      group: topGroup(n.folder),
      tags: n.tags,
      degree: 0,
      words: n.words,
    })
  }

  const seen = new Set<string>()
  const links: GraphLink[] = []
  for (const n of notes) {
    for (const raw of n.links) {
      let target = resolver.resolve(raw, n.path)
      if (!target) {
        if (!opts.includeGhosts) continue
        target = `ghost:${raw.toLowerCase()}`
        if (!nodes.has(target)) {
          nodes.set(target, { id: target, title: raw.split('/').pop() ?? raw, folder: '', group: 'Unresolved', tags: [], degree: 0, words: 0, ghost: true })
        }
      }
      if (target === n.path) continue
      const key = n.path < target ? `${n.path}\u0000${target}` : `${target}\u0000${n.path}`
      if (seen.has(key)) continue
      seen.add(key)
      links.push({ source: n.path, target })
      nodes.get(n.path)!.degree++
      nodes.get(target)!.degree++
    }
  }

  const groupCounts = new Map<string, number>()
  for (const node of nodes.values()) groupCounts.set(node.group, (groupCounts.get(node.group) ?? 0) + 1)
  const groups = [...groupCounts.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g)

  return { nodes: [...nodes.values()], links, groups, resolver }
}

/** Notes that link to the given note. */
export function backlinks(notes: BrainNote[], path: string, resolver: LinkResolver): BrainNote[] {
  return notes.filter((n) => n.path !== path && n.links.some((l) => resolver.resolve(l, n.path) === path))
}
