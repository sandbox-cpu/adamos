import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import { cn } from '../../lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle' | 'outline'
type Size = 'xs' | 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  iconRight?: ReactNode
  loading?: boolean
}

const variants: Record<Variant, string> = {
  primary:
    'text-white bg-[linear-gradient(120deg,var(--accent),color-mix(in_oklab,var(--accent-2)_70%,var(--accent)))] shadow-[0_8px_28px_-10px_var(--accent),inset_0_1px_0_rgb(255_255_255/0.25)] hover:brightness-110 active:brightness-95',
  secondary: 'text-fg bg-white/[0.06] border border-white/[0.09] hover:bg-white/[0.1] hover:border-white/[0.14]',
  outline: 'text-fg border border-white/[0.12] hover:bg-white/[0.05]',
  ghost: 'text-soft hover:text-fg hover:bg-white/[0.06]',
  subtle: 'text-soft bg-white/[0.035] hover:bg-white/[0.07] hover:text-fg',
  danger: 'text-white bg-bad/80 hover:bg-bad border border-bad/40',
}

const sizes: Record<Size, string> = {
  xs: 'h-7 px-2.5 text-xs gap-1.5 rounded-lg',
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-[15px] gap-2.5 rounded-2xl',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, iconRight, loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-all duration-200 disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle className="animate-spin" /> : icon}
      {children}
      {iconRight}
    </button>
  )
})

export function IconButton({ label, className, size = 'md', ...rest }: Omit<ButtonProps, 'children'> & { label: string }) {
  const dim = size === 'xs' ? 'size-7' : size === 'sm' ? 'size-8' : size === 'lg' ? 'size-12' : 'size-10'
  return <Button aria-label={label} title={label} size={size} className={cn('px-0', dim, className)} {...rest} />
}
