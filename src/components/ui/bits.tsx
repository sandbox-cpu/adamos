import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '../../lib/utils'

/* ------------------------------------------------------------------ */
/*  Tabs (segmented control)                                           */
/* ------------------------------------------------------------------ */

export function Tabs<T extends string>({ value, onChange, items, className, size = 'md' }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode; icon?: ReactNode; count?: number }[]; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div className={cn('inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-white/[0.07] bg-white/[0.03] p-1 no-scrollbar', className)}>
      {items.map((it) => {
        const active = it.id === value
        return (
          <button
            key={it.id}
            onClick={() => onChange(it.id)}
            className={cn(
              'relative flex shrink-0 items-center gap-2 rounded-xl font-medium transition-colors [&_svg]:size-4',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3.5 text-[13px]',
              active ? 'text-fg' : 'text-muted hover:text-soft',
            )}
          >
            {active && <motion.span layoutId={`tab-${items.map((i) => i.id).join('')}`} className="absolute inset-0 rounded-xl bg-white/[0.09] shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <span className="relative flex items-center gap-2">
              {it.icon}
              {it.label}
              {it.count !== undefined && <span className="rounded-full bg-white/[0.08] px-1.5 text-[10px] text-soft">{it.count}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Badge                                                              */
/* ------------------------------------------------------------------ */

type Tone = 'neutral' | 'accent' | 'good' | 'warn' | 'bad' | 'info'

const tones: Record<Tone, string> = {
  neutral: 'bg-white/[0.06] text-soft border-white/[0.08]',
  accent: 'bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] text-[color-mix(in_oklab,var(--accent)_55%,white)] border-[color-mix(in_oklab,var(--accent)_30%,transparent)]',
  good: 'bg-good/10 text-good border-good/25',
  warn: 'bg-warn/10 text-warn border-warn/25',
  bad: 'bg-bad/10 text-bad border-bad/25',
  info: 'bg-info/10 text-info border-info/25',
}

export function Badge({ children, tone = 'neutral', className, dot }: { children: ReactNode; tone?: Tone; className?: string; dot?: boolean }) {
  return (
    <span className={cn('inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[11px] font-medium [&_svg]:size-3', tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Empty state                                                        */
/* ------------------------------------------------------------------ */

export function Empty({ icon, title, body, action, className }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/[0.09] px-6 py-14 text-center', className)}>
      {icon && <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-white/[0.05] text-soft [&_svg]:size-6">{icon}</div>}
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {body && <p className="mt-1.5 max-w-md text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Progress                                                           */
/* ------------------------------------------------------------------ */

export function ProgressRing({ value, size = 44, stroke = 4, color, label }: { value: number; size?: number; stroke?: number; color?: string; label?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color ?? 'var(--accent)'} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)' }} />
      </svg>
      <span className="absolute text-[11px] font-semibold text-fg">{label ?? `${Math.round(v * 100)}%`}</span>
    </div>
  )
}

export function ProgressBar({ value, color, className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]', className)}>
      <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color ?? 'linear-gradient(90deg,var(--accent),var(--accent-2))' }} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Keyboard hint                                                      */
/* ------------------------------------------------------------------ */

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-white/10 bg-white/[0.06] px-1.5 font-sans text-[10px] font-medium text-muted">{children}</kbd>
}

/* ------------------------------------------------------------------ */
/*  Dropdown menu                                                      */
/* ------------------------------------------------------------------ */

export interface MenuItem {
  label: ReactNode
  icon?: ReactNode
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
}

export function Menu({ trigger, items, align = 'right' }: { trigger: (open: () => void) => ReactNode; items: (MenuItem | 'divider')[]; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const anchor = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('pointerdown', close)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])
  const show = () => {
    const rect = anchor.current?.getBoundingClientRect()
    if (rect) setPos({ top: rect.bottom + 6, left: align === 'right' ? rect.right : rect.left })
    setOpen(true)
  }
  return (
    <span ref={anchor} className="inline-flex">
      {trigger(show)}
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              className="glass-strong fixed z-[90] min-w-48 rounded-2xl p-1.5"
              style={{ top: pos.top, left: pos.left, translateX: align === 'right' ? '-100%' : 0 }}
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.14 }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {items.map((it, i) =>
                it === 'divider' ? (
                  <div key={i} className="my-1 h-px bg-white/[0.07]" />
                ) : (
                  <button
                    key={i}
                    disabled={it.disabled}
                    onClick={() => {
                      setOpen(false)
                      it.onSelect()
                    }}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] transition disabled:opacity-40 [&_svg]:size-4',
                      it.danger ? 'text-bad hover:bg-bad/10' : 'text-soft hover:bg-white/[0.07] hover:text-fg',
                    )}
                  >
                    {it.icon}
                    {it.label}
                  </button>
                ),
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Skeleton                                                           */
/* ------------------------------------------------------------------ */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-xl', className)} />
}

/* ------------------------------------------------------------------ */
/*  Section label                                                      */
/* ------------------------------------------------------------------ */

export function SectionLabel({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-3', className)}>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{children}</h2>
      {action}
    </div>
  )
}
