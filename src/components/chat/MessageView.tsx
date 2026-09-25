import { memo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { format } from 'date-fns'
import { Brain, Check, ChevronDown, Copy, ExternalLink, Info, ListPlus, RefreshCw, Sparkles, TriangleAlert, Volume2 } from 'lucide-react'
import type { Agent, Message, Role } from '../../lib/types'
import { useLive } from '../../stores/live'
import { useSettings } from '../../stores/settings'
import { AgentAvatar, UserAvatar } from '../agents/AgentAvatar'
import { Markdown } from '../ui/Markdown'
import { toast } from '../ui/Toast'
import { ActivityList } from './Activity'
import { cn, copyText, truncate } from '../../lib/utils'
import { saveNewNote } from '../../lib/brain/vault-fs'
import { createTask } from '../../lib/ops'

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function Typing() {
  return (
    <div className="flex items-center gap-1 py-2">
      {[0, 1, 2].map((i) => (
        <motion.span key={i} className="size-1.5 rounded-full bg-soft" animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />
      ))}
    </div>
  )
}

function ActionButton({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className="grid size-7 place-items-center rounded-lg text-faint transition hover:bg-white/[0.07] hover:text-fg [&_svg]:size-3.5">
      {icon}
    </button>
  )
}

interface Props {
  message: Message
  agent?: Agent
  role?: Role
  agents: Agent[]
  isLast?: boolean
  onRegenerate?: () => void
  compact?: boolean
  projectId?: string
}

export const MessageView = memo(function MessageView({ message, agent, role, agents, isLast, onRegenerate, compact, projectId }: Props) {
  const live = useLive((s) => s.messages[message.id])
  const settings = useSettings((s) => s.settings)
  const navigate = useNavigate()
  const [showThinking, setShowThinking] = useState(false)
  const [copied, setCopied] = useState(false)
  const streaming = message.status === 'streaming'

  if (message.role === 'user') {
    return (
      <div className="flex justify-end gap-3">
        <div className="max-w-[85%] rounded-3xl rounded-br-lg border border-[color-mix(in_oklab,var(--accent)_30%,transparent)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--accent)_22%,transparent),color-mix(in_oklab,var(--accent-2)_10%,transparent))] px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap text-fg">
          {message.content}
        </div>
        {!compact && <UserAvatar name={settings.userName} size={30} />}
      </div>
    )
  }

  const content = streaming ? (live?.text ?? '') : message.content
  const activities = (streaming ? live?.activities : message.activities) ?? []
  const thinking = streaming ? live?.thinking : message.thinking
  const citations = (streaming ? live?.citations : message.citations) ?? []
  const notices = (streaming ? live?.notices : message.notices) ?? []

  const saveToBrain = async () => {
    const title = `${agent?.name ?? 'Agent'} – ${truncate(content.split('\n').find((l) => l.trim())?.replace(/^#+\s*/, '') ?? 'Note', 60)}`
    const res = await saveNewNote(`${settings.brain.writeFolder}/Chats`, title, `${content}\n\n---\n_From ${agent?.name ?? 'an agent'} on ${format(message.createdAt, 'd MMM yyyy HH:mm')}_`)
    toast.success('Saved to your brain', res.path, { label: 'Open', onClick: () => navigate(`/brain?note=${encodeURIComponent(res.path)}`) })
  }

  const makeTask = async () => {
    const first = content.replace(/[#*_>`]/g, '').split(/\n|(?<=\.)\s/).find((l) => l.trim().length > 3) ?? 'Follow up'
    const task = await createTask({ title: truncate(first.trim(), 80), description: content, projectId, source: agent?.name })
    toast.success('Task added', task.title, { label: 'View board', onClick: () => navigate(projectId ? `/projects/${projectId}` : '/projects') })
  }

  const readAloud = () => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(content.replace(/[#*_>`|]/g, ''))
    window.speechSynthesis.speak(u)
  }

  return (
    <div className="group flex gap-3">
      {agent && !compact && <AgentAvatar agent={agent} size="md" active={streaming} className="mt-0.5" />}
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {agent && compact && <AgentAvatar agent={agent} size="xs" />}
          <span className="text-[13px] font-semibold text-fg">{agent?.name ?? 'Agent'}</span>
          {role && <span className="text-xs text-faint">{role.name}</span>}
          <span className="text-[11px] text-faint">· {format(message.createdAt, 'HH:mm')}</span>
          {message.demo && (
            <span className="flex items-center gap-1 rounded-full bg-warn/10 px-2 py-0.5 text-[10px] font-medium text-warn">
              <Sparkles className="size-3" /> Demo
            </span>
          )}
        </div>

        <ActivityList items={activities} agents={agents} />

        {thinking && thinking.trim() && (
          <div className="mb-2">
            <button onClick={() => setShowThinking((s) => !s)} className="flex items-center gap-1.5 text-xs text-muted hover:text-soft">
              <Sparkles className="size-3.5" />
              {streaming && !content ? 'Thinking…' : 'How I thought about it'}
              <ChevronDown className={cn('size-3.5 transition-transform', showThinking && 'rotate-180')} />
            </button>
            <AnimatePresence>
              {showThinking && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="mt-2 max-h-64 overflow-y-auto rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[12.5px] leading-relaxed whitespace-pre-wrap text-muted">{thinking}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {notices.map((n, i) => (
          <div key={i} className="mb-2 flex items-start gap-2 rounded-xl border border-info/20 bg-info/5 px-3 py-2 text-xs text-soft">
            <Info className="mt-0.5 size-3.5 shrink-0 text-info" />
            {n}
          </div>
        ))}

        {content ? (
          <Markdown className={cn(streaming && 'caret-live')}>{content}</Markdown>
        ) : streaming ? (
          <Typing />
        ) : null}

        {message.status === 'error' && (
          <div className="mt-2 rounded-2xl border border-bad/25 bg-bad/[0.06] px-4 py-3">
            <div className="flex items-start gap-2.5">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-bad" />
              <div className="min-w-0 text-sm">
                <div className="font-medium text-fg">{message.error}</div>
                {message.hint && <div className="mt-0.5 text-xs text-muted">{message.hint}</div>}
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {onRegenerate && (
                    <button onClick={onRegenerate} className="flex items-center gap-1.5 rounded-lg bg-white/[0.07] px-2.5 py-1 text-xs text-fg hover:bg-white/[0.12]">
                      <RefreshCw className="size-3.5" /> Try again
                    </button>
                  )}
                  <button onClick={() => navigate('/settings?tab=ai')} className="flex items-center gap-1.5 rounded-lg bg-white/[0.07] px-2.5 py-1 text-xs text-fg hover:bg-white/[0.12]">
                    Check AI settings
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {citations.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {citations.slice(0, 8).map((c) => (
              <a
                key={c.url}
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                title={c.title ?? c.url}
                className="flex max-w-[240px] items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-soft transition hover:border-white/20 hover:text-fg"
              >
                <ExternalLink className="size-3 shrink-0" />
                <span className="truncate">{c.title ? truncate(c.title, 40) : domainOf(c.url)}</span>
              </a>
            ))}
          </div>
        )}

        {!streaming && content && message.status !== 'error' && (
          <div className="mt-1.5 flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100 max-md:opacity-100">
            <ActionButton
              label={copied ? 'Copied' : 'Copy'}
              icon={copied ? <Check /> : <Copy />}
              onClick={async () => {
                await copyText(content)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
            />
            <ActionButton label="Save to brain" icon={<Brain />} onClick={() => void saveToBrain()} />
            <ActionButton label="Make it a task" icon={<ListPlus />} onClick={() => void makeTask()} />
            <ActionButton label="Read aloud" icon={<Volume2 />} onClick={readAloud} />
            {isLast && onRegenerate && <ActionButton label="Try again" icon={<RefreshCw />} onClick={onRegenerate} />}
          </div>
        )}
      </div>
    </div>
  )
})
