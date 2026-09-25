import { useMemo, useState } from 'react'
import { format, startOfMonth, subMonths } from 'date-fns'
import { ExternalLink, FileBarChart, Frown, Meh, MoreHorizontal, Pencil, Plus, Smile, Trash2 } from 'lucide-react'
import { db } from '../../lib/db'
import type { CoverageItem } from '../../lib/types'
import { cn, formatNumber, isoDate, parseDate, uid } from '../../lib/utils'
import { useUI } from '../../stores/ui'
import { useCoverage, useProjects } from '../../hooks/data'
import { ColumnChart, SentimentBar } from '../../components/charts/Charts'
import { Button } from '../../components/ui/Button'
import { Menu } from '../../components/ui/bits'
import { Field, Input, Select, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { toast } from '../../components/ui/Toast'

const SENTIMENT: Record<CoverageItem['sentiment'], { label: string; icon: typeof Smile; className: string }> = {
  positive: { label: 'Positive', icon: Smile, className: 'text-[#6ea8f0]' },
  neutral: { label: 'Neutral', icon: Meh, className: 'text-muted' },
  negative: { label: 'Negative', icon: Frown, className: 'text-[#f08a8a]' },
}

function CoverageModal({ item, onClose }: { item?: CoverageItem; onClose: () => void }) {
  const projects = useProjects()
  const [c, setC] = useState<CoverageItem>(
    item ?? { id: uid(), outlet: '', headline: '', url: '', date: isoDate(), reach: undefined, sentiment: 'positive', projectId: undefined, notes: '', createdAt: Date.now() },
  )
  const save = async () => {
    if (!c.outlet.trim() || !c.headline.trim()) return
    await db.coverage.put({ ...c, outlet: c.outlet.trim(), headline: c.headline.trim(), url: c.url?.trim() || undefined, notes: c.notes?.trim() || undefined, demo: undefined })
    toast.success(item ? 'Coverage updated' : 'Coverage logged', c.headline)
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      icon={<FileBarChart />}
      title={item ? 'Edit coverage' : 'Log a piece of coverage'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!c.outlet.trim() || !c.headline.trim()} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Headline">
          <Input autoFocus value={c.headline} onChange={(e) => setC({ ...c, headline: e.target.value })} placeholder="The headline as it ran" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Outlet">
            <Input value={c.outlet} onChange={(e) => setC({ ...c, outlet: e.target.value })} placeholder="e.g. The Daily Ledger" />
          </Field>
          <Field label="Date">
            <Input type="date" value={c.date} onChange={(e) => setC({ ...c, date: e.target.value })} className="[color-scheme:dark]" />
          </Field>
        </div>
        <Field label="Link" hint="optional">
          <Input value={c.url ?? ''} onChange={(e) => setC({ ...c, url: e.target.value })} placeholder="https://…" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Audience reach" hint="optional">
            <Input
              inputMode="numeric"
              value={c.reach ?? ''}
              onChange={(e) => setC({ ...c, reach: e.target.value ? Number(e.target.value.replace(/[^0-9]/g, '')) : undefined })}
              placeholder="e.g. 250000"
            />
          </Field>
          {projects.length > 0 && (
            <Field label="Project">
              <Select value={c.projectId ?? ''} onChange={(e) => setC({ ...c, projectId: e.target.value || undefined })}>
                <option value="">None</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <Field label="Tone of the piece">
          <div className="grid grid-cols-3 gap-2">
            {(['positive', 'neutral', 'negative'] as const).map((s) => {
              const meta = SENTIMENT[s]
              const Ico = meta.icon
              return (
                <button
                  key={s}
                  onClick={() => setC({ ...c, sentiment: s })}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-xl border px-2 py-2.5 text-[13px] transition',
                    c.sentiment === s ? 'border-transparent bg-white/[0.1] text-fg' : 'border-white/[0.08] text-muted hover:text-fg',
                  )}
                >
                  <Ico className={cn('size-4', meta.className)} /> {meta.label}
                </button>
              )
            })}
          </div>
        </Field>
        <Field label="Notes" hint="optional">
          <Textarea rows={2} value={c.notes ?? ''} onChange={(e) => setC({ ...c, notes: e.target.value })} />
        </Field>
      </div>
    </Modal>
  )
}

export function Coverage() {
  const coverage = useCoverage()
  const projects = useProjects()
  const askLead = useUI((s) => s.askLead)
  const [editing, setEditing] = useState<{ item?: CoverageItem; key: number } | null>(null)
  const [range, setRange] = useState<90 | 365>(90)

  const since = isoDate(new Date(Date.now() - range * 86_400_000))
  const recent = coverage.filter((c) => c.date >= since)
  const reach = recent.reduce((s, c) => s + (c.reach ?? 0), 0)
  const counts = {
    positive: recent.filter((c) => c.sentiment === 'positive').length,
    neutral: recent.filter((c) => c.sentiment === 'neutral').length,
    negative: recent.filter((c) => c.sentiment === 'negative').length,
  }
  const topOutlet = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of recent) m.set(c.outlet, (m.get(c.outlet) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0]
  }, [recent])
  const months = useMemo(() => {
    const n = range === 90 ? 6 : 12
    return Array.from({ length: n }, (_, i) => {
      const m = startOfMonth(subMonths(new Date(), n - 1 - i))
      const key = format(m, 'yyyy-MM')
      return { label: format(m, 'MMM'), value: coverage.filter((c) => c.date.startsWith(key)).length }
    })
  }, [coverage, range])

  const report = () => {
    const rows = recent
      .slice(0, 40)
      .map((c) => `| ${c.date} | ${c.outlet} | ${c.headline} | ${c.reach ? formatNumber(c.reach) : '–'} | ${c.sentiment} |`)
      .join('\n')
    askLead(
      `Write me a coverage report for the last ${range} days, ready to send to a client. Summarise the headline results, the stand-out pieces, the sentiment, which messages landed, and three recommendations for next month. Here is the coverage log:\n\n| Date | Outlet | Headline | Reach | Tone |\n|---|---|---|---|---|\n${rows}`,
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5">
          {([90, 365] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                'h-8 rounded-full border px-3.5 text-[12.5px] transition',
                range === r ? 'border-transparent bg-white text-ink-950' : 'border-white/[0.08] text-muted hover:text-fg',
              )}
            >
              {r === 90 ? 'Last 3 months' : 'Last year'}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" icon={<FileBarChart />} onClick={report} disabled={!recent.length}>
            Write a coverage report
          </Button>
          <Button variant="primary" icon={<Plus />} onClick={() => setEditing({ key: Date.now() })}>
            Log coverage
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Pieces of coverage', value: formatNumber(recent.length) },
          { label: 'Estimated audience reach', value: reach ? formatNumber(reach) : '–' },
          { label: 'Positive or neutral', value: recent.length ? `${Math.round(((counts.positive + counts.neutral) / recent.length) * 100)}%` : '–' },
          { label: 'Top outlet', value: topOutlet ? topOutlet[0] : '–', small: true },
        ].map((s) => (
          <div key={s.label} className="glass rounded-3xl px-5 py-4">
            <div className={cn('truncate font-display font-semibold tracking-tight', s.small ? 'text-xl' : 'text-3xl')}>{s.value}</div>
            <div className="mt-1 text-[12.5px] text-muted">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="glass rounded-3xl p-5">
          <h3 className="mb-1 text-[14px] font-semibold">Coverage per month</h3>
          <p className="mb-3 text-[12px] text-muted">Pieces logged, {range === 90 ? 'last 6 months' : 'last 12 months'}</p>
          <ColumnChart data={months} caption="Pieces of coverage per month" height={200} format={(v) => (Number.isInteger(v) ? formatNumber(v) : '')} />
        </div>
        <div className="glass rounded-3xl p-5">
          <h3 className="mb-1 text-[14px] font-semibold">Tone of coverage</h3>
          <p className="mb-5 text-[12px] text-muted">{recent.length} pieces in this period</p>
          <SentimentBar {...counts} />
        </div>
      </div>

      <div className="glass overflow-hidden rounded-3xl">
        <div className="hidden grid-cols-[96px_1.2fr_2.4fr_100px_110px_40px] gap-3 border-b border-white/[0.06] px-5 py-3 text-[11px] font-semibold tracking-[0.1em] text-faint uppercase md:grid">
          <span>Date</span>
          <span>Outlet</span>
          <span>Headline</span>
          <span className="text-right">Reach</span>
          <span>Tone</span>
          <span />
        </div>
        {coverage.length ? (
          coverage.map((c) => {
            const meta = SENTIMENT[c.sentiment]
            const Ico = meta.icon
            const project = projects.find((p) => p.id === c.projectId)
            return (
              <div
                key={c.id}
                className="group grid grid-cols-[1fr_auto] items-center gap-3 border-b border-white/[0.04] px-5 py-3 text-[13px] last:border-0 hover:bg-white/[0.02] md:grid-cols-[96px_1.2fr_2.4fr_100px_110px_40px]"
              >
                <span className="hidden text-muted md:block">{format(parseDate(c.date), 'd MMM yyyy')}</span>
                <span className="hidden truncate font-medium md:block">{c.outlet}</span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    {c.url ? (
                      <a href={c.url} target="_blank" rel="noopener noreferrer" className="truncate text-fg hover:underline">
                        {c.headline}
                      </a>
                    ) : (
                      <span className="truncate text-fg">{c.headline}</span>
                    )}
                    {c.url && <ExternalLink className="size-3 shrink-0 text-faint" />}
                  </span>
                  <span className="block truncate text-[11.5px] text-faint">
                    <span className="md:hidden">
                      {c.outlet} · {format(parseDate(c.date), 'd MMM')} ·{' '}
                    </span>
                    {project ? project.name : ''}
                  </span>
                </span>
                <span className="hidden text-right text-soft tabular-nums md:block">{c.reach ? formatNumber(c.reach) : '–'}</span>
                <span className={cn('hidden items-center gap-1.5 md:flex', meta.className)}>
                  <Ico className="size-4" /> <span className="text-soft">{meta.label}</span>
                </span>
                <Menu
                  trigger={(open) => (
                    <button
                      onClick={open}
                      className="grid size-8 place-items-center rounded-lg text-muted opacity-60 hover:bg-white/[0.07] hover:text-fg group-hover:opacity-100"
                      aria-label="More"
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                  )}
                  items={[
                    { label: 'Edit', icon: <Pencil />, onSelect: () => setEditing({ item: c, key: Date.now() }) },
                    'divider',
                    { label: 'Delete', icon: <Trash2 />, danger: true, onSelect: () => void db.coverage.delete(c.id) },
                  ]}
                />
              </div>
            )
          })
        ) : (
          <p className="p-8 text-center text-sm text-muted">Log coverage as it lands and your results build up here.</p>
        )}
      </div>
      {editing && <CoverageModal key={editing.key} item={editing.item} onClose={() => setEditing(null)} />}
    </div>
  )
}
