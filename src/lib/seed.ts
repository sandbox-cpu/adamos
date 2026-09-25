import { addDays, format, set, startOfWeek } from 'date-fns'
import { db, kvGet, kvSet } from './db'
import { defaultAgents } from './agents/defaults'
import { demoNotes } from './brain/demo'
import type {
  CalEvent,
  ContentPiece,
  CoverageItem,
  Deck,
  MediaContact,
  Project,
  ResearchReport,
  Site,
  Task,
} from './types'
import { dateFromNow, uid } from './utils'
import { SITE_PRESETS } from './sites/themes'

const SEEDED_KEY = 'seeded.v1'
const DEMO_WEEK_KEY = 'demo.eventsWeek'

export async function ensureSeeded(): Promise<boolean> {
  const seeded = await kvGet<boolean>(SEEDED_KEY)
  if (seeded) return false
  await db.transaction('rw', [db.agents, db.projects, db.tasks, db.contacts, db.coverage, db.content, db.research, db.decks, db.sites, db.notes, db.kv], async () => {
    await db.agents.bulkPut(defaultAgents())
    await seedWorkspace()
    await db.notes.bulkPut(demoNotes())
    await db.kv.put({ key: SEEDED_KEY, value: true })
  })
  await refreshDemoEvents(true)
  return true
}

