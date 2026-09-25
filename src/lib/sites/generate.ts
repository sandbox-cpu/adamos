import { db } from '../db'
import type { JSONSchema } from '../llm/types'
import { getLeadAgent, logActivity, MINUTES_SAVED } from '../ops'
import type { Agent, Site, SiteBrief, SiteItem, SiteSection, SiteSectionType } from '../types'
import { truncate, uid } from '../utils'
import { trackJob } from '../../stores/jobs'
import { runAgent } from '../agents/runtime'
import { fullPrompt, pollinationsUrl } from '../media/generate'
import { extractHtml } from './render'
import { presetById, SITE_PRESETS } from './themes'

export const SECTION_TYPES: { id: SiteSectionType; name: string; hint: string; emoji: string }[] = [
  { id: 'hero', name: 'Hero', hint: 'Big headline and buttons', emoji: '🚀' },
  { id: 'logos', name: 'Logo strip', hint: 'Partners, press or clients', emoji: '🏷️' },
  { id: 'features', name: 'Features', hint: 'Three to six reasons to care', emoji: '✨' },
  { id: 'stats', name: 'Numbers', hint: 'Figures that impress', emoji: '📈' },
  { id: 'split', name: 'Story block', hint: 'Text beside an image', emoji: '🖼️' },
  { id: 'testimonials', name: 'Quotes', hint: 'What people say', emoji: '💬' },
  { id: 'timeline', name: 'Timeline', hint: 'Agenda, steps or schedule', emoji: '🗓️' },
  { id: 'faq', name: 'FAQ', hint: 'Questions and answers', emoji: '❓' },
  { id: 'cta', name: 'Call to action', hint: 'The big ask', emoji: '👉' },
  { id: 'contact', name: 'Contact', hint: 'How to get in touch', emoji: '✉️' },
  { id: 'footer', name: 'Footer', hint: 'Sign-off', emoji: '⬇️' },
]

const TYPE_IDS = SECTION_TYPES.map((t) => t.id)

const ITEM_SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    body: { type: 'string' },
    value: { type: 'string' },
    label: { type: 'string' },
    icon: { type: 'string', description: 'A single emoji' },
    name: { type: 'string' },
    role: { type: 'string' },
    quote: { type: 'string' },
  },
  additionalProperties: false,
}

const SECTION_SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: TYPE_IDS },
    eyebrow: { type: 'string' },
    heading: { type: 'string' },
    subheading: { type: 'string' },
    body: { type: 'string' },
    items: { type: 'array', items: ITEM_SCHEMA },
    ctaLabel: { type: 'string' },
    ctaHref: { type: 'string' },
    cta2Label: { type: 'string' },
    cta2Href: { type: 'string' },
    imagePrompt: { type: 'string', description: 'For hero or story sections: a description of a fitting photo, no text' },
  },
  required: ['type', 'heading'],
  additionalProperties: false,
}

const SITE_SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    pageTitle: { type: 'string' },
    suggestedTheme: { type: 'string', enum: SITE_PRESETS.map((p) => p.id) },
    primaryColor: { type: 'string', description: 'Hex colour, e.g. #f59e0b' },
    secondaryColor: { type: 'string', description: 'Hex colour' },
    sections: { type: 'array', items: SECTION_SCHEMA },
  },
  required: ['pageTitle', 'sections'],
  additionalProperties: false,
}

const PAGE_RULES = `Landing page rules:
- Start with a "hero" section and end with a "footer". Include a "cta" section near the end.
- Choose the sections that best serve the purpose from: ${TYPE_IDS.join(', ')}. Six to nine sections is ideal.
- Headlines are short, specific and benefit-led. Body copy is warm, clear and scannable.
- Features: 3–6 items, each with an emoji icon, a short title and one or two sentences.
- Never invent statistics, awards, partner names or testimonials. Only include numbers, quotes or logos the brief provides; otherwise leave those sections out.
- Button links: use the call-to-action link from the brief, or "#" anchors.
- Give the hero and at most one story section an imagePrompt describing a fitting, high-quality photo with no text.`

const HEX = /^#[0-9a-f]{6}$/i

function clean(v: unknown, max = 600): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

