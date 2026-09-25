import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { Brain, Check, CircleStop, Copy, FolderKanban, Plus, Sparkles, Trash2, Wand2, X } from 'lucide-react'
import { db } from '../../lib/db'
import { updateTask } from '../../lib/ops'
import { runTaskWithAgent, stopTask, taskLiveKey } from '../../lib/projects'
import { saveNewNote } from '../../lib/brain/vault-fs'
import type { Priority, Task, TaskStatus } from '../../lib/types'
import { cn, copyText, errorMessage, uid } from '../../lib/utils'
import { useLive } from '../../stores/live'
import { useSettings } from '../../stores/settings'
import { useDraftField } from '../../hooks/useDraftField'
import { useAgents, useProjects, useRoles } from '../../hooks/data'
import { AgentAvatar, UserAvatar } from '../../components/agents/AgentAvatar'
import { ActivityList } from '../../components/chat/Activity'
import { Button } from '../../components/ui/Button'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { Drawer } from '../../components/ui/Modal'
import { Markdown } from '../../components/ui/Markdown'
import { toast } from '../../components/ui/Toast'
import { COLUMNS } from './Board'

const PRIORITIES: { id: Priority; label: string; color: string }[] = [
  { id: 'high', label: 'High', color: '#f87171' },
  { id: 'medium', label: 'Medium', color: '#fbbf24' },
  { id: 'low', label: 'Low', color: '#94a3b8' },
]

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-faint uppercase">{children}</div>
}