async function seedWorkspace() {
  const t = Date.now()
  const projects: Project[] = [
    {
      id: 'p-northwind',
      name: 'Autumn Blend Launch',
      client: 'Northwind Coffee',
      status: 'active',
      priority: 'high',
      color: '#f59e0b',
      emoji: '☕',
      description:
        'National launch of Northwind’s limited-edition Autumn Blend. Earned media first, supported by a sampling event, creator partnerships and social.',
      goals: ['40+ pieces of national and trade coverage', 'Sell out the launch batch in six weeks', 'Grow Instagram following by 15%'],
      startDate: dateFromNow(-12),
      dueDate: dateFromNow(18),
      budget: '£45,000',
      squad: ['echo', 'nova', 'quill', 'iris'],
      notes: ['Clients/Northwind Coffee.md', 'Campaigns/Autumn Blend Launch.md'],
      createdAt: t,
      updatedAt: t,
      demo: true,
    },
    {
      id: 'p-lumen',
      name: 'Lumen Skincare Pitch',
      client: 'Lumen Skincare',
      status: 'pitch',
      priority: 'high',
      color: '#f472b6',
      emoji: '✨',
      description: 'Competitive pitch for Lumen’s UK consumer PR retainer. Chemistry meeting done; full pitch due this week.',
      goals: ['Win the 12-month retainer', 'Land a standout creative idea', 'Show a credible measurement plan'],
      startDate: dateFromNow(-6),
      dueDate: dateFromNow(4),
      budget: '£8,000 / month retainer',
      squad: ['nova', 'scout', 'iris', 'quill'],
      notes: ['Clients/Lumen Skincare.md'],
      createdAt: t,
      updatedAt: t,
      demo: true,
    },
    {
      id: 'p-vertex',
      name: 'Crisis Readiness Programme',
      client: 'Vertex Motors',
      status: 'active',
      priority: 'medium',
      color: '#f87171',
      emoji: '🛡️',
      description: 'Crisis playbook, spokesperson training and scenario testing ahead of Vertex’s new EV model launch.',
      goals: ['Signed-off crisis playbook', 'Two trained spokespeople', 'Live scenario exercise completed'],
      startDate: dateFromNow(-20),
      dueDate: dateFromNow(30),
      budget: '£22,000',
      squad: ['lex', 'echo'],
      notes: ['Clients/Vertex Motors.md'],
      createdAt: t,
      updatedAt: t,
      demo: true,
    },
    {
      id: 'p-harbour',
      name: 'Media Partnerships 2026',
      client: 'Harbour Lights Festival',
      status: 'active',
      priority: 'medium',
      color: '#38bdf8',
      emoji: '🎆',
      description: 'Secure media partners and press accreditation for the city’s winter light festival.',
      goals: ['Two headline media partners', '120 accredited press and creators', 'Regional TV segment'],
      startDate: dateFromNow(-30),
      dueDate: dateFromNow(45),
      budget: '£15,000',
      squad: ['echo', 'nova'],
      notes: ['Clients/Harbour Lights Festival.md'],
      createdAt: t,
      updatedAt: t,
      demo: true,
    },
    {
      id: 'p-website',
      name: 'Agency Website Refresh',
      client: 'Internal',
      status: 'on_hold',
      priority: 'low',
      color: '#a78bfa',
      emoji: '🌐',
      description: 'Refresh the agency website with new case studies, a sharper positioning line and a faster build.',
      goals: ['New positioning live', 'Six new case studies', 'Page speed score above 90'],
      startDate: dateFromNow(-40),
      dueDate: dateFromNow(60),
      squad: ['byte', 'quill', 'iris'],
      notes: ['Agency/Positioning.md'],
      createdAt: t,
      updatedAt: t,
      demo: true,
    },
  ]
  await db.projects.bulkPut(projects)

  const task = (projectId: string, title: string, status: Task['status'], due: number | undefined, assigneeId: string, priority: Task['priority'] = 'medium', description?: string): Task => ({
    id: uid(),
    projectId,
    title,
    description,
    status,
    priority,
    dueDate: due === undefined ? undefined : dateFromNow(due),
    assigneeId,
    order: 0,
    checklist: [],
    createdAt: t,
    updatedAt: t,
    completedAt: status === 'done' ? t : undefined,
    demo: true,
  })

  const tasks: Task[] = [
    task('p-northwind', 'Finalise press release and embargo plan', 'review', 1, 'echo', 'high', 'Tighten the headline, add the founder quote and confirm the embargo time.'),
    task('p-northwind', 'Confirm venue for sampling pop-up', 'doing', 2, 'me', 'high'),
    task('p-northwind', 'Shortlist 10 food & drink creators', 'doing', 3, 'nova'),
    task('p-northwind', 'Write social launch copy (3 platforms)', 'todo', 6, 'quill'),
    task('p-northwind', 'Moodboard for launch photography', 'done', -2, 'iris'),
    task('p-northwind', 'Build target media list (national + trade)', 'done', -4, 'echo'),
    task('p-northwind', 'Book press photographer', 'todo', 5, 'me', 'medium'),
    task('p-lumen', 'Competitor audit of 5 skincare brands', 'done', -1, 'scout', 'high'),
    task('p-lumen', 'Develop three creative territories', 'doing', 1, 'iris', 'high'),
    task('p-lumen', 'Draft measurement framework', 'todo', 2, 'nova'),
    task('p-lumen', 'Pitch deck first draft', 'todo', 2, 'me', 'high'),
    task('p-lumen', 'Rehearsal with the team', 'todo', 3, 'me'),
    task('p-vertex', 'Draft crisis playbook v1', 'review', 0, 'echo', 'high'),
    task('p-vertex', 'Legal review of holding statements', 'todo', 4, 'lex', 'high'),
    task('p-vertex', 'Schedule spokesperson training', 'todo', 7, 'me'),
    task('p-vertex', 'Scenario list: top 10 risks', 'done', -5, 'lex'),
    task('p-harbour', 'Partnership proposal for regional TV', 'doing', 5, 'echo'),
    task('p-harbour', 'Press accreditation form live', 'todo', 9, 'byte'),
    task('p-harbour', 'Outreach to city lifestyle titles', 'todo', -1, 'me', 'medium'),
    task('p-website', 'Rewrite homepage positioning', 'todo', 20, 'quill', 'low'),
    task('p-website', 'Choose new site platform', 'todo', 25, 'byte', 'low'),
    task('p-website', 'Collect case study results', 'todo', 15, 'me', 'low'),
  ]
  tasks.forEach((tk, i) => (tk.order = i))
  await db.tasks.bulkPut(tasks)

  const contacts: MediaContact[] = [
    { name: 'Priya Shah', outlet: 'The Daily Ledger', beat: 'Consumer & retail', relationship: 'hot', tags: ['national', 'food & drink'] },
    { name: 'Tom Hartley', outlet: 'Brand Weekly', beat: 'Marketing trade', relationship: 'warm', tags: ['trade'] },
    { name: 'Elena Rossi', outlet: 'TechPulse', beat: 'Tech & EVs', relationship: 'warm', tags: ['tech', 'automotive'] },
    { name: 'Marcus Webb', outlet: 'City Evening News', beat: 'Local news & events', relationship: 'hot', tags: ['regional'] },
    { name: 'Aisha Bello', outlet: 'Glow Edit', beat: 'Beauty & wellness', relationship: 'cold', tags: ['beauty', 'online'] },
    { name: 'Daniel Okafor', outlet: 'Business Standard Today', beat: 'Business & startups', relationship: 'warm', tags: ['national', 'business'] },
    { name: 'Sophie Laurent', outlet: 'Morning Brew Radio', beat: 'Lifestyle broadcast', relationship: 'cold', tags: ['broadcast'] },
    { name: 'Ryan Cole', outlet: 'Motor Weekly', beat: 'Automotive', relationship: 'warm', tags: ['automotive', 'trade'] },
  ].map((c, i) => ({
    ...c,
    relationship: c.relationship as MediaContact['relationship'],
    id: uid(),
    email: `${c.name.split(' ')[0].toLowerCase()}@example.com`,
    lastContacted: dateFromNow(-(i * 5 + 3)),
    createdAt: t,
    demo: true,
  }))
  await db.contacts.bulkPut(contacts)

  const coverage: CoverageItem[] = [
    { outlet: 'City Evening News', headline: 'Harbour Lights confirms biggest ever programme', date: -3, reach: 180000, sentiment: 'positive', projectId: 'p-harbour' },
    { outlet: 'Brand Weekly', headline: 'Why Northwind is betting on seasonal blends', date: -8, reach: 60000, sentiment: 'positive', projectId: 'p-northwind' },
    { outlet: 'The Daily Ledger', headline: 'The small roasters taking on the high street', date: -15, reach: 950000, sentiment: 'positive', projectId: 'p-northwind' },
    { outlet: 'TechPulse', headline: 'Vertex Motors teases new mid-size EV', date: -22, reach: 420000, sentiment: 'neutral', projectId: 'p-vertex' },
    { outlet: 'Motor Weekly', headline: 'Vertex’s charging promise under scrutiny', date: -30, reach: 210000, sentiment: 'negative', projectId: 'p-vertex' },
    { outlet: 'Morning Brew Radio', headline: 'Festival organisers on lighting up winter', date: -41, reach: 300000, sentiment: 'positive', projectId: 'p-harbour' },
    { outlet: 'Business Standard Today', headline: 'Independent agencies see record new business', date: -55, reach: 510000, sentiment: 'positive' },
    { outlet: 'Glow Edit', headline: 'The skincare brands to watch this winter', date: -63, reach: 90000, sentiment: 'neutral', projectId: 'p-lumen' },
  ].map((c) => ({ ...c, id: uid(), date: dateFromNow(c.date), sentiment: c.sentiment as CoverageItem['sentiment'], createdAt: t, demo: true }))
  await db.coverage.bulkPut(coverage)

  const content: ContentPiece[] = [
    {
      id: uid(),
      kind: 'press_release',
      title: 'Northwind Coffee launches limited-edition Autumn Blend',
      brief: { news: 'Limited-edition Autumn Blend launches nationally', spokesperson: 'Founder' },
      content: `# Northwind Coffee launches limited-edition Autumn Blend\n\n**A small-batch seasonal roast inspired by the first frost mornings of the year**\n\n**[CITY], [DATE]** – Independent roaster Northwind Coffee today announces the launch of its limited-edition Autumn Blend, available nationwide from [DATE] for six weeks only.\n\nRoasted in small batches, the blend brings together [ORIGIN DETAILS] for a rich, warming cup with notes of [TASTING NOTES].\n\n"[FOUNDER QUOTE ABOUT WHY AUTUMN MATTERS TO THE BRAND]," said [FOUNDER NAME], founder of Northwind Coffee.\n\nTo celebrate, Northwind will host a free "First Frost Mornings" pop-up in [LOCATION] on [DATE], serving the new blend alongside [ACTIVITY].\n\n**Notes to editors**\n- Autumn Blend RRP: [PRICE]\n- Images available on request\n\n**About Northwind Coffee**\n[BOILERPLATE]\n\n**Media contact**\n[NAME] · [EMAIL] · [PHONE]`,
      agentId: 'echo',
      status: 'ready',
      projectId: 'p-northwind',
      createdAt: t,
      updatedAt: t,
      demo: true,
    },
  ]
  await db.content.bulkPut(content)

  const report: ResearchReport = {
    id: uid(),
    title: 'Trend scan: seasonal launches in food & drink',
    templateId: 'trends',
    subject: 'Seasonal product launches in food and drink',
    agentId: 'scout',
    usedWeb: false,
    citations: [],
    status: 'done',
    projectId: 'p-northwind',
    createdAt: t - 86_400_000 * 2,
    updatedAt: t - 86_400_000 * 2,
    demo: true,
    content: `> Sample report — run a fresh one with live web research once your AI is connected.\n\n## Executive summary\nSeasonal launches work when they feel like an **event**, not a discount. The strongest campaigns combine scarcity (a clear end date), a sensory story and a shareable moment in the real world.\n\n## Key trends\n1. **Scarcity as a story** — limited runs with a visible countdown drive urgency and repeat visits.\n2. **Real-world sampling moments** — pop-ups and morning commuter activations create content as well as trial.\n3. **Creator-led rituals** — creators sharing "first cup of autumn" rituals outperform scripted ads.\n4. **Provenance and craft** — origin stories and small-batch details give journalists a reason to write.\n\n## Opportunities for Northwind\n- Own the idea of the *first frosty morning* with a date-led media moment.\n- Offer journalists an exclusive first taste plus access to the roaster.\n- Give creators a simple ritual to film rather than a script.\n\n## Watch-outs\n- Seasonal fatigue: avoid clichés (pumpkin, falling leaves) unless subverted.\n- Make sure stock can meet demand before pushing national coverage.`,
  }
  await db.research.put(report)

  const deck: Deck = {
    id: 'd-northwind',
    title: 'Autumn Blend Launch Plan',
    brief: {
      topic: 'Launch campaign for Northwind Coffee’s Autumn Blend',
      audience: 'Northwind leadership team',
      goal: 'Get sign-off on the campaign plan and budget',
      keyMessages: 'Earned-first launch; First Frost Mornings idea; six-week plan; clear measurement',
      tone: 'Confident and warm',
      slideCount: 9,
      useWeb: false,
    },
    themeId: 'midnight',
    agentId: 'iris',
    projectId: 'p-northwind',
    status: 'ready',
    createdAt: t,
    updatedAt: t,
    demo: true,
    slides: [
      { id: uid(), layout: 'title', title: 'Autumn Blend Launch', subtitle: 'Campaign plan · Northwind Coffee', notes: 'Welcome everyone and set up the ambition for the next six weeks.' },
      {
        id: uid(),
        layout: 'agenda',
        title: 'Today',
        items: [{ label: 'The opportunity' }, { label: 'Our big idea' }, { label: 'Media & creator plan' }, { label: 'Six-week timeline' }, { label: 'Budget & measurement' }],
      },
      {
        id: uid(),
        layout: 'stats',
        title: 'What success looks like',
        stats: [
          { value: '40+', label: 'pieces of coverage (target)' },
          { value: '6', label: 'weeks, one sell-out batch' },
          { value: '+15%', label: 'Instagram growth (target)' },
        ],
      },
      {
        id: uid(),
        layout: 'bullets',
        title: 'The idea: First Frost Mornings',
        subtitle: 'Autumn doesn’t start on the calendar. It starts with the first cup.',
        bullets: [
          'We own the first frosty morning of the season as a national media moment',
          'A free pop-up serves the first cups at sunrise',
          'Creators share their own “first cup of autumn” rituals',
          'Every touchpoint points to a six-week, limited run',
        ],
      },
      {
        id: uid(),
        layout: 'two-column',
        title: 'How we bring it to life',
        columns: [
          { heading: 'Earned', bullets: ['Embargoed national exclusive', 'Trade story on seasonal strategy', 'Regional radio breakfast shows'] },
          { heading: 'Owned & social', bullets: ['Sunrise pop-up content', 'Creator ritual series', 'Countdown to sell-out'] },
        ],
      },
      {
        id: uid(),
        layout: 'timeline',
        title: 'Six weeks to sell-out',
        items: [
          { label: 'Week 1', detail: 'Exclusive + press release' },
          { label: 'Week 2', detail: 'Sunrise pop-up' },
          { label: 'Weeks 3–4', detail: 'Creator rituals' },
          { label: 'Week 5', detail: 'Last-chance push' },
          { label: 'Week 6', detail: 'Sell-out & results' },
        ],
      },
      {
        id: uid(),
        layout: 'chart',
        title: 'Where the budget goes',
        chart: { kind: 'donut', labels: ['Media relations', 'Pop-up event', 'Creators', 'Social', 'Measurement'], series: [{ name: 'Budget %', values: [35, 25, 20, 15, 5] }] },
      },
      { id: uid(), layout: 'quote', title: 'Campaign line', quote: { text: 'Autumn doesn’t start on the calendar. It starts with the first cup.', author: 'Campaign line', role: 'First Frost Mornings' } },
      { id: uid(), layout: 'closing', title: 'Let’s brew something brilliant', subtitle: 'Next step: sign-off by Friday so we can brief press next week.' },
    ],
  }
  await db.decks.put(deck)

  const preset = SITE_PRESETS[0]
  const site: Site = {
    id: 's-northwind',
    name: 'Autumn Blend landing page',
    brief: {
      purpose: 'Launch page for Northwind’s limited-edition Autumn Blend',
      audience: 'Coffee lovers and press',
      keyMessages: 'Limited six-week run; small-batch roast; First Frost Mornings pop-up',
      cta: 'Pre-order now',
      ctaLink: '#order',
      style: 'Warm, premium, editorial',
      useWeb: false,
    },
    mode: 'sections',
    theme: { ...preset.theme, primary: '#f59e0b', secondary: '#fb7185' },
    agentId: 'quill',
    projectId: 'p-northwind',
    history: [],
    status: 'ready',
    createdAt: t,
    updatedAt: t,
    demo: true,
    sections: [
      {
        id: uid(),
        type: 'hero',
        eyebrow: 'Limited edition · Six weeks only',
        heading: 'Autumn starts with the first cup.',
        subheading: 'Our small-batch Autumn Blend is here. Rich, warming and gone before winter.',
        cta: { label: 'Pre-order now', href: '#order' },
        cta2: { label: 'Find the pop-up', href: '#popup' },
      },
      {
        id: uid(),
        type: 'features',
        eyebrow: 'Why it’s special',
        heading: 'Roasted for frosty mornings',
        items: [
          { icon: '🔥', title: 'Small-batch roasted', body: 'Roasted in tiny batches for a deep, even flavour.' },
          { icon: '🍂', title: 'Seasonal notes', body: 'Warming notes built for crisp autumn mornings.' },
          { icon: '♻️', title: 'Fully recyclable', body: 'Packaging that goes straight in the recycling.' },
        ],
      },
      {
        id: uid(),
        type: 'split',
        eyebrow: 'First Frost Mornings',
        heading: 'Join us at sunrise',
        body: 'On the first frosty morning of the season we’re opening a pop-up café and pouring the first cups of Autumn Blend for free. Bring a friend and your favourite mug.',
        cta: { label: 'Get pop-up updates', href: '#popup' },
      },
      {
        id: uid(),
        type: 'faq',
        heading: 'Good to know',
        items: [
          { title: 'How long is it available?', body: 'Six weeks, or until the batch sells out.' },
          { title: 'Whole bean or ground?', body: 'Both, plus compostable pods.' },
          { title: 'Do you deliver nationwide?', body: 'Yes, with free delivery over a set spend.' },
        ],
      },
      { id: uid(), type: 'cta', heading: 'Don’t miss the first cup', body: 'Pre-order today and we’ll ship on launch day.', cta: { label: 'Pre-order now', href: '#order' } },
      { id: uid(), type: 'footer', heading: 'Northwind Coffee', body: 'Small-batch roasters.' },
    ],
  }
  await db.sites.put(site)
}

