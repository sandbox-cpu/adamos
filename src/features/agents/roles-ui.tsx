import { useMemo, useState } from 'react'
import { Check, ChevronDown, Pencil, Plus, Search, Sparkles, Trash2, UserPlus, Wand2 } from 'lucide-react'
import { ROLE_CATEGORIES } from '../../lib/agents/roles'
import { AGENT_COLORS } from '../../lib/agents/defaults'
import { deleteCustomRole, draftRole, saveCustomRole, TOOL_INFO, TOOL_ORDER, type RoleDraft } from '../../lib/agents/manage'
import type { Agent, AgentTool, Role, RoleCategory } from '../../lib/types'
import { cn, errorMessage, hexToRgba, mixHex } from '../../lib/utils'
import { Icon, ICON_NAMES } from '../../components/ui/Icon'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/bits'
import { Field, Input, Select, Textarea, Toggle } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { toast } from '../../components/ui/Toast'
import { AvatarStack } from '../../components/agents/AgentAvatar'

/* ------------------------------------------------------------------ */
/*  Role icon                                                          */
/* ------------------------------------------------------------------ */

export function RoleIcon({ role, size = 40, className }: { role: Pick<Role, 'icon' | 'color'>; size?: number; className?: string }) {
  return (
    <div
      className={cn('grid shrink-0 place-items-center rounded-[32%]', className)}
      style={{
        width: size,
        height: size,
        color: mixHex(role.color, '#ffffff', 0.35),
        background: `linear-gradient(145deg, ${hexToRgba(role.color, 0.32)}, ${hexToRgba(role.color, 0.08)})`,
        boxShadow: `inset 0 0 0 1px ${hexToRgba(role.color, 0.38)}, 0 8px 24px -12px ${role.color}`,
      }}
    >
      <Icon name={role.icon} style={{ width: size * 0.46, height: size * 0.46 }} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Search and filter                                                  */
/* ------------------------------------------------------------------ */

type CategoryFilter = RoleCategory | 'All' | 'Yours'

export function useRoleFilter(roles: Role[]) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('All')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return roles.filter((r) => {
      if (category === 'Yours' && !r.custom) return false
      if (category !== 'All' && category !== 'Yours' && r.category !== category) return false
      if (!q) return true
      return [r.name, r.tagline, r.description, r.category, ...r.skills].join(' ').toLowerCase().includes(q)
    })
  }, [roles, query, category])
  const categories: CategoryFilter[] = ['All', ...ROLE_CATEGORIES.filter((c) => roles.some((r) => r.category === c)), ...(roles.some((r) => r.custom) ? (['Yours'] as const) : [])]
  return { query, setQuery, category, setCategory, filtered, categories }
}

export function RoleFilterBar({ filter, className }: { filter: ReturnType<typeof useRoleFilter>; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3 md:flex-row md:items-center', className)}>
      <Input icon={<Search />} placeholder="Search roles or skills…" value={filter.query} onChange={(e) => filter.setQuery(e.target.value)} className="md:w-72" />
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {filter.categories.map((c) => (
          <button
            key={c}
            onClick={() => filter.setCategory(c)}
            className={cn(
              'h-8 shrink-0 rounded-full border px-3.5 text-[12.5px] font-medium transition',
              filter.category === c ? 'border-transparent bg-white text-ink-950' : 'border-white/[0.08] bg-white/[0.03] text-muted hover:text-fg',
            )}
          >
            {c === 'Yours' ? 'Your roles' : c}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Role tiles                                                         */
/* ------------------------------------------------------------------ */

export function RoleTile({ role, holders = [], selected, onClick, compact }: { role: Role; holders?: Agent[]; selected?: boolean; onClick: () => void; compact?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative flex flex-col gap-3 overflow-hidden rounded-2xl border p-4 text-left transition',
        selected ? 'border-transparent bg-white/[0.07]' : 'border-white/[0.07] bg-white/[0.025] hover:-translate-y-0.5 hover:border-white/[0.14] hover:bg-white/[0.045]',
      )}
      style={selected ? { boxShadow: `inset 0 0 0 1.5px ${role.color}, 0 12px 40px -20px ${role.color}` } : undefined}
    >
      <div
        className="pointer-events-none absolute -top-12 -right-10 size-32 rounded-full opacity-0 blur-2xl transition group-hover:opacity-40"
        style={{ background: role.color }}
      />
      <div className="flex items-start gap-3">
        <RoleIcon role={role} size={compact ? 36 : 42} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[14px] font-semibold text-fg">{role.name}</h3>
            {role.lead && <Badge tone="warn">Lead</Badge>}
            {role.custom && <Badge tone="accent">Yours</Badge>}
          </div>
          <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-muted">{role.tagline}</p>
        </div>
        {selected && (
          <span className="grid size-6 shrink-0 place-items-center rounded-full text-ink-950" style={{ background: role.color }}>
            <Check className="size-3.5" strokeWidth={3} />
          </span>
        )}
      </div>
      {!compact && (
        <div className="flex items-end justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {role.skills.slice(0, 3).map((s) => (
              <span key={s} className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px] text-soft">
                {s}
              </span>
            ))}
          </div>
          {holders.length > 0 && <AvatarStack agents={holders} size="xs" max={3} />}
        </div>
      )}
    </button>
  )
}

