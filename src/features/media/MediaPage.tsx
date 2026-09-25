import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { create } from 'zustand'
import { AnimatePresence, motion } from 'motion/react'
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Heart,
  Images,
  KeyRound,
  LayoutTemplate,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  TriangleAlert,
  Undo2,
  Upload,
  Wand2,
  X,
} from 'lucide-react'
import { db } from '../../lib/db'
import { ASPECT_PRESETS, aspectById, downloadMedia, enhanceImagePrompt, IMAGE_PROVIDERS, STYLE_PRESETS, styleById, uploadImage } from '../../lib/media/generate'
import { GRAPHIC_LAYOUTS } from '../../lib/media/graphics'
import type { MediaItem } from '../../lib/types'
import { cn, copyText, errorMessage, timeAgo } from '../../lib/utils'
import { useDraftField } from '../../hooks/useDraftField'
import { useMedia, useSecrets } from '../../hooks/data'
import { useMediaJobs, type ImageBatch, type ImageJob } from '../../stores/mediaJobs'
import { useSettings } from '../../stores/settings'
import { PageHeader } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Tabs } from '../../components/ui/bits'
import { Input } from '../../components/ui/Field'
import { useEscapeLayer } from '../../components/ui/Modal'
import { toast } from '../../components/ui/Toast'
import { MediaImg } from './MediaPicker'
import { SocialComposer, useComposer } from './SocialComposer'

type Tab = 'create' | 'social' | 'library'
type Filter = 'all' | 'favourites' | 'created' | 'graphics' | 'uploads'

const IDEAS: { emoji: string; text: string; from: string; to: string }[] = [
  { emoji: '☕', text: 'A cosy coffee shop on a rainy autumn morning, steam rising from a cup by the window', from: '#78350f', to: '#1c1917' },
  { emoji: '🗞️', text: 'Flat lay of a press kit with a notebook, a phone and fresh flowers on linen', from: '#57534e', to: '#1c1917' },
  { emoji: '🌇', text: 'A rooftop summer party at golden hour with string lights and a city skyline', from: '#9a3412', to: '#312e81' },
  { emoji: '🌀', text: 'Abstract flowing ribbons of deep blue and gold light on a dark background', from: '#1e3a8a', to: '#0f172a' },
  { emoji: '🎤', text: 'A confident speaker on a stage with warm spotlights and an engaged audience', from: '#831843', to: '#1e1b4b' },
  { emoji: '🏮', text: 'A winter light festival by the harbour, glowing installations reflected in the water', from: '#0e7490', to: '#172554' },
]

/** The picture being described, kept while moving around the studio. */
const useCreateForm = create<{ prompt: string; original: string | null; styleId: string; aspectId: string; count: number }>(() => ({
  prompt: '',
  original: null,
  styleId: 'photo',
  aspectId: 'square',
  count: 0,
}))

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return now
}

async function toggleFavourite(item: MediaItem) {
  await db.media.update(item.id, { favorite: !item.favorite })
}

/* ------------------------------------------------------------------ */
/*  Create                                                             */
/* ------------------------------------------------------------------ */

function JobCard({ batch, job, item, onOpen }: { batch: ImageBatch; job: ImageJob; item?: MediaItem; onOpen: (id: string) => void }) {
  const aspect = aspectById(batch.aspectId)
  const waiting = job.status === 'queued' && !!job.startsAt
  const now = useNow(waiting)
  const secs = job.startsAt ? Math.max(0, Math.ceil((job.startsAt - now) / 1000)) : 0
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]" style={{ aspectRatio: `${aspect.width} / ${aspect.height}` }}>
      {job.status === 'done' && item ? (
        <>
          <button onClick={() => onOpen(item.id)} className="absolute inset-0" aria-label={`Open ${item.title}`}>
            <MediaImg item={item} className="size-full" />
          </button>
          <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
            <button
              onClick={() => void toggleFavourite(item)}
              className="grid size-8 place-items-center rounded-lg bg-black/60 text-white backdrop-blur hover:bg-black/80"
              aria-label={item.favorite ? 'Remove from favourites' : 'Add to favourites'}
            >
              <Heart className={cn('size-4', item.favorite && 'fill-rose-400 text-rose-400')} />
            </button>
            <button
              onClick={() => void downloadMedia(item)}
              className="grid size-8 place-items-center rounded-lg bg-black/60 text-white backdrop-blur hover:bg-black/80"
              aria-label="Download"
            >
              <Download className="size-4" />
            </button>
          </div>
        </>
      ) : job.status === 'error' ? (
        <div className="absolute inset-0 grid place-items-center p-4 text-center">
          <div>
            <TriangleAlert className="mx-auto size-5 text-warn" />
            <p className="mt-2 line-clamp-4 text-[12px] text-soft">{job.error}</p>
            <Button size="xs" variant="secondary" icon={<RefreshCw />} className="mt-3" onClick={() => useMediaJobs.getState().retry(batch.id, job.id)}>
              Try again
            </Button>
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <div className="absolute inset-0 animate-pulse bg-[linear-gradient(135deg,color-mix(in_oklab,var(--accent)_14%,transparent),transparent_70%)]" />
          <div className="relative text-center text-[12.5px] text-soft">
            <Sparkles className="mx-auto mb-2 size-5 animate-pulse text-[var(--accent)]" />
            {waiting && secs > 0 ? `Your turn in ${secs}s` : job.status === 'queued' && !job.startsAt ? 'Waiting…' : 'Creating…'}
          </div>
        </div>
      )}
    </div>
  )
}

