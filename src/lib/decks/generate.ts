import { db } from '../db'
import type { JSONSchema } from '../llm/types'
import { getLeadAgent, logActivity, MINUTES_SAVED } from '../ops'
import type { Agent, Deck, DeckBrief, Slide, SlideLayout } from '../types'
import { truncate, uid } from '../utils'
import { trackJob } from '../../stores/jobs'
import { runAgent } from '../agents/runtime'
import { generateAndSaveImage } from '../media/generate'

export const SLIDE_LAYOUTS: { id: SlideLayout; name: string; hint: string }[] = [
  { id: 'title', name: 'Title', hint: 'Big opening statement' },
  { id: 'section', name: 'Section', hint: 'Divider between chapters' },
  { id: 'bullets', name: 'Key points', hint: 'Headline with bullet points' },
  { id: 'two-column', name: 'Two columns', hint: 'Side-by-side points' },
  { id: 'big-stat', name: 'Big number', hint: 'One number that lands' },
  { id: 'stats', name: 'Numbers', hint: 'Three or four figures' },
  { id: 'quote', name: 'Quote', hint: 'A line worth remembering' },
  { id: 'image', name: 'Image', hint: 'Visual with a message' },
  { id: 'timeline', name: 'Timeline', hint: 'Steps or phases' },
  { id: 'comparison', name: 'Comparison', hint: 'This vs. that' },
  { id: 'chart', name: 'Chart', hint: 'Data made visual' },
  { id: 'agenda', name: 'Agenda', hint: 'What we’ll cover' },
  { id: 'closing', name: 'Closing', hint: 'Thank you and next steps' },
]

const LAYOUT_IDS = SLIDE_LAYOUTS.map((l) => l.id)

const SLIDE_SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    layout: { type: 'string', enum: LAYOUT_IDS },
    title: { type: 'string' },
    subtitle: { type: 'string' },
    body: { type: 'string' },
    bullets: { type: 'array', items: { type: 'string' } },
    columns: {
      type: 'array',
      items: {
        type: 'object',
        properties: { heading: { type: 'string' }, bullets: { type: 'array', items: { type: 'string' } } },
        required: ['heading', 'bullets'],
        additionalProperties: false,
      },
    },
    stats: {
      type: 'array',
      items: { type: 'object', properties: { value: { type: 'string' }, label: { type: 'string' } }, required: ['value', 'label'], additionalProperties: false },
    },
    quote: {
      type: 'object',
      properties: { text: { type: 'string' }, author: { type: 'string' }, role: { type: 'string' } },
      required: ['text'],
      additionalProperties: false,
    },
    items: {
      type: 'array',
      items: { type: 'object', properties: { label: { type: 'string' }, detail: { type: 'string' } }, required: ['label'], additionalProperties: false },
    },
    chart: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['bar', 'line', 'donut'] },
        labels: { type: 'array', items: { type: 'string' } },
        series: {
          type: 'array',
          items: {
            type: 'object',
            properties: { name: { type: 'string' }, values: { type: 'array', items: { type: 'number' } } },
            required: ['name', 'values'],
            additionalProperties: false,
          },
        },
      },
      required: ['kind', 'labels', 'series'],
      additionalProperties: false,
    },
    imagePrompt: { type: 'string', description: 'For image layouts: a description of a photo that fits the slide' },
    notes: { type: 'string', description: 'Speaker notes, two to four sentences' },
  },
  required: ['layout', 'title', 'notes'],
  additionalProperties: false,
}

const DECK_SCHEMA: JSONSchema = {
  type: 'object',
  properties: { title: { type: 'string' }, slides: { type: 'array', items: SLIDE_SCHEMA } },
  required: ['title', 'slides'],
  additionalProperties: false,
}