/** Keeps demo meetings on the current week so the calendar always looks alive. */
export async function refreshDemoEvents(force = false): Promise<void> {
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const stored = await kvGet<string>(DEMO_WEEK_KEY)
  const settingsRow = await kvGet<{ demoData?: boolean }>('settings')
  if (settingsRow && settingsRow.demoData === false) return
  if (!force && stored === weekStart) return

  await db.events.where('source').equals('local').filter((e) => !!e.demo).delete()
  const today = new Date()
  const at = (dayOffset: number, h: number, m: number) => set(addDays(today, dayOffset), { hours: h, minutes: m, seconds: 0, milliseconds: 0 })
  const ev = (dayOffset: number, h: number, m: number, mins: number, title: string, extra: Partial<CalEvent> = {}): CalEvent => {
    const start = at(dayOffset, h, m)
    return {
      id: uid(),
      title,
      start: start.toISOString(),
      end: new Date(start.getTime() + mins * 60_000).toISOString(),
      source: 'local',
      demo: true,
      ...extra,
    }
  }
  const events: CalEvent[] = [
    ev(0, 9, 0, 30, 'Team stand-up', { location: 'Studio', color: '#8b6cff' }),
    ev(0, 10, 30, 60, 'Northwind: press release sign-off', { projectId: 'p-northwind', color: '#f59e0b', location: 'Video call', description: 'Walk the client through the final release and embargo plan.' }),
    ev(0, 13, 0, 60, 'Lunch with Priya Shah (The Daily Ledger)', { location: 'The Corner Café', color: '#34d399' }),
    ev(0, 15, 0, 90, 'Lumen pitch: creative workshop', { projectId: 'p-lumen', color: '#f472b6', description: 'Pick the lead creative territory for the pitch.' }),
    ev(0, 17, 30, 30, 'Call: Vertex comms director', { projectId: 'p-vertex', color: '#f87171' }),
    ev(1, 9, 30, 60, 'Harbour Lights partnership call', { projectId: 'p-harbour', color: '#38bdf8' }),
    ev(1, 14, 0, 120, 'Lumen pitch rehearsal', { projectId: 'p-lumen', color: '#f472b6' }),
    ev(2, 8, 0, 60, 'Breakfast: new business prospect', { color: '#34d399', location: 'Hotel lobby' }),
    ev(2, 11, 0, 90, 'Lumen Skincare: final pitch', { projectId: 'p-lumen', color: '#f472b6', location: 'Client HQ' }),
    ev(3, 10, 0, 60, 'Vertex spokesperson training', { projectId: 'p-vertex', color: '#f87171' }),
    ev(3, 16, 0, 45, 'Weekly finance check-in', { color: '#2dd4bf' }),
    ev(4, 9, 0, 30, 'Team stand-up', { color: '#8b6cff' }),
    ev(4, 12, 30, 60, 'Creator briefing: Autumn Blend', { projectId: 'p-northwind', color: '#f59e0b' }),
    ev(-1, 11, 0, 60, 'Northwind: pop-up venue walk-through', { projectId: 'p-northwind', color: '#f59e0b' }),
    ev(-2, 15, 0, 60, 'Quarterly planning', { color: '#8b6cff' }),
  ]
  await db.events.bulkPut(events)
  await kvSet(DEMO_WEEK_KEY, weekStart)
}

export async function clearDemoData(): Promise<void> {
  await db.transaction('rw', [db.projects, db.tasks, db.events, db.contacts, db.coverage, db.content, db.research, db.decks, db.sites, db.notes, db.kv], async () => {
    await db.projects.filter((x) => !!x.demo).delete()
    await db.tasks.filter((x) => !!x.demo).delete()
    await db.events.filter((x) => !!x.demo).delete()
    await db.contacts.filter((x) => !!x.demo).delete()
    await db.coverage.filter((x) => !!x.demo).delete()
    await db.content.filter((x) => !!x.demo).delete()
    await db.research.filter((x) => !!x.demo).delete()
    await db.decks.filter((x) => !!x.demo).delete()
    await db.sites.filter((x) => !!x.demo).delete()
    await db.notes.filter((x) => !!x.demo).delete()
  })
}

export async function resetEverything(): Promise<void> {
  db.close()
  await db.delete()
  localStorage.clear()
  location.reload()
}
