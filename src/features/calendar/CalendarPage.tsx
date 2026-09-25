import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, isSameMonth, startOfDay, startOfMonth, startOfWeek } from 'date-fns'
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileUp,
  Link2,
  ListPlus,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { db } from '../../lib/db'
import { createEvent, createTask } from '../../lib/ops'
import { addIcsUrl, connectGoogle, importIcsFile, removeSource, syncSource, syncStale } from '../../lib/calendar/sync'
import type { CalEvent, CalendarSource } from '../../lib/types'
import { cn, errorMessage, timeAgo } from '../../lib/utils'
import { useSettings } from '../../stores/settings'
import { useUI } from '../../stores/ui'
import { useCalendars, useEventsBetween, useProjects } from '../../hooks/data'
import { Button } from '../../components/ui/Button'
import { Menu, Tabs } from '../../components/ui/bits'
import { Field, Input, Select, Textarea, Toggle } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { toast } from '../../components/ui/Toast'
import { Agenda, eventColor, MiniMonth, MonthGrid, TimeGrid, timeRange } from './views'

type View = 'day' | 'week' | 'month' | 'agenda'

const EVENT_COLORS = ['#8b6cff', '#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#f87171', '#2dd4bf', '#fb923c']

/* ------------------------------------------------------------------ */
/*  Create / edit a local event                                        */
/* ------------------------------------------------------------------ */

function toLocalInput(d: Date): string {
  return format(d, "yyyy-MM-dd'T'HH:mm")
}