const SLIDE_RULES = `Slide rules:
- Start with a "title" slide and finish with a "closing" slide that has a clear ask or next step.
- For decks of eight or more slides, put an "agenda" slide second.
- Pick the best layout for each slide from: ${LAYOUT_IDS.join(', ')}. Vary layouts and never use the same one more than three times in a row.
- Slide titles are short, active statements (at most 8 words), not labels.
- 3–5 bullets per slide, each at most 14 words.
- Only use numbers that appear in the brief, research or source material. Never invent statistics. Where a number is needed but unknown, use a clear placeholder such as [X%] or label it as a target.
- Use "chart" only with real data provided; values must be numbers.
- For one or two slides, use the "image" layout with an imagePrompt describing a fitting photo (no text in the image).
- Write two to four sentences of speaker notes for every slide.`

function clean(v: unknown, max = 400): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

export function normaliseSlide(raw: unknown, keep?: Slide): Slide {
  const r = (raw ?? {}) as Record<string, unknown>
  let layout = (LAYOUT_IDS.includes(r.layout as SlideLayout) ? r.layout : 'bullets') as SlideLayout
  const list = (v: unknown, n: number) =>
    Array.isArray(v)
      ? v
          .map((x) => clean(x, 220))
          .filter(Boolean)
          .slice(0, n)
      : undefined
  const slide: Slide = {
    id: keep?.id ?? uid(),
    layout,
    title: clean(r.title, 160) || 'Untitled slide',
    subtitle: clean(r.subtitle, 240) || undefined,
    body: clean(r.body, 900) || undefined,
    bullets: list(r.bullets, 7),
    notes: clean(r.notes, 1600) || undefined,
    imagePrompt: clean(r.imagePrompt, 500) || undefined,
    image: keep?.image,
  }
  if (Array.isArray(r.columns)) {
    slide.columns = (r.columns as Record<string, unknown>[]).slice(0, 3).map((c) => ({ heading: clean(c?.heading, 80), bullets: list(c?.bullets, 6) ?? [] }))
  }
  if (Array.isArray(r.stats)) {
    slide.stats = (r.stats as Record<string, unknown>[])
      .slice(0, 4)
      .map((s) => ({ value: clean(s?.value, 24), label: clean(s?.label, 120) }))
      .filter((s) => s.value)
  }
  if (r.quote && typeof r.quote === 'object') {
    const q = r.quote as Record<string, unknown>
    if (clean(q.text)) slide.quote = { text: clean(q.text, 400), author: clean(q.author, 80) || undefined, role: clean(q.role, 80) || undefined }
  }
  if (Array.isArray(r.items)) {
    slide.items = (r.items as Record<string, unknown>[])
      .slice(0, 7)
      .map((i) => ({ label: clean(i?.label, 90), detail: clean(i?.detail, 200) || undefined }))
      .filter((i) => i.label)
  }
  if (r.chart && typeof r.chart === 'object') {
    const c = r.chart as Record<string, unknown>
    const labels = list(c.labels, 12) ?? []
    const series = Array.isArray(c.series)
      ? (c.series as Record<string, unknown>[])
          .map((s) => ({ name: clean(s?.name, 60), values: Array.isArray(s?.values) ? (s.values as unknown[]).map(Number).filter((n) => Number.isFinite(n)) : [] }))
          .filter((s) => s.values.length)
          .slice(0, 4)
      : []
    if (labels.length && series.length) slide.chart = { kind: c.kind === 'line' || c.kind === 'donut' ? c.kind : 'bar', labels, series }
  }
  // Fall back gracefully when a layout is missing the content it needs.
  if (layout === 'chart' && !slide.chart) layout = 'bullets'
  if (layout === 'big-stat' && !slide.stats?.length) layout = 'bullets'
  if (layout === 'stats' && !slide.stats?.length) layout = 'bullets'
  if (layout === 'quote' && !slide.quote) layout = slide.bullets?.length ? 'bullets' : 'section'
  if (layout === 'two-column' && !slide.columns?.length) layout = 'bullets'
  if ((layout === 'timeline' || layout === 'agenda') && !slide.items?.length) {
    if (slide.bullets?.length) slide.items = slide.bullets.map((b) => ({ label: b }))
    else layout = 'bullets'
  }
  slide.layout = layout
  return slide
}

