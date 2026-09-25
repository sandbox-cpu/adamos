import { forwardRef, useEffect, useRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'

const control =
  'w-full rounded-xl border border-white/[0.09] bg-white/[0.035] px-3.5 text-sm text-fg placeholder:text-faint outline-none transition focus:border-[color-mix(in_oklab,var(--accent)_70%,white)] focus:bg-white/[0.05] focus:ring-4 focus:ring-[color-mix(in_oklab,var(--accent)_18%,transparent)] disabled:opacity-50'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }>(function Input({ className, icon, ...rest }, ref) {
  if (icon) {
    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint [&_svg]:size-4">{icon}</span>
        <input ref={ref} className={cn(control, 'h-10 pl-9', className)} {...rest} />
      </div>
    )
  }
  return <input ref={ref} className={cn(control, 'h-10', className)} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { autoGrow?: boolean; maxHeight?: number }>(function Textarea(
  { className, autoGrow, maxHeight = 320, onInput, ...rest },
  ref,
) {
  const inner = useRef<HTMLTextAreaElement | null>(null)
  const resize = () => {
    const el = inner.current
    if (!el || !autoGrow) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px'
  }
  useEffect(resize, [rest.value, autoGrow, maxHeight])
  return (
    <textarea
      ref={(el) => {
        inner.current = el
        if (typeof ref === 'function') ref(el)
        else if (ref) ref.current = el
      }}
      onInput={(e) => {
        resize()
        onInput?.(e)
      }}
      className={cn(control, 'min-h-[88px] resize-none py-2.5 leading-relaxed', className)}
      {...rest}
    />
  )
})

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(control, 'h-10 cursor-pointer appearance-none pr-9 [&>option]:bg-ink-800', className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
    </div>
  )
}

export function Label({ children, hint, className }: { children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-1.5 flex items-baseline justify-between gap-3', className)}>
      <span className="text-[13px] font-medium text-soft">{children}</span>
      {hint && <span className="text-xs text-faint">{hint}</span>}
    </div>
  )
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <Label hint={hint}>{label}</Label>
      {children}
    </label>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: ReactNode
  description?: ReactNode
  disabled?: boolean
}) {
  return (
    <label className={cn('flex cursor-pointer items-center justify-between gap-4', disabled && 'cursor-not-allowed opacity-50')}>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-sm text-fg">{label}</span>}
          {description && <span className="block text-xs text-muted">{description}</span>}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200',
          checked ? 'border-transparent bg-[linear-gradient(120deg,var(--accent),var(--accent-2))]' : 'border-white/10 bg-white/[0.08]',
        )}
      >
        <span className={cn('absolute top-0.5 size-[18px] rounded-full bg-white shadow transition-all duration-200', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </label>
  )
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  left,
  right,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  left?: string
  right?: string
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_35%,transparent)] [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white"
        style={{ background: `linear-gradient(90deg, var(--accent) ${pct}%, rgb(255 255 255 / 0.1) ${pct}%)` }}
      />
      {(left || right) && (
        <div className="mt-1.5 flex justify-between text-[11px] text-faint">
          <span>{left}</span>
          <span>{right}</span>
        </div>
      )}
    </div>
  )
}