export function normaliseSection(raw: unknown, keep?: SiteSection): SiteSection {
  const r = (raw ?? {}) as Record<string, unknown>
  const type = (TYPE_IDS.includes(r.type as SiteSectionType) ? r.type : 'split') as SiteSectionType
  const items: SiteItem[] | undefined = Array.isArray(r.items)
    ? (r.items as Record<string, unknown>[]).slice(0, 8).map((i) => ({
        title: clean(i?.title, 140) || undefined,
        body: clean(i?.body, 500) || undefined,
        value: clean(i?.value, 24) || undefined,
        label: clean(i?.label, 120) || undefined,
        icon: clean(i?.icon, 8) || undefined,
        name: clean(i?.name, 80) || undefined,
        role: clean(i?.role, 100) || undefined,
        quote: clean(i?.quote, 500) || undefined,
      }))
    : undefined
  const section: SiteSection = {
    id: keep?.id ?? uid(),
    type,
    eyebrow: clean(r.eyebrow, 80) || undefined,
    heading: clean(r.heading, 160) || undefined,
    subheading: clean(r.subheading, 400) || undefined,
    body: clean(r.body, 1600) || undefined,
    items,
    cta: clean(r.ctaLabel, 40) ? { label: clean(r.ctaLabel, 40), href: clean(r.ctaHref, 300) || '#' } : undefined,
    cta2: clean(r.cta2Label, 40) ? { label: clean(r.cta2Label, 40), href: clean(r.cta2Href, 300) || '#' } : undefined,
    image: keep?.image,
    variant: keep?.variant,
  }
  const prompt = clean(r.imagePrompt, 500)
  if (prompt && !section.image && (type === 'hero' || type === 'split')) {
    section.image = pollinationsUrl(fullPrompt(prompt, 'editorial'), type === 'hero' ? 832 : 1024, type === 'hero' ? 1040 : 820, Math.floor(Math.random() * 1e6))
  }
  return section
}

function demoSite(site: Site): unknown {
  const b = site.brief
  const cta = b.cta || 'Get started'
  const link = b.ctaLink || '#contact'
  const points = b.keyMessages
    .split(/[;\n]/)
    .map((m) => m.trim())
    .filter(Boolean)
  return {
    pageTitle: site.name,
    suggestedTheme: site.theme.presetId,
    sections: [
      {
        type: 'hero',
        eyebrow: 'Introducing',
        heading: truncate(b.purpose || site.name, 70),
        subheading: `Made for ${b.audience || 'people who want more'}.`,
        ctaLabel: cta,
        ctaHref: link,
        cta2Label: 'Learn more',
        cta2Href: '#features',
        imagePrompt: `${b.purpose}, bright aspirational lifestyle scene`,
      },
      {
        type: 'features',
        eyebrow: 'Why it matters',
        heading: 'Everything you need, nothing you don’t',
        items: (points.length ? points : ['Simple to start', 'Built for real life', 'Backed by experts'])
          .slice(0, 3)
          .map((p, i) => ({ icon: ['✨', '⚡', '🤝'][i], title: truncate(p, 40), body: 'A short, clear sentence explaining why this makes a difference.' })),
      },
      {
        type: 'split',
        eyebrow: 'The story',
        heading: 'Why we made this',
        body: 'Tell the story behind the launch in two short paragraphs: the problem, the moment of insight and the difference it makes.',
        ctaLabel: cta,
        ctaHref: link,
      },
      {
        type: 'faq',
        heading: 'Questions, answered',
        items: [
          { title: 'Who is it for?', body: b.audience || 'Anyone who wants a better way.' },
          { title: 'How do I get started?', body: `Just click “${cta}”.` },
        ],
      },
      { type: 'cta', heading: 'Ready when you are', body: 'It only takes a minute to get started.', ctaLabel: cta, ctaHref: link },
      { type: 'footer', heading: site.name, body: 'Made with care.' },
    ],
  }
}

async function siteAgent(site: Site): Promise<Agent> {
  if (site.agentId) {
    const a = await db.agents.get(site.agentId)
    if (a) return a
  }
  const agents = await db.agents.toArray()
  return agents.find((a) => a.roleId === 'copywriter' && a.status === 'active') ?? agents.find((a) => a.roleId === 'creative') ?? (await getLeadAgent())!
}

function briefText(site: Site): string {
  const b = site.brief
  return [
    `Page name: ${site.name}`,
    `Purpose: ${b.purpose}`,
    b.audience && `Audience: ${b.audience}`,
    b.keyMessages && `Key messages: ${b.keyMessages}`,
    b.cta && `Main call to action: ${b.cta}${b.ctaLink ? ` (link: ${b.ctaLink})` : ''}`,
    b.style && `Style and feel: ${b.style}`,
  ]
    .filter(Boolean)
    .join('\n')
}

