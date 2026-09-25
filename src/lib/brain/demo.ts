import { addDays, format } from 'date-fns'
import type { BrainNote } from '../types'
import { buildNote } from './parse'

/**
 * A believable sample vault for a PR agency so the brain has something to
 * show before a real Obsidian vault is linked. Every note is flagged `demo`.
 */

interface Seed {
  path: string
  body: string
}

const clients: { name: string; sector: string; campaigns: string[]; contacts: string[]; people: string[] }[] = [
  {
    name: 'Northwind Coffee',
    sector: 'food-drink',
    campaigns: ['Autumn Blend Launch', 'First Frost Mornings'],
    contacts: ['Priya Shah', 'Tom Hartley', 'Marcus Webb'],
    people: ['Jess Carter', 'Maya Brooks'],
  },
  { name: 'Lumen Skincare', sector: 'beauty', campaigns: ['Lumen Glow Pitch'], contacts: ['Aisha Bello', 'Sophie Laurent'], people: ['Sam Patel', 'Leo Martins'] },
  { name: 'Vertex Motors', sector: 'automotive', campaigns: ['Vertex EV Reveal'], contacts: ['Elena Rossi', 'Ryan Cole'], people: ['Olivia Grant'] },
  {
    name: 'Harbour Lights Festival',
    sector: 'events',
    campaigns: ['Harbour Lights Winter Programme', 'Summer Street Party'],
    contacts: ['Marcus Webb', 'Sophie Laurent'],
    people: ['Maya Brooks', 'Noah Kim'],
  },
  { name: 'Oakridge Bank', sector: 'finance', campaigns: ['Oakridge Money Confidence'], contacts: ['Daniel Okafor'], people: ['Olivia Grant', 'Sam Patel'] },
  { name: 'Bloom & Branch Florists', sector: 'retail', campaigns: ['Local Heroes Series'], contacts: ['Marcus Webb'], people: ['Noah Kim'] },
  { name: 'Tidal Fitness', sector: 'health', campaigns: ['Tidal New Year Reset'], contacts: ['Sophie Laurent', 'Aisha Bello'], people: ['Maya Brooks'] },
  { name: 'Kestrel Airlines', sector: 'travel', campaigns: ['Kestrel Summer Routes'], contacts: ['Daniel Okafor', 'Priya Shah'], people: ['Jess Carter'] },
  { name: 'Maple Street Bakery', sector: 'food-drink', campaigns: ['Bake-Off Stunt'], contacts: ['Marcus Webb', 'Priya Shah'], people: ['Leo Martins'] },
  { name: 'Aurora Tech', sector: 'tech', campaigns: ['AI Ethics Report'], contacts: ['Elena Rossi', 'Daniel Okafor'], people: ['Sam Patel', 'Noah Kim'] },
]

const journalists: { name: string; outlet: string; beat: string }[] = [
  { name: 'Priya Shah', outlet: 'The Daily Ledger', beat: 'consumer and retail' },
  { name: 'Tom Hartley', outlet: 'Brand Weekly', beat: 'marketing trade' },
  { name: 'Elena Rossi', outlet: 'TechPulse', beat: 'technology and EVs' },
  { name: 'Marcus Webb', outlet: 'City Evening News', beat: 'local news and events' },
  { name: 'Aisha Bello', outlet: 'Glow Edit', beat: 'beauty and wellness' },
  { name: 'Daniel Okafor', outlet: 'Business Standard Today', beat: 'business and startups' },
  { name: 'Sophie Laurent', outlet: 'Morning Brew Radio', beat: 'lifestyle broadcast' },
  { name: 'Ryan Cole', outlet: 'Motor Weekly', beat: 'automotive' },
]

