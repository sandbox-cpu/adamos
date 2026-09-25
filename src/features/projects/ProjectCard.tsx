import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { CalendarClock } from 'lucide-react'
import type { Agent, Project, Task } from '../../lib/types'
import { AvatarStack } from '../../components/agents/AgentAvatar'
import { Badge, ProgressRing } from '../../components/ui/bits'
import { cn, dueLabel } from '../../lib/utils'

export const STATUS_META: Record<Project['status'], { label: string; tone: 'accent' | 'good' | 'warn' | 'neutral' | 'info' }> = {
  pitch: { label: 'Pitch', tone: 'info' },
  active: { label: 'Active', tone: 'good' },
  on_hold: { label: 'On hold', tone: 'warn' },
  done: { label: 'Complete', tone: 'neutral' },
}

export function projectProgress(tasks: Task[]): number {
  if (!tasks.length) return 0
  return tasks.filter((t) => t.status === 'done').length / tasks.length
}

export function ProjectCard({ project, tasks, agents, compact }: { project: Project; tasks: Task[]; agents: Agent[]; compact?: boolean }) {
  const navigate = useNavigate()
  const progress = projectProgress(tasks)
  const due = dueLabel(project.dueDate)
  const squad = project.squad.map((id) => agents.find((a) => a.id === id)).filter((a): a is Agent => !!a)
  const open = tasks.filter((t) => t.status !== 'done').length
  return (
    <motion.button
      whileHover={{ y: -3 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      onClick={() => navigate(`/projects/${project.id}`)}
      className={cn('glass group relative flex w-full flex-col overflow-hidden rounded-3xl text-left transition-colors hover:border-white/15', compact ? 'p-4' : 'p-5')}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-60 transition group-hover:opacity-90"
        style={{ background: `radial-gradient(120% 100% at 0% 0%, ${project.color}33, transparent 70%)` }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted">
            <span className="size-2 rounded-full" style={{ background: project.color, boxShadow: `0 0 10px ${project.color}` }} />
            <span className="truncate">{project.client ?? 'No client'}</span>
          </div>
          <h3 className="truncate font-display text-[17px] font-semibold tracking-tight text-fg">
            {project.emoji && <span className="mr-1.5">{project.emoji}</span>}
            {project.name}
          </h3>
        </div>
        <ProgressRing value={progress} size={compact ? 40 : 46} color={project.color} />
      </div>
      {!compact && project.description && <p className="relative mt-2 line-clamp-2 text-[13px] leading-relaxed text-muted">{project.description}</p>}
      <div className="relative mt-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_META[project.status].tone}>{STATUS_META[project.status].label}</Badge>
          {due && (
            <span className={cn('flex items-center gap-1 text-xs', due.tone === 'bad' ? 'text-bad' : due.tone === 'warn' ? 'text-warn' : 'text-muted')}>
              <CalendarClock className="size-3.5" />
              {due.text}
            </span>
          )}
        </div>
        {squad.length > 0 && <AvatarStack agents={squad} size="xs" max={4} />}
      </div>
      {!compact && <div className="relative mt-3 text-xs text-faint">{open ? `${open} open task${open === 1 ? '' : 's'}` : 'No open tasks'}</div>}
    </motion.button>
  )
}
