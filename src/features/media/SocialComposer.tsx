import { useEffect, useRef, useState, type ReactNode } from 'react'
import { create } from 'zustand'
import { Copy, Download, ImagePlus, Images, Save, Wand2, X } from 'lucide-react'
import { writeGraphicCopy } from '../../lib/media/copy'
import {
  drawGraphic,
  formatById,
  GRADIENTS,
  GRAPHIC_FONTS,
  GRAPHIC_FORMATS,
  GRAPHIC_LAYOUTS,
  graphicBlob,
  layoutById,
  loadPicture,
  prepareFonts,
  type GraphicFormatId,
  type GraphicLayoutId,
  type GraphicSpec,
} from '../../lib/media/graphics'
import { generateAndSaveImage, saveMedia } from '../../lib/media/generate'
import type { MediaItem } from '../../lib/types'
import { cn, copyText, downloadBlob, errorMessage, safeFileName } from '../../lib/utils'
import { useMedia } from '../../hooks/data'
import { useSettings } from '../../stores/settings'
import { Button } from '../../components/ui/Button'
import { Input, Slider, Textarea } from '../../components/ui/Field'
import { toast } from '../../components/ui/Toast'
import { MediaImg, MediaPicker } from './MediaPicker'

const SAMPLES: Record<GraphicLayoutId, Pick<GraphicSpec, 'eyebrow' | 'headline' | 'body' | 'cta'>> = {
  announcement: {
    eyebrow: 'Just announced',
    headline: 'Something new is coming this autumn',
    body: 'Be the first to hear about it. Follow along for the reveal.',
    cta: 'Find out more',
  },
  quote: { eyebrow: 'In their words', headline: 'The best campaigns don’t shout. They start conversations people want to join.', body: 'Our founder', cta: '' },
  event: { eyebrow: 'Thu 16 Oct', headline: 'The Autumn Press Breakfast', body: '8.30am · The Glasshouse, London', cta: 'Save your place' },
  stat: { eyebrow: 'This season', headline: '3 cities', body: 'one weekend of pop-up tastings', cta: '' },
}

const ACCENTS = ['#f59e0b', '#fb7185', '#e11d48', '#a78bfa', '#6366f1', '#38bdf8', '#2dd4bf', '#a3e635', '#fb923c', '#ffffff']

/** Picture shapes that suit each graphic size, for making a background. */
const ASPECT_FOR: Record<GraphicFormatId, string> = { square: 'square', portrait: 'portrait', story: 'story', landscape: 'landscape', wide: 'landscape' }

interface ComposerState {
  spec: GraphicSpec
  caption: string
  brandReady: boolean
  /** The layout the words were last written for, so they can be rewritten after a change. */
  writtenFor: GraphicLayoutId | null
  set: (patch: Partial<GraphicSpec>) => void
  setCaption: (caption: string) => void
  setBrand: (brand: string) => void
}

/** The graphic being designed, kept while moving around the studio. */
export const useComposer = create<ComposerState>((set, get) => ({
  spec: {
    format: 'square',
    layout: 'announcement',
    ...SAMPLES.announcement,
    brand: '',
    accent: '#f59e0b',
    font: 'bold',
    background: { kind: 'gradient', from: GRADIENTS[1].from, to: GRADIENTS[1].to },
    shade: 0.4,
  },
  caption: '',
  brandReady: false,
  writtenFor: null,
  set: (patch) => set({ spec: { ...get().spec, ...patch } }),
  setCaption: (caption) => set({ caption }),
  setBrand: (brand) => set({ spec: { ...get().spec, brand }, brandReady: true }),
}))

function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] font-semibold tracking-[0.12em] text-faint uppercase">{title}</h3>
        {hint && <span className="text-[11.5px] text-faint">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

function Swatches({ colors, value, onChange, label }: { colors: string[]; value: string; onChange: (c: string) => void; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {colors.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          aria-label={`${label} ${c}`}
          className={cn('size-7 rounded-full ring-1 ring-white/15 transition hover:scale-110', value.toLowerCase() === c && 'ring-2 ring-white ring-offset-2 ring-offset-ink-950')}
          style={{ background: c }}
        />
      ))}
      <label
        className="relative grid size-7 cursor-pointer place-items-center overflow-hidden rounded-full bg-[conic-gradient(#f87171,#fbbf24,#a3e635,#38bdf8,#a78bfa,#f87171)] ring-1 ring-white/15"
        title="Any colour"
      >
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          aria-label={`Pick any ${label.toLowerCase()}`}
        />
      </label>
    </div>
  )
}

