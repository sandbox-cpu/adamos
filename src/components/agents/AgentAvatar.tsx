import { memo } from 'react'
import { Icon } from '../ui/Icon'
import { ROLE_BANK } from '../../lib/agents/roles'
import type { Agent } from '../../lib/types'
import { cn, mixHex } from '../../lib/utils'

const SIZES = { xs: 22, sm: 30, md: 40, lg: 56, xl: 88, hero: 148 } as const
export type AvatarSize = keyof typeof SIZES

interface Props {
  agent: Pick<Agent, 'name' | 'color' | 'roleId' | 'icon'> & { isLead?: boolean }
  size?: AvatarSize
  active?: boolean
  speaking?: boolean
  status?: 'online' | 'working' | 'bench'
  className?: string
  ring?: boolean
}

/** A glossy orb in the agent's colour, with its role icon at the centre. */
export const AgentAvatar = memo(function AgentAvatar({ agent, size = 'md', active, speaking, status, className, ring }: Props) {
  const s = SIZES[size]
  const c = agent.color || '#8b6cff'
  const light = mixHex(c, '#ffffff', 0.55)
  const dark = mixHex(c, '#05060a', 0.62)
  const iconName = agent.icon || ROLE_BANK.find((r) => r.id === agent.roleId)?.icon
  const iconSize = Math.round(s * (size === 'xs' ? 0.5 : 0.42))
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: s, height: s }} title={agent.name}>
      {(speaking || ring) && (
        <span
          className={cn('absolute -inset-[3px] rounded-full', speaking && 'animate-pulse-soft')}
          style={{ boxShadow: `0 0 0 2px ${c}, 0 0 ${Math.round(s * 0.45)}px ${mixHex(c, '#000000', 0.1)}` }}
        />
      )}
      <div
        className="absolute inset-0 overflow-hidden rounded-full"
        style={{
          background: `radial-gradient(circle at 32% 26%, ${light} 0%, ${c} 36%, ${dark} 78%, #06070b 100%)`,
          boxShadow: `inset 0 0 0 1px rgb(255 255 255 / 0.14), inset 0 -${Math.max(2, s * 0.08)}px ${Math.max(4, s * 0.18)}px rgb(0 0 0 / 0.35), 0 ${Math.max(2, s * 0.12)}px ${Math.max(6, s * 0.4)}px -${Math.max(2, s * 0.14)}px ${c}`,
        }}
      >
        <div
          className={cn('absolute -inset-1/4 opacity-70 mix-blend-soft-light', (active || speaking) && 'animate-spin-slow')}
          style={{ background: `conic-gradient(from 200deg, transparent 0deg, rgb(255 255 255 / 0.55) 60deg, transparent 140deg, ${mixHex(c, '#ffffff', 0.3)} 250deg, transparent 320deg)` }}
        />
        <div className="absolute inset-[7%] rounded-full" style={{ background: 'radial-gradient(circle at 30% 22%, rgb(255 255 255 / 0.55), transparent 32%)' }} />
      </div>
      <div className="absolute inset-0 grid place-items-center text-white drop-shadow-[0_1px_2px_rgb(0_0_0/0.5)]">
        {size === 'xs' ? (
          <span className="text-[10px] font-bold">{agent.name.slice(0, 1)}</span>
        ) : (
          <Icon name={iconName} style={{ width: iconSize, height: iconSize }} />
        )}
      </div>
      {status && size !== 'xs' && (
        <span
          className={cn(
            'absolute bottom-0 right-0 rounded-full border-2 border-ink-900',
            status === 'online' && 'bg-good',
            status === 'working' && 'animate-pulse bg-warn',
            status === 'bench' && 'bg-ink-500',
          )}
          style={{ width: Math.max(9, s * 0.24), height: Math.max(9, s * 0.24) }}
        />
      )}
      {agent.isLead && s >= 40 && (
        <span className="absolute -top-1 -right-1 grid size-[18px] place-items-center rounded-full bg-[#f4c95d] text-[10px] text-black shadow-[0_0_12px_#f4c95d]">★</span>
      )}
    </div>
  )
})

export function AvatarStack({ agents, size = 'sm', max = 4 }: { agents: Pick<Agent, 'id' | 'name' | 'color' | 'roleId'>[]; size?: AvatarSize; max?: number }) {
  const shown = agents.slice(0, max)
  const extra = agents.length - shown.length
  return (
    <div className="flex items-center">
      {shown.map((a, i) => (
        <div key={a.id} className="rounded-full ring-2 ring-ink-850" style={{ marginLeft: i === 0 ? 0 : -8, zIndex: shown.length - i }}>
          <AgentAvatar agent={a} size={size} />
        </div>
      ))}
      {extra > 0 && <div className="-ml-2 grid size-[30px] place-items-center rounded-full bg-ink-600 text-[11px] font-semibold text-soft ring-2 ring-ink-850">+{extra}</div>}
    </div>
  )
}

export function UserAvatar({ name, size = 30 }: { name: string; size?: number }) {
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4, background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.2)' }}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  )
}
