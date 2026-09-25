import ICAL from 'ical.js'
import type { CalEvent } from '../types'

export interface IcsWindow {
  start: Date
  end: Date
}

/** How far around today imported calendars are expanded. */
export function defaultWindow(): IcsWindow {
  const now = Date.now()
  return { start: new Date(now - 60 * 86_400_000), end: new Date(now + 400 * 86_400_000) }
}

const MAX_OCCURRENCES = 800

/**
 * Reads an iCalendar (.ics) file into events, expanding repeating events
 * inside the window so weekly meetings show up on every week.
 */
export function parseIcs(text: string, opts: { calendarId: string; color?: string; source: CalEvent['source']; window?: IcsWindow }): { events: CalEvent[]; name?: string } {
  const window = opts.window ?? defaultWindow()
  const root = new ICAL.Component(ICAL.parse(text))
  for (const tz of root.getAllSubcomponents('vtimezone')) {
    try {
      ICAL.TimezoneService.register(tz)
    } catch {
      // Unknown or duplicate zones fall back to floating times.
    }
  }
  const name = (root.getFirstPropertyValue('x-wr-calname') as string | null) ?? undefined
  const from = ICAL.Time.fromJSDate(window.start, true)
  const to = ICAL.Time.fromJSDate(window.end, true)
  const events: CalEvent[] = []
  const vevents = root.getAllSubcomponents('vevent')
  // Occurrences that were moved or edited individually replace the generated ones.
  const exceptions = new Set(
    vevents.filter((v) => v.hasProperty('recurrence-id')).map((v) => `${v.getFirstPropertyValue('uid')}|${String(v.getFirstPropertyValue('recurrence-id'))}`),
  )

  const push = (uid: string, key: string, summary: string, start: ICAL.Time, end: ICAL.Time, extra: { location?: string; description?: string; url?: string }) => {
    const allDay = start.isDate
    const s = start.toJSDate()
    let e = end.toJSDate()
    if (e.getTime() <= s.getTime()) e = new Date(s.getTime() + (allDay ? 86_400_000 : 3_600_000))
    events.push({
      id: `${opts.calendarId}:${uid}:${key}`,
      title: summary || '(No title)',
      start: s.toISOString(),
      end: e.toISOString(),
      allDay: allDay || undefined,
      location: extra.location || undefined,
      description: extra.description ? extra.description.slice(0, 4000) : undefined,
      url: extra.url || undefined,
      source: opts.source,
      calendarId: opts.calendarId,
      color: opts.color,
    })
  }

  for (const v of vevents) {
    const status = String(v.getFirstPropertyValue('status') ?? '').toUpperCase()
    if (status === 'CANCELLED') continue
    const ev = new ICAL.Event(v)
    const uid = ev.uid || Math.random().toString(36).slice(2)
    const extra = { location: ev.location, description: ev.description, url: (v.getFirstPropertyValue('url') as string | null) ?? undefined }
    if (ev.isRecurring() && !v.hasProperty('recurrence-id')) {
      const it = ev.iterator()
      let next: ICAL.Time | null
      let count = 0
      while ((next = it.next()) && count < MAX_OCCURRENCES) {
        if (next.compare(to) > 0) break
        if (exceptions.has(`${uid}|${next.toString()}`)) continue
        const details = ev.getOccurrenceDetails(next)
        if (details.endDate.compare(from) < 0) continue
        push(uid, next.toString(), ev.summary, details.startDate, details.endDate, extra)
        count++
      }
    } else {
      if (!ev.startDate) continue
      const end = ev.endDate ?? ev.startDate
      if (end.compare(from) < 0 || ev.startDate.compare(to) > 0) continue
      const key = v.hasProperty('recurrence-id') ? String(v.getFirstPropertyValue('recurrence-id')) : 'single'
      push(uid, key, ev.summary, ev.startDate, end, extra)
    }
  }
  return { events, name }
}
