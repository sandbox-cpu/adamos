import { db } from '../db'
import { FriendlyError } from '../llm/errors'
import { logActivity } from '../ops'
import type { CalEvent, CalendarSource } from '../types'
import { uid } from '../utils'
import { useSettings } from '../../stores/settings'
import { defaultWindow, parseIcs } from './ics'
import { fetchGoogleEvents, hasGoogleToken, signInToGoogle } from './google'

export const SOURCE_COLORS = ['#60a5fa', '#34d399', '#f472b6', '#fbbf24', '#a78bfa', '#2dd4bf', '#fb923c']

async function nextColor(): Promise<string> {
  return SOURCE_COLORS[(await db.calendars.count()) % SOURCE_COLORS.length]
}

async function replaceEvents(calendarId: string, events: CalEvent[]): Promise<void> {
  await db.transaction('rw', db.events, async () => {
    await db.events.where('calendarId').equals(calendarId).delete()
    await db.events.bulkPut(events)
  })
}

/** Calendar apps hand out webcal:// links; browsers need https://. */
function normaliseUrl(url: string): string {
  return url.trim().replace(/^webcals?:\/\//i, 'https://')
}

async function fetchIcs(url: string): Promise<string> {
  const target = normaliseUrl(url)
  const proxy = useSettings.getState().settings.calendar.corsProxy
  const attempts = [target, ...(proxy ? [`${proxy}${encodeURIComponent(target)}`] : [])]
  let lastError: unknown
  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt, { headers: { Accept: 'text/calendar, text/plain, */*' } })
      if (!res.ok) throw new FriendlyError(`The calendar link returned an error (${res.status}).`, 'Check the link is still valid.')
      const text = await res.text()
      if (!text.includes('BEGIN:VCALENDAR'))
        throw new FriendlyError('That link isn’t a calendar feed.', 'Look for a link ending in .ics, sometimes called the “secret address in iCal format”.')
      return text
    } catch (err) {
      lastError = err
      if (err instanceof FriendlyError) throw err
    }
  }
  if (lastError instanceof TypeError || !proxy) {
    throw new FriendlyError(
      'Your calendar provider doesn’t let browsers read that link directly.',
      proxy
        ? 'The proxy in Settings couldn’t reach it either. Try downloading the calendar file and uploading it instead.'
        : 'Download the calendar as a file and upload it instead, or add a calendar proxy in Settings → Integrations.',
    )
  }
  throw lastError
}

export async function addIcsUrl(url: string, name?: string): Promise<CalendarSource> {
  const text = await fetchIcs(url)
  const source: CalendarSource = { id: uid(), kind: 'ics-url', name: name?.trim() || 'Calendar', url: normaliseUrl(url), color: await nextColor(), enabled: true }
  const { events, name: calName } = parseIcs(text, { calendarId: source.id, color: source.color, source: 'ics' })
  source.name = name?.trim() || calName || 'Calendar'
  source.lastSync = Date.now()
  await db.calendars.put(source)
  await replaceEvents(source.id, events)
  void logActivity('system', `Connected the “${source.name}” calendar (${events.length} events)`)
  return source
}

export async function importIcsFile(file: File): Promise<CalendarSource> {
  const text = await file.text()
  if (!text.includes('BEGIN:VCALENDAR')) throw new FriendlyError('That file isn’t a calendar.', 'Choose a file ending in .ics exported from your calendar app.')
  const source: CalendarSource = { id: uid(), kind: 'ics-file', name: file.name.replace(/\.ics$/i, ''), color: await nextColor(), enabled: true }
  const { events, name } = parseIcs(text, { calendarId: source.id, color: source.color, source: 'ics' })
  source.name = name || source.name
  source.lastSync = Date.now()
  await db.calendars.put(source)
  await replaceEvents(source.id, events)
  return source
}

/** Signs in to Google (from a click) and imports every ticked calendar. */
export async function connectGoogle(): Promise<CalendarSource> {
  const clientId = useSettings.getState().settings.calendar.googleClientId ?? ''
  const accessToken = await signInToGoogle(clientId)
  const existing = (await db.calendars.where('kind').equals('google').toArray())[0]
  const source: CalendarSource = existing ?? { id: uid(), kind: 'google', name: 'Google Calendar', color: '#4285f4', enabled: true }
  const { events, account } = await fetchGoogleEvents(accessToken, source.id, defaultWindow())
  source.name = account ? `Google · ${account}` : 'Google Calendar'
  source.lastSync = Date.now()
  source.error = undefined
  await db.calendars.put(source)
  await replaceEvents(source.id, events)
  return source
}

export async function syncSource(id: string, opts: { interactive?: boolean } = {}): Promise<number> {
  const source = await db.calendars.get(id)
  if (!source) return 0
  try {
    let events: CalEvent[] = []
    if (source.kind === 'ics-url' && source.url) {
      events = parseIcs(await fetchIcs(source.url), { calendarId: source.id, color: source.color, source: 'ics' }).events
    } else if (source.kind === 'google') {
      if (!hasGoogleToken() && !opts.interactive) return 0
      const accessToken = await signInToGoogle(useSettings.getState().settings.calendar.googleClientId ?? '')
      events = (await fetchGoogleEvents(accessToken, source.id, defaultWindow())).events
    } else return 0
    await replaceEvents(source.id, events)
    await db.calendars.update(id, { lastSync: Date.now(), error: undefined })
    return events.length
  } catch (err) {
    await db.calendars.update(id, { error: err instanceof Error ? err.message : 'Sync failed' })
    throw err
  }
}

/** Refreshes linked calendars quietly, skipping any synced in the last half hour. */
export async function syncStale(): Promise<void> {
  const sources = await db.calendars.toArray()
  for (const s of sources) {
    if (s.kind === 'ics-file' || !s.enabled) continue
    if (s.lastSync && Date.now() - s.lastSync < 30 * 60_000) continue
    await syncSource(s.id).catch(() => undefined)
  }
}

export async function removeSource(id: string): Promise<void> {
  await db.transaction('rw', db.events, db.calendars, async () => {
    await db.events.where('calendarId').equals(id).delete()
    await db.calendars.delete(id)
  })
}