const team: { name: string; role: string }[] = [
  { name: 'Jess Carter', role: 'Account Director' },
  { name: 'Sam Patel', role: 'Senior Account Executive' },
  { name: 'Leo Martins', role: 'Designer' },
  { name: 'Maya Brooks', role: 'Social Lead' },
  { name: 'Olivia Grant', role: 'Head of Corporate Comms' },
  { name: 'Noah Kim', role: 'Account Executive' },
]

const ideas: { title: string; links: string[]; tags: string[] }[] = [
  { title: 'Sunrise pop-ups', links: ['First Frost Mornings', 'Event Playbook', 'Northwind Coffee'], tags: ['experiential'] },
  { title: 'Data story - breakfast habits', links: ['Northwind Coffee', 'Measurement Framework', 'Priya Shah'], tags: ['data-pr'] },
  { title: 'Creator rituals', links: ['Influencer Playbook', 'Autumn Blend Launch', 'Maya Brooks'], tags: ['creators'] },
  { title: 'Reverse advent calendar', links: ['Bloom & Branch Florists', 'Local Heroes Series'], tags: ['seasonal'] },
  { title: 'Agency podcast', links: ['Positioning', 'Tone of Voice', 'Morning Brew Radio'], tags: ['owned-media'] },
  { title: 'Micro-influencer network', links: ['Influencer Playbook', 'Tidal Fitness', 'Lumen Skincare'], tags: ['creators'] },
  { title: 'Employee advocacy programme', links: ['Oakridge Bank', 'Internal comms basics'], tags: ['corporate'] },
  { title: 'Newsjacking checklist', links: ['Media Relations Playbook', 'Crisis Playbook'], tags: ['reactive'] },
  { title: 'Awards strategy', links: ['Case Studies', 'New Business Pipeline'], tags: ['awards'] },
  { title: 'Sustainability storytelling', links: ['Kestrel Airlines', 'Trust in brands', 'Northwind Coffee'], tags: ['purpose'] },
  { title: 'AI in PR workshop', links: ['AI tools for agencies', 'Services', 'Aurora Tech'], tags: ['ai'] },
  { title: 'Local heroes series', links: ['Bloom & Branch Florists', 'City Evening News', 'Local news landscape'], tags: ['community'] },
  { title: 'Myth-busting campaign', links: ['Oakridge Money Confidence', 'Trust in brands'], tags: ['education'] },
  { title: 'Behind-the-scenes content', links: ['Maya Brooks', 'Weekly rituals', 'Harbour Lights Festival'], tags: ['social'] },
]

const playbooks: { title: string; points: string[]; links: string[] }[] = [
  {
    title: 'Crisis Playbook',
    points: ['First hour: facts, owner, holding statement', 'Stakeholder map and message matrix', 'Legal review before anything goes out', 'Update cadence every two hours'],
    links: ['Vertex Motors', 'Olivia Grant', 'Newsjacking checklist'],
  },
  {
    title: 'Launch Playbook',
    points: ['Exclusive first, then wide release', 'Real-world moment for pictures', 'Creators in week two', 'Results report in week six'],
    links: ['Autumn Blend Launch', 'Vertex EV Reveal', 'Event Playbook'],
  },
  {
    title: 'Pitch Playbook',
    points: ['Decode the brief in the first 24 hours', 'One big idea, three proof points', 'Rehearse twice with a sceptic', 'Leave-behind deck within 24 hours'],
    links: ['Lumen Glow Pitch', 'New Business Pipeline', 'Case Studies'],
  },
  {
    title: 'Media Relations Playbook',
    points: ['Personalise every pitch', 'Offer assets and spokespeople', 'Follow up once, then move on', 'Log every conversation'],
    links: ['Priya Shah', 'Tom Hartley', 'Newsjacking checklist'],
  },
  {
    title: 'Measurement Framework',
    points: ['Outputs, outtakes, outcomes, impact', 'No advertising value equivalents', 'Agree KPIs at kickoff', 'Monthly one-page dashboard'],
    links: ['Oakridge Money Confidence', 'Data story - breakfast habits'],
  },
  {
    title: 'Influencer Playbook',
    points: ['Audience fit over follower count', 'Clear brief and disclosure rules', 'Usage rights agreed up front'],
    links: ['Creator rituals', 'Micro-influencer network', 'Maya Brooks'],
  },
  {
    title: 'Event Playbook',
    points: ['Run of show with minute timings', 'Press check-in and asset pack', 'Weather and capacity plan B'],
    links: ['Sunrise pop-ups', 'Harbour Lights Winter Programme'],
  },
  {
    title: 'Onboarding a new client',
    points: ['Kickoff agenda and brand immersion', 'Access to assets and approvals', 'Agree reporting rhythm'],
    links: ['Services', 'Jess Carter', 'Measurement Framework'],
  },
]

