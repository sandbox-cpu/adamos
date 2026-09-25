import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowDown } from 'lucide-react'
import { useAgents, useMessages, useRoles } from '../../hooks/data'
import { regenerateLast, sendDirect, sendGroup, stopConversation } from '../../lib/agents/chat'
import type { Agent, Conversation } from '../../lib/types'
import { useLive } from '../../stores/live'
import { Composer } from './Composer'
import { MessageView } from './MessageView'
import { cn } from '../../lib/utils'

interface Props {
  conversation: Conversation
  compact?: boolean
  empty?: ReactNode
  draft?: string
  placeholder?: string
  autoFocus?: boolean
  footer?: ReactNode
}

export function ChatView({ conversation, compact, empty, draft, placeholder, autoFocus, footer }: Props) {
  const messages = useMessages(conversation.id)
  const agents = useAgents()
  const roles = useRoles()
  const running = useLive((s) => !!s.running[conversation.id])
  const scroller = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(true)
  const participants = useMemo(() => conversation.agentIds.map((id) => agents.find((a) => a.id === id)).filter((a): a is Agent => !!a), [conversation.agentIds, agents])
  const liveLen = useLive((s) => {
    const last = messages[messages.length - 1]
    return last ? (s.messages[last.id]?.text.length ?? 0) + (s.messages[last.id]?.activities.length ?? 0) : 0
  })

  useLayoutEffect(() => {
    const el = scroller.current
    if (el && stuck) el.scrollTop = el.scrollHeight
  }, [messages.length, liveLen, stuck])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onScroll = () => setStuck(el.scrollHeight - el.scrollTop - el.clientHeight < 80)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  const lastAgentIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'agent') return i
    return -1
  })()

  const onSend = (text: string, att?: Parameters<typeof sendDirect>[2]) => {
    setStuck(true)
    if (conversation.kind === 'group') void sendGroup(conversation.id, text)
    else void sendDirect(conversation.id, text, att)
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div ref={scroller} className={cn('relative min-h-0 flex-1 overflow-y-auto', compact ? 'px-4 py-4' : 'px-4 py-6 sm:px-8')}>
        {messages.length === 0 && empty}
        <div className={cn('mx-auto space-y-6', compact ? 'max-w-none' : 'max-w-3xl')}>
          {messages.map((m, i) => {
            const agent = m.agentId ? agents.find((a) => a.id === m.agentId) : undefined
            return (
              <MessageView
                key={m.id}
                message={m}
                agent={agent}
                role={agent ? roles.find((r) => r.id === agent.roleId) : undefined}
                agents={agents}
                compact={compact}
                isLast={i === lastAgentIndex && i === messages.length - 1 && conversation.kind !== 'group'}
                onRegenerate={conversation.kind !== 'group' && !running ? () => void regenerateLast(conversation.id) : undefined}
                projectId={conversation.projectId}
              />
            )
          })}
        </div>
      </div>
      {!stuck && (
        <button
          onClick={() => {
            const el = scroller.current
            if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
          }}
          className="glass-strong absolute bottom-28 left-1/2 z-10 grid size-9 -translate-x-1/2 place-items-center rounded-full text-soft hover:text-fg"
          aria-label="Scroll to latest"
        >
          <ArrowDown className="size-4" />
        </button>
      )}
      <div className={cn('shrink-0', compact ? 'px-3 pb-3' : 'px-4 pb-5 sm:px-8')}>
        <div className={cn('mx-auto', compact ? 'max-w-none' : 'max-w-3xl')}>
          {footer}
          <Composer
            key={conversation.id}
            onSend={onSend}
            onStop={() => stopConversation(conversation.id)}
            running={running}
            placeholder={
              placeholder ?? (conversation.kind === 'group' ? 'Message the huddle… use @name to ask someone directly' : `Message ${participants[0]?.name ?? 'your agent'}…`)
            }
            mentionAgents={conversation.kind === 'group' ? participants : undefined}
            allowAttachments={conversation.kind !== 'group'}
            autoFocus={autoFocus}
            draft={draft}
            compact={compact}
          />
        </div>
      </div>
    </div>
  )
}