function demoDeck(brief: DeckBrief, title: string): { title: string; slides: unknown[] } {
  const topic = brief.topic || title
  const messages = brief.keyMessages
    .split(/[;\n]|,(?=\s*[A-Z])/)
    .map((m) => m.trim())
    .filter(Boolean)
  const points = messages.length >= 3 ? messages : ['Why this matters now', 'What we recommend', 'How we will measure success']
  return {
    title,
    slides: [
      { layout: 'title', title, subtitle: brief.audience ? `Prepared for ${brief.audience}` : 'Presentation', notes: `Welcome everyone. Today is about ${topic}.` },
      {
        layout: 'agenda',
        title: 'What we’ll cover',
        items: [{ label: 'The opportunity' }, { label: 'Our approach' }, { label: 'The plan' }, { label: 'Next steps' }],
        notes: 'A quick map of the session.',
      },
      { layout: 'section', title: 'The opportunity', subtitle: truncate(topic, 120), notes: 'Set up the context before the recommendation.' },
      { layout: 'bullets', title: 'Why this matters now', bullets: points.slice(0, 4), notes: 'Walk through each point and connect it to the audience’s goals.' },
      {
        layout: 'two-column',
        title: 'Where we play',
        columns: [
          { heading: 'What we do', bullets: ['Lead with a sharp idea', 'Earn attention first', 'Prove results early'] },
          { heading: 'What we avoid', bullets: ['Spreading budget thin', 'Generic messaging', 'Vanity metrics'] },
        ],
        notes: 'Be explicit about the trade-offs.',
      },
      {
        layout: 'image',
        title: 'Bringing it to life',
        body: 'A single, memorable moment people will talk about and share.',
        imagePrompt: `${topic}, a memorable real-world moment, people engaged and smiling`,
        notes: 'Paint the picture of the idea in action.',
      },
      {
        layout: 'timeline',
        title: 'The plan',
        items: [
          { label: 'Weeks 1–2', detail: 'Insight and idea' },
          { label: 'Weeks 3–4', detail: 'Create and prepare' },
          { label: 'Week 5', detail: 'Launch' },
          { label: 'Week 6+', detail: 'Measure and scale' },
        ],
        notes: 'Keep momentum with a clear rhythm.',
      },
      {
        layout: 'stats',
        title: 'What success looks like',
        stats: [
          { value: '[X]', label: 'pieces of quality coverage (target)' },
          { value: '[Y%]', label: 'uplift in awareness (target)' },
          { value: '6', label: 'weeks to first results' },
        ],
        notes: 'Agree targets together; the placeholders are for us to fill in.',
      },
      { layout: 'closing', title: 'Let’s make it happen', subtitle: 'Next step: agree the plan and start this week.', notes: 'Close with the ask and the next action.' },
    ],
  }
}

async function deckAgent(deck: Deck): Promise<Agent> {
  if (deck.agentId) {
    const a = await db.agents.get(deck.agentId)
    if (a) return a
  }
  const agents = await db.agents.toArray()
  return agents.find((a) => a.roleId === 'creative' && a.status === 'active') ?? agents.find((a) => a.roleId === 'creative') ?? (await getLeadAgent())!
}

function briefText(deck: Deck): string {
  const b = deck.brief
  return [
    `Deck title: ${deck.title}`,
    `Brief: ${b.topic}`,
    b.audience && `Audience: ${b.audience}`,
    b.goal && `Goal: ${b.goal}`,
    b.keyMessages && `Key messages: ${b.keyMessages}`,
    b.tone && `Tone: ${b.tone}`,
    `Number of slides: about ${b.slideCount}`,
  ]
    .filter(Boolean)
    .join('\n')
}

export async function createDeck(input: { title: string; brief: DeckBrief; themeId?: string; agentId?: string; projectId?: string }): Promise<Deck> {
  const t = Date.now()
  const deck: Deck = {
    id: uid(),
    title: input.title.trim() || 'Untitled deck',
    brief: input.brief,
    themeId: input.themeId ?? 'midnight',
    slides: [],
    status: 'generating',
    stage: 'Getting started',
    agentId: input.agentId,
    projectId: input.projectId,
    createdAt: t,
    updatedAt: t,
  }
  await db.decks.put(deck)
  return deck
}

