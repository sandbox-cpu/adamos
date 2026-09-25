import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft, ChevronRight, Maximize, Minimize, NotebookText, Printer, X } from 'lucide-react'
import { db } from '../../lib/db'
import { resolveDeckTheme } from '../../lib/decks/themes'
import type { Deck } from '../../lib/types'
import { cn } from '../../lib/utils'
import { SLIDE_H, SLIDE_W, SlideView } from './SlideView'

function useFitScale(padding = 0) {
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const update = () => setScale(Math.min((window.innerWidth - padding) / SLIDE_W, (window.innerHeight - padding) / SLIDE_H))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [padding])
  return scale
}

/** Every slide on its own page, for saving as PDF from the print dialog. */
function PrintView({ deck }: { deck: Deck }) {
  const theme = resolveDeckTheme(deck.themeId, deck.brand)
  useEffect(() => {
    const prev = document.title
    document.title = deck.title
    let cancelled = false
    void (async () => {
      await document.fonts.ready
      await new Promise((r) => setTimeout(r, 1200))
      if (!cancelled) window.print()
    })()
    return () => {
      cancelled = true
      document.title = prev
    }
  }, [deck.title])
  return (
    <div className="print-deck bg-[#111]">
      <style>{`@page { size: ${SLIDE_W}px ${SLIDE_H}px; margin: 0 } @media print { html, body { background: none !important } .print-hint { display: none !important } .print-deck { background: none !important } .print-slide { break-after: page; margin: 0 !important; box-shadow: none !important } }`}</style>
      <div className="print-hint sticky top-0 z-10 flex items-center justify-center gap-3 bg-black/80 px-4 py-3 text-[13px] text-soft backdrop-blur">
        <Printer className="size-4" /> In the print window, choose <b className="text-fg">Save as PDF</b> as the destination. Turn on <b className="text-fg">Background graphics</b>{' '}
        for the full design.
        <button onClick={() => window.print()} className="rounded-lg bg-white/10 px-3 py-1 text-fg hover:bg-white/20">
          Print again
        </button>
      </div>
      {deck.slides.map((s, i) => (
        <div key={s.id} className="print-slide mx-auto my-6 shadow-2xl" style={{ width: SLIDE_W, height: SLIDE_H, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
          <SlideView slide={s} theme={theme} index={i} total={deck.slides.length} deckTitle={deck.title} logo={deck.brand?.logo} />
        </div>
      ))}
    </div>
  )
}

function Presenter({ deck, start }: { deck: Deck; start: number }) {
  const navigate = useNavigate()
  const theme = useMemo(() => resolveDeckTheme(deck.themeId, deck.brand), [deck.themeId, deck.brand])
  const [index, setIndex] = useState(Math.min(Math.max(0, start), deck.slides.length - 1))
  const [direction, setDirection] = useState(1)
  const [notes, setNotes] = useState(false)
  const [chrome, setChrome] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const scale = useFitScale()
  const total = deck.slides.length

  const go = useCallback(
    (to: number) => {
      const next = Math.min(Math.max(0, to), total - 1)
      setIndex((cur) => {
        setDirection(next >= cur ? 1 : -1)
        return next
      })
    },
    [total],
  )
  const exit = useCallback(() => navigate(`/decks/${deck.id}`), [navigate, deck.id])

  const poke = useCallback(() => {
    setChrome(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setChrome(false), 2600)
  }, [])

  useEffect(() => {
    poke()
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) {
        e.preventDefault()
        go(index + 1)
      } else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) {
        e.preventDefault()
        go(index - 1)
      } else if (e.key === 'Home') go(0)
      else if (e.key === 'End') go(total - 1)
      else if (e.key.toLowerCase() === 'n') setNotes((v) => !v)
      else if (e.key.toLowerCase() === 'f') void toggleFullscreen()
      else if (e.key === 'Escape' && !document.fullscreenElement) exit()
    }
    const onFs = () => setFullscreen(!!document.fullscreenElement)
    window.addEventListener('keydown', onKey)
    document.addEventListener('fullscreenchange', onFs)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('fullscreenchange', onFs)
    }
  }, [go, index, total, exit, poke])

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {
      // Some browsers refuse full screen; presenting still works.
    }
  }

  const slide = deck.slides[index]
  return (
    <div className={cn('fixed inset-0 overflow-hidden bg-black select-none', !chrome && 'cursor-none')} onMouseMove={poke}>
      <div
        className="absolute inset-0"
        onClick={(e) => {
          const x = e.clientX / window.innerWidth
          go(x < 0.33 ? index - 1 : index + 1)
        }}
      />
      <AnimatePresence initial={false} custom={direction} mode="popLayout">
        <motion.div
          key={slide.id}
          custom={direction}
          initial={{ opacity: 0, x: direction * 60 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction * -60 }}
          transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
          className="pointer-events-none absolute top-1/2 left-1/2"
          style={{ width: SLIDE_W * scale, height: SLIDE_H * scale, marginLeft: (-SLIDE_W * scale) / 2, marginTop: (-SLIDE_H * scale) / 2 }}
        >
          <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0', width: SLIDE_W, height: SLIDE_H }}>
            <SlideView slide={slide} theme={theme} index={index} total={total} deckTitle={deck.title} logo={deck.brand?.logo} />
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-white/10">
        <div className="h-full bg-[linear-gradient(90deg,var(--accent),var(--accent-2))] transition-all duration-500" style={{ width: `${((index + 1) / total) * 100}%` }} />
      </div>

      <AnimatePresence>
        {notes && slide.notes && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute inset-x-4 bottom-20 mx-auto max-w-3xl rounded-2xl bg-black/85 p-5 text-[16px] leading-relaxed text-white/90 backdrop-blur"
          >
            {slide.notes}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {chrome && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-black/70 p-1.5 text-white backdrop-blur"
          >
            <button
              onClick={() => go(index - 1)}
              disabled={index === 0}
              className="grid size-9 place-items-center rounded-full hover:bg-white/10 disabled:opacity-30"
              aria-label="Previous slide"
            >
              <ChevronLeft className="size-5" />
            </button>
            <span className="min-w-[64px] text-center text-[13px] tabular-nums">
              {index + 1} / {total}
            </span>
            <button
              onClick={() => go(index + 1)}
              disabled={index === total - 1}
              className="grid size-9 place-items-center rounded-full hover:bg-white/10 disabled:opacity-30"
              aria-label="Next slide"
            >
              <ChevronRight className="size-5" />
            </button>
            <span className="mx-1 h-5 w-px bg-white/15" />
            <button
              onClick={() => setNotes((v) => !v)}
              className={cn('grid size-9 place-items-center rounded-full hover:bg-white/10', notes && 'bg-white/15')}
              aria-label="Speaker notes (N)"
              title="Speaker notes (N)"
            >
              <NotebookText className="size-4" />
            </button>
            <button
              onClick={() => void toggleFullscreen()}
              className="grid size-9 place-items-center rounded-full hover:bg-white/10"
              aria-label="Full screen (F)"
              title="Full screen (F)"
            >
              {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
            </button>
            <button onClick={exit} className="grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="Stop presenting (Esc)" title="Stop presenting (Esc)">
              <X className="size-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function PresentPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const deck = useLiveQuery(() => (id ? db.decks.get(id) : undefined), [id])
  if (!deck || !deck.slides.length) return <div className="fixed inset-0 bg-black" />
  if (params.has('print')) return <PrintView deck={deck} />
  return <Presenter deck={deck} start={Number(params.get('from') ?? 0)} />
}
