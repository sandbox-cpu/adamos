import { getLeadAgent, logActivity, MINUTES_SAVED } from '../ops'
import { isoDate } from '../utils'
import { useSettings } from '../../stores/settings'
import { createStreamWriter, useLive } from '../../stores/live'
import { runAgent } from './runtime'

export const BRIEF_KEY = 'brief:today'

/** The lead agent's morning brief, cached for the day in settings. */
export async function generateBrief(): Promise<void> {
  const lead = await getLeadAgent()
  if (!lead) return
  const controller = new AbortController()
  const live = useLive.getState()
  live.setRunning(BRIEF_KEY, controller)
  live.begin(BRIEF_KEY)
  const writer = createStreamWriter(BRIEF_KEY)
  try {
    const res = await runAgent({
      agent: lead,
      prompt:
        'Write my morning brief for today. Check my calendar, my tasks due in the next two days and my live projects, and look in my brain for anything relevant to today’s meetings. Use these short sections: **Today at a glance** (one or two sentences), **Your schedule** (each meeting with a one-line prep tip), **Top three priorities**, **Watch-outs** (anything overdue or at risk) and **One opportunity**. Keep it under 230 words.',
      toolAccess: 'read',
      webSearch: false,
      thinkingDepth: 'quick',
      maxTokens: 8000,
      signal: controller.signal,
      handlers: { onText: writer.text, onReset: writer.reset, onActivities: (activities) => useLive.getState().patch(BRIEF_KEY, { activities }) },
    })
    writer.flush()
    await useSettings.getState().update({ brief: { date: isoDate(), content: res.text } })
    void logActivity('brief', `${lead.name} prepared your morning brief`, { agentId: lead.id, minutesSaved: res.demo ? 0 : MINUTES_SAVED.brief })
  } finally {
    useLive.getState().end(BRIEF_KEY)
    useLive.getState().setRunning(BRIEF_KEY, null)
  }
}