/** Research (optional) → full slide content. Runs in the background. */
export async function generateDeck(deckId: string, signal?: AbortSignal): Promise<void> {
  const deck = await db.decks.get(deckId)
  if (!deck) return
  const agent = await deckAgent(deck)
  await trackJob({ id: `deck:${deckId}`, kind: 'deck', title: deck.title, stage: 'Starting', agentId: agent.id, link: `/decks/${deckId}` }, async (setStage) => {
    const stage = async (s: string) => {
      setStage(s)
      await db.decks.update(deckId, { stage: s, updatedAt: Date.now() })
    }
    try {
      let research = deck.research ?? ''
      if (deck.brief.useWeb && !research) {
        await stage(`${agent.name} is researching`)
        const r = await runAgent({
          agent,
          prompt: `Research facts, figures, examples and context for a presentation.\n\n${briefText(deck)}\n\nReturn concise bullet-point notes grouped by theme, with the source for every number. Only include facts you can verify.`,
          toolAccess: 'read',
          webSearch: true,
          thinkingDepth: 'balanced',
          maxTokens: 12000,
          signal,
        })
        research = r.text
        await db.decks.update(deckId, { research })
      }
      await stage(`${agent.name} is writing the slides`)
      const res = await runAgent({
        agent,
        mode: 'studio',
        prompt: `Create a presentation.\n\n${briefText(deck)}\n${deck.brief.sources ? `\nSource material:\n${truncate(deck.brief.sources, 20000)}\n` : ''}${research ? `\nResearch notes:\n${truncate(research, 16000)}\n` : ''}\n${SLIDE_RULES}`,
        toolAccess: 'read',
        webSearch: false,
        thinkingDepth: 'balanced',
        maxTokens: 24000,
        json: { name: 'deck', schema: DECK_SCHEMA },
        demo: { json: () => demoDeck(deck.brief, deck.title) },
        signal,
      })
      const data = res.json as { title?: string; slides?: unknown[] }
      const slides = (data.slides ?? []).map((s) => normaliseSlide(s))
      if (!slides.length) throw new Error('The agent returned an empty deck. Try again with a little more detail in the brief.')
      await db.decks.update(deckId, { slides, status: 'ready', stage: undefined, error: undefined, updatedAt: Date.now() })
      void logActivity('deck', `${agent.name} created the deck “${deck.title}”`, { agentId: agent.id, minutesSaved: res.demo ? 0 : MINUTES_SAVED.deck, link: `/decks/${deckId}` })
      void illustrateDeck(deckId, 3)
    } catch (err) {
      await db.decks.update(deckId, { status: 'error', stage: undefined, error: err instanceof Error ? err.message : 'Deck generation failed' })
      throw err
    }
  })
}

/** Creates images for slides that asked for one, a few at a time. */
export async function illustrateDeck(deckId: string, max = 3): Promise<void> {
  const deck = await db.decks.get(deckId)
  if (!deck) return
  const targets = deck.slides.filter((s) => s.imagePrompt && !s.image?.mediaId && !s.image?.url).slice(0, max)
  for (const slide of targets) {
    try {
      const media = await generateAndSaveImage({ prompt: slide.imagePrompt!, styleId: 'editorial', aspectId: 'landscape', projectId: deck.projectId, log: false })
      const latest = await db.decks.get(deckId)
      if (!latest) return
      await db.decks.update(deckId, {
        slides: latest.slides.map((s) => (s.id === slide.id ? { ...s, image: { mediaId: media.id, alt: slide.imagePrompt } } : s)),
        updatedAt: Date.now(),
      })
    } catch {
      // Images are a bonus; the deck is complete without them.
    }
  }
}