function BatchView({ batch, items, onOpen }: { batch: ImageBatch; items: Map<string, MediaItem>; onOpen: (id: string) => void }) {
  const aspect = aspectById(batch.aspectId)
  const style = styleById(batch.styleId)
  const n = batch.jobs.length
  const wide = aspect.width / aspect.height > 1.5
  const cols =
    n === 1 ? (wide ? 'max-w-3xl grid-cols-1' : 'max-w-md grid-cols-1') : wide ? 'grid-cols-1 sm:grid-cols-2' : n === 2 ? 'max-w-3xl grid-cols-2' : 'grid-cols-2 lg:grid-cols-4'
  return (
    <section className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[14px] text-soft">“{batch.prompt}”</p>
          <p className="mt-1 text-[12px] text-faint">
            {style.emoji} {style.name} · {aspect.name} · {timeAgo(batch.createdAt)}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          icon={<RefreshCw />}
          onClick={() => useMediaJobs.getState().create({ prompt: batch.prompt, styleId: batch.styleId, aspectId: batch.aspectId, count: batch.jobs.length })}
        >
          More like this
        </Button>
        <button
          onClick={() => useMediaJobs.getState().dismiss(batch.id)}
          className="grid size-8 place-items-center rounded-lg text-faint hover:bg-white/[0.06] hover:text-fg"
          aria-label="Hide these results"
          title="Hide (they stay in your library)"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className={cn('grid gap-3', cols)}>
        {batch.jobs.map((j) => (
          <JobCard key={j.id} batch={batch} job={j} item={j.mediaId ? items.get(j.mediaId) : undefined} onOpen={onOpen} />
        ))}
      </div>
    </section>
  )
}

