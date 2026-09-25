import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { addDays, differenceInMinutes, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfDay, startOfMonth, startOfWeek } from 'date-fns'
import { MapPin } from 'lucide-react'
import type { CalEvent } from '../../lib/types'
import { cn, hexToRgba, mixHex } from '../../lib/utils'

export const HOUR = 56
const FALLBACK = '#8b6cff'

export function eventColor(e: CalEvent): string {
  return e.color || FALLBACK
}

export function timeRange(e: CalEvent): string {
  if (e.allDay) return 'All day'
  const s = new Date(e.start)
  const en = new Date(e.end)
  return `${format(s, 'HH:mm')}–${format(en, 'HH:mm')}`
}

/* ------------------------------------------------------------------ */
/*  Overlap layout: side-by-side columns for clashing meetings         */
/* ------------------------------------------------------------------ */

interface Placed {
  event: CalEvent
  top: number
  height: number
  col: number
  cols: number
}

function layoutDay(events: CalEvent[], day: Date): Placed[] {
  const dayStart = startOfDay(day)
  const dayEnd = addDays(dayStart, 1)
  const timed = events
    .filter((e) => !e.allDay)
    .map((e) => {
      const s = new Date(Math.max(new Date(e.start).getTime(), dayStart.getTime()))
      const en = new Date(Math.min(new Date(e.end).getTime(), dayEnd.getTime()))
      return { e, s, en }
    })
    .filter((x) => x.en > x.s)
    .sort((a, b) => a.s.getTime() - b.s.getTime() || b.en.getTime() - a.en.getTime())

  const placed: Placed[] = []
  let cluster: { item: (typeof timed)[number]; col: number }[] = []
  let clusterEnd = 0
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((c) => c.col + 1))
    for (const c of cluster) {
      const minutes = differenceInMinutes(c.item.s, dayStart)
      const length = Math.max(20, differenceInMinutes(c.item.en, c.item.s))
      placed.push({ event: c.item.e, top: (minutes / 60) * HOUR, height: (length / 60) * HOUR, col: c.col, cols })
    }
    cluster = []
  }
  for (const item of timed) {
    if (cluster.length && item.s.getTime() >= clusterEnd) flush()
    const taken = new Set(cluster.filter((c) => c.item.en.getTime() > item.s.getTime()).map((c) => c.col))
    let col = 0
    while (taken.has(col)) col++
    cluster.push({ item, col })
    clusterEnd = Math.max(clusterEnd, item.en.getTime())
  }
  if (cluster.length) flush()
  return placed
}

function eventsOn(events: CalEvent[], day: Date): CalEvent[] {
  const s = startOfDay(day).getTime()
  const e = addDays(startOfDay(day), 1).getTime()
  return events.filter((ev) => new Date(ev.start).getTime() < e && new Date(ev.end).getTime() > s)
}

/* ------------------------------------------------------------------ */
/*  Day / week time grid                                               */
/* ------------------------------------------------------------------ */

function NowLine() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  const top = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR
  return (
    <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top }}>
      <div className="relative h-[2px] bg-[#ff5d6c] shadow-[0_0_8px_#ff5d6c]">
        <span className="absolute -top-[4px] -left-[5px] size-[10px] rounded-full bg-[#ff5d6c]" />
      </div>
    </div>
  )
}