export async function startDeckFromBrief(input: {
  title: string
  topic: string
  audience?: string
  slideCount?: number
  agentId?: string
  projectId?: string
  sources?: string
  useWeb?: boolean
}): Promise<Deck> {
  const deck = await createDeck({
    title: input.title,
    agentId: input.agentId,
    projectId: input.projectId,
    brief: {
      topic: input.topic,
      audience: input.audience ?? '',
      goal: '',
      keyMessages: '',
      tone: 'Confident, clear and human',
      slideCount: input.slideCount ?? 10,
      sources: input.sources,
      useWeb: input.useWeb ?? !input.sources,
    },
  })
  void generateDeck(deck.id).catch(() => undefined)
  return deck
}

export async function reviseDeck(deckId: string, instruction: string, signal?: AbortSignal): Promise<void> {
  const deck = await db.decks.get(deckId)
  if (!deck) return
  const agent = await deckAgent(deck)
  await trackJob(
    { id: `deck-revise:${deckId}`, kind: 'deck', title: `Updating ${deck.title}`, stage: `${agent.name} is editing`, agentId: agent.id, link: `/decks/${deckId}` },
    async () => {
      await db.decks.update(deckId, { status: 'generating', stage: `${agent.name} is updating the deck` })
      try {
        const current = { title: deck.title, slides: deck.slides.map(({ id: _id, image: _image, ...rest }) => rest) }
        const res = await runAgent({
          agent,
          mode: 'studio',
          prompt: `Here is the current deck as JSON:\n${JSON.stringify(current)}\n\nChange request: ${instruction}\n\nReturn the complete updated deck. Keep slides that don’t need to change exactly as they are, in the same order.\n\n${SLIDE_RULES}`,
          toolAccess: 'none',
          webSearch: false,
          thinkingDepth: 'balanced',
          maxTokens: 24000,
          json: { name: 'deck', schema: DECK_SCHEMA },
          demo: { json: () => ({ ...current, slides: current.slides.map((s, i) => (i === 1 ? { ...s, subtitle: `Updated: ${truncate(instruction, 60)}` } : s)) }) },
          signal,
        })
        const data = res.json as { title?: string; slides?: unknown[] }
        const slides = (data.slides ?? []).map((s, i) => {
          const prev = deck.slides[i]
          const next = normaliseSlide(s, prev)
          return prev && prev.title === next.title ? { ...next, image: prev.image } : { ...next, image: prev?.image && next.layout === 'image' ? prev.image : next.image }
        })
        await db.decks.update(deckId, {
          slides: slides.length ? slides : deck.slides,
          title: data.title?.trim() || deck.title,
          status: 'ready',
          stage: undefined,
          updatedAt: Date.now(),
        })
        void illustrateDeck(deckId, 2)
      } catch (err) {
        await db.decks.update(deckId, { status: 'ready', stage: undefined })
        throw err
      }
    },
  )
}

export async function reviseSlide(deckId: string, slideId: string, instruction: string, signal?: AbortSignal): Promise<void> {
  const deck = await db.decks.get(deckId)
  const slide = deck?.slides.find((s) => s.id === slideId)
  if (!deck || !slide) return
  const agent = await deckAgent(deck)
  const { id: _id, image: _image, ...current } = slide
  const res = await runAgent({
    agent,
    mode: 'studio',
    prompt: `Deck: ${deck.title} (${deck.brief.topic}).\n\nCurrent slide as JSON:\n${JSON.stringify(current)}\n\nChange request: ${instruction}\n\nReturn the updated slide only.\n\n${SLIDE_RULES}`,
    toolAccess: 'none',
    webSearch: false,
    thinkingDepth: 'quick',
    maxTokens: 6000,
    json: { name: 'slide', schema: SLIDE_SCHEMA },
    demo: { json: () => ({ ...current, title: current.title, subtitle: `Revised: ${truncate(instruction, 60)}`, notes: current.notes ?? '' }) },
    signal,
  })
  const next = normaliseSlide(res.json, slide)
  const latest = await db.decks.get(deckId)
  if (!latest) return
  await db.decks.update(deckId, { slides: latest.slides.map((s) => (s.id === slideId ? next : s)), updatedAt: Date.now() })
}
