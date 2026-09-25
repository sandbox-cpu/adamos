export interface ResearchTemplate {
  id: string
  name: string
  description: string
  icon: string
  color: string
  roleId: string
  subjectLabel: string
  placeholder: string
  minutes: number
  instructions: string
}

export const RESEARCH_TEMPLATES: ResearchTemplate[] = [
  {
    id: 'question',
    name: 'Ask anything',
    description: 'Any question, researched from live sources with citations.',
    icon: 'Microscope',
    color: '#a78bfa',
    roleId: 'research',
    subjectLabel: 'Your question',
    placeholder: 'e.g. What are UK consumers saying about sustainable coffee?',
    minutes: 45,
    instructions: `Answer the question properly: open with a direct answer in two or three sentences, then the evidence (each point with a source), what it means for us, and recommended next steps. Use headings and bullet points where they help.`,
  },
  {
    id: 'market',
    name: 'Market landscape',
    description: 'Size, trends, drivers and the main players in a market.',
    icon: 'Globe',
    color: '#60a5fa',
    roleId: 'marketing',
    subjectLabel: 'Market or category',
    placeholder: 'e.g. UK plant-based snacks',
    minutes: 90,
    instructions: `Write a market landscape report with these sections:
## Executive summary
## Market snapshot (size, growth and key figures, each with a source)
## Key trends and drivers
## Main players and how they position themselves
## Customer needs and behaviour
## Opportunities and white space
## Risks and headwinds
## So what for us (three to five recommendations)`,
  },
  {
    id: 'competitor',
    name: 'Competitor deep-dive',
    description: 'Profiles, positioning, recent moves and where they are vulnerable.',
    icon: 'Radar',
    color: '#34d399',
    roleId: 'competitor',
    subjectLabel: 'Competitors or brand to benchmark',
    placeholder: 'e.g. The top three rivals to Northwind Coffee',
    minutes: 90,
    instructions: `Write a competitor deep-dive with these sections:
## Executive summary
## At a glance (a comparison table: positioning, audience, strengths, weaknesses, recent news)
## Competitor profiles (one sub-section each: what they offer, positioning, recent campaigns and announcements with dates, share of voice and tone)
## Where they are strong
## Gaps and vulnerabilities
## Recommended moves for us`,
  },
  {
    id: 'audience',
    name: 'Audience persona',
    description: 'Who they are, what they care about and how to reach them.',
    icon: 'UsersRound',
    color: '#f472b6',
    roleId: 'marketing',
    subjectLabel: 'Audience',
    placeholder: 'e.g. Busy parents who buy premium coffee',
    minutes: 60,
    instructions: `Create an audience insight report with two or three personas. For each: name and snapshot, goals, frustrations, values, media diet and trusted sources, channels, what would make them pay attention, messages that will land and messages to avoid. Finish with the key insight and three campaign implications. Cite sources for any data.`,
  },
  {
    id: 'trends',
    name: 'Trend scan',
    description: 'Cultural, consumer and media trends worth jumping on.',
    icon: 'TrendingUp',
    color: '#a78bfa',
    roleId: 'social',
    subjectLabel: 'Topic or sector',
    placeholder: 'e.g. Wellness trends for January',
    minutes: 60,
    instructions: `Write a trend scan: identify six to eight current trends relevant to the subject. For each: what it is, evidence it is real (with sources and dates), who is driving it, how long it might last and a concrete idea for how we could use it. Finish with the top three to act on now.`,
  },
  {
    id: 'swot',
    name: 'SWOT analysis',
    description: 'Strengths, weaknesses, opportunities and threats.',
    icon: 'Scale',
    color: '#fbbf24',
    roleId: 'marketing',
    subjectLabel: 'Brand, product or organisation',
    placeholder: 'e.g. Lumen Skincare',
    minutes: 45,
    instructions: `Produce a SWOT analysis. Give each quadrant four to six specific, evidenced points (with sources where they are factual). Then add "Strategic implications": how to use strengths to seize opportunities, and how to fix weaknesses before threats hit.`,
  },
  {
    id: 'media',
    name: 'Media landscape',
    description: 'Which outlets, formats and angles matter for a story.',
    icon: 'Newspaper',
    color: '#38bdf8',
    roleId: 'pr-media',
    subjectLabel: 'Story or sector',
    placeholder: 'e.g. A new electric family car launch',
    minutes: 75,
    instructions: `Map the media landscape for this story:
## The story angles journalists will care about
## Target outlets by tier (national, trade, regional, broadcast, podcasts, newsletters) and why each fits
## The kinds of reporters and desks to approach (do not invent individual journalist names; if you find real, current bylines through research, cite the article)
## Recent coverage of similar stories, with links
## Timing, hooks and assets that will help
## Recommended outreach plan`,
  },
  {
    id: 'campaigns',
    name: 'Campaign inspiration',
    description: 'Great campaigns that solved a similar problem.',
    icon: 'Lightbulb',
    color: '#fb923c',
    roleId: 'creative',
    subjectLabel: 'Challenge',
    placeholder: 'e.g. Making a bank feel human to young people',
    minutes: 60,
    instructions: `Find six to eight real campaigns that tackled a similar challenge. For each: brand, year, the idea in a sentence, why it worked, results where reported (with sources) and the lesson for us. Finish with three original ideas inspired by the patterns.`,
  },
  {
    id: 'issues',
    name: 'Risk & issues scan',
    description: 'Potential controversies and reputation risks, before they hit.',
    icon: 'ShieldAlert',
    color: '#f87171',
    roleId: 'crisis',
    subjectLabel: 'Organisation, launch or topic',
    placeholder: 'e.g. Vertex Motors EV launch',
    minutes: 75,
    instructions: `Run a risk and issues scan: list the most likely reputational risks (rate likelihood and impact), current sentiment and recent critical coverage (with sources), stakeholder concerns, and for each major risk a prevention step and a holding line. Finish with a readiness checklist.`,
  },
  {
    id: 'newsjacking',
    name: 'Newsjacking calendar',
    description: 'Dates, events and news hooks for the next 90 days.',
    icon: 'CalendarDays',
    color: '#2dd4bf',
    roleId: 'pr-media',
    subjectLabel: 'Brand or sector',
    placeholder: 'e.g. A local bakery chain',
    minutes: 60,
    instructions: `Build a 90-day newsjacking calendar starting today: awareness days, cultural and sporting events, seasonal moments, industry events and expected news. Present it as a table (date, moment, why it matters, idea for us). Verify dates through research and flag any that are estimates.`,
  },
  {
    id: 'briefing',
    name: 'Meeting briefing',
    description: 'Background on a person or company before you meet them.',
    icon: 'Briefcase',
    color: '#c084fc',
    roleId: 'research',
    subjectLabel: 'Person or company',
    placeholder: 'e.g. The CEO of Kestrel Airlines',
    minutes: 30,
    instructions: `Prepare a one-page meeting briefing: who they are, background, recent news and statements (with dates and sources), their priorities and pressures, points of connection with us, smart questions to ask and topics to handle carefully. Only use verifiable public information.`,
  },
]

export function templateById(id: string): ResearchTemplate {
  return RESEARCH_TEMPLATES.find((t) => t.id === id) ?? RESEARCH_TEMPLATES[0]
}