function EventEditor({ initial, onClose }: { initial: Partial<CalEvent> & { start: string; end: string }; onClose: () => void }) {
  const projects = useProjects()
  const [title, setTitle] = useState(initial.title ?? '')
  const [start, setStart] = useState(toLocalInput(new Date(initial.start)))
  const [end, setEnd] = useState(toLocalInput(new Date(initial.end)))
  const [allDay, setAllDay] = useState(!!initial.allDay)
  const [location, setLocation] = useState(initial.location ?? '')
  const [description, setDescription] = useState(initial.description ?? '')
  const [projectId, setProjectId] = useState(initial.projectId ?? '')
  const [color, setColor] = useState(initial.color ?? EVENT_COLORS[0])
  const editing = !!initial.id

  const save = async () => {
    const s = new Date(allDay ? `${start.slice(0, 10)}T00:00` : start)
    let e = new Date(allDay ? `${end.slice(0, 10)}T23:59` : end)
    if (e <= s) e = new Date(s.getTime() + 3_600_000)
    const data = {
      title: title.trim() || 'New event',
      start: s.toISOString(),
      end: e.toISOString(),
      allDay: allDay || undefined,
      location: location.trim() || undefined,
      description: description.trim() || undefined,
      projectId: projectId || undefined,
      color,
    }
    if (editing) await db.events.update(initial.id!, data)
    else await createEvent(data)
    toast.success(editing ? 'Event updated' : 'Added to your calendar', data.title)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      icon={<CalendarPlus />}
      title={editing ? 'Edit event' : 'New event'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()}>
            {editing ? 'Save' : 'Add to calendar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What’s happening?"
          className="h-12 text-[16px]"
          onKeyDown={(e) => e.key === 'Enter' && void save()}
        />
        <Toggle checked={allDay} onChange={setAllDay} label="All day" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Starts">
            <Input
              type={allDay ? 'date' : 'datetime-local'}
              value={allDay ? start.slice(0, 10) : start}
              onChange={(e) => setStart(allDay ? `${e.target.value}T09:00` : e.target.value)}
              className="[color-scheme:dark]"
            />
          </Field>
          <Field label="Ends">
            <Input
              type={allDay ? 'date' : 'datetime-local'}
              value={allDay ? end.slice(0, 10) : end}
              onChange={(e) => setEnd(allDay ? `${e.target.value}T10:00` : e.target.value)}
              className="[color-scheme:dark]"
            />
          </Field>
        </div>
        <Field label="Where">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Office, video call, restaurant…" />
        </Field>
        <Field label="Notes">
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Agenda, attendees, anything to remember" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Project">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">None</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Colour">
            <div className="flex h-10 items-center gap-1.5">
              {EVENT_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  aria-label={`Colour ${c}`}
                  className={cn('size-6 rounded-full transition', color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-ink-900' : 'hover:scale-110')}
                  style={{ background: c }}
                />
              ))}
            </div>
          </Field>
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/*  Event details                                                      */
/* ------------------------------------------------------------------ */

function EventDetails({ event, source, onClose, onEdit }: { event: CalEvent; source?: CalendarSource; onClose: () => void; onEdit: () => void }) {
  const navigate = useNavigate()
  const askLead = useUI((s) => s.askLead)
  const projects = useProjects()
  const project = projects.find((p) => p.id === event.projectId)
  const s = new Date(event.start)
  const local = event.source === 'local'
  const when = `${format(s, 'EEEE d MMMM')} · ${timeRange(event)}`

  const prep = () => {
    onClose()
    askLead(
      `Prep me for “${event.title}” (${when}${event.location ? `, ${event.location}` : ''}). ${event.description ? `Details: ${event.description.slice(0, 600)}. ` : ''}${project ? `It’s for the ${project.name} project. ` : ''}Check my brain for anything on the people, client or topic, then give me: the purpose in one line, three talking points, questions to ask, anything to watch out for, and what a great outcome looks like.`,
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={event.title}
      subtitle={when}
      icon={<span className="size-3 rounded-full" style={{ background: eventColor(event), boxShadow: `0 0 14px ${eventColor(event)}` }} />}
    >
      <div className="space-y-5">
        {event.location && (
          <p className="flex items-center gap-1.5 text-[13.5px] text-soft">
            <MapPin className="size-4 text-muted" /> {event.location}
          </p>
        )}
        {event.description && (
          <div className="max-h-48 overflow-y-auto rounded-2xl bg-white/[0.03] p-4 text-[13px] leading-relaxed whitespace-pre-wrap text-soft">{event.description}</div>
        )}
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: source?.color ?? eventColor(event) }} />
            {source?.name ?? (event.demo ? 'Sample calendar' : 'My events')}
          </span>
          {project && (
            <button onClick={() => navigate(`/projects/${project.id}`)} className="hover:text-fg">
              {project.emoji} {project.name}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-5">
          <Button variant="primary" icon={<Sparkles />} onClick={prep}>
            Prep me for this
          </Button>
          <Button
            variant="secondary"
            icon={<ListPlus />}
            onClick={async () => {
              await createTask({ title: `Follow up: ${event.title}`, projectId: event.projectId, dueDate: format(addDays(s, 1), 'yyyy-MM-dd'), source: 'Calendar' })
              toast.success('Follow-up task added', 'Due the day after.')
            }}
          >
            Follow-up task
          </Button>
          {event.url && (
            <Button variant="ghost" icon={<ExternalLink />} onClick={() => window.open(event.url, '_blank', 'noopener')}>
              Open
            </Button>
          )}
          {local && (
            <>
              <Button variant="ghost" icon={<Pencil />} onClick={onEdit}>
                Edit
              </Button>
              <Button
                variant="ghost"
                icon={<Trash2 />}
                className="text-bad hover:text-bad"
                onClick={async () => {
                  await db.events.delete(event.id)
                  toast.info('Event deleted')
                  onClose()
                }}
              >
                Delete
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/*  Connect a calendar                                                 */
/* ------------------------------------------------------------------ */

const LINK_HELP: Record<string, string[]> = {
  Google: ['Open Google Calendar on a computer.', 'Next to your calendar’s name, click ⋮ then “Settings and sharing”.', 'Scroll to “Secret address in iCal format” and copy it.'],
  Outlook: [
    'Open Outlook on the web and go to Settings → Calendar → Shared calendars.',
    'Under “Publish a calendar”, choose your calendar and “Can view all details”.',
    'Click Publish and copy the ICS link.',
  ],
  Apple: ['Open the Calendar app on your Mac.', 'Right-click the calendar and choose “Share Calendar…”.', 'Tick “Public Calendar” and copy the link.'],
}

function ConnectModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const clientId = useSettings((s) => s.settings.calendar.googleClientId)
  const proxy = useSettings((s) => s.settings.calendar.corsProxy)
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [help, setHelp] = useState<keyof typeof LINK_HELP>('Google')
  const fileRef = useRef<HTMLInputElement>(null)

  const run = async (key: string, fn: () => Promise<CalendarSource>) => {
    setBusy(key)
    try {
      const src = await fn()
      toast.success(`${src.name} connected`, 'Your meetings are in the calendar now.')
      onClose()
    } catch (err) {
      toast.error('Couldn’t connect that calendar', errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon={<CalendarPlus />}
      title="Connect your calendar"
      subtitle="Bring your meetings in so your team can plan around them and prep you for each one."
    >
      <div className="space-y-4">
        <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-5">
          <div className="flex flex-wrap items-center gap-4">
            <span className="grid size-11 place-items-center rounded-2xl bg-white text-[18px] font-bold text-[#4285f4]">G</span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">Google Calendar</div>
              <div className="text-[13px] text-muted">
                {clientId ? 'Sign in with Google. Always up to date, read-only.' : 'Needs a one-time setup by whoever installed your OS.'}
              </div>
            </div>
            {clientId ? (
              <Button variant="primary" loading={busy === 'google'} onClick={() => void run('google', connectGoogle)}>
                Sign in with Google
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => {
                  onClose()
                  navigate('/settings?tab=integrations')
                }}
              >
                Set up
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-5">
          <div className="mb-4 flex items-center gap-4">
            <span className="grid size-11 place-items-center rounded-2xl bg-white/[0.07]">
              <Link2 className="size-5" />
            </span>
            <div>
              <div className="font-semibold">Paste a calendar link</div>
              <div className="text-[13px] text-muted">Works with Google, Outlook and Apple calendars and stays in sync.</div>
              {!proxy && <div className="mt-1 text-[12px] text-faint">Some providers block this until a calendar proxy is added in Settings. Uploading the file always works.</div>}
            </div>
          </div>
          <div className="space-y-2.5">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… or webcal://… (ends in .ics)" />
            <div className="flex gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name it (optional), e.g. Work" />
              <Button variant="primary" loading={busy === 'url'} disabled={!url.trim()} onClick={() => void run('url', () => addIcsUrl(url, name))}>
                Connect
              </Button>
            </div>
          </div>
          <div className="mt-4 rounded-2xl bg-black/20 p-4">
            <div className="mb-2 flex items-center gap-2 text-[12.5px] text-muted">
              Where do I find it?
              <Tabs size="sm" value={help} onChange={setHelp} items={Object.keys(LINK_HELP).map((k) => ({ id: k as keyof typeof LINK_HELP, label: k }))} />
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-[13px] text-soft">
              {LINK_HELP[help].map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </div>

        <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-5">
          <div className="flex flex-wrap items-center gap-4">
            <span className="grid size-11 place-items-center rounded-2xl bg-white/[0.07]">
              <FileUp className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">Upload a calendar file</div>
              <div className="text-[13px] text-muted">Export an .ics file from any calendar app. Upload again to refresh.</div>
            </div>
            <Button variant="secondary" loading={busy === 'file'} onClick={() => fileRef.current?.click()}>
              Choose file
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".ics,text/calendar"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void run('file', () => importIcsFile(f))
                e.target.value = ''
              }}
            />
          </div>
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

function SourceRow({ source }: { source: CalendarSource }) {
  const [busy, setBusy] = useState(false)
  const sync = async () => {
    setBusy(true)
    try {
      const n = await syncSource(source.id, { interactive: true })
      toast.success(`${source.name} is up to date`, `${n} events`)
    } catch (err) {
      toast.error('Sync failed', errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="group flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-white/[0.03]">
      <button
        onClick={() => void db.calendars.update(source.id, { enabled: !source.enabled })}
        className={cn('grid size-4 shrink-0 place-items-center rounded-[5px] border transition')}
        style={{ background: source.enabled ? source.color : 'transparent', borderColor: source.color }}
        aria-label={source.enabled ? `Hide ${source.name}` : `Show ${source.name}`}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] text-soft">{source.name}</div>
        {source.error ? (
          <div className="flex items-center gap-1 truncate text-[11px] text-bad" title={source.error}>
            <TriangleAlert className="size-3" /> Needs attention
          </div>
        ) : (
          source.lastSync && <div className="text-[11px] text-faint">Synced {timeAgo(source.lastSync)}</div>
        )}
      </div>
      {source.kind !== 'ics-file' && (
        <button
          onClick={() => void sync()}
          className="grid size-7 place-items-center rounded-lg text-faint opacity-0 transition group-hover:opacity-100 hover:bg-white/[0.07] hover:text-fg"
          aria-label="Sync"
        >
          <RefreshCw className={cn('size-3.5', busy && 'animate-spin')} />
        </button>
      )}
      <Menu
        trigger={(open) => (
          <button
            onClick={open}
            className="grid size-7 place-items-center rounded-lg text-faint opacity-0 transition group-hover:opacity-100 hover:bg-white/[0.07] hover:text-fg"
            aria-label="More"
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        )}
        items={[
          {
            label: 'Remove calendar',
            icon: <Trash2 />,
            danger: true,
            onSelect: async () => {
              if (!window.confirm(`Remove ${source.name}? Its events disappear from the OS (nothing changes in the original calendar).`)) return
              await removeSource(source.id)
            },
          },
        ]}
      />
    </div>
  )
}

export default function CalendarPage() {
  const [params, setParams] = useSearchParams()
  const settings = useSettings((s) => s.settings)
  const weekStartsOn = settings.calendar.weekStartsOn
  const sources = useCalendars()
  const [view, setView] = useState<View>(() => (window.innerWidth < 768 ? 'day' : 'week'))
  const [date, setDate] = useState(() => (params.get('date') ? new Date(`${params.get('date')}T12:00:00`) : new Date()))
  const [miniMonth, setMiniMonth] = useState(date)
  const [editing, setEditing] = useState<(Partial<CalEvent> & { start: string; end: string }) | null>(null)
  const [selected, setSelected] = useState<CalEvent | null>(null)
  const connecting = params.has('connect')

  useEffect(() => {
    void syncStale()
  }, [])

  const range = useMemo(() => {
    if (view === 'day') return { start: startOfDay(date), end: addDays(startOfDay(date), 1) }
    if (view === 'week') return { start: startOfWeek(date, { weekStartsOn }), end: addDays(endOfWeek(date, { weekStartsOn }), 1) }
    if (view === 'month') return { start: startOfWeek(startOfMonth(date), { weekStartsOn }), end: addDays(endOfWeek(endOfMonth(date), { weekStartsOn }), 1) }
    return { start: startOfDay(date), end: addDays(startOfDay(date), 31) }
  }, [view, date, weekStartsOn])
  const events = useEventsBetween(range.start, range.end)
  const monthEvents = useEventsBetween(startOfWeek(startOfMonth(miniMonth), { weekStartsOn }), addDays(endOfWeek(endOfMonth(miniMonth), { weekStartsOn }), 1))
  const busyDays = useMemo(() => new Set(monthEvents.map((e) => e.start.slice(0, 10))), [monthEvents])

  const days = view === 'day' ? [startOfDay(date)] : Array.from({ length: 7 }, (_, i) => addDays(range.start, i))
  const step = (dir: 1 | -1) =>
    setDate((d) => (view === 'day' ? addDays(d, dir) : view === 'week' ? addWeeks(d, dir) : view === 'month' ? addMonths(d, dir) : addDays(d, dir * 30)))
  const label =
    view === 'day'
      ? format(date, 'EEEE d MMMM yyyy')
      : view === 'week'
        ? isSameMonth(range.start, addDays(range.end, -1))
          ? `${format(range.start, 'd')} – ${format(addDays(range.end, -1), 'd MMMM yyyy')}`
          : `${format(range.start, 'd MMM')} – ${format(addDays(range.end, -1), 'd MMM yyyy')}`
        : view === 'month'
          ? format(date, 'MMMM yyyy')
          : `From ${format(date, 'd MMMM')}`

  const newAt = (start: Date) => setEditing({ start: start.toISOString(), end: new Date(start.getTime() + 3_600_000).toISOString() })
  const closeConnect = () =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('connect')
      return next
    })

  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-[272px] shrink-0 flex-col gap-6 overflow-y-auto border-r border-white/[0.06] bg-black/10 px-4 py-5 lg:flex">
        <Button variant="primary" icon={<Plus />} onClick={() => newAt(new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000))}>
          New event
        </Button>
        <MiniMonth
          month={miniMonth}
          selected={date}
          busyDays={busyDays}
          weekStartsOn={weekStartsOn}
          onMonth={setMiniMonth}
          onPick={(d) => {
            setDate(d)
            if (view === 'month' || view === 'agenda') setView('day')
          }}
        />
        <div>
          <div className="mb-2 flex items-center justify-between px-2">
            <span className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Calendars</span>
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2.5 px-2 py-1.5">
              <span className="size-4 rounded-[5px]" style={{ background: 'var(--accent)' }} />
              <span className="text-[13px] text-soft">My events</span>
            </div>
            {sources.map((s) => (
              <SourceRow key={s.id} source={s} />
            ))}
          </div>
          <button
            onClick={() => setParams((prev) => new URLSearchParams([...prev, ['connect', '1']]))}
            className="mt-2 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-[13px] text-muted transition hover:bg-white/[0.04] hover:text-fg"
          >
            <Plus className="size-4" /> Connect a calendar
          </button>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] px-4 py-3 sm:px-6">
          <Button size="sm" variant="secondary" onClick={() => setDate(new Date())}>
            Today
          </Button>
          <div className="flex">
            <button onClick={() => step(-1)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/[0.07] hover:text-fg" aria-label="Previous">
              <ChevronLeft className="size-4" />
            </button>
            <button onClick={() => step(1)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/[0.07] hover:text-fg" aria-label="Next">
              <ChevronRight className="size-4" />
            </button>
          </div>
          <h1 className="min-w-0 flex-1 truncate font-display text-xl font-semibold tracking-tight">{label}</h1>
          <Tabs
            size="sm"
            value={view}
            onChange={setView}
            items={[
              { id: 'day', label: 'Day' },
              { id: 'week', label: 'Week' },
              { id: 'month', label: 'Month' },
              { id: 'agenda', label: 'List' },
            ]}
          />
          <Button size="sm" variant="primary" icon={<Plus />} className="lg:hidden" onClick={() => newAt(new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000))}>
            New
          </Button>
        </header>
        <div className="min-h-0 flex-1">
          {view === 'week' || view === 'day' ? (
            <TimeGrid days={days} events={events} dayStart={settings.calendar.dayStart} onSlot={newAt} onEvent={setSelected} />
          ) : view === 'month' ? (
            <MonthGrid
              month={date}
              events={events}
              weekStartsOn={weekStartsOn}
              onEvent={setSelected}
              onDay={(d) => {
                setDate(d)
                setView('day')
              }}
            />
          ) : (
            <Agenda from={date} events={events} onEvent={setSelected} />
          )}
        </div>
      </section>

      {selected && (
        <EventDetails
          event={selected}
          source={sources.find((s) => s.id === selected.calendarId)}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setEditing(selected)
            setSelected(null)
          }}
        />
      )}
      {editing && <EventEditor key={editing.id ?? editing.start} initial={editing} onClose={() => setEditing(null)} />}
      {connecting && <ConnectModal onClose={closeConnect} />}
    </div>
  )
}
