import { useState } from 'react'
import { ImagePlus, Plus, Trash2, Upload, Wand2, X } from 'lucide-react'
import { SLIDE_LAYOUTS } from '../../lib/decks/generate'
import { generateAndSaveImage, saveMedia } from '../../lib/media/generate'
import type { Slide, SlideChart, SlideLayout } from '../../lib/types'
import { cn, errorMessage } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { Input, Textarea } from '../../components/ui/Field'
import { toast } from '../../components/ui/Toast'

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-[11px] font-semibold tracking-[0.12em] text-faint uppercase">{children}</div>
}

function ListEditor({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  return (
    <div className="space-y-1.5">
      {items.map((b, i) => (
        <div key={i} className="group flex gap-1.5">
          <Textarea rows={1} autoGrow value={b} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} className="min-h-9 py-2 text-[13px]" />
          <button
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="grid size-9 shrink-0 place-items-center rounded-lg text-faint hover:bg-white/[0.06] hover:text-fg"
            aria-label="Remove"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      <button onClick={() => onChange([...items, ''])} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] text-muted hover:bg-white/[0.04] hover:text-fg">
        <Plus className="size-3.5" /> {placeholder}
      </button>
    </div>
  )
}

/** Sensible starting content when a slide switches to a layout that needs something it doesn't have. */
export function withLayout(slide: Slide, layout: SlideLayout): Slide {
  const next: Slide = { ...slide, layout }
  const bullets = slide.bullets ?? []
  if ((layout === 'stats' || layout === 'big-stat') && !slide.stats?.length) next.stats = [{ value: '[X]', label: bullets[0] ?? 'What this number shows' }]
  if (layout === 'quote' && !slide.quote) next.quote = { text: bullets[0] ?? slide.subtitle ?? 'A line worth remembering.', author: '' }
  if ((layout === 'two-column' || layout === 'comparison') && !slide.columns?.length) {
    const half = Math.ceil(bullets.length / 2)
    next.columns = [
      { heading: layout === 'comparison' ? 'Before' : 'First', bullets: bullets.slice(0, half).length ? bullets.slice(0, half) : ['A point'] },
      { heading: layout === 'comparison' ? 'After' : 'Second', bullets: bullets.slice(half).length ? bullets.slice(half) : ['A point'] },
    ]
  }
  if ((layout === 'timeline' || layout === 'agenda') && !slide.items?.length) next.items = (bullets.length ? bullets : ['First', 'Second', 'Third']).map((b) => ({ label: b }))
  if (layout === 'chart' && !slide.chart) next.chart = { kind: 'bar', labels: ['Q1', 'Q2', 'Q3', 'Q4'], series: [{ name: 'Results', values: [12, 19, 26, 34] }] }
  if (layout === 'bullets' && !bullets.length) next.bullets = ['A key point']
  return next
}

function ChartFields({ chart, onChange }: { chart: SlideChart; onChange: (c: SlideChart) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5">
        {(['bar', 'line', 'donut'] as const).map((k) => (
          <button
            key={k}
            onClick={() => onChange({ ...chart, kind: k })}
            className={cn(
              'h-8 rounded-lg border text-[12.5px] capitalize transition',
              chart.kind === k ? 'border-transparent bg-white text-ink-950' : 'border-white/[0.08] text-muted hover:text-fg',
            )}
          >
            {k}
          </button>
        ))}
      </div>
      <div>
        <Label>Labels (comma separated)</Label>
        <Input value={chart.labels.join(', ')} onChange={(e) => onChange({ ...chart, labels: e.target.value.split(',').map((x) => x.trim()) })} className="h-9 text-[13px]" />
      </div>
      {chart.series.map((s, i) => (
        <div key={i} className="space-y-1.5 rounded-xl border border-white/[0.06] p-2.5">
          <div className="flex gap-1.5">
            <Input
              value={s.name}
              onChange={(e) => onChange({ ...chart, series: chart.series.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
              placeholder="Series name"
              className="h-8 text-[12.5px]"
            />
            {chart.series.length > 1 && (
              <button
                onClick={() => onChange({ ...chart, series: chart.series.filter((_, j) => j !== i) })}
                className="grid size-8 shrink-0 place-items-center rounded-lg text-faint hover:text-fg"
                aria-label="Remove series"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
          <Input
            value={s.values.join(', ')}
            onChange={(e) =>
              onChange({
                ...chart,
                series: chart.series.map((x, j) =>
                  j === i
                    ? {
                        ...x,
                        values: e.target.value
                          .split(',')
                          .map((v) => Number(v.trim().replace(/[^0-9.-]/g, '')))
                          .filter((n) => Number.isFinite(n)),
                      }
                    : x,
                ),
              })
            }
            placeholder="Numbers, comma separated"
            className="h-8 text-[12.5px]"
          />
        </div>
      ))}
      {chart.kind !== 'donut' && chart.series.length < 4 && (
        <button
          onClick={() => onChange({ ...chart, series: [...chart.series, { name: `Series ${chart.series.length + 1}`, values: chart.labels.map(() => 0) }] })}
          className="flex items-center gap-1.5 text-[12.5px] text-muted hover:text-fg"
        >
          <Plus className="size-3.5" /> Add a series
        </button>
      )}
    </div>
  )
}

export function SlideFields({ slide, projectId, onChange }: { slide: Slide; projectId?: string; onChange: (s: Slide) => void }) {
  const [imageBusy, setImageBusy] = useState(false)
  const set = (patch: Partial<Slide>) => onChange({ ...slide, ...patch })
  const L = slide.layout

  const makeImage = async () => {
    if (!slide.imagePrompt?.trim()) return
    setImageBusy(true)
    try {
      const media = await generateAndSaveImage({ prompt: slide.imagePrompt, styleId: 'editorial', aspectId: 'landscape', projectId })
      onChange({ ...slide, image: { mediaId: media.id, alt: slide.imagePrompt } })
    } catch (err) {
      toast.error('Couldn’t create the image', errorMessage(err))
    } finally {
      setImageBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <Label>Layout</Label>
        <div className="grid grid-cols-3 gap-1.5">
          {SLIDE_LAYOUTS.map((l) => (
            <button
              key={l.id}
              onClick={() => onChange(withLayout(slide, l.id))}
              title={l.hint}
              className={cn(
                'h-8 truncate rounded-lg border px-1.5 text-[11.5px] transition',
                L === l.id ? 'border-transparent bg-white text-ink-950' : 'border-white/[0.08] text-muted hover:text-fg',
              )}
            >
              {l.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>{L === 'big-stat' ? 'Headline above the number' : 'Title'}</Label>
        <Textarea rows={2} autoGrow value={slide.title} onChange={(e) => set({ title: e.target.value })} className="text-[14px] font-medium" />
      </div>
      {['title', 'section', 'closing', 'bullets', 'two-column', 'comparison', 'stats', 'timeline', 'agenda', 'chart'].includes(L) && (
        <div>
          <Label>Subtitle</Label>
          <Input value={slide.subtitle ?? ''} onChange={(e) => set({ subtitle: e.target.value || undefined })} className="h-9 text-[13px]" />
        </div>
      )}
      {['bullets', 'image', 'chart', 'big-stat', 'title', 'closing'].includes(L) && (
        <div>
          <Label>Text</Label>
          <Textarea rows={2} autoGrow value={slide.body ?? ''} onChange={(e) => set({ body: e.target.value || undefined })} className="text-[13px]" />
        </div>
      )}
      {['bullets', 'image', 'chart'].includes(L) && (
        <div>
          <Label>Points</Label>
          <ListEditor items={slide.bullets ?? []} onChange={(bullets) => set({ bullets })} placeholder="Add a point" />
        </div>
      )}
      {(L === 'two-column' || L === 'comparison') &&
        (slide.columns ?? []).map((c, i) => (
          <div key={i} className="space-y-2 rounded-2xl border border-white/[0.06] p-3">
            <Input
              value={c.heading}
              onChange={(e) => set({ columns: slide.columns!.map((x, j) => (j === i ? { ...x, heading: e.target.value } : x)) })}
              className="h-9 text-[13px] font-medium"
              placeholder="Column heading"
            />
            <ListEditor items={c.bullets} onChange={(bullets) => set({ columns: slide.columns!.map((x, j) => (j === i ? { ...x, bullets } : x)) })} placeholder="Add a point" />
          </div>
        ))}
      {(L === 'stats' || L === 'big-stat') && (
        <div className="space-y-2">
          <Label>{L === 'big-stat' ? 'The number' : 'Numbers'}</Label>
          {(slide.stats ?? []).slice(0, L === 'big-stat' ? 1 : 4).map((s, i) => (
            <div key={i} className="grid grid-cols-[90px_1fr_auto] gap-1.5">
              <Input
                value={s.value}
                onChange={(e) => set({ stats: slide.stats!.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })}
                className="h-9 text-[13px] font-semibold"
              />
              <Input value={s.label} onChange={(e) => set({ stats: slide.stats!.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} className="h-9 text-[13px]" />
              <button
                onClick={() => set({ stats: slide.stats!.filter((_, j) => j !== i) })}
                className="grid size-9 place-items-center rounded-lg text-faint hover:text-fg"
                aria-label="Remove"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          {L === 'stats' && (slide.stats?.length ?? 0) < 4 && (
            <button
              onClick={() => set({ stats: [...(slide.stats ?? []), { value: '[X]', label: '' }] })}
              className="flex items-center gap-1.5 text-[12.5px] text-muted hover:text-fg"
            >
              <Plus className="size-3.5" /> Add a number
            </button>
          )}
        </div>
      )}
      {L === 'quote' && (
        <div className="space-y-2">
          <Label>Quote</Label>
          <Textarea rows={3} autoGrow value={slide.quote?.text ?? ''} onChange={(e) => set({ quote: { ...slide.quote, text: e.target.value } })} className="text-[13px]" />
          <div className="grid grid-cols-2 gap-1.5">
            <Input
              value={slide.quote?.author ?? ''}
              onChange={(e) => set({ quote: { text: slide.quote?.text ?? '', ...slide.quote, author: e.target.value } })}
              placeholder="Who said it"
              className="h-9 text-[13px]"
            />
            <Input
              value={slide.quote?.role ?? ''}
              onChange={(e) => set({ quote: { text: slide.quote?.text ?? '', ...slide.quote, role: e.target.value } })}
              placeholder="Their role"
              className="h-9 text-[13px]"
            />
          </div>
        </div>
      )}
      {(L === 'timeline' || L === 'agenda') && (
        <div className="space-y-2">
          <Label>{L === 'timeline' ? 'Steps' : 'Items'}</Label>
          {(slide.items ?? []).map((it, i) => (
            <div key={i} className="space-y-1 rounded-xl border border-white/[0.06] p-2">
              <div className="flex gap-1.5">
                <Input
                  value={it.label}
                  onChange={(e) => set({ items: slide.items!.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                  className="h-8 text-[13px] font-medium"
                />
                <button
                  onClick={() => set({ items: slide.items!.filter((_, j) => j !== i) })}
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-faint hover:text-fg"
                  aria-label="Remove"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <Input
                value={it.detail ?? ''}
                onChange={(e) => set({ items: slide.items!.map((x, j) => (j === i ? { ...x, detail: e.target.value || undefined } : x)) })}
                placeholder="Detail (optional)"
                className="h-8 text-[12.5px]"
              />
            </div>
          ))}
          <button onClick={() => set({ items: [...(slide.items ?? []), { label: 'New step' }] })} className="flex items-center gap-1.5 text-[12.5px] text-muted hover:text-fg">
            <Plus className="size-3.5" /> Add
          </button>
        </div>
      )}
      {L === 'chart' && slide.chart && (
        <div>
          <Label>Chart</Label>
          <ChartFields chart={slide.chart} onChange={(chart) => set({ chart })} />
        </div>
      )}
      {L === 'image' && (
        <div className="space-y-2">
          <Label>Image</Label>
          <Textarea
            rows={2}
            autoGrow
            value={slide.imagePrompt ?? ''}
            onChange={(e) => set({ imagePrompt: e.target.value })}
            placeholder="Describe the picture you want"
            className="text-[13px]"
          />
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="secondary" icon={<Wand2 />} loading={imageBusy} disabled={!slide.imagePrompt?.trim()} onClick={() => void makeImage()}>
              {slide.image ? 'New image' : 'Create image'}
            </Button>
            <label className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 text-[13px] text-soft hover:text-fg">
              <Upload className="size-3.5" /> Upload
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  const media = await saveMedia({ kind: 'image', title: f.name, blob: f, width: 1600, height: 900, projectId })
                  onChange({ ...slide, image: { mediaId: media.id, alt: f.name } })
                  e.target.value = ''
                }}
              />
            </label>
            {slide.image && (
              <Button size="sm" variant="ghost" icon={<ImagePlus />} onClick={() => set({ image: undefined })}>
                Remove
              </Button>
            )}
          </div>
        </div>
      )}
      <div>
        <Label>Speaker notes</Label>
        <Textarea
          rows={3}
          autoGrow
          value={slide.notes ?? ''}
          onChange={(e) => set({ notes: e.target.value || undefined })}
          placeholder="What you’ll say on this slide"
          className="text-[13px]"
        />
      </div>
    </div>
  )
}
