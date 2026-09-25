import { motion } from 'motion/react'
import { BrainCircuit, Check, ClipboardList, Lightbulb, MessagesSquare, Swords } from 'lucide-react'
import type { Agent, MastermindSession } from '../../lib/types'
import { cn, hexToRgba } from '../../lib/utils'
import { AgentAvatar } from '../../components/agents/AgentAvatar'

export const PHASES = [
  { id: 'opening', label: 'Opening ideas', icon: Lightbulb },
  { id: 'challenge', label: 'Debate', icon: Swords },
  { id: 'synthesis', label: 'Strategy', icon: MessagesSquare },
  { id: 'plan', label: 'Action plan', icon: ClipboardList },
] as const

export function phaseIndex(phase: MastermindSession['phase']): number {
  if (phase === 'setup') return -1
  if (phase === 'done') return PHASES.length
  if (phase === 'error') return -1
  return PHASES.findIndex((p) => p.id === phase)
}

const CENTER_LABEL: Record<MastermindSession['phase'], string> = {
  setup: 'Taking seats',
  opening: 'Sharing opening ideas',
  challenge: 'Debating',
  synthesis: 'Pulling it together',
  plan: 'Drafting the plan',
  done: 'Plan ready',
  error: 'Paused',
}

/** Participants around a glowing table; whoever is talking lights up and links to the centre. */
export function RoundTable({ session, lead, agents, speaking, size = 340 }: { session: MastermindSession; lead?: Agent; agents: Agent[]; speaking: Set<string>; size?: number }) {
  const seats = lead ? [lead, ...agents] : agents
  const radius = size * 0.39
  const c = size / 2
  const running = !['done', 'error', 'setup'].includes(session.phase)
  const leadTalking = lead && (session.phase === 'synthesis' || session.phase === 'plan')
  const isSpeaking = (a: Agent) => speaking.has(a.id) || (a.id === lead?.id && !!leadTalking)
  const pos = (i: number) => {
    const angle = (i / seats.length) * Math.PI * 2 - Math.PI / 2
    return { x: c + Math.cos(angle) * radius, y: c + Math.sin(angle) * radius }
  }
  const CenterIcon = session.phase === 'done' ? Check : BrainCircuit

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      {/* table */}
      <div
        className="absolute rounded-full border border-white/[0.08]"
        style={{ inset: size * 0.2, background: 'radial-gradient(circle at 50% 40%, rgb(255 255 255 / 0.06), rgb(255 255 255 / 0.01) 70%)' }}
      />
      <div className={cn('absolute rounded-full border border-dashed border-white/[0.08]', running && 'animate-[spin_40s_linear_infinite]')} style={{ inset: size * 0.12 }} />
      {/* links from speakers to the centre */}
      <svg className="pointer-events-none absolute inset-0" width={size} height={size} aria-hidden>
        <defs>
          <radialGradient id="mm-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.6" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>
        {running && <circle cx={c} cy={c} r={size * 0.2} fill="url(#mm-core)" />}
        {seats.map((a, i) => {
          if (!isSpeaking(a)) return null
          const p = pos(i)
          return (
            <motion.line
              key={a.id}
              x1={p.x}
              y1={p.y}
              x2={c}
              y2={c}
              stroke={a.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray="4 7"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.35, 0.9, 0.35], strokeDashoffset: [0, -22] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
            />
          )
        })}
      </svg>
      {/* centre */}
      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center text-center">
          <motion.div
            className="grid size-14 place-items-center rounded-2xl border border-white/10 bg-ink-900/80 text-fg shadow-[0_0_40px_-8px_var(--accent)]"
            animate={running ? { scale: [1, 1.06, 1] } : { scale: 1 }}
            transition={{ duration: 2.4, repeat: running ? Infinity : 0 }}
          >
            <CenterIcon className={cn('size-6', session.phase === 'done' && 'text-good')} />
          </motion.div>
          <div className="mt-2 max-w-[140px] text-[12px] font-medium text-soft">{CENTER_LABEL[session.phase]}</div>
        </div>
      </div>
      {/* seats */}
      {seats.map((a, i) => {
        const p = pos(i)
        const on = isSpeaking(a)
        return (
          <div key={a.id} className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: p.x, top: p.y }}>
            <div className="relative">
              {on && (
                <motion.div
                  className="absolute -inset-3 rounded-full blur-lg"
                  style={{ background: hexToRgba(a.color, 0.6) }}
                  animate={{ opacity: [0.3, 0.85, 0.3] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              )}
              <AgentAvatar agent={a} size="md" speaking={on} />
            </div>
            <span className={cn('mt-1 rounded-full px-1.5 text-[11px] font-medium', on ? 'text-fg' : 'text-muted')}>{a.name}</span>
          </div>
        )
      })}
    </div>
  )
}

export function PhaseStepper({ session }: { session: MastermindSession }) {
  const current = phaseIndex(session.phase)
  const quick = session.depth === 'quick'
  return (
    <div className="flex items-center justify-between gap-1">
      {PHASES.map((p, i) => {
        const skipped = quick && p.id === 'challenge'
        const done = current > i
        const active = current === i
        const Icon = p.icon
        return (
          <div key={p.id} className="flex flex-1 items-center gap-1 last:flex-none">
            <div className={cn('flex flex-col items-center gap-1.5', skipped && 'opacity-35')}>
              <span
                className={cn(
                  'grid size-9 place-items-center rounded-full border transition',
                  done && 'border-transparent bg-[var(--accent)] text-white',
                  active && 'border-[color-mix(in_oklab,var(--accent)_60%,transparent)] bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] text-fg',
                  !done && !active && 'border-white/[0.1] text-faint',
                )}
              >
                {done ? <Check className="size-4" strokeWidth={3} /> : <Icon className={cn('size-4', active && 'animate-pulse')} />}
              </span>
              <span className={cn('text-center text-[11px] whitespace-nowrap', active ? 'text-fg' : 'text-muted')}>{skipped ? 'Skipped' : p.label}</span>
            </div>
            {i < PHASES.length - 1 && <span className={cn('mb-5 h-px flex-1', done ? 'bg-[var(--accent)]' : 'bg-white/[0.08]')} />}
          </div>
        )
      })}
    </div>
  )
}
