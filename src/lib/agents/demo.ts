import { addDays, format, startOfDay } from 'date-fns'
import { db } from '../db'
import { eventsBetween } from '../ops'
import type { Agent, Role, Settings } from '../types'
import { friendlyDate, isoDate } from '../utils'

const DEMO_FOOTER = '\n\n_Demo answer: connect an AI provider in **Settings → AI** and I’ll respond properly, with live research and real actions._'

function topicOf(prompt: string): string {
  // Group and studio prompts carry scaffolding; the subject is on its own line.
  const labelled = prompt.match(/^(?:discussion topic|topic|subject|objective):\s*(.+)$/im)?.[1]
  let cleaned = (labelled ?? prompt.split('\n').find((l) => l.trim()) ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[?.!:]+$/, '')
  // "Find three angles for the autumn launch" -> "the autumn launch"
  const tail = labelled ? undefined : cleaned.match(/\b(?:for|about|on)\s+(.{8,})$/i)?.[1]
  if (tail && tail.split(' ').length >= 2) cleaned = tail
  return cleaned.length > 80 ? cleaned.slice(0, 77) + '…' : cleaned || 'this'
}

async function todaySummary(settings: Settings): Promise<string> {
  const name = settings.userName.split(' ')[0]
  const today = startOfDay(new Date())
  const events = await eventsBetween(today, addDays(today, 1))
  const tasks = (await db.tasks.toArray()).filter((t) => t.status !== 'done' && (t.assigneeId === 'me' || !t.assigneeId))
  const dueSoon = tasks.filter((t) => t.dueDate && t.dueDate <= isoDate(addDays(new Date(), 1))).slice(0, 5)
  const lines: string[] = [`Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, ${name}. Here’s your day at a glance.`]
  if (events.length) {
    lines.push('\n**Your schedule**')
    for (const e of events) lines.push(`- **${format(new Date(e.start), 'HH:mm')}** ${e.title}${e.location ? ` · ${e.location}` : ''}`)
  } else lines.push('\nYour calendar is clear today, a good day for deep work.')
  if (dueSoon.length) {
    lines.push('\n**Needs your attention**')
    for (const t of dueSoon) lines.push(`- ${t.title} (${friendlyDate(t.dueDate)})`)
  }
  lines.push(
    '\n**Suggested focus**\n- Block 45 minutes before your biggest meeting to prepare.\n- Batch quick replies into one slot after lunch.\n- Hand anything writing-heavy to the team so you can stay in the room.',
  )
  return lines.join('\n')
}

async function overdueSummary(): Promise<string> {
  const tasks = (await db.tasks.toArray()).filter((t) => t.status !== 'done' && t.dueDate && t.dueDate < isoDate())
  if (!tasks.length) return 'Nothing is overdue right now. Nice work.'
  return `**${tasks.length} things are overdue:**\n${tasks.map((t) => `- ${t.title} (${friendlyDate(t.dueDate)})`).join('\n')}\n\nWant me to reschedule them or hand some to the team?`
}

/** A short, spoken-style sample answer for voice calls (no lists or formatting). */
export async function buildVoiceDemoReply(prompt: string, settings: Settings): Promise<string> {
  const p = prompt.toLowerCase()
  const name = settings.userName.split(' ')[0] || 'there'
  const note = 'This is a sample answer; connect an AI in Settings and I can do much more.'
  if (/\b(calendar|schedule|meetings?|diary|agenda|today|tomorrow|my day)\b/.test(p)) {
    const tomorrow = /\btomorrow\b/.test(p)
    const day = startOfDay(addDays(new Date(), tomorrow ? 1 : 0))
    const events = await eventsBetween(day, addDays(day, 1))
    const when = tomorrow ? 'Tomorrow' : 'Today'
    if (!events.length) return `${when} looks clear, ${name}, a good chance for some deep work. ${note}`
    const list = events
      .slice(0, 4)
      .map((e) => `${format(new Date(e.start), 'h:mm a')}, ${e.title}`)
      .join('; ')
    return `${when} you have ${events.length} thing${events.length === 1 ? '' : 's'} in the diary: ${list}. Want me to get you ready for any of them? ${note}`
  }
  return `Happy to help with ${topicOf(prompt)}, ${name}. I’m on sample answers right now, so connect an AI in Settings and I’ll talk it through properly, with your screen, your projects and your brain.`
}

export async function buildDemoReply(agent: Agent, role: Role, prompt: string, settings: Settings): Promise<string> {
  const p = prompt.toLowerCase()
  if (agent.isLead) {
    if (/\b(today|my day|schedule|agenda|plan my|this morning|busy)\b/.test(p)) return (await todaySummary(settings)) + DEMO_FOOTER
    if (/\b(overdue|behind|late|slipping|at risk)\b/.test(p)) return (await overdueSummary()) + DEMO_FOOTER
  }
  const topic = topicOf(prompt)
  const body = (() => {
    switch (role.category) {
      case 'Communications':
        return `**Angle:** a clear, human story with a reason to report it *now*.\n\n**Headline options**\n1. “${topic}” – the story in one line\n2. The surprising number behind it\n3. The people it affects most\n\n**Next steps**\n- Pick the angle and a spokesperson\n- Draft the release and a short pitch\n- Target the top 10 journalists for the beat`
      case 'Strategy':
        return `**Objective:** decide what success looks like for ${topic}.\n\n**Audience:** who we most need to move, and what they care about.\n\n**Recommended approach**\n1. Lead with one sharp insight\n2. Build an idea that earns attention rather than buys it\n3. Measure outcomes, not outputs\n\n**Risks to watch:** budget stretch and message dilution.`
      case 'Creative':
        return `Three routes for ${topic}:\n\n1. **The Big Moment** – a real-world stunt that creates the photo everyone shares.\n2. **Hidden Numbers** – a data story that reveals something surprising.\n3. **Real People** – ordinary voices telling the story better than any ad could.\n\nI’d back route one for impact and route three for longevity.`
      case 'Research':
        return `Here’s how I’d research ${topic}:\n\n- Latest official statistics and industry reports\n- What competitors have announced in the last six months\n- Media coverage and the angles journalists are taking\n- Audience conversation on social\n\nI’ll cite every source and flag anything uncertain.`
      case 'Specialist':
        return `**Key considerations for ${topic}**\n\n| Issue | Risk | What to do |\n|---|---|---|\n| Claims and evidence | Medium | Make sure every claim can be backed up |\n| Permissions and rights | Medium | Confirm usage rights for names, images and data |\n| Timing and approvals | Low | Build in review time before launch |`
      case 'Operations':
        return `**Plan for ${topic}**\n\n1. Agree the goal, owner and deadline\n2. Break it into tasks with dates\n3. Book the key moments into the calendar\n4. Weekly check-in until it’s done\n\nI can add these to the board whenever you’re ready.`
      default:
        return `Here’s my take on ${topic}:\n\n- Start with the outcome you want\n- Use what we already know from your brain\n- Keep the next step small and specific`
    }
  })()
  return `${body}${DEMO_FOOTER}`
}
