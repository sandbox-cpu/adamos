import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowLeft, Check, Copy, Download, FileText, ImagePlus, MoreHorizontal, Palette, Play, Plus, RotateCcw, Sparkles, Trash2, TriangleAlert, Wand2 } from 'lucide-react'
import { db } from '../../lib/db'
import { generateDeck, illustrateDeck, reviseDeck, reviseSlide, SLIDE_LAYOUTS } from '../../lib/decks/generate'
import { exportDeckToPptx } from '../../lib/decks/pptx'
import { DECK_THEMES, resolveDeckTheme } from '../../lib/decks/themes'
import type { Deck, Slide } from '../../lib/types'
import { cn, copyText, errorMessage, uid } from '../../lib/utils'
import { useDraftField } from '../../hooks/useDraftField'
import { useAgents } from '../../hooks/data'
import { AgentAvatar } from '../../components/agents/AgentAvatar'
import { Button } from '../../components/ui/Button'
import { Menu, Tabs } from '../../components/ui/bits'
import { Textarea } from '../../components/ui/Field'
import { toast } from '../../components/ui/Toast'
import { SlideFrame, SlideView } from './SlideView'
import { SlideFields, withLayout } from './SlideFields'

const SLIDE_IDEAS = ['Make it punchier', 'Cut it to three points', 'Turn it into a chart', 'Add a striking statistic', 'Make it a big number slide']
const DECK_IDEAS = ['Make it more visual', 'Add a slide on budget and timings', 'Shorten to 8 slides', 'Make the tone more formal', 'Add a case study slide']

async function saveSlides(deckId: string, slides: Slide[]) {
  await db.decks.update(deckId, { slides, updatedAt: Date.now() })
}

/* ------------------------------------------------------------------ */
/*  Thumbnails                                                         */
/* ------------------------------------------------------------------ */

function Thumb({
  deck,
  slide,
  index,
  active,
  onSelect,
  onDuplicate,
  onDelete,
}: {
  deck: Deck
  slide: Slide
  index: number
  active: boolean
  onSelect: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slide.id })
  const theme = useMemo(() => resolveDeckTheme(deck.themeId, deck.brand), [deck.themeId, deck.brand])
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn('group relative flex gap-2', isDragging && 'z-10 opacity-70')}>
      <span className={cn('w-5 shrink-0 pt-1 text-right text-[11px]', active ? 'text-fg' : 'text-faint')}>{index + 1}</span>
      <button
        {...attributes}
        {...listeners}
        onClick={onSelect}
        className={cn(
          'relative min-w-0 flex-1 overflow-hidden rounded-xl border transition',
          active ? 'border-transparent ring-2 ring-[var(--accent)]' : 'border-white/[0.08] hover:border-white/[0.2]',
        )}
      >
        <SlideFrame>
          <SlideView slide={slide} theme={theme} index={index} total={deck.slides.length} deckTitle={deck.title} logo={deck.brand?.logo} />
        </SlideFrame>
      </button>
      <div className="absolute top-1 right-1 opacity-0 transition group-hover:opacity-100">
        <Menu
          trigger={(open) => (
            <button onClick={open} className="grid size-6 place-items-center rounded-md bg-black/70 text-soft hover:text-fg" aria-label="Slide options">
              <MoreHorizontal className="size-3.5" />
            </button>
          )}
          items={[
            { label: 'Duplicate', icon: <Copy />, onSelect: onDuplicate },
            { label: 'Delete slide', icon: <Trash2 />, danger: true, onSelect: onDelete },
          ]}
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  While the deck is being made                                       */
/* ------------------------------------------------------------------ */