function CreateTab({ onOpen }: { onOpen: (id: string) => void }) {
  const navigate = useNavigate()
  const form = useCreateForm()
  const setForm = useCreateForm.setState
  const batches = useMediaJobs((s) => s.batches)
  const media = useMedia()
  const secrets = useSecrets()
  const providerId = useSettings((s) => s.settings.media.provider)
  const provider = IMAGE_PROVIDERS.find((p) => p.id === providerId) ?? IMAGE_PROVIDERS[0]
  const missingKey = !!provider.needs && !secrets.some((s) => s.service === provider.needs)
  const freeQueue = provider.id === 'pollinations' && !secrets.some((s) => s.service === 'pollinations')
  const count = form.count || (freeQueue ? 2 : 4)
  const [improving, setImproving] = useState(false)
  const items = useMemo(() => new Map(media.map((m) => [m.id, m])), [media])

  const createPictures = () => {
    if (!form.prompt.trim()) return
    useMediaJobs.getState().create({ prompt: form.prompt, styleId: form.styleId, aspectId: form.aspectId, count })
  }

  const improve = async () => {
    if (!form.prompt.trim()) return
    setImproving(true)
    try {
      const better = await enhanceImagePrompt(form.prompt, form.styleId)
      setForm({ original: form.prompt, prompt: better })
    } catch (err) {
      toast.error('Couldn’t improve the idea', errorMessage(err))
    } finally {
      setImproving(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="glass relative overflow-hidden rounded-[28px] p-2">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_140%_at_0%_0%,color-mix(in_oklab,var(--accent)_16%,transparent),transparent_60%)]" />
        <div className="relative rounded-[22px] bg-black/20 p-4 sm:p-5">
          <textarea
            value={form.prompt}
            onChange={(e) => setForm({ prompt: e.target.value, original: null })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                createPictures()
              }
            }}
            rows={2}
            aria-label="Describe the picture you want"
            placeholder="Describe the picture you want… e.g. A cosy coffee shop on a rainy autumn morning"
            className="w-full resize-none bg-transparent text-[16px] leading-relaxed outline-none placeholder:text-faint"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" icon={<Wand2 />} loading={improving} disabled={!form.prompt.trim()} onClick={() => void improve()}>
              Improve my idea
            </Button>
            {form.original !== null && (
              <Button size="sm" variant="ghost" icon={<Undo2 />} onClick={() => setForm({ prompt: form.original ?? '', original: null })}>
                Use my words
              </Button>
            )}
            <Button variant="primary" icon={<Sparkles />} className="ml-auto" disabled={!form.prompt.trim()} onClick={createPictures}>
              Create {count === 1 ? 'picture' : `${count} pictures`}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <h3 className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-faint uppercase">Style</h3>
          <div className="flex gap-2 overflow-x-auto pr-10 pb-1 no-scrollbar [mask-image:linear-gradient(to_right,black_calc(100%-56px),transparent)]">
            {STYLE_PRESETS.map((s) => (
              <button
                key={s.id}
                onClick={() => setForm({ styleId: s.id })}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] transition',
                  form.styleId === s.id ? 'border-transparent bg-white text-ink-950' : 'border-white/[0.08] text-soft hover:border-white/[0.18] hover:text-fg',
                )}
              >
                <span>{s.emoji}</span>
                {s.name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-6">
          <div>
            <h3 className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-faint uppercase">Shape</h3>
            <div className="flex gap-1.5">
              {ASPECT_PRESETS.map((a) => {
                const r = a.width / a.height
                return (
                  <button
                    key={a.id}
                    onClick={() => setForm({ aspectId: a.id })}
                    title={`${a.name} · ${a.label}`}
                    aria-label={a.name}
                    className={cn(
                      'grid size-10 place-items-center rounded-xl border transition',
                      form.aspectId === a.id ? 'border-transparent bg-white/[0.1] text-fg ring-2 ring-[var(--accent)]' : 'border-white/[0.08] text-muted hover:text-fg',
                    )}
                  >
                    <span className="rounded-[2px] border-[1.5px] border-current" style={{ width: r >= 1 ? 20 : 20 * r, height: r >= 1 ? 20 / r : 20 }} />
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-faint uppercase">How many</h3>
            <Tabs
              value={String(count) as '1' | '2' | '4'}
              onChange={(v) => setForm({ count: Number(v) })}
              items={[
                { id: '1', label: '1' },
                { id: '2', label: '2' },
                { id: '4', label: '4' },
              ]}
            />
          </div>
        </div>
      </div>

      {missingKey ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-[13px] text-amber-100">
          <KeyRound className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{provider.name} needs a key before it can make pictures.</span>
          <Button size="xs" variant="secondary" onClick={() => navigate('/vault')}>
            Add a key
          </Button>
          <Button size="xs" variant="ghost" onClick={() => void useSettings.getState().update({ media: { provider: 'pollinations' } })}>
            Use the free service
          </Button>
        </div>
      ) : (
        <p className="text-[12.5px] text-muted">
          {freeQueue ? (
            <>
              Free pictures from Pollinations. They take turns, about one every 15 seconds. Want them faster?{' '}
              <button onClick={() => navigate('/vault')} className="text-soft underline decoration-white/20 underline-offset-2 hover:text-fg">
                Add a free key
              </button>
            </>
          ) : (
            <>Pictures are made with {provider.name}.</>
          )}{' '}
          <button onClick={() => navigate('/settings?tab=integrations')} className="text-soft underline decoration-white/20 underline-offset-2 hover:text-fg">
            Change service
          </button>
        </p>
      )}

      {batches.length ? (
        <div className="space-y-10">
          {batches.map((b) => (
            <BatchView key={b.id} batch={b} items={items} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <section>
          <h3 className="mb-3 text-[11px] font-semibold tracking-[0.12em] text-faint uppercase">Ideas to try</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {IDEAS.map((idea) => (
              <button
                key={idea.text}
                onClick={() => setForm({ prompt: idea.text, original: null })}
                className="group relative overflow-hidden rounded-3xl border border-white/[0.07] p-5 text-left transition hover:-translate-y-0.5 hover:border-white/[0.16]"
                style={{ background: `linear-gradient(135deg, ${idea.from}, ${idea.to})` }}
              >
                <span className="text-[26px]">{idea.emoji}</span>
                <p className="mt-3 text-[13.5px] leading-relaxed text-white/90">{idea.text}</p>
                <span className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-white/60 transition group-hover:text-white">
                  <Wand2 className="size-3.5" /> Use this idea
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Library                                                            */
/* ------------------------------------------------------------------ */

function kindOf(item: MediaItem): 'created' | 'graphics' | 'uploads' {
  if (item.kind === 'graphic') return 'graphics'
  return item.prompt ? 'created' : 'uploads'
}

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'favourites', label: 'Favourites' },
  { id: 'created', label: 'Made here' },
  { id: 'graphics', label: 'Social graphics' },
  { id: 'uploads', label: 'Uploads' },
]

function LibraryTab({ onOpen }: { onOpen: (id: string) => void }) {
  const media = useMedia()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [dragging, setDragging] = useState(false)
  const q = query.trim().toLowerCase()
  const visible = media.filter(
    (m) => (filter === 'all' || (filter === 'favourites' ? m.favorite : kindOf(m) === filter)) && (!q || `${m.title} ${m.prompt ?? ''}`.toLowerCase().includes(q)),
  )
  const counts: Record<Filter, number> = {
    all: media.length,
    favourites: media.filter((m) => m.favorite).length,
    created: media.filter((m) => kindOf(m) === 'created').length,
    graphics: media.filter((m) => kindOf(m) === 'graphics').length,
    uploads: media.filter((m) => kindOf(m) === 'uploads').length,
  }

  const addFiles = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith('image/'))
    if (!list.length) return
    try {
      for (const f of list) await uploadImage(f)
      toast.success(list.length === 1 ? 'Picture added' : `${list.length} pictures added`)
    } catch (err) {
      toast.error('Couldn’t add those pictures', errorMessage(err))
    }
  }

  return (
    <div
      className={cn('relative space-y-5 rounded-3xl transition', dragging && 'ring-2 ring-[var(--accent)] ring-offset-4 ring-offset-ink-950')}
      onDragOver={(e) => {
        if ([...e.dataTransfer.items].some((i) => i.kind === 'file')) {
          e.preventDefault()
          setDragging(true)
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        void addFiles(e.dataTransfer.files)
      }}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <Input icon={<Search />} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your pictures…" className="md:w-72" />
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'h-8 shrink-0 rounded-full border px-3.5 text-[12.5px] transition',
                filter === f.id ? 'border-transparent bg-white text-ink-950' : 'border-white/[0.08] text-muted hover:text-fg',
              )}
            >
              {f.label}
              {counts[f.id] > 0 && <span className="ml-1.5 opacity-60">{counts[f.id]}</span>}
            </button>
          ))}
        </div>
        <label className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 text-[13.5px] font-medium text-soft transition hover:border-white/[0.2] hover:text-fg md:ml-auto">
          <Upload className="size-4" /> Upload
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
      </div>
      {visible.length ? (
        <div className="columns-2 gap-3 md:columns-3 xl:columns-4">
          {visible.map((m) => (
            <button
              key={m.id}
              onClick={() => onOpen(m.id)}
              className="group relative mb-3 block w-full break-inside-avoid overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] transition hover:border-white/[0.2] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              style={{ aspectRatio: `${m.width || 1} / ${m.height || 1}` }}
            >
              <MediaImg item={m} className="size-full transition duration-500 group-hover:scale-[1.03]" />
              <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/75 to-transparent px-3 pt-8 pb-2.5 text-left opacity-0 transition group-hover:opacity-100">
                <span className="truncate text-[12px] text-white">{m.title}</span>
                {m.demo && <span className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-[10px] text-white">Sample</span>}
              </span>
              {m.favorite && <Heart className="absolute top-2.5 right-2.5 size-4 fill-rose-400 text-rose-400 drop-shadow" />}
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-[28px] border border-dashed border-white/[0.1] p-12 text-center">
          <Images className="mx-auto size-8 text-faint" />
          <p className="mt-3 font-medium">{media.length ? 'Nothing matches' : 'Your library is empty'}</p>
          <p className="mt-1 text-sm text-muted">
            {media.length ? 'Try another search or filter.' : 'Create a picture, make a social graphic, or drop pictures here to upload them.'}
          </p>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Viewer                                                             */
/* ------------------------------------------------------------------ */

function Viewer({
  item,
  prevId,
  nextId,
  onNavigate,
  onClose,
  onMore,
  onGraphic,
}: {
  item: MediaItem
  prevId?: string
  nextId?: string
  onNavigate: (id: string) => void
  onClose: () => void
  onMore: (item: MediaItem) => void
  onGraphic: (item: MediaItem) => void
}) {
  useEscapeLayer(true, onClose)
  const [title, setTitle] = useDraftField(item.title, (v) => void db.media.update(item.id, { title: v.trim() || item.title }))
  const style = item.kind === 'image' && item.style ? STYLE_PRESETS.find((s) => s.id === item.style) : undefined
  const layout = item.kind === 'graphic' ? GRAPHIC_LAYOUTS.find((l) => l.id === item.style) : undefined
  const provider = item.provider ? IMAGE_PROVIDERS.find((p) => p.id === item.provider) : undefined
  const portrait = (item.height || 1) >= (item.width || 1)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = titleRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [title])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea')) return
      if (e.key === 'ArrowLeft' && prevId) onNavigate(prevId)
      if (e.key === 'ArrowRight' && nextId) onNavigate(nextId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prevId, nextId, onNavigate])

  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
      className="fixed inset-0 z-[80] flex flex-col bg-black/85 backdrop-blur-md lg:flex-row"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4 sm:p-10" onClick={onClose}>
        <motion.div
          key={item.id}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.18 }}
          className="relative max-h-full max-w-full overflow-hidden rounded-2xl shadow-[0_40px_120px_-30px_rgb(0_0_0)]"
          style={{ aspectRatio: `${item.width || 1} / ${item.height || 1}`, ...(portrait ? { height: 'min(100%, 82vh)' } : { width: 'min(100%, 70vw)' }) }}
          onClick={(e) => e.stopPropagation()}
        >
          <MediaImg item={item} className="size-full object-contain" />
        </motion.div>
        {prevId && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onNavigate(prevId)
            }}
            className="absolute top-1/2 left-3 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
            aria-label="Previous picture"
          >
            <ChevronLeft className="size-5" />
          </button>
        )}
        {nextId && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onNavigate(nextId)
            }}
            className="absolute top-1/2 right-3 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
            aria-label="Next picture"
          >
            <ChevronRight className="size-5" />
          </button>
        )}
      </div>
      <aside className="glass-strong flex max-h-[48vh] w-full shrink-0 flex-col overflow-y-auto border-white/[0.08] p-6 lg:max-h-none lg:w-[380px] lg:border-l">
        <div className="flex items-start gap-2">
          <textarea
            ref={titleRef}
            rows={1}
            value={title}
            onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), (e.target as HTMLTextAreaElement).blur())}
            aria-label="Picture name"
            className="-ml-2 min-w-0 flex-1 resize-none overflow-hidden rounded-lg bg-transparent px-2 py-1 font-display text-[18px] leading-snug font-semibold tracking-tight outline-none focus:bg-white/[0.05]"
          />
          <button onClick={onClose} className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-white/[0.07] hover:text-fg" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11.5px]">
          <span className="rounded-full bg-white/[0.07] px-2.5 py-1 text-soft">{item.kind === 'graphic' ? 'Social graphic' : item.prompt ? 'Made here' : 'Upload'}</span>
          {style && (
            <span className="rounded-full bg-white/[0.07] px-2.5 py-1 text-soft">
              {style.emoji} {style.name}
            </span>
          )}
          {layout && (
            <span className="rounded-full bg-white/[0.07] px-2.5 py-1 text-soft">
              {layout.emoji} {layout.name}
            </span>
          )}
          <span className="rounded-full bg-white/[0.07] px-2.5 py-1 text-soft">
            {item.width} × {item.height}
          </span>
          {item.demo && <span className="rounded-full bg-white/[0.07] px-2.5 py-1 text-soft">Sample</span>}
        </div>
        {item.prompt && (
          <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-[0.12em] text-faint uppercase">Description</span>
              <button
                onClick={async () => {
                  await copyText(item.prompt!)
                  toast.success('Description copied')
                }}
                className="flex items-center gap-1 text-[11.5px] text-muted hover:text-fg"
              >
                <Copy className="size-3" /> Copy
              </button>
            </div>
            <p className="text-[13px] leading-relaxed text-soft">{item.prompt}</p>
          </div>
        )}
        <p className="mt-4 text-[12px] text-faint">
          Added {timeAgo(item.createdAt)}
          {provider ? ` · made with ${provider.name}` : ''}
        </p>
        <div className="mt-6 grid gap-2">
          <Button variant="primary" icon={<Download />} onClick={() => void downloadMedia(item)}>
            Download
          </Button>
          <Button variant="secondary" icon={<Heart className={cn(item.favorite && 'fill-rose-400 text-rose-400')} />} onClick={() => void toggleFavourite(item)}>
            {item.favorite ? 'In your favourites' : 'Add to favourites'}
          </Button>
          {item.prompt && (
            <Button variant="secondary" icon={<RefreshCw />} onClick={() => onMore(item)}>
              More like this
            </Button>
          )}
          {item.kind === 'image' && (
            <Button variant="secondary" icon={<LayoutTemplate />} onClick={() => onGraphic(item)}>
              Use in a social graphic
            </Button>
          )}
          <Button
            variant="ghost"
            icon={<Trash2 />}
            className="text-bad hover:text-bad"
            onClick={async () => {
              if (!window.confirm(`Delete “${item.title}”? Pages and decks using it will lose the picture.`)) return
              await db.media.delete(item.id)
              onClose()
            }}
          >
            Delete
          </Button>
        </div>
      </aside>
    </motion.div>,
    document.body,
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

