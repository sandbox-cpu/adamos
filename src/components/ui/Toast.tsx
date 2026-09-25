import { create } from 'zustand'
import { AnimatePresence, motion } from 'motion/react'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn, uid } from '../../lib/utils'

type ToastTone = 'success' | 'error' | 'info'

interface ToastItem {
  id: string
  tone: ToastTone
  title: string
  body?: string
  action?: { label: string; onClick: () => void }
}

interface ToastState {
  toasts: ToastItem[]
  push: (t: Omit<ToastItem, 'id'>) => void
  dismiss: (id: string) => void
}

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = uid()
    set((s) => ({ toasts: [...s.toasts, { ...t, id }].slice(-4) }))
    setTimeout(() => get().dismiss(id), t.tone === 'error' ? 8000 : 4500)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}))

export const toast = {
  success: (title: string, body?: string, action?: ToastItem['action']) => useToasts.getState().push({ tone: 'success', title, body, action }),
  error: (title: string, body?: string) => useToasts.getState().push({ tone: 'error', title, body }),
  info: (title: string, body?: string, action?: ToastItem['action']) => useToasts.getState().push({ tone: 'info', title, body, action }),
}

const icons: Record<ToastTone, ReactNode> = {
  success: <CircleCheck className="size-5 text-good" />,
  error: <CircleAlert className="size-5 text-bad" />,
  info: <Info className="size-5 text-info" />,
}

export function Toaster() {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[100] flex w-[min(420px,calc(100vw-32px))] -translate-x-1/2 flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            className={cn('glass-strong pointer-events-auto flex items-start gap-3 rounded-2xl px-4 py-3')}
          >
            <div className="mt-0.5">{icons[t.tone]}</div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-fg">{t.title}</div>
              {t.body && <div className="mt-0.5 text-xs text-muted">{t.body}</div>}
              {t.action && (
                <button
                  onClick={() => {
                    t.action!.onClick()
                    dismiss(t.id)
                  }}
                  className="mt-2 text-xs font-semibold text-[color-mix(in_oklab,var(--accent)_60%,white)] hover:underline"
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button onClick={() => dismiss(t.id)} className="text-faint hover:text-fg" aria-label="Dismiss">
              <X className="size-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