function Building({ deck }: { deck: Deck }) {
  const agents = useAgents()
  const agent = agents.find((a) => a.id === deck.agentId) ?? agents.find((a) => a.roleId === 'creative')
  const theme = resolveDeckTheme(deck.themeId, deck.brand)
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="w-full max-w-3xl text-center">
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.08]" style={{ background: theme.canvas }}>
          <div className="aspect-video" />
          <div className="absolute inset-0 flex flex-col justify-center gap-5 p-[8%]">
            <div className="skeleton h-[9%] w-3/4 rounded-2xl opacity-60" />
            <div className="skeleton h-[5%] w-1/2 rounded-xl opacity-40" />
            <div className="mt-6 space-y-3">
              {[80, 70, 76].map((w) => (
                <div key={w} className="skeleton h-3 rounded-lg opacity-30" style={{ width: `${w}%` }} />
              ))}
            </div>
          </div>
        </div>
        <div className="mt-8 flex items-center justify-center gap-3">
          {agent && <AgentAvatar agent={agent} size="md" active />}
          <div className="text-left">
            <div className="font-semibold">{deck.stage ?? 'Getting started'}</div>
            <div className="text-[13px] text-muted">Your deck will appear here slide by slide. It usually takes a minute or two.</div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Editor                                                             */
/* ------------------------------------------------------------------ */