export async function createSite(input: { name: string; brief: SiteBrief; mode: Site['mode']; presetId?: string; agentId?: string; projectId?: string }): Promise<Site> {
  const t = Date.now()
  const preset = presetById(input.presetId ?? 'midnight')
  const site: Site = {
    id: uid(),
    name: input.name.trim() || 'Untitled page',
    brief: input.brief,
    mode: input.mode,
    theme: { ...preset.theme },
    sections: [],
    history: [],
    status: 'generating',
    stage: 'Getting started',
    agentId: input.agentId,
    projectId: input.projectId,
    createdAt: t,
    updatedAt: t,
  }
  await db.sites.put(site)
  return site
}

const FREEFORM_RULES = `Design rules for the page:
- A single, complete, responsive HTML document with all CSS in one <style> tag. Google Fonts links are allowed. No external JavaScript; a small inline script for scroll animations is fine.
- Striking, modern, premium design: bold typography, generous spacing, a clear visual hierarchy, tasteful motion and hover states. It must look great on phones.
- For images, use https://image.pollinations.ai/prompt/{url-encoded description}?width=1200&height=800&nologo=true with descriptive prompts (no text in images).
- Never invent statistics, awards, partner names or testimonials. Use clearly marked placeholders instead.
- Reply with the HTML document only.`

export async function generateSite(siteId: string, signal?: AbortSignal): Promise<void> {
  const site = await db.sites.get(siteId)
  if (!site) return
  const agent = await siteAgent(site)
  await trackJob({ id: `site:${siteId}`, kind: 'site', title: site.name, stage: 'Starting', agentId: agent.id, link: `/sites/${siteId}` }, async (setStage) => {
    const stage = async (s: string) => {
      setStage(s)
      await db.sites.update(siteId, { stage: s, updatedAt: Date.now() })
    }
    try {
      let research = ''
      if (site.brief.useWeb) {
        await stage(`${agent.name} is researching`)
        const r = await runAgent({
          agent,
          prompt: `Research useful, verifiable facts and context for a landing page.\n\n${briefText(site)}\n\nReturn short bullet notes with sources.`,
          toolAccess: 'read',
          webSearch: true,
          thinkingDepth: 'quick',
          maxTokens: 8000,
          signal,
        })
        research = r.text
      }
      if (site.mode === 'freeform') {
        await stage(`${agent.name} is designing the page`)
        const res = await runAgent({
          agent,
          mode: 'studio',
          prompt: `Design and write a complete landing page.\n\n${briefText(site)}\nColour direction: primary ${site.theme.primary}, secondary ${site.theme.secondary}, ${site.theme.mode} background.\n${research ? `\nResearch notes:\n${truncate(research, 10000)}\n` : ''}\n${FREEFORM_RULES}`,
          toolAccess: 'none',
          webSearch: false,
          thinkingDepth: 'balanced',
          maxTokens: 32000,
          demo: { text: () => '' },
          signal,
        })
        let html = extractHtml(res.text)
        if (res.demo || !/<html/i.test(html)) {
          // Demo mode (or an unusable answer): build the page from sections instead.
          await db.sites.update(siteId, { mode: 'sections' })
          const data = demoSite(site) as { sections: unknown[] }
          await db.sites.update(siteId, { sections: data.sections.map((s) => normaliseSection(s)), status: 'ready', stage: undefined, updatedAt: Date.now() })
          return
        }
        html = html.replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/gi, '')
        await db.sites.update(siteId, { html, status: 'ready', stage: undefined, error: undefined, updatedAt: Date.now() })
      } else {
        await stage(`${agent.name} is writing the page`)
        const res = await runAgent({
          agent,
          mode: 'studio',
          prompt: `Write a landing page.\n\n${briefText(site)}\n${research ? `\nResearch notes:\n${truncate(research, 10000)}\n` : ''}\n${PAGE_RULES}\nAvailable visual themes: ${SITE_PRESETS.map((p) => `${p.id} (${p.description})`).join('; ')}.`,
          toolAccess: 'read',
          webSearch: false,
          thinkingDepth: 'balanced',
          maxTokens: 16000,
          json: { name: 'landing_page', schema: SITE_SCHEMA },
          demo: { json: () => demoSite(site) },
          signal,
        })
        const data = res.json as { pageTitle?: string; suggestedTheme?: string; primaryColor?: string; secondaryColor?: string; sections?: unknown[] }
        const sections = (data.sections ?? []).map((s) => normaliseSection(s))
        if (!sections.length) throw new Error('The agent returned an empty page. Add a little more detail to the brief and try again.')
        const keepTheme = site.theme.presetId !== 'midnight' || !data.suggestedTheme
        const theme = keepTheme ? site.theme : { ...presetById(data.suggestedTheme!).theme }
        if (!keepTheme && data.primaryColor && HEX.test(data.primaryColor)) theme.primary = data.primaryColor
        if (!keepTheme && data.secondaryColor && HEX.test(data.secondaryColor)) theme.secondary = data.secondaryColor
        await db.sites.update(siteId, { sections, theme, status: 'ready', stage: undefined, error: undefined, updatedAt: Date.now() })
      }
      void logActivity('site', `${agent.name} created the landing page “${site.name}”`, { agentId: agent.id, minutesSaved: MINUTES_SAVED.site, link: `/sites/${siteId}` })
    } catch (err) {
      await db.sites.update(siteId, { status: 'error', stage: undefined, error: err instanceof Error ? err.message : 'Landing page generation failed' })
      throw err
    }
  })
}

