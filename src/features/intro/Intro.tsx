import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import Lenis from 'lenis'
import { addDays, format, startOfDay } from 'date-fns'
import { ArrowRight, Brain, CalendarDays, CircleCheck, Sparkles } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db'
import { useActiveAgents, useRoles } from '../../hooks/data'
import { osNameOf, useSettings } from '../../stores/settings'
import { useUI } from '../../stores/ui'
import { AgentAvatar } from '../../components/agents/AgentAvatar'
import { isoDate, timeOfDay } from '../../lib/utils'
import { HeroCanvas, type HeroSignals } from './HeroScene'

class CanvasBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789·•*+'

function useScramble(text: string, delay = 0, duration = 1100) {
  const [out, setOut] = useState('')
  useEffect(() => {
    let raf = 0
    const start = performance.now() + delay
    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / duration))
      const settled = Math.floor(t * text.length)
      let s = ''
      for (let i = 0; i < text.length; i++) {
        if (i < settled || text[i] === ' ') s += text[i]
        else if (now >= start) s += GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
      }
      setOut(s)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [text, delay, duration])
  return out
}

function useTyped(text: string, delay: number, speed = 38) {
  const [n, setN] = useState(0)
  useEffect(() => {
    let i = 0
    let timer: ReturnType<typeof setTimeout>
    const start = setTimeout(function step() {
      i++
      setN(i)
      if (i < text.length) timer = setTimeout(step, speed + Math.random() * 30)
    }, delay)
    return () => {
      clearTimeout(start)
      clearTimeout(timer)
    }
  }, [text, delay, speed])
  return text.slice(0, n)
}

function Letters({ text, delay = 0, gradient = false }: { text: string; delay?: number; gradient?: boolean }) {
  const chars = Array.from(text)
  return (
    <span aria-label={text}>
      {chars.map((ch, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.12em] align-bottom" aria-hidden>
          <motion.span
            className="hero-letter"
            style={{ whiteSpace: 'pre' }}
            initial={{ y: '105%', rotateX: -85, opacity: 0, filter: 'blur(14px)' }}
            animate={{ y: '0%', rotateX: 0, opacity: 1, filter: 'blur(0px)' }}
            transition={{ delay: delay + i * 0.055, type: 'spring', stiffness: 170, damping: 17, mass: 0.9 }}
          >
            <span
              className={`hero-wave inline-block ${gradient ? 'text-gradient' : ''}`}
              style={{
                animationDelay: `${1.6 + i * 0.12}s`,
                ...(gradient ? { backgroundSize: `${chars.length * 100}% 100%`, backgroundPosition: `${(i / Math.max(1, chars.length - 1)) * 100}% 50%` } : {}),
              }}
            >
              {ch}
            </span>
          </motion.span>
        </span>
      ))}
    </span>
  )
}

function Section({ children, scroller }: { children: ReactNode; scroller: React.RefObject<HTMLDivElement | null> }) {
  return (
    <section className="relative flex h-dvh items-center justify-center px-6">
      <motion.div
        className="w-full max-w-4xl text-center"
        initial={{ opacity: 0, y: 60, filter: 'blur(10px)' }}
        whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        viewport={{ root: scroller, amount: 0.55 }}
        transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
      >
        {children}
      </motion.div>
    </section>
  )
}

