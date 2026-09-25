import { describe, expect, it } from 'vitest'
import { parseIcs } from '../calendar/ics'

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
X-WR-CALNAME:Work
BEGIN:VEVENT
UID:weekly-1
DTSTART:20260105T090000Z
DTEND:20260105T093000Z
RRULE:FREQ=WEEKLY;COUNT=6
SUMMARY:Stand-up
LOCATION:Studio
END:VEVENT
BEGIN:VEVENT
UID:weekly-1
RECURRENCE-ID:20260112T090000Z
DTSTART:20260112T100000Z
DTEND:20260112T103000Z
SUMMARY:Stand-up (moved)
END:VEVENT
BEGIN:VEVENT
UID:allday-1
DTSTART;VALUE=DATE:20260110
DTEND;VALUE=DATE:20260111
SUMMARY:Offsite
END:VEVENT
BEGIN:VEVENT
UID:cancelled-1
DTSTART:20260106T120000Z
DTEND:20260106T130000Z
STATUS:CANCELLED
SUMMARY:Cancelled lunch
END:VEVENT
END:VCALENDAR`

describe('parseIcs', () => {
  const window = { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-03-01T00:00:00Z') }
  const { events, name } = parseIcs(ICS, { calendarId: 'cal', source: 'ics', window })

  it('reads the calendar name', () => {
    expect(name).toBe('Work')
  })

  it('expands repeating events and applies moved occurrences', () => {
    const standups = events.filter((e) => e.title.startsWith('Stand-up'))
    expect(standups).toHaveLength(6)
    const moved = standups.find((e) => e.title === 'Stand-up (moved)')
    expect(moved?.start).toBe('2026-01-12T10:00:00.000Z')
    expect(standups.filter((e) => e.start.startsWith('2026-01-12'))).toHaveLength(1)
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length)
  })

  it('keeps all-day events and skips cancelled ones', () => {
    expect(events.find((e) => e.title === 'Offsite')?.allDay).toBe(true)
    expect(events.some((e) => e.title === 'Cancelled lunch')).toBe(false)
  })

  it('ignores events outside the window', () => {
    const later = parseIcs(ICS, { calendarId: 'cal', source: 'ics', window: { start: new Date('2027-01-01'), end: new Date('2027-02-01') } })
    expect(later.events).toHaveLength(0)
  })
})
