import { Suspense, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { LoaderCircle } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { LeadDock } from './LeadDock'
import { CommandPalette } from './CommandPalette'
import { VaultUnlockModal } from './VaultUnlockModal'
import { Toaster } from '../components/ui/Toast'
import { useVault } from '../stores/vault'

export function PageLoader() {
  return (
    <div className="grid h-full min-h-[50vh] place-items-center">
      <LoaderCircle className="size-6 animate-spin text-muted" />
    </div>
  )
}

/** Pages that manage their own full-height layout and scrolling. */
const FULL_BLEED = [/^\/brain/, /^\/comms/, /^\/huddle/, /^\/live/, /^\/decks\/[^/]+/, /^\/sites\/[^/]+/, /^\/calendar/]

export function Shell() {
  const location = useLocation()
  const touch = useVault((s) => s.touch)
  const fullBleed = FULL_BLEED.some((r) => r.test(location.pathname))

  useEffect(() => {
    let last = 0
    const onActivity = () => {
      const now = Date.now()
      if (now - last > 20_000) {
        last = now
        touch()
      }
    }
    window.addEventListener('pointerdown', onActivity)
    window.addEventListener('keydown', onActivity)
    return () => {
      window.removeEventListener('pointerdown', onActivity)
      window.removeEventListener('keydown', onActivity)
    }
  }, [touch])

  return (
    <div className="relative flex h-dvh w-full overflow-hidden">
      <div className="app-backdrop" />
      <Sidebar />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className={fullBleed ? 'relative min-h-0 flex-1 overflow-hidden' : 'relative min-h-0 flex-1 overflow-y-auto'}>
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname.split('/').slice(0, 2).join('/')}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
              className={fullBleed ? 'h-full' : 'mx-auto w-full max-w-[1480px] px-4 pt-7 pb-28 sm:px-8'}
            >
              <Suspense fallback={<PageLoader />}>
                <Outlet />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <LeadDock />
      <CommandPalette />
      <VaultUnlockModal />
      <Toaster />
    </div>
  )
}
