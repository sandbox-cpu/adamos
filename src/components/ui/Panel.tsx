import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function Panel({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('glass rounded-3xl', className)} {...rest}>
      {children}
    </div>
  )
}

export function PanelHeader({ title, icon, subtitle, actions, className }: { title: ReactNode; icon?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-5 pt-5 pb-3', className)}>
      <div className="flex min-w-0 items-center gap-3">
        {icon && <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-soft [&_svg]:size-[18px]">{icon}</div>}
        <div className="min-w-0">
          <h3 className="truncate font-display text-[15px] font-semibold tracking-tight text-fg">{title}</h3>
          {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  )
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-7 flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">{eyebrow}</div>}
        <h1 className="font-display text-3xl font-semibold tracking-tight text-fg sm:text-[34px]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-white/[0.07]', className)} />
}