export function TimeGrid({
  days,
  events,
  dayStart,
  onSlot,
  onEvent,
}: {
  days: Date[]
  events: CalEvent[]
  dayStart: number
  onSlot: (start: Date) => void
  onEvent: (e: CalEvent) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = Math.max(0, (dayStart - 0.5) * HOUR)
  }, [dayStart])

  const allDay = days.map((d) => eventsOn(events, d).filter((e) => e.allDay))
  const hasAllDay = allDay.some((a) => a.length)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* day headers */}
      <div className="flex border-b border-white/[0.06] pr-2">
        <div className="w-14 shrink-0" />
        {days.map((d) => (
          <div key={d.toISOString()} className="flex-1 px-2 py-2.5 text-center">
            <div className={cn('text-[11px] font-semibold tracking-[0.14em] uppercase', isToday(d) ? 'text-[color-mix(in_oklab,var(--accent)_70%,white)]' : 'text-muted')}>
              {format(d, 'EEE')}
            </div>
            <div
              className={cn(
                'mx-auto mt-1 grid size-9 place-items-center rounded-full font-display text-lg font-semibold',
                isToday(d) ? 'bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] text-white shadow-[0_6px_20px_-6px_var(--accent)]' : 'text-fg',
              )}
            >
              {format(d, 'd')}
            </div>
          </div>
        ))}
      </div>
      {hasAllDay && (
        <div className="flex border-b border-white/[0.06] pr-2">
          <div className="w-14 shrink-0 py-1.5 pr-2 text-right text-[10px] text-faint">all day</div>
          {allDay.map((list, i) => (
            <div key={i} className="flex-1 space-y-1 px-1 py-1.5">
              {list.map((e) => (
                <button
                  key={e.id}
                  onClick={() => onEvent(e)}
                  className="block w-full truncate rounded-md px-2 py-1 text-left text-[11.5px] font-medium"
                  style={{ background: hexToRgba(eventColor(e), 0.22), color: mixHex(eventColor(e), '#ffffff', 0.55) }}
                >
                  {e.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      {/* grid */}
      <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="relative flex" style={{ height: 24 * HOUR }}>
          <div className="w-14 shrink-0">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="relative" style={{ height: HOUR }}>
                {h > 0 && <span className="absolute -top-2 right-2 text-[10.5px] text-faint">{String(h).padStart(2, '0')}:00</span>}
              </div>
            ))}
          </div>
          {days.map((d) => {
            const placed = layoutDay(eventsOn(events, d), d)
            return (
              <div
                key={d.toISOString()}
                className={cn('relative flex-1 border-l border-white/[0.05]', isToday(d) && 'bg-white/[0.015]')}
                onClick={(ev) => {
                  const rect = (ev.currentTarget as HTMLDivElement).getBoundingClientRect()
                  const minutes = Math.floor(((ev.clientY - rect.top) / HOUR) * 4) * 15
                  const start = new Date(startOfDay(d).getTime() + minutes * 60_000)
                  onSlot(start)
                }}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="border-t border-white/[0.045]" style={{ height: HOUR }} />
                ))}
                {isToday(d) && <NowLine />}
                {placed.map(({ event: e, top, height, col, cols }) => {
                  const c = eventColor(e)
                  const short = height < 38
                  return (
                    <button
                      key={e.id}
                      onClick={(ev) => {
                        ev.stopPropagation()
                        onEvent(e)
                      }}
                      className="group absolute z-10 overflow-hidden rounded-xl border-l-[3px] px-2 py-1 text-left transition hover:z-30 hover:brightness-125"
                      style={{
                        top: top + 1,
                        height: height - 2,
                        left: `calc(${(col / cols) * 100}% + 3px)`,
                        width: `calc(${100 / cols}% - 6px)`,
                        background: `linear-gradient(135deg, ${hexToRgba(c, 0.3)}, ${hexToRgba(c, 0.16)})`,
                        borderLeftColor: c,
                        boxShadow: `inset 0 0 0 1px ${hexToRgba(c, 0.25)}`,
                      }}
                    >
                      <div className={cn('text-[12px] leading-tight font-semibold text-fg', short ? 'truncate' : 'line-clamp-2')}>{e.title}</div>
                      {!short && (
                        <div className="mt-0.5 truncate text-[10.5px]" style={{ color: mixHex(c, '#ffffff', 0.55) }}>
                          {timeRange(e)}
                          {e.location ? ` · ${e.location}` : ''}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Month grid                                                         */
/* ------------------------------------------------------------------ */

export function MonthGrid({
  month,
  events,
  weekStartsOn,
  onDay,
  onEvent,
}: {
  month: Date
  events: CalEvent[]
  weekStartsOn: 0 | 1
  onDay: (d: Date) => void
  onEvent: (e: CalEvent) => void
}) {
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn }), end: endOfWeek(endOfMonth(month), { weekStartsOn }) })
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid grid-cols-7 border-b border-white/[0.06]">
        {days.slice(0, 7).map((d) => (
          <div key={d.toISOString()} className="px-3 py-2.5 text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">
            {format(d, 'EEE')}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7" style={{ gridTemplateRows: `repeat(${days.length / 7}, minmax(0, 1fr))` }}>
        {days.map((d) => {
          const list = eventsOn(events, d).sort((a, b) => Number(!!b.allDay) - Number(!!a.allDay) || a.start.localeCompare(b.start))
          return (
            <div
              key={d.toISOString()}
              onClick={() => onDay(d)}
              className={cn(
                'min-h-[92px] cursor-pointer overflow-hidden border-r border-b border-white/[0.05] p-1.5 transition hover:bg-white/[0.02]',
                !isSameMonth(d, month) && 'opacity-40',
              )}
            >
              <div
                className={cn(
                  'mb-1 grid size-7 place-items-center rounded-full text-[12.5px] font-semibold',
                  isToday(d) ? 'bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] text-white' : 'text-soft',
                )}
              >
                {format(d, 'd')}
              </div>
              <div className="space-y-0.5">
                {list.slice(0, 3).map((e) => (
                  <button
                    key={e.id}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      onEvent(e)
                    }}
                    className="flex w-full items-center gap-1.5 truncate rounded-md px-1.5 py-0.5 text-left text-[11.5px] text-soft hover:bg-white/[0.06]"
                  >
                    <span className="size-1.5 shrink-0 rounded-full" style={{ background: eventColor(e) }} />
                    {!e.allDay && <span className="text-faint">{format(new Date(e.start), 'HH:mm')}</span>}
                    <span className="truncate">{e.title}</span>
                  </button>
                ))}
                {list.length > 3 && <div className="px-1.5 text-[11px] text-muted">+{list.length - 3} more</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Agenda                                                             */
/* ------------------------------------------------------------------ */

export function Agenda({ from, events, onEvent }: { from: Date; events: CalEvent[]; onEvent: (e: CalEvent) => void }) {
  const days = useMemo(() => {
    const out: { day: Date; list: CalEvent[] }[] = []
    for (let i = 0; i < 30; i++) {
      const day = addDays(startOfDay(from), i)
      const list = eventsOn(events, day).sort((a, b) => Number(!!b.allDay) - Number(!!a.allDay) || a.start.localeCompare(b.start))
      if (list.length) out.push({ day, list })
    }
    return out
  }, [from, events])
  if (!days.length) return <div className="grid h-full place-items-center text-sm text-muted">Nothing in the next 30 days.</div>
  return (
    <div className="h-full overflow-y-auto px-4 py-4 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        {days.map(({ day, list }) => (
          <div key={day.toISOString()} className="grid grid-cols-[64px_1fr] gap-4">
            <div className="pt-1 text-center">
              <div className={cn('text-[11px] font-semibold tracking-[0.14em] uppercase', isToday(day) ? 'text-[color-mix(in_oklab,var(--accent)_70%,white)]' : 'text-muted')}>
                {format(day, 'EEE')}
              </div>
              <div className="font-display text-2xl font-semibold">{format(day, 'd')}</div>
              <div className="text-[11px] text-faint">{format(day, 'MMM')}</div>
            </div>
            <div className="space-y-2">
              {list.map((e) => (
                <button
                  key={`${e.id}-${day.toISOString()}`}
                  onClick={() => onEvent(e)}
                  className="flex w-full items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3.5 text-left transition hover:border-white/[0.14]"
                >
                  <span className="mt-1 h-9 w-1 shrink-0 rounded-full" style={{ background: eventColor(e) }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-medium">{e.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12px] text-muted">
                      <span>{isSameDay(new Date(e.start), day) || e.allDay ? timeRange(e) : `until ${format(new Date(e.end), 'HH:mm')}`}</span>
                      {e.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="size-3" />
                          {e.location}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Mini month for the sidebar                                         */
/* ------------------------------------------------------------------ */

export function MiniMonth({
  month,
  selected,
  busyDays,
  weekStartsOn,
  onPick,
  onMonth,
}: {
  month: Date
  selected: Date
  busyDays: Set<string>
  weekStartsOn: 0 | 1
  onPick: (d: Date) => void
  onMonth: (d: Date) => void
}) {
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn }), end: endOfWeek(endOfMonth(month), { weekStartsOn }) })
  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[13px] font-semibold">{format(month, 'MMMM yyyy')}</span>
        <div className="flex">
          <button
            onClick={() => onMonth(addDays(startOfMonth(month), -1))}
            className="grid size-7 place-items-center rounded-lg text-muted hover:bg-white/[0.06] hover:text-fg"
            aria-label="Previous month"
          >
            ‹
          </button>
          <button
            onClick={() => onMonth(addDays(endOfMonth(month), 1))}
            className="grid size-7 place-items-center rounded-lg text-muted hover:bg-white/[0.06] hover:text-fg"
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {days.slice(0, 7).map((d) => (
          <span key={d.toISOString()} className="py-1 text-[10px] font-semibold text-faint uppercase">
            {format(d, 'EEEEE')}
          </span>
        ))}
        {days.map((d) => {
          const sel = isSameDay(d, selected)
          return (
            <button
              key={d.toISOString()}
              onClick={() => onPick(d)}
              className={cn(
                'relative mx-auto grid size-8 place-items-center rounded-full text-[12px] transition',
                sel
                  ? 'bg-white text-ink-950'
                  : isToday(d)
                    ? 'text-[color-mix(in_oklab,var(--accent)_70%,white)]'
                    : isSameMonth(d, month)
                      ? 'text-soft hover:bg-white/[0.06]'
                      : 'text-faint hover:bg-white/[0.04]',
              )}
            >
              {format(d, 'd')}
              {busyDays.has(format(d, 'yyyy-MM-dd')) && !sel && <span className="absolute bottom-1 size-1 rounded-full bg-[var(--accent)]" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