export function SocialComposer({ onOpen }: { onOpen: (id: string) => void }) {
  const { spec, caption, brandReady, writtenFor, set, setCaption, setBrand } = useComposer()
  const companyName = useSettings((s) => s.settings.companyName)
  const media = useMedia()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [picture, setPicture] = useState<CanvasImageSource | null>(null)
  const [fontsTick, setFontsTick] = useState(0)
  const [about, setAbout] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [pictureIdea, setPictureIdea] = useState('')
  const layout = layoutById(spec.layout)
  const fmt = formatById(spec.format)
  const bg = spec.background
  const mediaId = bg.kind === 'image' ? bg.mediaId : null
  const bgItem: MediaItem | undefined = mediaId ? media.find((m) => m.id === mediaId) : undefined

  useEffect(() => {
    if (!brandReady) setBrand(companyName)
  }, [brandReady, companyName, setBrand])

  useEffect(() => {
    let alive = true
    setPicture(null)
    if (mediaId) void loadPicture(mediaId).then((p) => alive && setPicture(p))
    return () => {
      alive = false
    }
  }, [mediaId])

  useEffect(() => {
    let alive = true
    void prepareFonts(spec.font).then(() => alive && setFontsTick((n) => n + 1))
    return () => {
      alive = false
    }
  }, [spec.font])

  useEffect(() => {
    if (canvasRef.current) drawGraphic(canvasRef.current, spec, picture)
  }, [spec, picture, fontsTick])

  const switchLayout = (id: GraphicLayoutId) => {
    const before = SAMPLES[spec.layout]
    const untouched = spec.eyebrow === before.eyebrow && spec.headline === before.headline && spec.body === before.body && spec.cta === before.cta
    set({ layout: id, ...(untouched ? SAMPLES[id] : {}) })
  }

  const writeForMe = async () => {
    if (!about.trim()) return
    setBusy('write')
    try {
      const copy = await writeGraphicCopy({ about: about.trim(), layout: spec.layout, brand: spec.brand })
      set({ eyebrow: copy.eyebrow, headline: copy.headline || spec.headline, body: copy.body, cta: layout.labels.cta ? copy.cta : '' })
      setCaption(copy.caption)
      useComposer.setState({ writtenFor: spec.layout })
    } catch (err) {
      toast.error('Couldn’t write the words', errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const makePicture = async () => {
    const idea = pictureIdea.trim() || about.trim() || spec.headline
    setBusy('picture')
    try {
      const item = await generateAndSaveImage({ prompt: idea, styleId: 'editorial', aspectId: ASPECT_FOR[spec.format] })
      set({ background: { kind: 'image', mediaId: item.id } })
      setPictureIdea('')
    } catch (err) {
      toast.error('Couldn’t create the picture', errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const exportBlob = async (): Promise<Blob | null> => {
    try {
      return await graphicBlob(canvasRef.current!)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'SecurityError')
        toast.error('This picture can’t be used in a graphic', 'It comes from another website. Download it, upload it to your library, then try again.')
      else toast.error('Couldn’t make the file', errorMessage(err))
      return null
    }
  }

  const save = async () => {
    setBusy('save')
    const blob = await exportBlob()
    if (blob) {
      const item = await saveMedia({ kind: 'graphic', title: spec.headline.trim() || 'Social graphic', blob, width: fmt.width, height: fmt.height, style: spec.layout })
      toast.success('Saved to your library', undefined, { label: 'View', onClick: () => onOpen(item.id) })
    }
    setBusy(null)
  }

  const download = async () => {
    const blob = await exportBlob()
    if (blob) downloadBlob(blob, `${safeFileName(spec.headline || 'social graphic')}.png`)
  }

  return (
    <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
      <div className="space-y-7">
        <div className="glass relative overflow-hidden rounded-3xl p-4">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_120%_at_0%_0%,color-mix(in_oklab,var(--accent)_14%,transparent),transparent_60%)]" />
          <div className="relative space-y-2.5">
            <label htmlFor="graphic-about" className="block text-[13.5px] font-semibold">
              What’s the post about?
            </label>
            <Textarea
              id="graphic-about"
              rows={2}
              autoGrow
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              placeholder="e.g. Our Autumn Blend pop-up opens this Saturday in Shoreditch"
              className="text-[13.5px]"
            />
            <Button size="sm" variant="primary" icon={<Wand2 />} loading={busy === 'write'} disabled={!about.trim()} onClick={() => void writeForMe()}>
              Write it for me
            </Button>
          </div>
        </div>

        <Section title="Size" hint={fmt.hint}>
          <div className="grid grid-cols-5 gap-1.5">
            {GRAPHIC_FORMATS.map((f) => {
              const r = f.width / f.height
              return (
                <button
                  key={f.id}
                  onClick={() => set({ format: f.id })}
                  title={f.hint}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 text-[11.5px] transition',
                    spec.format === f.id ? 'border-transparent bg-white/[0.09] text-fg ring-2 ring-[var(--accent)]' : 'border-white/[0.08] text-muted hover:text-fg',
                  )}
                >
                  <span className="grid h-7 place-items-center">
                    <span className="rounded-[3px] border-[1.5px] border-current" style={{ width: r >= 1 ? 26 : 26 * r, height: r >= 1 ? 26 / r : 26 }} />
                  </span>
                  {f.name}
                </button>
              )
            })}
          </div>
        </Section>

        <Section title="Layout">
          <div className="grid grid-cols-2 gap-2">
            {GRAPHIC_LAYOUTS.map((l) => (
              <button
                key={l.id}
                onClick={() => switchLayout(l.id)}
                className={cn(
                  'flex items-start gap-2.5 rounded-2xl border p-3 text-left transition',
                  spec.layout === l.id ? 'border-transparent bg-white/[0.08] ring-2 ring-[var(--accent)]' : 'border-white/[0.08] hover:border-white/[0.18]',
                )}
              >
                <span className="text-[18px] leading-none">{l.emoji}</span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold">{l.name}</span>
                  <span className="block text-[11.5px] text-muted">{l.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </Section>

        <Section
          title="Words"
          hint={
            writtenFor && writtenFor !== spec.layout && about.trim() ? (
              <button
                onClick={() => void writeForMe()}
                disabled={busy === 'write'}
                className="flex items-center gap-1 text-[12px] text-[var(--accent)] hover:underline disabled:opacity-50"
              >
                <Wand2 className="size-3.5" /> Rewrite for this layout
              </button>
            ) : undefined
          }
        >
          <div className="space-y-2.5">
            <Input
              value={spec.eyebrow}
              onChange={(e) => set({ eyebrow: e.target.value })}
              placeholder={layout.labels.eyebrow}
              aria-label={layout.labels.eyebrow}
              className="h-9 text-[13px]"
            />
            <Textarea
              rows={2}
              autoGrow
              value={spec.headline}
              onChange={(e) => set({ headline: e.target.value })}
              placeholder={layout.labels.headline}
              aria-label={layout.labels.headline}
              className="text-[14px] font-medium"
            />
            <Textarea
              rows={1}
              autoGrow
              value={spec.body}
              onChange={(e) => set({ body: e.target.value })}
              placeholder={layout.labels.body}
              aria-label={layout.labels.body}
              className="text-[13px]"
            />
            <div className="grid grid-cols-2 gap-2.5">
              {layout.labels.cta ? (
                <Input
                  value={spec.cta}
                  onChange={(e) => set({ cta: e.target.value })}
                  placeholder={`${layout.labels.cta} (optional)`}
                  aria-label={layout.labels.cta}
                  className="h-9 text-[13px]"
                />
              ) : (
                <span />
              )}
              <Input value={spec.brand} onChange={(e) => setBrand(e.target.value)} placeholder="Brand name" aria-label="Brand name" className="h-9 text-[13px]" />
            </div>
          </div>
        </Section>

        <Section title="Background">
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'image', label: 'Picture' },
                  { id: 'gradient', label: 'Gradient' },
                  { id: 'solid', label: 'Colour' },
                ] as const
              ).map((o) => (
                <button
                  key={o.id}
                  onClick={() => {
                    if (o.id === bg.kind) return
                    if (o.id === 'gradient') set({ background: { kind: 'gradient', from: GRADIENTS[1].from, to: GRADIENTS[1].to } })
                    else if (o.id === 'solid') set({ background: { kind: 'solid', color: '#111113' } })
                    else if (media[0]) set({ background: { kind: 'image', mediaId: media.find((m) => m.kind === 'image')?.id ?? media[0].id } })
                    else setPicking(true)
                  }}
                  className={cn(
                    'h-8 rounded-lg border text-[12.5px] transition',
                    bg.kind === o.id ? 'border-transparent bg-white text-ink-950' : 'border-white/[0.08] text-muted hover:text-fg',
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {bg.kind === 'gradient' && (
              <div className="flex flex-wrap gap-2">
                {GRADIENTS.map((g) => (
                  <button
                    key={g.name}
                    onClick={() => set({ background: { kind: 'gradient', from: g.from, to: g.to } })}
                    title={g.name}
                    aria-label={`${g.name} gradient`}
                    className={cn(
                      'size-9 rounded-xl ring-1 ring-white/15 transition hover:scale-105',
                      bg.from === g.from && bg.to === g.to && 'ring-2 ring-white ring-offset-2 ring-offset-ink-950',
                    )}
                    style={{ background: `linear-gradient(135deg, ${g.from}, ${g.to})` }}
                  />
                ))}
              </div>
            )}
            {bg.kind === 'solid' && (
              <Swatches
                label="Background"
                colors={['#111113', '#0b1220', '#1c1917', '#ffffff', '#f5f0e8', '#fde68a', '#dbeafe', '#fce7f3']}
                value={bg.color}
                onChange={(color) => set({ background: { kind: 'solid', color } })}
              />
            )}
            {bg.kind === 'image' && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="size-16 shrink-0 overflow-hidden rounded-xl ring-1 ring-white/10">{bgItem ? <MediaImg item={bgItem} className="size-full" /> : null}</div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="secondary" icon={<Images />} onClick={() => setPicking(true)}>
                      Change picture
                    </Button>
                    <Button size="sm" variant="ghost" icon={<X />} onClick={() => set({ background: { kind: 'gradient', from: GRADIENTS[1].from, to: GRADIENTS[1].to } })}>
                      Remove
                    </Button>
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 text-[12px] text-muted">Darken the picture so the words stand out</div>
                  <Slider value={Math.round(spec.shade * 100)} onChange={(v) => set({ shade: v / 100 })} left="Lighter" right="Darker" />
                </div>
              </div>
            )}
            <div className="flex gap-1.5">
              <Input value={pictureIdea} onChange={(e) => setPictureIdea(e.target.value)} placeholder="Or describe a new background picture…" className="h-9 text-[13px]" />
              <Button size="sm" variant="secondary" icon={<ImagePlus />} loading={busy === 'picture'} onClick={() => void makePicture()} className="h-9 shrink-0">
                Create
              </Button>
            </div>
          </div>
        </Section>

        <Section title="Highlight colour">
          <Swatches label="Highlight colour" colors={ACCENTS} value={spec.accent} onChange={(accent) => set({ accent })} />
        </Section>

        <Section title="Lettering">
          <div className="grid grid-cols-3 gap-1.5">
            {GRAPHIC_FONTS.map((f) => (
              <button
                key={f.id}
                onClick={() => set({ font: f.id })}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl border py-2.5 text-[11.5px] transition',
                  spec.font === f.id ? 'border-transparent bg-white/[0.09] text-fg ring-2 ring-[var(--accent)]' : 'border-white/[0.08] text-muted hover:text-fg',
                )}
              >
                <span className="text-[22px] leading-none text-fg" style={{ fontFamily: f.family, fontWeight: f.weight }}>
                  Aa
                </span>
                {f.label}
              </button>
            ))}
          </div>
        </Section>
      </div>

      <div className="order-first space-y-4 xl:sticky xl:top-2 xl:order-none">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto text-[12.5px] text-muted">
            {fmt.name} · {fmt.width} × {fmt.height}
          </span>
          <Button variant="secondary" icon={<Download />} onClick={() => void download()}>
            Download
          </Button>
          <Button variant="primary" icon={<Save />} loading={busy === 'save'} onClick={() => void save()}>
            Save to library
          </Button>
        </div>
        <div className="grid min-h-[420px] place-items-center rounded-[28px] border border-white/[0.06] bg-[radial-gradient(70%_60%_at_50%_40%,rgb(255_255_255/0.05),transparent),repeating-conic-gradient(rgb(255_255_255/0.025)_0%_25%,transparent_0%_50%)] bg-[length:auto,24px_24px] p-5 sm:p-8">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`${layout.name} graphic: ${spec.headline}`}
            className="rounded-lg shadow-[0_30px_80px_-30px_rgb(0_0_0/0.9)]"
            style={{ maxWidth: '100%', maxHeight: 'min(64vh, calc(100vh - 260px))', width: 'auto', height: 'auto' }}
          />
        </div>
        {caption && (
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[11px] font-semibold tracking-[0.12em] text-faint uppercase">Caption to post with it</h3>
              <Button
                size="xs"
                variant="ghost"
                icon={<Copy />}
                onClick={async () => {
                  await copyText(caption)
                  toast.success('Caption copied')
                }}
              >
                Copy
              </Button>
            </div>
            <Textarea rows={3} autoGrow value={caption} onChange={(e) => setCaption(e.target.value)} className="text-[13px]" />
          </div>
        )}
      </div>
      <MediaPicker open={picking} onClose={() => setPicking(false)} onPick={(m) => set({ background: { kind: 'image', mediaId: m.id } })} />
    </div>
  )
}