export function RoleGrid({
  roles,
  agents,
  selectedId,
  onSelect,
  compact,
  leading,
}: {
  roles: Role[]
  agents: Agent[]
  selectedId?: string
  onSelect: (role: Role) => void
  compact?: boolean
  leading?: React.ReactNode
}) {
  return (
    <div className={cn('grid gap-3', compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4')}>
      {leading}
      {roles.map((r) => (
        <RoleTile key={r.id} role={r} compact={compact} holders={agents.filter((a) => a.roleId === r.id)} selected={selectedId === r.id} onClick={() => onSelect(r)} />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Pick a role (used when hiring and when changing someone's role)    */
/* ------------------------------------------------------------------ */

export function RolePickerModal({
  open,
  onClose,
  roles,
  agents,
  title,
  subtitle,
  initialId,
  confirmLabel,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  roles: Role[]
  agents: Agent[]
  title: string
  subtitle?: string
  initialId?: string
  confirmLabel: string
  onConfirm: (role: Role) => void | Promise<void>
}) {
  const filter = useRoleFilter(roles)
  const [picked, setPicked] = useState<string | undefined>(initialId)
  const role = roles.find((r) => r.id === picked)
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={title}
      subtitle={subtitle}
      icon={<Sparkles />}
      footer={
        <>
          {role && <span className="mr-auto hidden text-sm text-muted sm:block">{role.description}</span>}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!role || role.id === initialId} onClick={() => role && void onConfirm(role)}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <RoleFilterBar filter={filter} className="mb-4" />
      <RoleGrid roles={filter.filtered} agents={agents} selectedId={picked} onSelect={(r) => setPicked(r.id)} compact />
      {filter.filtered.length === 0 && <p className="py-10 text-center text-sm text-muted">No roles match “{filter.query}”.</p>}
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/*  Role details                                                       */
/* ------------------------------------------------------------------ */

export function RoleDetailModal({
  role,
  agents,
  onClose,
  onHire,
  onAssign,
  onEdit,
}: {
  role?: Role
  agents: Agent[]
  onClose: () => void
  onHire: (role: Role) => void
  onAssign: (role: Role) => void
  onEdit: (role: Role) => void
}) {
  const [showBrief, setShowBrief] = useState(false)
  const holders = role ? agents.filter((a) => a.roleId === role.id) : []
  const remove = async () => {
    if (!role) return
    if (!window.confirm(`Delete the “${role.name}” role?${holders.length ? ` ${holders.map((h) => h.name).join(', ')} will become Research Analysts.` : ''}`)) return
    await deleteCustomRole(role.id)
    toast.info('Role deleted')
    onClose()
  }
  return (
    <Modal
      open={!!role}
      onClose={onClose}
      size="lg"
      footer={
        role && (
          <>
            {role.custom && (
              <>
                <Button variant="ghost" icon={<Trash2 />} onClick={() => void remove()} className="text-bad hover:text-bad">
                  Delete
                </Button>
                <Button variant="ghost" icon={<Pencil />} onClick={() => onEdit(role)} className="mr-auto">
                  Edit
                </Button>
              </>
            )}
            <Button variant="secondary" onClick={() => onAssign(role)}>
              Give this role to…
            </Button>
            <Button variant="primary" icon={<UserPlus />} onClick={() => onHire(role)}>
              Hire for this role
            </Button>
          </>
        )
      }
    >
      {role && (
        <div className="space-y-6">
          <div className="flex items-start gap-4">
            <RoleIcon role={role} size={64} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-2xl font-semibold tracking-tight">{role.name}</h2>
                <Badge>{role.category}</Badge>
                {role.custom && <Badge tone="accent">Your role</Badge>}
              </div>
              <p className="mt-1 text-[15px] text-soft">{role.tagline}</p>
            </div>
          </div>
          <p className="text-[14.5px] leading-relaxed text-soft">{role.description}</p>
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <h4 className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-faint uppercase">Strengths</h4>
              <div className="flex flex-wrap gap-1.5">
                {role.skills.map((s) => (
                  <span key={s} className="rounded-full px-2.5 py-1 text-[12.5px]" style={{ background: hexToRgba(role.color, 0.12), color: mixHex(role.color, '#ffffff', 0.45) }}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <h4 className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-faint uppercase">Can</h4>
              <ul className="space-y-1 text-[13px] text-soft">
                {TOOL_ORDER.filter((t) => role.tools.includes(t)).map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <Check className="size-3.5 text-good" /> {TOOL_INFO[t].label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div>
            <h4 className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-faint uppercase">Things to ask</h4>
            <div className="grid gap-2 sm:grid-cols-2">
              {role.starters.map((s) => (
                <div key={s} className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-3.5 py-2.5 text-[13px] text-soft">
                  “{s.trim().replace(/[:\s]+$/, '…')}”
                </div>
              ))}
            </div>
          </div>
          {holders.length > 0 && (
            <div className="flex items-center gap-3 rounded-2xl bg-white/[0.03] px-4 py-3">
              <AvatarStack agents={holders} size="sm" />
              <span className="text-sm text-soft">
                {holders.map((h) => h.name).join(', ')} {holders.length === 1 ? 'has' : 'have'} this role
              </span>
            </div>
          )}
          <div>
            <button onClick={() => setShowBrief((v) => !v)} className="flex items-center gap-1.5 text-[13px] text-muted hover:text-fg">
              <ChevronDown className={cn('size-4 transition', showBrief && 'rotate-180')} />
              {showBrief ? 'Hide' : 'Read'} their full brief
            </button>
            {showBrief && (
              <div className="mt-3 rounded-2xl border border-white/[0.06] bg-black/20 p-4 text-[13px] leading-relaxed whitespace-pre-wrap text-soft">{role.prompt}</div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/*  Role designer                                                      */
/* ------------------------------------------------------------------ */

const IDEAS = [
  'Awards entry specialist',
  'Sustainability and ESG comms advisor',
  'Podcast booking producer',
  'Travel and hospitality PR expert',
  'B2B tech trade press specialist',
  'Charity and fundraising comms lead',
]

const EMPTY: RoleDraft = {
  name: '',
  category: 'Specialist',
  tagline: '',
  description: '',
  prompt: '',
  skills: [],
  starters: [],
  icon: 'Sparkles',
  tools: ['brain', 'web', 'projects'],
  color: '#a78bfa',
}

export function RoleDesignerModal({ open, onClose, editing, onSaved }: { open: boolean; onClose: () => void; editing?: Role; onSaved?: (role: Role) => void }) {
  const [idea, setIdea] = useState('')
  const [draft, setDraft] = useState<RoleDraft | null>(editing ? { ...EMPTY, ...editing } : null)
  const [busy, setBusy] = useState(false)
  const [skillInput, setSkillInput] = useState('')
  const [starterInput, setStarterInput] = useState('')

  const set = (patch: Partial<RoleDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d))

  const write = async (text = idea) => {
    if (!text.trim()) return
    setBusy(true)
    try {
      const d = await draftRole(text)
      setDraft(d)
      if (d.demo) toast.info('Drafted a starter role', 'Connect an AI in Settings for a fully written brief.')
    } catch (err) {
      toast.error('Couldn’t write that role', errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!draft || !draft.name.trim()) return
    const saved = await saveCustomRole({ ...draft, id: editing?.id, name: draft.name.trim() })
    toast.success(editing ? 'Role updated' : `${saved.name} added to your role bank`)
    onSaved?.(saved)
    onClose()
  }

  const toggleTool = (t: AgentTool, on: boolean) => set({ tools: on ? [...new Set([...(draft?.tools ?? []), t])] : (draft?.tools ?? []).filter((x) => x !== t) })

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      icon={<Wand2 />}
      title={editing ? `Edit ${editing.name}` : 'Create a role'}
      subtitle={editing ? 'Changes apply to everyone with this role.' : 'Describe the specialist you need and we’ll write their brief.'}
      footer={
        draft && (
          <>
            {!editing && (
              <Button variant="ghost" onClick={() => setDraft(null)} className="mr-auto">
                Start again
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!draft.name.trim()} onClick={() => void save()} icon={<Check />}>
              {editing ? 'Save role' : 'Add to role bank'}
            </Button>
          </>
        )
      }
    >
      {!draft ? (
        <div className="space-y-5 py-2">
          <div className="relative">
            <Textarea
              autoFocus
              rows={3}
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void write()
                }
              }}
              placeholder="e.g. Someone who writes award entries and knows what judges look for"
              className="pr-4 text-[15px]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {IDEAS.map((i) => (
              <button
                key={i}
                onClick={() => setIdea(i)}
                className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[12.5px] text-soft transition hover:border-white/[0.16] hover:text-fg"
              >
                {i}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg" icon={<Wand2 />} loading={busy} disabled={!idea.trim()} onClick={() => void write()}>
              {busy ? 'Writing their brief…' : 'Write it for me'}
            </Button>
            <Button variant="ghost" onClick={() => setDraft({ ...EMPTY })}>
              Or fill it in myself
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-start gap-4">
            <RoleIcon role={draft} size={60} />
            <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_180px]">
              <Field label="Role name">
                <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Awards Specialist" />
              </Field>
              <Field label="Group">
                <Select value={draft.category} onChange={(e) => set({ category: e.target.value as RoleCategory })}>
                  {ROLE_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
          <Field label="One-line summary">
            <Input value={draft.tagline} onChange={(e) => set({ tagline: e.target.value })} placeholder="What they’re brilliant at, in a few words" />
          </Field>
          <Field label="What they do for you">
            <Textarea rows={2} value={draft.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>
          <Field label="How they work" hint="This is the brief the agent follows. Write it like you’d brief a new hire.">
            <Textarea rows={8} value={draft.prompt} onChange={(e) => set({ prompt: e.target.value })} className="text-[13px] leading-relaxed" />
          </Field>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Look">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {AGENT_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => set({ color: c })}
                      aria-label={`Colour ${c}`}
                      className={cn('size-6 rounded-full transition', draft.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-ink-900' : 'hover:scale-110')}
                      style={{ background: c }}
                    />
                  ))}
                </div>
                <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
                  {ICON_NAMES.map((n) => (
                    <button
                      key={n}
                      onClick={() => set({ icon: n })}
                      aria-label={n}
                      className={cn(
                        'grid size-8 place-items-center rounded-lg transition [&_svg]:size-4',
                        draft.icon === n ? 'bg-white text-ink-950' : 'text-muted hover:bg-white/[0.07] hover:text-fg',
                      )}
                    >
                      <Icon name={n} />
                    </button>
                  ))}
                </div>
              </div>
            </Field>
            <Field label="What they can do">
              <div className="space-y-1">
                {TOOL_ORDER.filter((t) => t !== 'delegate').map((t) => (
                  <Toggle key={t} checked={draft.tools.includes(t)} onChange={(v) => toggleTool(t, v)} label={TOOL_INFO[t].label} />
                ))}
              </div>
            </Field>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Strengths">
              <ChipEditor items={draft.skills} onChange={(skills) => set({ skills })} input={skillInput} setInput={setSkillInput} placeholder="Add a strength" />
            </Field>
            <Field label="Things you might ask them">
              <ChipEditor items={draft.starters} onChange={(starters) => set({ starters })} input={starterInput} setInput={setStarterInput} placeholder="Add a question" stacked />
            </Field>
          </div>
        </div>
      )}
    </Modal>
  )
}

function ChipEditor({
  items,
  onChange,
  input,
  setInput,
  placeholder,
  stacked,
}: {
  items: string[]
  onChange: (v: string[]) => void
  input: string
  setInput: (v: string) => void
  placeholder: string
  stacked?: boolean
}) {
  const add = () => {
    const v = input.trim()
    if (!v) return
    onChange([...items, v])
    setInput('')
  }
  return (
    <div className="space-y-2">
      <div className={cn('flex gap-1.5', stacked ? 'flex-col' : 'flex-wrap')}>
        {items.map((s, i) => (
          <span key={`${s}-${i}`} className="group flex items-center justify-between gap-1.5 rounded-xl bg-white/[0.05] py-1 pr-1 pl-2.5 text-[12.5px] text-soft">
            <span className={stacked ? 'line-clamp-2' : ''}>{s}</span>
            <button
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              aria-label={`Remove ${s}`}
              className="grid size-5 shrink-0 place-items-center rounded-md text-faint hover:bg-white/[0.08] hover:text-fg"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder={placeholder}
          className="h-9"
        />
        <Button size="sm" variant="secondary" onClick={add} icon={<Plus />} aria-label="Add" />
      </div>
    </div>
  )
}

export function CreateRoleTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group relative flex min-h-[132px] flex-col items-start justify-between gap-3 overflow-hidden rounded-2xl border border-dashed border-white/[0.14] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--accent)_10%,transparent),transparent_60%)] p-4 text-left transition hover:-translate-y-0.5 hover:border-[color-mix(in_oklab,var(--accent)_55%,transparent)]"
    >
      <div className="grid size-[42px] place-items-center rounded-[32%] bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] text-white shadow-[0_10px_30px_-10px_var(--accent)]">
        <Wand2 className="size-5" />
      </div>
      <div>
        <h3 className="text-[14px] font-semibold">Create your own role</h3>
        <p className="mt-0.5 text-[12.5px] text-muted">Describe a specialist in a sentence and we’ll write their brief.</p>
      </div>
    </button>
  )
}
