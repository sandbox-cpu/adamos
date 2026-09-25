import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Brain, Check, ChevronDown, Globe, LoaderCircle, TriangleAlert, Wrench } from 'lucide-react'
import type { ActivityItem, Agent } from '../../lib/types'
import { AgentAvatar } from '../agents/AgentAvatar'
import { Markdown } from '../ui/Markdown'
import { cn } from '../../lib/utils'

function KindIcon({ item }: { item: ActivityItem }) {
  if (item.kind === 'web') return <Globe className="size-3.5" />
  if (item.kind === 'brain') return <Brain className="size-3.5" />
  return <Wrench className="size-3.5" />
}

function StatusIcon({ status }: { status: ActivityItem['status'] }) {
  if (status === 'running') return <LoaderCircle className="size-3.5 animate-spin text-[color-mix(in_oklab,var(--accent)_60%,white)]" />
  if (status === 'error') return <TriangleAlert className="size-3.5 text-bad" />
  return <Check className="size-3.5 text-good" />
}

function Delegation({ item, agent }: { item: ActivityItem; agent?: Agent }) {
  const [open, setOpen] = useState(item.status === 'running')
  const expanded = open || item.status === 'running'
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025]">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
        {agent ? <AgentAvatar agent={agent} size="sm" active={item.status === 'running'} /> : <Wrench className="size-4" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[13px] font-medium text-fg">
            {item.label}
            <StatusIcon status={item.status} />
          </div>
          {item.detail && <div className="truncate text-xs text-muted">{item.detail}</div>}
        </div>
        <ChevronDown className={cn('size-4 text-faint transition-transform', expanded && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {expanded && item.output && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="max-h-80 overflow-y-auto border-t border-white/[0.06] px-4 py-3">
              <Markdown className="text-[13px]">{item.output}</Markdown>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function ActivityList({ items, agents }: { items: ActivityItem[]; agents: Agent[] }) {
  const navigate = useNavigate()
  if (!items.length) return null
  const delegations = items.filter((i) => i.kind === 'delegate')
  const steps = items.filter((i) => i.kind !== 'delegate')
  return (
    <div className="mb-3 space-y-2">
      {steps.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {steps.map((item) => (
            <button
              key={item.id}
              disabled={!item.link}
              onClick={() => item.link && navigate(item.link)}
              title={item.output || item.detail}
              className={cn(
                'flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1 text-[11.5px] transition',
                item.status === 'error' ? 'border-bad/25 bg-bad/5 text-bad' : 'border-white/[0.08] bg-white/[0.035] text-soft',
                item.link && 'hover:border-white/20 hover:text-fg',
              )}
            >
              <KindIcon item={item} />
              <span className="truncate">{item.label}</span>
              {item.detail && item.status !== 'running' && <span className="hidden truncate text-faint sm:inline">· {item.detail}</span>}
              <StatusIcon status={item.status} />
            </button>
          ))}
        </div>
      )}
      {delegations.map((d) => (
        <Delegation key={d.id} item={d} agent={agents.find((a) => a.id === d.agentId)} />
      ))}
    </div>
  )
}