const research: { title: string; links: string[]; tags: string[] }[] = [
  { title: 'Seasonal launches trends', links: ['Autumn Blend Launch', 'Northwind Coffee'], tags: ['food-drink'] },
  { title: 'EV market notes', links: ['Vertex Motors', 'Elena Rossi'], tags: ['automotive'] },
  { title: 'Skincare market notes', links: ['Lumen Skincare', 'Aisha Bello'], tags: ['beauty'] },
  { title: 'Festival sponsorship benchmarks', links: ['Harbour Lights Festival', 'Event Playbook'], tags: ['events'] },
  { title: 'Gen Z media habits', links: ['Maya Brooks', 'Creator rituals'], tags: ['audiences'] },
  { title: 'Trust in brands', links: ['Oakridge Bank', 'Sustainability storytelling'], tags: ['reputation'] },
  { title: 'Local news landscape', links: ['City Evening News', 'Marcus Webb'], tags: ['media'] },
  { title: 'AI tools for agencies', links: ['AI in PR workshop', 'Tools we use'], tags: ['ai'] },
]

const agency: { title: string; body: string; links: string[] }[] = [
  {
    title: 'Positioning',
    body: 'We are the agency that makes brands talked about for the right reasons: bold ideas, earned attention and results we can prove.',
    links: ['Services', 'Tone of Voice', 'Case Studies'],
  },
  {
    title: 'Services',
    body: 'Consumer PR, corporate reputation, crisis readiness, creator partnerships, events and digital PR.',
    links: ['Positioning', 'Pricing', 'AI in PR workshop'],
  },
  { title: 'Team', body: 'A small senior team with specialist freelancers when needed.', links: team.map((t) => t.name) },
  { title: 'Pricing', body: 'Retainers from four days a month; project fees for launches and events; crisis support on call-off.', links: ['Services', 'New Business Pipeline'] },
  { title: 'Values', body: 'Brave ideas, honest advice, no surprises.', links: ['Positioning', 'Weekly rituals'] },
  { title: 'New Business Pipeline', body: 'Current pitches and warm leads.', links: ['Lumen Glow Pitch', 'Kestrel Airlines', 'Aurora Tech', 'Pitch Playbook'] },
  { title: 'Case Studies', body: 'Our proudest work, ready for pitches and awards.', links: ['Harbour Lights Winter Programme', 'Oakridge Money Confidence', 'Awards strategy'] },
  { title: 'Tone of Voice', body: 'Warm, sharp and plain-spoken. Short sentences. No jargon.', links: ['Positioning', 'Agency podcast'] },
  { title: 'Tools we use', body: 'Obsidian for our brain, our agentic OS for the team, a media database and a shared drive.', links: ['AI tools for agencies', 'Weekly rituals'] },
  { title: 'Weekly rituals', body: 'Monday priorities, Wednesday creative jam, Friday wins and learnings.', links: ['Team', 'Values', 'Behind-the-scenes content'] },
]

function list(items: string[]): string {
  return items.map((i) => `- ${i}`).join('\n')
}

function link(name: string): string {
  return `[[${name}]]`
}

