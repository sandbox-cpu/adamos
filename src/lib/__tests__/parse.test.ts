import { describe, expect, it } from 'vitest'
import { buildNote, normaliseLinkTarget, parseMarkdown, plainText } from '../brain/parse'
import { buildGraph, LinkResolver } from '../brain/graph'

describe('obsidian parsing', () => {
  it('reads frontmatter tags, inline tags and aliases', () => {
    const p = parseMarkdown(`---\ntags: [Client, food-drink]\naliases: [NW]\n---\n# Hello\nWorking on #launch/autumn and #Q4.\n\`#notatag\`\nIssue #123 is not a tag`)
    expect(p.tags).toEqual(expect.arrayContaining(['client', 'food-drink', 'launch/autumn', 'q4']))
    expect(p.tags).not.toContain('notatag')
    expect(p.tags).not.toContain("123")
    expect(p.aliases).toEqual(['NW'])
  })

  it('extracts wikilinks, embeds and markdown links but skips attachments', () => {
    const p = parseMarkdown('See [[Clients/Northwind Coffee|Northwind]] and [[Launch Playbook#Steps]]. ![[chart.png]] ![[Embedded Note]] [doc](Other%20Note.md) [web](https://example.com/page.md)')
    expect(p.links).toEqual(['Clients/Northwind Coffee', 'Launch Playbook', 'Embedded Note', 'Other Note'])
  })

  it('normalises link targets', () => {
    expect(normaliseLinkTarget('Folder/Note.md#Heading|Alias')).toBe('Folder/Note')
    expect(normaliseLinkTarget('Note^block')).toBe('Note')
  })

  it('produces readable plain text', () => {
    expect(plainText('---\na: 1\n---\n# Title\n**Bold** [[Target|Shown]] and [link](http://x.com)')).toBe('Title Bold Shown and link')
  })
})

describe('link resolution and graph', () => {
  const notes = [
    buildNote('Clients/Northwind Coffee.md', '# NW\n[[Autumn Blend Launch]] [[Priya Shah]] [[Missing Note]]', 1),
    buildNote('Campaigns/Autumn Blend Launch.md', 'For [[Northwind Coffee]]', 2),
    buildNote('Media/Priya Shah.md', '---\naliases: [Priya]\n---\nJournalist', 3),
    buildNote('Archive/Priya Shah.md', 'Old copy', 4),
  ]

  it('resolves by path, name and alias, preferring the same folder', () => {
    const r = new LinkResolver(notes)
    expect(r.resolve('Northwind Coffee')).toBe('Clients/Northwind Coffee.md')
    expect(r.resolve('Media/Priya Shah')).toBe('Media/Priya Shah.md')
    expect(r.resolve('priya')).toBe('Media/Priya Shah.md')
    expect(r.resolve('Priya Shah', 'Archive/Other.md')).toBe('Archive/Priya Shah.md')
    expect(r.resolve('Nope')).toBeUndefined()
  })

  it('builds an undirected graph without duplicates and counts degree', () => {
    const g = buildGraph(notes)
    expect(g.links).toHaveLength(2)
    const nw = g.nodes.find((n) => n.id === 'Clients/Northwind Coffee.md')!
    expect(nw.degree).toBe(2)
    const withGhosts = buildGraph(notes, { includeGhosts: true })
    expect(withGhosts.nodes.some((n) => n.ghost)).toBe(true)
  })
})