function Editor({ deck }: { deck: Deck }) {
  const navigate = useNavigate()
  const agents = useAgents()
  const theme = useMemo(() => resolveDeckTheme(deck.themeId, deck.brand), [deck.themeId, deck.brand])
  const [selectedId, setSelectedId] = useState(deck.slides[0]?.id)
  const [panel, setPanel] = useState<'edit' | 'ai'>('edit')
  const [slideAsk, setSlideAsk] = useState('')
  const [deckAsk, setDeckAsk] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [title, setTitle] = useDraftField(deck.title, (v) => void db.decks.update(deck.id, { title: v.trim() || deck.title, updatedAt: Date.now() }))
  const agent = agents.find((a) => a.id === deck.agentId) ?? agents.find((a) => a.roleId === 'creative')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const selectedIndex = Math.max(
    0,
    deck.slides.findIndex((s) => s.id === selectedId),
  )
  const stored = deck.slides[selectedIndex]

  // The selected slide is edited locally and saved shortly after typing stops.
  const [draft, setDraft] = useState<Slide | undefined>(stored)
  const pending = useRef(false)
  const version = useRef(0)
  const draftRef = useRef(draft)
  useEffect(() => {
    draftRef.current = draft
  })
  const persist = async (slide: Slide, v: number) => {
    const latest = await db.decks.get(deck.id)
    if (latest)
      await saveSlides(
        deck.id,
        latest.slides.map((s) => (s.id === slide.id ? slide : s)),
      )
    // Only settle if nothing was typed while saving.
    if (version.current === v) pending.current = false
  }
  useEffect(() => {
    if (!pending.current || draft?.id !== stored?.id) setDraft(stored)
  }, [stored, draft?.id])
  useEffect(() => {
    if (!pending.current || !draft) return
    const v = version.current
    const t = setTimeout(() => void persist(draft, v), 400)
    return () => clearTimeout(t)
  }, [draft])
  // Switching slides saves any edits straight away.
  useEffect(
    () => () => {
      if (pending.current && draftRef.current) void persist(draftRef.current, version.current)
    },
    [stored?.id],
  )
  const editSlide = (s: Slide) => {
    pending.current = true
    version.current++
    setDraft(s)
  }
  const current = draft && draft.id === stored?.id ? draft : stored
  const slidesForView = deck.slides.map((s) => (current && s.id === current.id ? current : s))

  useEffect(() => {
    if (!deck.slides.some((s) => s.id === selectedId) && deck.slides[0]) setSelectedId(deck.slides[0].id)
  }, [deck.slides, selectedId])

  const addSlide = async (layout: Slide['layout']) => {
    const base: Slide = { id: uid(), layout: 'bullets', title: 'New slide', bullets: ['A key point'] }
    const slide = withLayout(base, layout)
    const slides = [...deck.slides]
    slides.splice(selectedIndex + 1, 0, slide)
    await saveSlides(deck.id, slides)
    setSelectedId(slide.id)
  }

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = deck.slides.findIndex((s) => s.id === active.id)
    const to = deck.slides.findIndex((s) => s.id === over.id)
    void saveSlides(deck.id, arrayMove(deck.slides, from, to))
  }

  const run = async (key: string, fn: () => Promise<void>, done?: string) => {
    setBusy(key)
    try {
      await fn()
      if (done) toast.success(done)
    } catch (err) {
      toast.error('That didn’t work', errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const exportPdf = () => window.open(`${location.pathname}${location.search}#/present/${deck.id}?print=1`, '_blank', 'noopener')

  const outline = () =>
    deck.slides
      .map((s, i) => [`${i + 1}. ${s.title}`, s.subtitle, ...(s.bullets ?? []).map((b) => `   • ${b}`), s.notes ? `   Notes: ${s.notes}` : ''].filter(Boolean).join('\n'))
      .join('\n\n')

  const missingImages = deck.slides.filter((s) => s.imagePrompt && !s.image).length

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Top bar */}
      <header className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-2.5 sm:px-5">
        <button onClick={() => navigate('/decks')} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/[0.07] hover:text-fg" aria-label="All decks">
          <ArrowLeft className="size-4" />
        </button>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Deck title"
          className="min-w-0 flex-1 rounded-lg bg-transparent px-2 py-1 font-display text-[17px] font-semibold tracking-tight outline-none focus:bg-white/[0.05]"
        />
        {deck.status === 'generating' && (
          <span className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1 text-[12px] text-soft">
            <Sparkles className="size-3.5 animate-pulse text-[var(--accent)]" /> {deck.stage ?? 'Working…'}
          </span>
        )}
        <Menu
          trigger={(open) => (
            <Button size="sm" variant="ghost" icon={<Palette />} onClick={open}>
              <span className="hidden sm:inline">{theme.name}</span>
            </Button>
          )}
          items={[
            ...DECK_THEMES.map((t) => ({
              label: (
                <span className="flex items-center gap-2.5">
                  <span className="flex gap-0.5">
                    <span className="size-3 rounded-full" style={{ background: t.accent }} />
                    <span className="size-3 rounded-full" style={{ background: t.accent2 }} />
                  </span>
                  {t.name}
                  {deck.themeId === t.id && <Check className="ml-auto size-3.5" />}
                </span>
              ),
              onSelect: () => void db.decks.update(deck.id, { themeId: t.id, updatedAt: Date.now() }),
            })),
            ...(deck.brand ? [{ label: 'Your brand', onSelect: () => void db.decks.update(deck.id, { themeId: 'brand', updatedAt: Date.now() }) }] : []),
          ]}
        />
        <Menu
          trigger={(open) => (
            <Button size="sm" variant="secondary" icon={<Download />} onClick={open} loading={busy === 'pptx'}>
              <span className="hidden sm:inline">Export</span>
            </Button>
          )}
          items={[
            { label: 'PowerPoint (.pptx)', icon: <Download />, onSelect: () => void run('pptx', () => exportDeckToPptx(deck), 'PowerPoint downloaded') },
            { label: 'PDF (print or save)', icon: <FileText />, onSelect: exportPdf },
            {
              label: 'Copy outline and notes',
              icon: <Copy />,
              onSelect: async () => {
                await copyText(outline())
                toast.success('Outline copied')
              },
            },
          ]}
        />
        <Button size="sm" variant="primary" icon={<Play />} onClick={() => navigate(`/present/${deck.id}?from=${selectedIndex}`)} disabled={!deck.slides.length}>
          Present
        </Button>
        <Menu
          trigger={(open) => (
            <button onClick={open} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/[0.07] hover:text-fg" aria-label="More">
              <MoreHorizontal className="size-4" />
            </button>
          )}
          items={[
            {
              label: 'Make it again from the brief',
              icon: <RotateCcw />,
              onSelect: () => {
                if (!window.confirm('Rebuild the whole deck from the original brief? Your edits will be replaced.')) return
                void db.decks
                  .update(deck.id, { slides: [], status: 'generating', stage: 'Starting again' })
                  .then(() => generateDeck(deck.id).catch((err) => toast.error('Couldn’t rebuild the deck', errorMessage(err))))
              },
            },
            'divider',
            {
              label: 'Delete deck',
              icon: <Trash2 />,
              danger: true,
              onSelect: async () => {
                if (!window.confirm(`Delete “${deck.title}”?`)) return
                await db.decks.delete(deck.id)
                navigate('/decks')
              },
            },
          ]}
        />
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Thumbnails */}
        <aside className="hidden w-[210px] shrink-0 flex-col border-r border-white/[0.06] md:flex">
          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={deck.slides.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                {slidesForView.map((s, i) => (
                  <Thumb
                    key={s.id}
                    deck={deck}
                    slide={s}
                    index={i}
                    active={s.id === current?.id}
                    onSelect={() => setSelectedId(s.id)}
                    onDuplicate={() => {
                      const copy = { ...s, id: uid() }
                      const slides = [...deck.slides]
                      slides.splice(i + 1, 0, copy)
                      void saveSlides(deck.id, slides)
                    }}
                    onDelete={() =>
                      void saveSlides(
                        deck.id,
                        deck.slides.filter((x) => x.id !== s.id),
                      )
                    }
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
          <div className="border-t border-white/[0.06] p-3">
            <Menu
              align="left"
              trigger={(open) => (
                <Button size="sm" variant="secondary" icon={<Plus />} onClick={open} className="w-full">
                  Add slide
                </Button>
              )}
              items={SLIDE_LAYOUTS.map((l) => ({ label: `${l.name}`, onSelect: () => void addSlide(l.id) }))}
            />
          </div>
        </aside>

        {/* Stage */}
        <main className="flex min-w-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto p-4 sm:p-8">
          {current && (
            <>
              <div className="w-full max-w-[1100px] overflow-hidden rounded-2xl shadow-[0_40px_120px_-40px_rgb(0_0_0/0.9)] ring-1 ring-white/[0.08]">
                <SlideFrame>
                  <SlideView slide={current} theme={theme} index={selectedIndex} total={deck.slides.length} deckTitle={deck.title} logo={deck.brand?.logo} />
                </SlideFrame>
              </div>
              <div className="flex w-full max-w-[1100px] items-center justify-between text-[12.5px] text-muted">
                <span>
                  Slide {selectedIndex + 1} of {deck.slides.length}
                </span>
                <span className="flex gap-1 md:hidden">
                  <Button size="xs" variant="ghost" disabled={selectedIndex === 0} onClick={() => setSelectedId(deck.slides[selectedIndex - 1]?.id)}>
                    Previous
                  </Button>
                  <Button size="xs" variant="ghost" disabled={selectedIndex >= deck.slides.length - 1} onClick={() => setSelectedId(deck.slides[selectedIndex + 1]?.id)}>
                    Next
                  </Button>
                </span>
              </div>
            </>
          )}
        </main>

        {/* Panel */}
        <aside className="hidden w-[360px] shrink-0 flex-col border-l border-white/[0.06] lg:flex">
          <div className="border-b border-white/[0.06] p-3">
            <Tabs
              value={panel}
              onChange={setPanel}
              className="w-full"
              items={[
                { id: 'edit', label: 'Edit slide' },
                { id: 'ai', label: `Ask ${agent?.name ?? 'AI'}`, icon: <Sparkles /> },
              ]}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {panel === 'edit' && current ? (
              <SlideFields key={current.id} slide={current} projectId={deck.projectId} onChange={editSlide} />
            ) : (
              <div className="space-y-7">
                <section className="space-y-2.5">
                  <h3 className="text-[11px] font-semibold tracking-[0.12em] text-faint uppercase">Change this slide</h3>
                  <Textarea
                    rows={3}
                    value={slideAsk}
                    onChange={(e) => setSlideAsk(e.target.value)}
                    placeholder="e.g. Make the points sharper and add a number"
                    className="text-[13px]"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {SLIDE_IDEAS.map((i) => (
                      <button
                        key={i}
                        onClick={() => setSlideAsk(i)}
                        className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[11.5px] text-muted hover:border-white/[0.16] hover:text-fg"
                      >
                        {i}
                      </button>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<Wand2 />}
                    className="w-full"
                    loading={busy === 'slide'}
                    disabled={!slideAsk.trim() || !current}
                    onClick={() =>
                      void run(
                        'slide',
                        async () => {
                          await reviseSlide(deck.id, current!.id, slideAsk.trim())
                          setSlideAsk('')
                        },
                        'Slide updated',
                      )
                    }
                  >
                    Update this slide
                  </Button>
                </section>
                <section className="space-y-2.5">
                  <h3 className="text-[11px] font-semibold tracking-[0.12em] text-faint uppercase">Change the whole deck</h3>
                  <Textarea
                    rows={3}
                    value={deckAsk}
                    onChange={(e) => setDeckAsk(e.target.value)}
                    placeholder="e.g. Add a slide about measurement and make the ending stronger"
                    className="text-[13px]"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {DECK_IDEAS.map((i) => (
                      <button
                        key={i}
                        onClick={() => setDeckAsk(i)}
                        className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[11.5px] text-muted hover:border-white/[0.16] hover:text-fg"
                      >
                        {i}
                      </button>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Wand2 />}
                    className="w-full"
                    loading={busy === 'deck'}
                    disabled={!deckAsk.trim() || deck.status === 'generating'}
                    onClick={() =>
                      void run(
                        'deck',
                        async () => {
                          await reviseDeck(deck.id, deckAsk.trim())
                          setDeckAsk('')
                        },
                        'Deck updated',
                      )
                    }
                  >
                    Update the deck
                  </Button>
                </section>
                {missingImages > 0 && (
                  <section className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
                    <p className="text-[13px] text-soft">
                      {missingImages} slide{missingImages === 1 ? '' : 's'} could use an image.
                    </p>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<ImagePlus />}
                      className="mt-3"
                      loading={busy === 'images'}
                      onClick={() => void run('images', () => illustrateDeck(deck.id, 6), 'Images added')}
                    >
                      Create images
                    </Button>
                  </section>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

export default function DeckEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const deck = useLiveQuery(() => (id ? db.decks.get(id) : undefined), [id])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    void db.decks.get(id).then((d) => {
      if (!cancelled && !d) navigate('/decks', { replace: true })
    })
    return () => {
      cancelled = true
    }
  }, [id, navigate])

  if (!deck) return null
  if (!deck.slides.length) {
    if (deck.status === 'error')
      return (
        <div className="grid h-full place-items-center p-6">
          <div className="max-w-md text-center">
            <TriangleAlert className="mx-auto size-8 text-bad" />
            <h2 className="mt-4 font-display text-2xl font-semibold">The deck didn’t finish</h2>
            <p className="mt-2 text-sm text-muted">{deck.error}</p>
            <div className="mt-6 flex justify-center gap-2">
              <Button variant="ghost" onClick={() => navigate('/decks')}>
                Back
              </Button>
              <Button
                variant="primary"
                icon={<RotateCcw />}
                onClick={() =>
                  void db.decks.update(deck.id, { status: 'generating', error: undefined, stage: 'Starting again' }).then(() => generateDeck(deck.id).catch(() => undefined))
                }
              >
                Try again
              </Button>
            </div>
          </div>
        </div>
      )
    return <Building deck={deck} />
  }
  return <Editor key={deck.id} deck={deck} />
}