function buildSeeds(): Seed[] {
  const seeds: Seed[] = []

  for (const c of clients) {
    seeds.push({
      path: `Clients/${c.name}.md`,
      body: `---\ntags: [client, ${c.sector}]\nstatus: active\n---\n# ${c.name}\n\nSector: #${c.sector}\n\n## Campaigns\n${list(c.campaigns.map(link))}\n\n## Key media\n${list(c.contacts.map(link))}\n\n## Our team\n${list(c.people.map(link))}\n\n## Notes\n- Prefers weekly status calls and a monthly results report (see ${link('Measurement Framework')}).\n- Approvals go through the marketing director; allow 48 hours.\n`,
    })
  }

  const campaignOwners = new Map<string, string>()
  for (const c of clients) for (const camp of c.campaigns) campaignOwners.set(camp, c.name)
  const extraCampaigns = ['Agency Awards Entry']
  for (const [camp, client] of campaignOwners) {
    const c = clients.find((x) => x.name === client)!
    seeds.push({
      path: `Campaigns/${camp}.md`,
      body: `---\ntags: [campaign, ${c.sector}]\nclient: ${client}\n---\n# ${camp}\n\nClient: ${link(client)}\n\n## Objective\nEarn national and trade coverage, drive consideration and give the client a moment they can own.\n\n## Approach\n${list([`Lead with an exclusive for ${link(c.contacts[0])}`, `Follow the ${link('Launch Playbook')}`, `Social support from ${link('Maya Brooks')}`])}\n\n## Status\n#in-progress\n`,
    })
  }
  for (const camp of extraCampaigns) {
    seeds.push({
      path: `Campaigns/${camp}.md`,
      body: `# ${camp}\n\nPulling our best work into an awards entry. See ${link('Case Studies')} and ${link('Awards strategy')}.\n\n#campaign #awards\n`,
    })
  }

  for (const j of journalists) {
    seeds.push({
      path: `Media/${j.name}.md`,
      body: `---\ntags: [journalist]\noutlet: ${j.outlet}\n---\n# ${j.name}\n\n${j.outlet} (${link(j.outlet)}) · covers ${j.beat}.\n\n## Relationship notes\n- Likes a clear hook in the first line and a data point.\n- Best contacted mid-morning. Never pitch on deadline day.\n- Follow the ${link('Media Relations Playbook')}.\n\n#media\n`,
    })
    seeds.push({
      path: `Media/Outlets/${j.outlet}.md`,
      body: `# ${j.outlet}\n\nKey contact: ${link(j.name)}\nAudience: engaged readers interested in ${j.beat}.\n\n#outlet #media\n`,
    })
  }

  for (const i of ideas) {
    seeds.push({
      path: `Ideas/${i.title}.md`,
      body: `# ${i.title}\n\n${list(i.links.map(link))}\n\nWhy it could work: a simple, visual idea that journalists and creators can pick up easily.\n\n${i.tags.map((t) => '#' + t).join(' ')} #idea\n`,
    })
  }

  for (const p of playbooks) {
    seeds.push({ path: `Playbooks/${p.title}.md`, body: `---\ntags: [playbook]\n---\n# ${p.title}\n\n## Steps\n${list(p.points)}\n\n## Related\n${list(p.links.map(link))}\n` })
  }

  for (const r of research) {
    seeds.push({
      path: `Research/${r.title}.md`,
      body: `# ${r.title}\n\nSummary of what we have learned so far. Related: ${r.links.map(link).join(', ')}.\n\n- Key insight: audiences reward brands that are useful, not just visible.\n- Open question: what proof points will journalists trust?\n\n${r.tags.map((t) => '#' + t).join(' ')} #research\n`,
    })
  }

  for (const a of agency) {
    seeds.push({ path: `Agency/${a.title}.md`, body: `# ${a.title}\n\n${a.body}\n\n${list(a.links.map(link))}\n\n#agency\n` })
  }

  for (const t of team) {
    const theirClients = clients.filter((c) => c.people.includes(t.name)).map((c) => c.name)
    seeds.push({ path: `People/${t.name}.md`, body: `# ${t.name}\n\n${t.role}.\n\n## Works on\n${list(theirClients.map(link))}\n\n#team\n` })
  }
  seeds.push({ path: 'People/Internal comms basics.md', body: `# Internal comms basics\n\nKeep the team in the loop with ${link('Weekly rituals')} and a Friday note.\n\n#team\n` })

  const meetingTopics: { title: string; links: string[] }[] = [
    { title: 'Northwind kickoff', links: ['Northwind Coffee', 'Autumn Blend Launch', 'Jess Carter'] },
    { title: 'Lumen chemistry meeting', links: ['Lumen Skincare', 'Lumen Glow Pitch', 'Sam Patel'] },
    { title: 'Vertex crisis workshop', links: ['Vertex Motors', 'Crisis Playbook', 'Olivia Grant'] },
    { title: 'Harbour Lights partners call', links: ['Harbour Lights Festival', 'Festival sponsorship benchmarks'] },
    { title: 'Creative jam - Autumn Blend', links: ['First Frost Mornings', 'Sunrise pop-ups', 'Leo Martins'] },
    { title: 'Oakridge quarterly review', links: ['Oakridge Bank', 'Measurement Framework'] },
    { title: 'Kestrel intro call', links: ['Kestrel Airlines', 'New Business Pipeline'] },
    { title: 'Coffee with Priya Shah', links: ['Priya Shah', 'The Daily Ledger', 'Data story - breakfast habits'] },
    { title: 'Aurora report planning', links: ['Aurora Tech', 'AI Ethics Report', 'AI tools for agencies'] },
    { title: 'Tidal January planning', links: ['Tidal Fitness', 'Tidal New Year Reset'] },
    { title: 'Team offsite planning', links: ['Team', 'Values', 'Weekly rituals'] },
    { title: 'Bakery stunt brainstorm', links: ['Maple Street Bakery', 'Bake-Off Stunt'] },
  ]
  const today = new Date()
  meetingTopics.forEach((m, i) => {
    const date = format(addDays(today, -(i * 3 + 1)), 'yyyy-MM-dd')
    seeds.push({
      path: `Meetings/${date} ${m.title}.md`,
      body: `---\ndate: ${date}\ntags: [meeting]\n---\n# ${m.title}\n\n## Attendees & links\n${list(m.links.map(link))}\n\n## Decisions\n- Agreed next steps and owners.\n\n## Actions\n- [ ] Send summary to the client\n- [ ] Update the project board\n`,
    })
  })

  for (let i = 0; i < 12; i++) {
    const date = format(addDays(today, -i - 1), 'yyyy-MM-dd')
    const c = clients[i % clients.length]
    const idea = ideas[i % ideas.length]
    seeds.push({
      path: `Daily/${date}.md`,
      body: `# ${date}\n\n- Worked on ${link(c.campaigns[0])} for ${link(c.name)}\n- Idea worth exploring: ${link(idea.title)}\n- Called ${link(c.contacts[0])}\n\n#daily\n`,
    })
  }

  seeds.push({
    path: 'Home.md',
    body: `# Home\n\nThe front door to our brain.\n\n## Clients\n${list(clients.map((c) => link(c.name)))}\n\n## Playbooks\n${list(playbooks.map((p) => link(p.title)))}\n\n## Agency\n${list(['Positioning', 'Services', 'Team', 'New Business Pipeline'].map(link))}\n`,
  })

  return seeds
}

export function demoNotes(): BrainNote[] {
  const base = Date.now() - 86_400_000 * 20
  return buildSeeds().map((s, i) => buildNote(s.path, s.body, base + i * 3_600_000, { demo: true }))
}
