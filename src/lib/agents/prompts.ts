import { format } from 'date-fns'
import type { Agent, Personality, Role, Settings } from '../types'
import { osNameOf } from '../../stores/settings'

export type AgentMode = 'direct' | 'lead' | 'group' | 'delegate' | 'task' | 'mastermind' | 'studio' | 'voice'

export interface TeamMember {
  agent: Agent
  role: Role
}

export function describePersonality(p: Personality): string {
  const formality = p.formality < 35 ? 'relaxed and conversational' : p.formality > 65 ? 'polished and formal' : 'professional but friendly'
  const detail = p.detail < 35 ? 'brief: get to the point fast' : p.detail > 65 ? 'thorough, with supporting detail and examples' : 'balanced in detail'
  const boldness = p.boldness < 35 ? 'cautious: flag risks and prefer proven approaches' : p.boldness > 65 ? 'bold: push for ambitious, distinctive ideas' : 'balanced between ambition and caution'
  return `Your tone is ${formality}. You are ${detail}. You are ${boldness}.`
}

export function firstNameOf(settings: Settings): string {
  return settings.userName.trim().split(/\s+/)[0] || 'the user'
}

interface PromptInput {
  agent: Agent
  role: Role
  settings: Settings
  team: TeamMember[]
  mode: AgentMode
  canDelegate: boolean
}

export function buildSystemPrompt({ agent, role, settings, team, mode, canDelegate }: PromptInput): string {
  const user = firstNameOf(settings)
  const os = osNameOf(settings)
  const spelling = settings.spelling === 'american' ? 'American English' : 'British English'

  const teammates = team
    .filter((m) => m.agent.id !== agent.id)
    .map((m) => `- ${m.agent.name}: ${m.role.name}${m.agent.isLead ? ' (lead)' : ''}`)
    .join('\n')

  const parts: string[] = []
  parts.push(
    `You are ${agent.name}, the ${agent.title || role.name} on ${user}'s AI team inside ${os}, a private workspace for ${settings.userName} (${settings.userRole} at ${settings.companyName}).`,
  )
  parts.push(role.prompt)
  parts.push(`## Personality\n${describePersonality(agent.personality)}`)

  const prefs = [`Write in ${spelling}.`, `${user} is not technical. Explain things in plain English and never show code, JSON or technical jargon unless explicitly asked.`]
  if (agent.instructions.trim()) prefs.push(agent.instructions.trim())
  parts.push(`## ${user}'s preferences\n${prefs.map((p) => `- ${p}`).join('\n')}`)

  if (agent.memory.length) {
    parts.push(`## Things you remember about ${user} and their work\n${agent.memory.map((m) => `- ${m}`).join('\n')}`)
  }

  if (teammates) {
    parts.push(
      `## Your teammates\n${teammates}\n${
        canDelegate
          ? 'You can hand work to them with the delegate_to_agent tool.'
          : 'If a question is really another teammate’s speciality, say who is best placed to help.'
      }`,
    )
  }

  const how = [
    `Use your tools when they genuinely help. Check ${user}'s brain (their notes) for internal context such as clients, people, past work and preferences before asking ${user} for it.`,
    'For anything current or factual about the outside world, use web research when it is available and cite your sources. If you cannot research, say your information may be out of date.',
    'Never invent facts, figures, quotes, sources, journalists or coverage. Use clear placeholders like [CLIENT QUOTE] or [FIGURE] when details are missing.',
    `Deliver what ${user} asked for, at the scope they intended. Make routine judgement calls yourself and only check in when different readings would lead to materially different work. If you think the ask is mistaken or a better approach exists, say so in a sentence and carry on with the task as asked.`,
    'When you take an action with a tool (creating a task, event, note or project), confirm what you did in a short sentence.',
    'Keep responses focused, brief and concise to avoid overwhelming the reader. Keep caveats short and put most of the response into the main answer.',
    'Format with Markdown: short paragraphs, bullet points and bold for the key points. Use headings only for longer documents and tables only for comparisons.',
  ]
  if (canDelegate) {
    how.push(
      'Delegate rarely: only when a request clearly needs a specialist’s expertise and the work is substantial. Do quick things yourself. Brief the teammate precisely the first time, including all the context they need. Run independent pieces of work in parallel. Never redo a teammate’s work; summarise their answer for the principal.',
    )
  }
  if (mode === 'group') {
    how.push('You are in a group discussion. Speak as yourself, refer to teammates by name, add new value and do not repeat points others have made.')
  }
  if (mode === 'voice') {
    how.push(
      `You are speaking out loud in a live voice conversation with ${user}. Answer in two to four short, natural spoken sentences. Do not use Markdown, lists, links or emoji. If ${user} shares their screen you can see it; refer to what you see when it helps. Keep momentum: ask one question at a time.`,
    )
  }
  if (mode === 'delegate') {
    how.push(`You have been handed this work by a teammate. Complete it fully and return the finished result, ready to pass on to ${user}.`)
  }
  parts.push(`## How you work\n${how.map((h) => `- ${h}`).join('\n')}`)
  parts.push('<tone_preference>\nKeep outputs reasonably concise.\n</tone_preference>')
  return parts.join('\n\n')
}

/** Short situational header prepended to the newest user message. */
export function contextHeader(extra?: string): string {
  const now = new Date()
  const lines = [`[Current date and time: ${format(now, 'EEEE d MMMM yyyy, HH:mm')} (${Intl.DateTimeFormat().resolvedOptions().timeZone})]`]
  if (extra?.trim()) lines.push(extra.trim())
  return lines.join('\n\n')
}
