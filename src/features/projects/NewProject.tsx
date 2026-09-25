import { useState } from 'react'
import { ArrowLeft, Check, FolderPlus, Plus, Wand2, X } from 'lucide-react'
import { createProjectFromDraft, draftProject, type ProjectDraft } from '../../lib/projects'
import type { Priority, Project } from '../../lib/types'
import { cn, errorMessage } from '../../lib/utils'
import { useSettings } from '../../stores/settings'
import { useAgents, useLead } from '../../hooks/data'
import { AgentAvatar } from '../../components/agents/AgentAvatar'
import { Button } from '../../components/ui/Button'
import { Field, Input, Select, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { toast } from '../../components/ui/Toast'

const IDEAS = [
  'Launch a sustainable trainer brand in the UK this spring, aiming for national press and 50 creator posts',
  'Pitch for a hotel group’s PR account next month. We need a winning strategy and deck',
  'Our own agency awards entries for the PR Week awards, due in six weeks',
]

const EMPTY: ProjectDraft = { name: '', client: '', emoji: '📁', description: '', goals: [], dueInDays: 30, squad: [], tasks: [] }

export function NewProjectModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (p: Project) => void }) {
  const agents = useAgents()
  const lead = useLead()
  const firstName = useSettings((s) => s.settings.userName.split(' ')[0] || 'Me')
  const [idea, setIdea] = useState('')
  const [draft, setDraft] = useState<ProjectDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [goalInput, setGoalInput] = useState('')
  const team = agents.filter((a) => a.status === 'active')
  const set = (patch: Partial<ProjectDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d))

  const write = async () => {
    setBusy(true)
    try {
      const d = await draftProject(idea)
      setDraft(d)
      if (d.demo) toast.info('Drafted a starter project', 'Connect an AI in Settings for a plan tailored to your brief.')
    } catch (err) {
      toast.error('Couldn’t set that up', errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const create = async () => {
    if (!draft?.name.trim()) return
    setCreating(true)
    try {
      const p = await createProjectFromDraft(draft)
      toast.success(`${p.name} is set up`, `${draft.tasks.length} tasks on the board.`)
      onCreated(p)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size={draft ? 'lg' : 'md'}
      icon={<FolderPlus />}
      title={draft ? 'Check it over' : 'Start a project'}
      subtitle={draft ? 'Change anything you like, then create it.' : `Describe it in your own words and ${lead?.name ?? 'your lead'} will set it up.`}
      footer={
        draft && (
          <>
            <Button variant="ghost" icon={<ArrowLeft />} onClick={() => setDraft(null)} className="mr-auto">
              Back
            </Button>
            <Button variant="primary" icon={<Check />} loading={creating} disabled={!draft.name.trim()} onClick={() => void create()}>
              Create project
            </Button>
          </>
        )
      }
    >
      {!draft ? (
        <div className="space-y-5 py-1">
          <Textarea
            autoFocus
            rows={4}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="e.g. Autumn product launch for Northwind Coffee. We want national food press and 2,000 pre-orders by mid October."
            className="text-[15px]"
          />
          <div className="flex flex-wrap gap-2">
            {IDEAS.map((i) => (
              <button
                key={i}
                onClick={() => setIdea(i)}
                className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-left text-[12.5px] text-soft transition hover:border-white/[0.16] hover:text-fg"
              >
                {i}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg" icon={<Wand2 />} loading={busy} disabled={!idea.trim()} onClick={() => void write()}>
              {busy ? 'Setting it up…' : 'Set it up for me'}
            </Button>
            <Button variant="ghost" onClick={() => setDraft({ ...EMPTY, name: idea.trim().slice(0, 60) })}>
              I’ll fill it in myself
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-[72px_1fr_1fr]">
            <Field label="Icon">
              <Input value={draft.emoji} onChange={(e) => set({ emoji: e.target.value.slice(0, 4) })} className="text-center text-lg" />
            </Field>
            <Field label="Project name">
              <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Autumn Blend launch" />
            </Field>
            <Field label="Client">
              <Input value={draft.client} onChange={(e) => set({ client: e.target.value })} placeholder="Optional" />
            </Field>
          </div>
          <Field label="What it’s about">
            <Textarea rows={2} value={draft.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Goals">
              <div className="space-y-1.5">
                {draft.goals.map((g, i) => (
                  <div key={i} className="group flex items-start gap-2 rounded-xl bg-white/[0.03] px-3 py-2 text-[13px] text-soft">
                    <span className="flex-1">{g}</span>
                    <button
                      onClick={() => set({ goals: draft.goals.filter((_, j) => j !== i) })}
                      className="text-faint opacity-0 group-hover:opacity-100 hover:text-fg"
                      aria-label="Remove goal"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input
                    value={goalInput}
                    onChange={(e) => setGoalInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && goalInput.trim()) {
                        set({ goals: [...draft.goals, goalInput.trim()] })
                        setGoalInput('')
                      }
                    }}
                    placeholder="Add a goal"
                    className="h-9"
                  />
                </div>
              </div>
            </Field>
            <div className="space-y-5">
              <Field label="Deadline">
                <Select value={String(draft.dueInDays)} onChange={(e) => set({ dueInDays: Number(e.target.value) })}>
                  {[7, 14, 21, 30, 42, 60, 90, 120, 180].map((d) => (
                    <option key={d} value={d}>
                      {d < 30 ? `${d / 7} week${d === 7 ? '' : 's'}` : d < 90 ? `About ${Math.round(d / 30)} month${d < 45 ? '' : 's'}` : `${Math.round(d / 30)} months`}
                    </option>
                  ))}
                  {![7, 14, 21, 30, 42, 60, 90, 120, 180].includes(draft.dueInDays) && <option value={draft.dueInDays}>{draft.dueInDays} days</option>}
                </Select>
              </Field>
              <Field label="Squad">
                <div className="flex flex-wrap gap-1.5">
                  {team.map((a) => {
                    const on = draft.squad.some((n) => n.toLowerCase() === a.name.toLowerCase())
                    return (
                      <button
                        key={a.id}
                        onClick={() => set({ squad: on ? draft.squad.filter((n) => n.toLowerCase() !== a.name.toLowerCase()) : [...draft.squad, a.name] })}
                        className={cn(
                          'flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-0.5 text-[12px] transition',
                          on ? 'border-transparent bg-white/[0.1] text-fg' : 'border-white/[0.08] text-muted hover:text-fg',
                        )}
                        style={on ? { boxShadow: `inset 0 0 0 1.5px ${a.color}` } : undefined}
                      >
                        <AgentAvatar agent={a} size="xs" /> {a.name}
                      </button>
                    )
                  })}
                </div>
              </Field>
            </div>
          </div>
          <Field label={`First tasks · ${draft.tasks.length}`}>
            <div className="divide-y divide-white/[0.05] overflow-hidden rounded-2xl border border-white/[0.07]">
              {draft.tasks.map((t, i) => (
                <div key={i} className="group grid items-center gap-2 px-3 py-2 sm:grid-cols-[1fr_130px_112px_24px]">
                  <input
                    value={t.title}
                    onChange={(e) => set({ tasks: draft.tasks.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })}
                    className="min-w-0 rounded-lg bg-transparent px-1 py-1 text-[13px] outline-none focus:bg-white/[0.04]"
                  />
                  <Select
                    value={t.owner}
                    onChange={(e) => set({ tasks: draft.tasks.map((x, j) => (j === i ? { ...x, owner: e.target.value } : x)) })}
                    className="h-8 py-0 text-[12.5px]"
                  >
                    <option value={firstName}>{firstName}</option>
                    {team.map((a) => (
                      <option key={a.id} value={a.name}>
                        {a.name}
                      </option>
                    ))}
                    {![firstName, ...team.map((a) => a.name)].includes(t.owner) && <option value={t.owner}>{t.owner}</option>}
                  </Select>
                  <Select
                    value={t.priority}
                    onChange={(e) => set({ tasks: draft.tasks.map((x, j) => (j === i ? { ...x, priority: e.target.value as Priority } : x)) })}
                    className="h-8 py-0 text-[12.5px]"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </Select>
                  <button
                    onClick={() => set({ tasks: draft.tasks.filter((_, j) => j !== i) })}
                    className="text-faint opacity-60 hover:text-fg group-hover:opacity-100"
                    aria-label="Remove task"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => set({ tasks: [...draft.tasks, { title: 'New task', owner: firstName, dueInDays: 7, priority: 'medium' }] })}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-[13px] text-muted transition hover:bg-white/[0.03] hover:text-fg"
              >
                <Plus className="size-4" /> Add a task
              </button>
            </div>
          </Field>
        </div>
      )}
    </Modal>
  )
}