function TaskBody({ task }: { task: Task }) {
  const navigate = useNavigate()
  const agents = useAgents()
  const roles = useRoles()
  const projects = useProjects()
  const settings = useSettings((s) => s.settings)
  const live = useLive((s) => s.messages[taskLiveKey(task.id)])
  const running = useLive((s) => !!s.running[taskLiveKey(task.id)])
  const [newItem, setNewItem] = useState('')
  const [feedback, setFeedback] = useState('')
  const save = (patch: Partial<Task>) => void updateTask(task.id, patch)
  const [title, setTitle] = useDraftField(task.title, (v) => save({ title: v.trim() || task.title }))
  const [description, setDescription] = useDraftField(task.description ?? '', (v) => save({ description: v.trim() || undefined }))
  const agent = task.assigneeId && task.assigneeId !== 'me' ? agents.find((a) => a.id === task.assigneeId) : undefined
  const team = agents.filter((a) => a.status === 'active')
  const firstName = settings.userName.split(' ')[0]
  const output = running ? (live?.text ?? '') : task.output

  const run = async (agentId?: string) => {
    try {
      await runTaskWithAgent(task.id, agentId)
      toast.success('Work ready for review', task.title)
    } catch (err) {
      toast.error('The agent couldn’t finish', errorMessage(err))
    }
  }

  const addItem = () => {
    if (!newItem.trim()) return
    save({ checklist: [...task.checklist, { id: uid(), text: newItem.trim(), done: false }] })
    setNewItem('')
  }

  return (
    <div className="space-y-7 pb-4">
      <textarea
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        rows={2}
        aria-label="Task"
        className="w-full resize-none rounded-lg bg-transparent font-display text-2xl leading-tight font-semibold tracking-tight outline-none focus:bg-white/[0.03]"
      />

      <div>
        <Label>Status</Label>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {COLUMNS.map((c) => (
            <button
              key={c.id}
              onClick={() => save({ status: c.id as TaskStatus })}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-[12.5px] font-medium transition',
                task.status === c.id ? 'border-transparent bg-white text-ink-950' : 'border-white/[0.08] text-soft hover:border-white/[0.16]',
              )}
            >
              <span className="size-1.5 rounded-full" style={{ background: c.color }} />
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label>Due</Label>
          <Input type="date" value={task.dueDate ?? ''} onChange={(e) => save({ dueDate: e.target.value || undefined })} />
        </div>
        <div>
          <Label>Priority</Label>
          <div className="flex gap-1.5">
            {PRIORITIES.map((p) => (
              <button
                key={p.id}
                onClick={() => save({ priority: p.id })}
                className={cn(
                  'flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border text-[12.5px] transition',
                  task.priority === p.id ? 'border-white/30 bg-white/[0.08] text-fg' : 'border-white/[0.08] text-muted hover:text-fg',
                )}
              >
                <span className="size-2 rounded-full" style={{ background: p.color }} />
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <Label>Who’s doing it</Label>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => save({ assigneeId: 'me' })}
            className={cn(
              'flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-[12.5px] transition',
              !agent ? 'border-transparent bg-white/[0.1] text-fg' : 'border-white/[0.08] text-muted hover:text-fg',
            )}
          >
            <UserAvatar name={settings.userName} size={24} /> {firstName || 'Me'}
          </button>
          {team.map((a) => (
            <button
              key={a.id}
              onClick={() => save({ assigneeId: a.id })}
              title={roles.find((r) => r.id === a.roleId)?.name}
              className={cn(
                'flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-[12.5px] transition',
                agent?.id === a.id ? 'border-transparent bg-white/[0.1] text-fg' : 'border-white/[0.08] text-muted hover:text-fg',
              )}
              style={agent?.id === a.id ? { boxShadow: `inset 0 0 0 1.5px ${a.color}` } : undefined}
            >
              <AgentAvatar agent={a} size="xs" /> {a.name}
            </button>
          ))}
        </div>
      </div>

      {/* Agent work */}
      <div className="rounded-3xl border border-white/[0.08] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--accent)_10%,transparent),transparent_60%)] p-5">
        {!agent ? (
          <div className="flex flex-wrap items-center gap-3">
            <Sparkles className="size-5 text-[var(--accent)]" />
            <p className="flex-1 text-[13.5px] text-soft">Want someone to do this for you? Pick an agent above and they’ll get straight to work.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <AgentAvatar agent={agent} size="md" active={running} />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold">{running ? `${agent.name} is working on it…` : output ? `${agent.name}’s work` : `Hand it to ${agent.name}`}</div>
                <div className="text-[12.5px] text-muted">
                  {running
                    ? 'You can close this and carry on; it’ll be here when it’s done.'
                    : output
                      ? 'Review it, ask for changes or mark it done.'
                      : 'They’ll do the work and put it here for you to review.'}
                </div>
              </div>
              {running ? (
                <Button size="sm" variant="secondary" icon={<CircleStop />} onClick={() => stopTask(task.id)}>
                  Stop
                </Button>
              ) : (
                !output && (
                  <Button size="sm" variant="primary" icon={<Wand2 />} onClick={() => void run()}>
                    Do it
                  </Button>
                )
              )}
            </div>
            {running && live?.activities && live.activities.length > 0 && (
              <div className="mt-4">
                <ActivityList items={live.activities} agents={agents} />
              </div>
            )}
            {output && (
              <div className="mt-4 max-h-[420px] overflow-y-auto rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                <Markdown className={cn('text-[13.5px]', running && 'caret-live')}>{output}</Markdown>
              </div>
            )}
            {output && !running && (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" icon={<Check />} disabled={task.status === 'done'} onClick={() => save({ status: 'done' })}>
                    {task.status === 'done' ? 'Done' : 'Looks good, mark done'}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Copy />}
                    onClick={async () => {
                      await copyText(output)
                      toast.success('Copied')
                    }}
                  >
                    Copy
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Brain />}
                    onClick={async () => {
                      const r = await saveNewNote(`${settings.brain.writeFolder}/Tasks`, task.title, `${output}\n\n---\n_Done by ${agent.name} for ${firstName}._`)
                      toast.success('Saved to your brain', r.path)
                    }}
                  >
                    Save to brain
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Input value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder={`Ask ${agent.name} for changes…`} className="h-9" />
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!feedback.trim()}
                    onClick={async () => {
                      const note = `Feedback on the last draft: ${feedback.trim()}\n\nPrevious draft:\n${output}`
                      await db.tasks.update(task.id, { description: [task.description, note].filter(Boolean).join('\n\n') })
                      setFeedback('')
                      void run(agent.id)
                    }}
                  >
                    Redo
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div>
        <Label>Notes</Label>
        <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Background, links or anything the person doing it should know" />
      </div>

      <div>
        <Label>Checklist</Label>
        <div className="space-y-1.5">
          {task.checklist.map((c) => (
            <div key={c.id} className="group flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-white/[0.03]">
              <button
                onClick={() => save({ checklist: task.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)) })}
                className={cn(
                  'grid size-5 shrink-0 place-items-center rounded-md border transition',
                  c.done ? 'border-transparent bg-[var(--accent)] text-white' : 'border-white/25 hover:border-white/50',
                )}
                aria-label={c.done ? 'Mark not done' : 'Mark done'}
              >
                {c.done && <Check className="size-3" strokeWidth={3} />}
              </button>
              <span className={cn('flex-1 text-[13.5px]', c.done ? 'text-muted line-through' : 'text-soft')}>{c.text}</span>
              <button
                onClick={() => save({ checklist: task.checklist.filter((x) => x.id !== c.id) })}
                className="text-faint opacity-0 group-hover:opacity-100 hover:text-fg"
                aria-label="Remove"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <Input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addItem()
                }
              }}
              placeholder="Add a step"
              className="h-9"
            />
            <Button size="sm" variant="secondary" icon={<Plus />} onClick={addItem} aria-label="Add step" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <Label>Project</Label>
          <Select value={task.projectId ?? ''} onChange={(e) => save({ projectId: e.target.value || undefined })}>
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.client ? `${p.client} · ${p.name}` : p.name}
              </option>
            ))}
          </Select>
        </div>
        {task.projectId && (
          <Button variant="ghost" icon={<FolderKanban />} onClick={() => navigate(`/projects/${task.projectId}`)}>
            Open project
          </Button>
        )}
      </div>
      {task.source && <p className="text-[12px] text-faint">Added from {task.source}</p>}
    </div>
  )
}

export function TaskDrawer({ taskId, onClose }: { taskId?: string; onClose: () => void }) {
  const task = useLiveQuery(() => (taskId ? db.tasks.get(taskId) : undefined), [taskId])
  return (
    <Drawer
      open={!!taskId && !!task}
      onClose={onClose}
      width="max-w-2xl"
      title="Task"
      footer={
        task && (
          <Button
            variant="ghost"
            icon={<Trash2 />}
            className="mr-auto text-bad hover:text-bad"
            onClick={async () => {
              if (!window.confirm('Delete this task?')) return
              stopTask(task.id)
              await db.tasks.delete(task.id)
              onClose()
            }}
          >
            Delete task
          </Button>
        )
      }
    >
      {task && <TaskBody key={task.id} task={task} />}
    </Drawer>
  )
}