export default function Intro() {
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const setShowIntro = useUI((s) => s.setShowIntro)
  const agents = useActiveAgents()
  const roles = useRoles()
  const reduced = useReducedMotion() || settings.reduceMotion
  const scroller = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const signals = useRef<HeroSignals>({ progress: 0, mouseX: 0, mouseY: 0, leaving: 0 })
  const leavingRef = useRef(false)
  const [progress, setProgress] = useState(0)

  const first = settings.userName.trim().split(/\s+/)[0] || 'there'
  const osName = osNameOf(settings)
  const greeting = useScramble(`GOOD ${timeOfDay().toUpperCase()} · ${format(new Date(), 'EEEE d MMMM').toUpperCase()}`, 250, 1300)
  const typed = useTyped('Your team is awake, briefed and standing by.', 1500)

  const stats = useLiveQuery(async () => {
    const today = startOfDay(new Date())
    const tomorrow = addDays(today, 1)
    const events = (await db.events.where('start').between(today.toISOString(), tomorrow.toISOString()).toArray()).sort((a, b) => a.start.localeCompare(b.start))
    const tasks = await db.tasks.toArray()
    const due = tasks.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate <= isoDate()).length
    const notes = await db.notes.toArray()
    const links = notes.reduce((n, x) => n + x.links.length, 0)
    const projects = (await db.projects.toArray()).filter((p) => p.status === 'active' || p.status === 'pitch').length
    const next = events.find((e) => new Date(e.end) > new Date())
    return { meetings: events.length, due, notes: notes.length, links, projects, next }
  }, [])

  const agentColors = useMemo(() => agents.map((a) => a.color), [agents])

  useEffect(() => {
    if (reduced || !scroller.current || !content.current) return
    const l = new Lenis({ wrapper: scroller.current, content: content.current, lerp: 0.075, smoothWheel: true, autoRaf: true })
    l.on('scroll', (e: Lenis) => {
      signals.current.progress = e.progress
      setProgress(e.progress)
    })
    return () => l.destroy()
  }, [reduced])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      signals.current.mouseX = (e.clientX / window.innerWidth) * 2 - 1
      signals.current.mouseY = -((e.clientY / window.innerHeight) * 2 - 1)
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  const enter = () => {
    if (leavingRef.current) return
    leavingRef.current = true
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 900)
      signals.current.leaving = t * t
      if (t < 1) requestAnimationFrame(step)
      else {
        void update({ lastIntroDate: isoDate() })
        setShowIntro(false)
      }
    }
    requestAnimationFrame(step)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape') enter()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <motion.div
      className="fixed inset-0 z-[120] overflow-hidden bg-ink-950 text-fg"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04, filter: 'blur(10px)' }}
      transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="absolute inset-0">
        <CanvasBoundary
          fallback={<div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,color-mix(in_oklab,var(--accent)_45%,transparent),transparent_40%),radial-gradient(circle_at_60%_60%,color-mix(in_oklab,var(--accent-2)_30%,transparent),transparent_45%)]" />}
        >
          <HeroCanvas signals={signals} agentColors={agentColors} />
        </CanvasBoundary>
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgb(5_6_10/0.55)_100%)]" />

      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-5 sm:px-10">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="flex items-center gap-2.5 text-sm font-medium text-soft">
          <span className="size-2 rounded-full bg-[var(--accent)] shadow-[0_0_12px_var(--accent)]" />
          {osName}
        </motion.div>
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          onClick={enter}
          className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-soft backdrop-blur-md transition hover:bg-white/10 hover:text-fg"
        >
          Skip intro
        </motion.button>
      </div>

      <div ref={scroller} className="no-scrollbar absolute inset-0 z-10 overflow-x-hidden overflow-y-auto">
        <div ref={content}>
          <section className="relative flex h-dvh flex-col items-center justify-center px-6 text-center">
            <div className="mb-6 h-5 font-mono text-[11px] tracking-[0.32em] text-soft [text-shadow:0_1px_12px_rgb(0_0_0/0.9)] sm:text-xs">{greeting}</div>
            <h1 className="font-display text-[clamp(56px,13vw,188px)] leading-[0.92] font-bold tracking-[-0.045em] [perspective:600px]">
              <Letters text="Hello," delay={0.35} /> <Letters text={`${first}.`} delay={0.35 + 6 * 0.055 + 0.1} gradient />
            </h1>
            <p className="mt-7 h-8 font-serif text-[clamp(20px,2.6vw,30px)] text-soft italic [text-shadow:0_2px_18px_rgb(0_0_0/0.9)]">
              <span className="caret">{typed}</span>
            </p>
            <motion.div className="mt-9 flex flex-wrap justify-center gap-2.5" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.09, delayChildren: 2.9 } } }}>
              {[
                { icon: <CalendarDays className="size-4" />, text: stats ? `${stats.meetings} meetings today` : '…' },
                { icon: <CircleCheck className="size-4" />, text: stats ? `${stats.due} tasks due` : '…' },
                { icon: <Brain className="size-4" />, text: stats ? `${stats.notes.toLocaleString()} notes in your brain` : '…' },
                { icon: <Sparkles className="size-4" />, text: `${agents.length} agents online` },
              ].map((c, i) => (
                <motion.span
                  key={i}
                  variants={{ hidden: { opacity: 0, y: 14, scale: 0.95 }, show: { opacity: 1, y: 0, scale: 1 } }}
                  className="flex items-center gap-2 rounded-full border border-white/12 bg-ink-950/55 px-4 py-2 text-sm text-soft backdrop-blur-md"
                >
                  {c.icon}
                  {c.text}
                </motion.span>
              ))}
            </motion.div>
            {!reduced && (
              <motion.div
                className="absolute bottom-10 flex flex-col items-center gap-3 text-xs tracking-[0.2em] text-faint"
                initial={{ opacity: 0 }}
                animate={{ opacity: progress > 0.02 ? 0 : 1 }}
                transition={{ delay: progress > 0.02 ? 0 : 3.4 }}
              >
                <div className="grid h-10 w-6 justify-center rounded-full border border-white/25 pt-2">
                  <motion.span className="size-1.5 rounded-full bg-white/80" animate={{ y: [0, 12, 0], opacity: [1, 0.2, 1] }} transition={{ duration: 1.8, repeat: Infinity }} />
                </div>
                SCROLL TO BEGIN
              </motion.div>
            )}
          </section>

          {!reduced && (
            <>
              <Section scroller={scroller}>
                <div className="mb-4 text-xs font-semibold tracking-[0.3em] text-soft">YOUR SECOND BRAIN</div>
                <h2 className="font-display text-[clamp(40px,7vw,96px)] leading-[0.95] font-bold tracking-[-0.04em]">
                  Everything you know. <span className="text-gradient">Connected.</span>
                </h2>
                <p className="mx-auto mt-6 max-w-xl text-lg text-soft">
                  {stats ? `${stats.notes.toLocaleString()} notes and ${stats.links.toLocaleString()} connections` : 'Your notes'} from your Obsidian vault, ready for every agent to draw on.
                </p>
              </Section>

              <Section scroller={scroller}>
                <div className="mb-4 text-xs font-semibold tracking-[0.3em] text-soft">YOUR TEAM</div>
                <h2 className="font-display text-[clamp(40px,7vw,96px)] leading-[0.95] font-bold tracking-[-0.04em]">
                  Specialists on call. <span className="text-gradient">Always.</span>
                </h2>
                <div className="mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-4">
                  {agents.map((a, i) => (
                    <motion.div
                      key={a.id}
                      className="flex w-24 flex-col items-center gap-2"
                      initial={{ opacity: 0, y: 30, scale: 0.8 }}
                      whileInView={{ opacity: 1, y: 0, scale: 1 }}
                      viewport={{ root: scroller, amount: 0.3 }}
                      transition={{ delay: 0.15 + i * 0.07, type: 'spring', stiffness: 200, damping: 18 }}
                    >
                      <AgentAvatar agent={a} size="lg" active />
                      <div className="text-sm font-semibold [text-shadow:0_1px_10px_rgb(0_0_0/0.9)]">{a.name}</div>
                      <div className="text-[11px] leading-tight text-soft [text-shadow:0_1px_10px_rgb(0_0_0/0.95)]">{roles.find((r) => r.id === a.roleId)?.name}</div>
                    </motion.div>
                  ))}
                </div>
              </Section>

              <Section scroller={scroller}>
                <div className="mb-4 text-xs font-semibold tracking-[0.3em] text-soft">TODAY</div>
                <h2 className="font-display text-[clamp(40px,7vw,96px)] leading-[0.95] font-bold tracking-[-0.04em]">
                  Your day, <span className="text-gradient">handled.</span>
                </h2>
                <div className="mx-auto mt-10 grid max-w-2xl gap-3 text-left sm:grid-cols-3">
                  {[
                    { label: 'Meetings', value: stats?.meetings ?? 0 },
                    { label: 'Tasks due', value: stats?.due ?? 0 },
                    { label: 'Live projects', value: stats?.projects ?? 0 },
                  ].map((s) => (
                    <div key={s.label} className="rounded-3xl border border-white/10 bg-ink-950/70 px-5 py-4 backdrop-blur-xl">
                      <div className="text-4xl font-semibold">{s.value}</div>
                      <div className="mt-1 text-sm text-muted">{s.label}</div>
                    </div>
                  ))}
                </div>
                {stats?.next && (
                  <p className="mt-6 text-soft [text-shadow:0_1px_12px_rgb(0_0_0/0.95)]">
                    Next up: <span className="text-fg">{stats.next.title}</span> at {format(new Date(stats.next.start), 'HH:mm')}
                  </p>
                )}
              </Section>
            </>
          )}

          <section className="relative flex h-dvh flex-col items-center justify-center px-6 text-center">
            <motion.h2
              className="font-display text-[clamp(44px,8vw,120px)] leading-[0.95] font-bold tracking-[-0.045em]"
              initial={{ opacity: 0, scale: 0.92 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ root: scroller, amount: 0.5 }}
              transition={{ duration: 0.9 }}
            >
              Let’s make today <span className="text-gradient">count.</span>
            </motion.h2>
            <motion.button
              onClick={enter}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              className="group mt-10 flex items-center gap-3 rounded-full bg-white px-8 py-4 text-base font-semibold text-black shadow-[0_0_60px_-10px_var(--accent)]"
            >
              Enter {osName}
              <ArrowRight className="size-5 transition group-hover:translate-x-1" />
            </motion.button>
            <p className="mt-4 text-xs text-faint">or press Enter</p>
          </section>
        </div>
      </div>

      {!reduced && (
        <div className="pointer-events-none absolute top-1/2 right-6 z-20 hidden -translate-y-1/2 flex-col gap-2 sm:flex">
          {[0, 0.25, 0.5, 0.75, 1].map((stop, i) => (
            <span
              key={i}
              className="block w-1 rounded-full bg-white transition-all duration-500"
              style={{ height: Math.abs(progress - stop) < 0.13 ? 24 : 8, opacity: Math.abs(progress - stop) < 0.13 ? 0.9 : 0.25 }}
            />
          ))}
        </div>
      )}

      {progress < 0.9 && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 3.6 }}
          onClick={enter}
          className="absolute right-6 bottom-8 z-20 flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-5 py-2.5 text-sm font-medium text-fg backdrop-blur-md transition hover:bg-white/[0.12] sm:right-10"
        >
          Enter <ArrowRight className="size-4" />
        </motion.button>
      )}
    </motion.div>
  )
}
