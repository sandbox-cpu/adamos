import { NavLink } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronsLeft, ChevronsRight, Lock, LockOpen, Sparkles } from 'lucide-react'
import { NAV } from './nav'
import { useUI } from '../stores/ui'
import { useOsName, useSettings } from '../stores/settings'
import { useVault } from '../stores/vault'
import { UserAvatar } from '../components/agents/AgentAvatar'
import { cn } from '../lib/utils'

export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-[30%] bg-[conic-gradient(from_140deg,var(--accent),var(--accent-2),var(--accent-3),var(--accent))] opacity-90 blur-[10px]" />
      <div className="absolute inset-0 grid place-items-center rounded-[30%] border border-white/15 bg-ink-900">
        <div
          className="rounded-full"
          style={{ width: size * 0.5, height: size * 0.5, background: 'radial-gradient(circle at 32% 28%, #fff, var(--accent) 45%, color-mix(in oklab, var(--accent) 40%, #05060a) 100%)', boxShadow: '0 0 14px var(--accent)' }}
        />
        <div className="absolute rounded-full border border-white/40" style={{ width: size * 0.8, height: size * 0.3, transform: 'rotate(-24deg)' }} />
      </div>
    </div>
  )
}

function SidebarBody({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const osName = useOsName()
  const settings = useSettings((s) => s.settings)
  const vaultStatus = useVault((s) => s.status)
  const lock = useVault((s) => s.lock)
  const toggle = useUI((s) => s.toggleSidebar)

  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-16 items-center gap-3 px-4', collapsed && 'justify-center px-0')}>
        <BrandMark />
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate font-display text-[17px] font-semibold tracking-tight">{osName}</div>
            <div className="truncate text-[11px] text-faint">{settings.companyName}</div>
          </div>
        )}
      </div>

      <nav className="no-scrollbar flex-1 overflow-y-auto px-3 pb-4">
        {NAV.map((group) => (
          <div key={group.group} className="mt-4 first:mt-1">
            {!collapsed && <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">{group.group}</div>}
            {collapsed && <div className="mx-auto mb-2 h-px w-6 bg-white/[0.06]" />}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium transition-colors',
                      collapsed && 'justify-center px-0',
                      isActive ? 'text-fg' : 'text-muted hover:bg-white/[0.04] hover:text-soft',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span
                          layoutId="nav-active"
                          className="absolute inset-0 rounded-xl border border-white/[0.08] bg-[linear-gradient(90deg,color-mix(in_oklab,var(--accent)_22%,transparent),rgb(255_255_255/0.03))]"
                          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                        />
                      )}
                      {isActive && <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full bg-[var(--accent)] shadow-[0_0_12px_var(--accent)]" />}
                      <item.icon className={cn('relative size-[18px] shrink-0', isActive && 'text-[color-mix(in_oklab,var(--accent)_45%,white)]')} />
                      {!collapsed && <span className="relative flex-1 truncate">{item.label}</span>}
                      {!collapsed && item.badge && (
                        <span className="relative flex items-center gap-1 rounded-full bg-bad/15 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-bad">
                          <span className="size-1.5 animate-pulse rounded-full bg-bad" />
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/[0.06] p-3">
        <div className={cn('flex items-center gap-2.5 rounded-2xl p-2', !collapsed && 'bg-white/[0.03]')}>
          {!collapsed && <UserAvatar name={settings.userName} size={32} />}
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">{settings.userName}</div>
              <div className="truncate text-[11px] text-faint">{settings.userRole}</div>
            </div>
          )}
          {vaultStatus === 'unlocked' ? (
            <button onClick={() => void lock()} title="Vault unlocked · click to lock" className="grid size-8 place-items-center rounded-lg text-good hover:bg-white/[0.06]">
              <LockOpen className="size-4" />
            </button>
          ) : (
            <NavLink to="/vault" title={vaultStatus === 'locked' ? 'Vault locked' : 'Set up your vault'} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/[0.06] hover:text-fg">
              {vaultStatus === 'uninitialized' ? <Sparkles className="size-4" /> : <Lock className="size-4" />}
            </NavLink>
          )}
        </div>
        <button onClick={toggle} className="mt-2 hidden h-8 w-full items-center justify-center gap-2 rounded-lg text-xs text-faint transition hover:bg-white/[0.04] hover:text-soft lg:flex">
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          {!collapsed && 'Collapse'}
        </button>
      </div>
    </div>
  )
}

export function Sidebar() {
  const collapsed = useUI((s) => s.sidebarCollapsed)
  const mobileNav = useUI((s) => s.mobileNav)
  const setMobileNav = useUI((s) => s.setMobileNav)
  return (
    <>
      <aside className={cn('relative z-30 hidden shrink-0 border-r border-white/[0.06] bg-ink-900/60 backdrop-blur-xl transition-[width] duration-300 lg:block', collapsed ? 'w-[76px]' : 'w-[248px]')}>
        <SidebarBody collapsed={collapsed} />
      </aside>
      <AnimatePresence>
        {mobileNav && (
          <motion.div className="fixed inset-0 z-[60] lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileNav(false)} />
            <motion.aside
              className="glass-strong absolute inset-y-0 left-0 w-[272px] rounded-r-3xl"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 360, damping: 36 }}
            >
              <SidebarBody collapsed={false} onNavigate={() => setMobileNav(false)} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