export async function startSiteFromBrief(input: { name: string; purpose: string; audience?: string; cta?: string; agentId?: string; projectId?: string }): Promise<Site> {
  const site = await createSite({
    name: input.name,
    agentId: input.agentId,
    projectId: input.projectId,
    mode: 'sections',
    brief: { purpose: input.purpose, audience: input.audience ?? '', keyMessages: '', cta: input.cta ?? '', ctaLink: '', style: 'Modern and premium', useWeb: false },
  })
  void generateSite(site.id).catch(() => undefined)
  return site
}

/** Applies a plain-English change request to the whole page. */
export async function reviseSite(siteId: string, instruction: string, signal?: AbortSignal): Promise<void> {
  const site = await db.sites.get(siteId)
  if (!site) return
  const agent = await siteAgent(site)
  await db.sites.update(siteId, { history: [...site.history, { prompt: instruction, at: Date.now() }] })
  await trackJob(
    { id: `site-revise:${siteId}`, kind: 'site', title: `Updating ${site.name}`, stage: `${agent.name} is editing`, agentId: agent.id, link: `/sites/${siteId}` },
    async () => {
      await db.sites.update(siteId, { status: 'generating', stage: `${agent.name} is making your changes` })
      try {
        if (site.mode === 'freeform' && site.html) {
          const res = await runAgent({
            agent,
            mode: 'studio',
            prompt: `Here is the current landing page HTML:\n\n${site.html}\n\nChange request: ${instruction}\n\nReturn the complete updated HTML document.\n\n${FREEFORM_RULES}`,
            toolAccess: 'none',
            webSearch: false,
            thinkingDepth: 'balanced',
            maxTokens: 32000,
            demo: { text: () => site.html ?? '' },
            signal,
          })
          const html = extractHtml(res.text)
          if (/<html/i.test(html)) await db.sites.update(siteId, { html: html.replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/gi, '') })
        } else {
          const current = site.sections.map((s) => ({
            type: s.type,
            eyebrow: s.eyebrow,
            heading: s.heading,
            subheading: s.subheading,
            body: s.body,
            items: s.items,
            ctaLabel: s.cta?.label,
            ctaHref: s.cta?.href,
            cta2Label: s.cta2?.label,
            cta2Href: s.cta2?.href,
          }))
          const res = await runAgent({
            agent,
            mode: 'studio',
            prompt: `Here is the current landing page as JSON:\n${JSON.stringify({ pageTitle: site.name, sections: current })}\n\nChange request: ${instruction}\n\nReturn the complete updated page. Keep sections that don’t need changes exactly as they are.\n\n${PAGE_RULES}`,
            toolAccess: 'none',
            webSearch: false,
            thinkingDepth: 'balanced',
            maxTokens: 16000,
            json: { name: 'landing_page', schema: SITE_SCHEMA },
            demo: {
              json: () => ({ pageTitle: site.name, sections: current.map((s, i) => (i === 0 ? { ...s, subheading: `${s.subheading ?? ''} (${truncate(instruction, 50)})` } : s)) }),
            },
            signal,
          })
          const data = res.json as { sections?: unknown[] }
          const sections = (data.sections ?? []).map((s, i) => {
            const prev = site.sections[i]
            return normaliseSection(s, prev && prev.type === (s as { type?: string })?.type ? prev : undefined)
          })
          if (sections.length) await db.sites.update(siteId, { sections })
        }
        await db.sites.update(siteId, { status: 'ready', stage: undefined, updatedAt: Date.now() })
      } catch (err) {
        await db.sites.update(siteId, { status: 'ready', stage: undefined })
        throw err
      }
    },
  )
}
