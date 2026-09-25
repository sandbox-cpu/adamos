import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUp, FileText, FolderKanban, Mic, MicOff, Paperclip, Square, X } from 'lucide-react'
import { db } from '../../lib/db'
import type { Agent } from '../../lib/types'
import type { Attachments } from '../../lib/agents/chat'
import { useDictation } from '../../hooks/useDictation'
import { useProjects } from '../../hooks/data'
import { AgentAvatar } from '../agents/AgentAvatar'
import { cn, truncate } from '../../lib/utils'

interface Props {
  onSend: (text: string, attachments?: Attachments) => void
  onStop?: () => void
  running?: boolean
  placeholder?: string
  mentionAgents?: Agent[]
  allowAttachments?: boolean
  autoFocus?: boolean
  draft?: string
  compact?: boolean
}

export function Composer({ onSend, onStop, running, placeholder = 'Message…', mentionAgents, allowAttachments = true, autoFocus, draft, compact }: Props) {
  const [text, setText] = useState(draft ?? '')
  const [notes, setNotes] = useState<string[]>([])
  const [projectId, setProjectId] = useState<string | undefined>()
  const [picker, setPicker] = useState<'none' | 'menu' | 'notes' | 'project'>('none')
  const [noteQuery, setNoteQuery] = useState('')
  const [mention, setMention] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)
  const projects = useProjects()
  const dictation = useDictation((t) => setText((prev) => (prev ? prev.replace(/\s*$/, ' ') : '') + t))

  useEffect(() => {
    if (draft) {
      setText(draft)
      requestAnimationFrame(() => {
        const el = ref.current
        if (!el) return
        el.focus()
        el.setSelectionRange(el.value.length, el.value.length)
      })
    }
  }, [draft])

  const noteResults = useLiveQuery(
    async () => {
      if (picker !== 'notes') return []
      const q = noteQuery.trim().toLowerCase()
      const all = await db.notes.toArray()
      return all.filter((n) => !q || n.title.toLowerCase().includes(q) || n.path.toLowerCase().includes(q)).slice(0, 8)
    },
    [picker, noteQuery],
    [],
  )

  const mentionOptions = useMemo(() => {
    if (mention === null || !mentionAgents) return []
    return mentionAgents.filter((a) => a.name.toLowerCase().startsWith(mention.toLowerCase()))
  }, [mention, mentionAgents])

  const resize = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 220) + 'px'
  }

  const send = () => {
    const value = text.trim()
    if (!value || running) return
    onSend(value, allowAttachments ? { notes, projectId } : undefined)
    setText('')
    setNotes([])
    requestAnimationFrame(resize)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOptions.length && (e.key === 'Enter' || e.key === 'Tab')) {
      e.preventDefault()
      insertMention(mentionOptions[0])
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
    }
  }

  const insertMention = (agent: Agent) => {
    setText((t) => t.replace(/@(\w*)$/, `@${agent.name} `))
    setMention(null)
    ref.current?.focus()
  }

  const project = projects.find((p) => p.id === projectId)

  return (
    <div className="relative">
      <AnimatePresence>
        {mentionOptions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="glass-strong absolute bottom-full left-0 z-20 mb-2 w-64 rounded-2xl p-1.5"
          >
            {mentionOptions.map((a) => (
              <button key={a.id} onClick={() => insertMention(a)} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-white/[0.07]">
                <AgentAvatar agent={a} size="sm" />
                {a.name}
              </button>
            ))}
          </motion.div>
        )}
        {picker !== 'none' && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="glass-strong absolute bottom-full left-0 z-20 mb-2 w-80 rounded-2xl p-2"
          >
            {picker === 'menu' && (
              <>
                <button onClick={() => setPicker('notes')} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-white/[0.07]">
                  <FileText className="size-4 text-muted" /> Attach a note from your brain
                </button>
                <button onClick={() => setPicker('project')} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-white/[0.07]">
                  <FolderKanban className="size-4 text-muted" /> Focus on a project
                </button>
              </>
            )}
            {picker === 'notes' && (
              <>
                <input
                  autoFocus
                  value={noteQuery}
                  onChange={(e) => setNoteQuery(e.target.value)}
                  placeholder="Search notes…"
                  className="mb-1.5 h-9 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none"
                />
                <div className="max-h-64 overflow-y-auto">
                  {noteResults.map((n) => (
                    <button
                      key={n.path}
                      onClick={() => {
                        setNotes((prev) => (prev.includes(n.path) ? prev : [...prev, n.path]))
                        setPicker('none')
                        setNoteQuery('')
                      }}
                      className="flex w-full flex-col items-start rounded-xl px-3 py-2 text-left hover:bg-white/[0.07]"
                    >
                      <span className="text-sm text-fg">{n.title}</span>
                      <span className="text-[11px] text-faint">{n.folder || 'Vault root'}</span>
                    </button>
                  ))}
                  {!noteResults.length && <div className="px-3 py-4 text-center text-xs text-muted">No notes found</div>}
                </div>
              </>
            )}
            {picker === 'project' && (
              <div className="max-h-64 overflow-y-auto">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setProjectId(p.id)
                      setPicker('none')
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm hover:bg-white/[0.07]"
                  >
                    <span className="size-2.5 rounded-full" style={{ background: p.color }} />
                    <span className="truncate">{p.name}</span>
                    {p.client && <span className="truncate text-xs text-faint">{p.client}</span>}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className={cn(
          'glass rounded-3xl p-2 transition focus-within:border-[color-mix(in_oklab,var(--accent)_45%,transparent)] focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_12%,transparent),0_24px_60px_-28px_rgb(0_0_0/0.75)]',
        )}
      >
        {(notes.length > 0 || project) && (
          <div className="flex flex-wrap gap-1.5 px-2 pt-1 pb-2">
            {project && (
              <span className="flex items-center gap-1.5 rounded-full bg-white/[0.07] py-1 pr-1.5 pl-2.5 text-xs text-soft">
                <FolderKanban className="size-3.5" /> {truncate(project.name, 28)}
                <button onClick={() => setProjectId(undefined)} className="rounded-full p-0.5 hover:bg-white/10" aria-label="Remove project">
                  <X className="size-3" />
                </button>
              </span>
            )}
            {notes.map((n) => (
              <span key={n} className="flex items-center gap-1.5 rounded-full bg-white/[0.07] py-1 pr-1.5 pl-2.5 text-xs text-soft">
                <FileText className="size-3.5" /> {truncate(n.split('/').pop()!.replace(/\.md$/, ''), 28)}
                <button onClick={() => setNotes((prev) => prev.filter((x) => x !== n))} className="rounded-full p-0.5 hover:bg-white/10" aria-label="Remove note">
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-end gap-1.5">
          {allowAttachments && (
            <button
              onClick={() => setPicker((p) => (p === 'none' ? 'menu' : 'none'))}
              className="mb-0.5 grid size-9 shrink-0 place-items-center rounded-2xl text-muted transition hover:bg-white/[0.07] hover:text-fg"
              aria-label="Attach"
              title="Attach notes or a project"
            >
              <Paperclip className="size-[18px]" />
            </button>
          )}
          <textarea
            ref={ref}
            autoFocus={autoFocus}
            rows={1}
            value={dictation.listening && dictation.interim ? `${text}${text ? ' ' : ''}${dictation.interim}` : text}
            onChange={(e) => {
              setText(e.target.value)
              const m = e.target.value.match(/@(\w*)$/)
              setMention(m && mentionAgents ? m[1] : null)
              resize()
            }}
            onKeyDown={onKeyDown}
            placeholder={dictation.listening ? 'Listening… speak now' : placeholder}
            className={cn(
              'max-h-[220px] min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[14.5px] leading-relaxed text-fg outline-none placeholder:text-faint',
              compact && 'text-sm',
            )}
          />
          {dictation.supported && (
            <button
              onClick={dictation.toggle}
              className={cn(
                'mb-0.5 grid size-9 shrink-0 place-items-center rounded-2xl transition',
                dictation.listening ? 'bg-bad/15 text-bad' : 'text-muted hover:bg-white/[0.07] hover:text-fg',
              )}
              aria-label={dictation.listening ? 'Stop dictation' : 'Dictate'}
              title={dictation.listening ? 'Stop dictation' : 'Speak instead of typing'}
            >
              {dictation.listening ? <MicOff className="size-[18px]" /> : <Mic className="size-[18px]" />}
            </button>
          )}
          {running ? (
            <button onClick={onStop} className="mb-0.5 grid size-9 shrink-0 place-items-center rounded-2xl bg-white/10 text-fg hover:bg-white/15" aria-label="Stop">
              <Square className="size-3.5 fill-current" />
            </button>
          ) : (
            <button
              onClick={send}
              disabled={!text.trim()}
              className="mb-0.5 grid size-9 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] text-white shadow-[0_6px_20px_-6px_var(--accent)] transition hover:brightness-110 disabled:opacity-30 disabled:shadow-none"
              aria-label="Send"
            >
              <ArrowUp className="size-[18px]" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