function nearestAspect(item: MediaItem): string {
  const r = (item.width || 1) / (item.height || 1)
  return ASPECT_PRESETS.reduce((best, a) => (Math.abs(a.width / a.height - r) < Math.abs(best.width / best.height - r) ? a : best)).id
}

export default function MediaPage() {
  const [params, setParams] = useSearchParams()
  const media = useMedia()
  const tab = (params.get('tab') as Tab) || 'create'
  const itemId = params.get('item') ?? undefined
  const item = itemId ? media.find((m) => m.id === itemId) : undefined
  const index = item ? media.indexOf(item) : -1

  const set = (patch: Record<string, string | undefined>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v)
          else next.delete(k)
        }
        return next
      },
      { replace: true },
    )
  const open = (id: string) => set({ item: id })

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Studios"
        title="Media Studio"
        subtitle="Pictures and social graphics made from a sentence, for free. Everything is saved to your library, ready for decks, pages and posts."
      />
      <Tabs
        value={tab}
        onChange={(t) => set({ tab: t === 'create' ? undefined : t })}
        items={[
          { id: 'create', label: 'Create pictures', icon: <Sparkles /> },
          { id: 'social', label: 'Social graphics', icon: <LayoutTemplate /> },
          { id: 'library', label: 'Library', icon: <Images />, count: media.length },
        ]}
      />
      {tab === 'create' && <CreateTab onOpen={open} />}
      {tab === 'social' && <SocialComposer onOpen={open} />}
      {tab === 'library' && <LibraryTab onOpen={open} />}
      <AnimatePresence>
        {item && (
          <Viewer
            key="viewer"
            item={item}
            prevId={index > 0 ? media[index - 1].id : undefined}
            nextId={index >= 0 && index < media.length - 1 ? media[index + 1].id : undefined}
            onNavigate={open}
            onClose={() => set({ item: undefined })}
            onMore={(m) => {
              useMediaJobs.getState().create({ prompt: m.prompt!, styleId: STYLE_PRESETS.some((s) => s.id === m.style) ? m.style! : 'photo', aspectId: nearestAspect(m), count: 2 })
              set({ item: undefined, tab: undefined })
            }}
            onGraphic={(m) => {
              useComposer.getState().set({ background: { kind: 'image', mediaId: m.id } })
              set({ item: undefined, tab: 'social' })
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
