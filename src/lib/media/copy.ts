import { db } from '../db'
import type { JSONSchema } from '../llm/types'
import { getLeadAgent } from '../ops'
import { truncate } from '../utils'
import { runAgent } from '../agents/runtime'
import type { GraphicLayoutId } from './graphics'

export interface GraphicCopy {
  eyebrow: string
  headline: string
  body: string
  cta: string
  caption: string
}

const SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    eyebrow: { type: 'string' },
    headline: { type: 'string' },
    body: { type: 'string' },
    cta: { type: 'string' },
    caption: { type: 'string', description: 'A ready-to-post caption with two to four relevant hashtags' },
  },
  required: ['headline', 'body', 'caption'],
  additionalProperties: false,
}

const GUIDE: Record<GraphicLayoutId, string> = {
  announcement: 'eyebrow: a 1–3 word label. headline: at most 9 punchy words. body: at most 18 words. cta: 2–3 words.',
  quote:
    'headline: the quote itself, at most 25 words. body: who said it. Only attribute words to a named person if the brief gives both the words and the person; otherwise write it as the brand’s own line and attribute it to the brand.',
  event:
    'eyebrow: the date in short form such as "THU 16 OCT" if the brief gives one, otherwise "Save the date". headline: the event name. body: time and place if given. cta: 2–3 words.',
  stat: 'headline: the number exactly as the brief gives it. Never invent a number; if none is given, use [X]. body: what the number means, at most 12 words.',
}

function sentence(text: string): string {
  const t = text.trim().replace(/[.\s]+$/, '')
  return t ? t[0].toUpperCase() + t.slice(1) : t
}

function demoCopy(about: string, layout: GraphicLayoutId, brand: string): GraphicCopy {
  const idea = sentence(about) || 'Something new is on the way'
  const caption = `${idea}. ✨\n\nMore soon.${brand ? ` #${brand.replace(/[^a-z0-9]/gi, '')}` : ''} #News`
  switch (layout) {
    case 'quote':
      return { eyebrow: 'In their words', headline: truncate(idea, 140), body: brand || 'Our team', cta: '', caption }
    case 'event':
      return { eyebrow: 'Save the date', headline: truncate(idea, 60), body: 'Time · Place', cta: 'Save your place', caption }
    case 'stat': {
      const number = about.match(/[£$€]?\d[\d,.]*\s*(%|x|k|m|bn)?/i)?.[0]?.trim()
      return { eyebrow: 'By the numbers', headline: number || '[X]', body: truncate(sentence(number ? about.replace(number, '') : about), 80), cta: '', caption }
    }
    default:
      return { eyebrow: 'Announcing', headline: truncate(idea, 70), body: 'Here’s what you need to know, and why it matters.', cta: 'Find out more', caption }
  }
}

/** Writes the words for a social graphic, plus a caption to post with it. */
export async function writeGraphicCopy(input: { about: string; layout: GraphicLayoutId; brand: string; signal?: AbortSignal }): Promise<GraphicCopy> {
  const agents = await db.agents.toArray()
  const active = agents.filter((a) => a.status === 'active')
  const agent = active.find((a) => a.roleId === 'social') ?? active.find((a) => a.roleId === 'copywriter') ?? active.find((a) => a.roleId === 'creative') ?? (await getLeadAgent())
  if (!agent) return demoCopy(input.about, input.layout, input.brand)
  const res = await runAgent({
    agent,
    mode: 'studio',
    prompt: `Write the words for a social media graphic${input.brand ? ` for ${input.brand}` : ''}.\n\nWhat it's about: ${input.about}\n\nLayout: ${input.layout}. ${GUIDE[input.layout]}\nKeep every line short enough to read at a glance on a phone. Don't use hashtags or emoji on the graphic itself; put them in the caption.`,
    toolAccess: 'none',
    webSearch: false,
    thinkingDepth: 'quick',
    maxTokens: 4000,
    json: { name: 'social_graphic', schema: SCHEMA },
    demo: { json: () => demoCopy(input.about, input.layout, input.brand) },
    signal: input.signal,
  })
  const d = (res.json ?? {}) as Partial<GraphicCopy>
  const pick = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  return { eyebrow: pick(d.eyebrow, 40), headline: pick(d.headline, 200), body: pick(d.body, 200), cta: pick(d.cta, 30), caption: pick(d.caption, 2200) }
}
