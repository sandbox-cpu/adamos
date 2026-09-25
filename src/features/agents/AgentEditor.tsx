import { useEffect, useRef, useState } from 'react'
import { useDraftField } from '../../hooks/useDraftField'
import { useNavigate } from 'react-router-dom'
import { Brain, Check, Copy, Crown, MessageSquare, Plus, Repeat2, Sparkles, Trash2, X } from 'lucide-react'
import { AGENT_COLORS } from '../../lib/agents/defaults'
import { changeRole, duplicateAgent, removeAgent, setDuty, setLead, TOOL_INFO, TOOL_ORDER, updateAgent } from '../../lib/agents/manage'
import { getProvider, modelLabel } from '../../lib/llm/providers'
import type { Agent, AgentTool, Personality, Role } from '../../lib/types'
import { cn, hexToRgba } from '../../lib/utils'
import { useSettings } from '../../stores/settings'
import { useAgents, useProfiles, useRoles } from '../../hooks/data'
import { AgentAvatar } from '../../components/agents/AgentAvatar'
import { Button } from '../../components/ui/Button'
import { Badge, Menu } from '../../components/ui/bits'
import { Input, Slider, Textarea, Toggle } from '../../components/ui/Field'
import { Drawer } from '../../components/ui/Modal'
import { toast } from '../../components/ui/Toast'
import { ServiceMark } from '../../components/ui/ProviderMark'
import { RoleIcon, RolePickerModal } from './roles-ui'

/** Plain-English preview of how the personality sliders will sound. */
export function personalityPreview(name: string, p: Personality): string {
  const tone = p.formality < 35 ? 'relaxed and chatty' : p.formality > 65 ? 'polished and formal' : 'professional but friendly'
  const detail = p.detail < 35 ? 'gets straight to the point' : p.detail > 65 ? 'goes into real depth' : 'balances detail with brevity'
  const bold = p.boldness < 35 ? 'plays it safe and flags risks early' : p.boldness > 65 ? 'pushes bold, ambitious ideas' : 'weighs ambition against caution'
  return `${name} sounds ${tone}, ${detail} and ${bold}.`
}

const INSTRUCTION_IDEAS = [
  'Keep answers short and skimmable.',
  'Always finish with clear next steps.',
  'Write in a warm, human tone. No corporate jargon.',
  'Ask me before assuming budgets or dates.',
  'Challenge my thinking if you disagree.',
  'Suggest a headline or hook first.',
]

const PERSONALITY: { key: keyof Personality; label: string; left: string; right: string }[] = [
  { key: 'formality', label: 'Tone', left: 'Relaxed', right: 'Formal' },
  { key: 'detail', label: 'Detail', left: 'Brief', right: 'Thorough' },
  { key: 'boldness', label: 'Ideas', left: 'Cautious', right: 'Bold' },
]

function Section({ title, hint, children, action }: { title: string; hint?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-[11px] font-semibold tracking-[0.14em] text-faint uppercase">{title}</h3>
          {hint && <p className="mt-1 text-[12.5px] text-muted">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function EditorBody({ agent, role, roles }: { agent: Agent; role: Role; roles: Role[] }) {
  const navigate = useNavigate()
  const agents = useAgents()
  const profiles = useProfiles()
  const settings = useSettings((s) => s.settings)
  const [picking, setPicking] = useState(false)
  const [memoryInput, setMemoryInput] = useState('')
  const [personality, setPersonality] = useState(agent.personality)
  const save = (patch: Partial<Agent>) => void updateAgent(agent.id, patch)

  const [name, setName] = useDraftField(agent.name, (v) => save({ name: v.trim() || agent.name }))
  const [title, setTitle] = useDraftField(agent.title ?? '', (v) => save({ title: v.trim() || undefined }))
  const [instructions, setInstructions] = useDraftField(agent.instructions, (v) => save({ instructions: v }))

  // The body is keyed by agent, so sliders own this state while the drawer is open.
  const savedPersonality = useRef(agent.personality)
  useEffect(() => {
    if (JSON.stringify(personality) === JSON.stringify(savedPersonality.current)) return
    const t = setTimeout(() => {
      savedPersonality.current = personality
      void updateAgent(agent.id, { personality })
    }, 250)
    return () => clearTimeout(t)
  }, [personality, agent.id])

  const toggleTool = (t: AgentTool, on: boolean) => save({ tools: on ? [...new Set([...agent.tools, t])] : agent.tools.filter((x) => x !== t) })
  const addMemory = () => {
    const v = memoryInput.trim()
    if (!v) return
    save({ memory: [...agent.memory, v] })
    setMemoryInput('')
  }
  const defaultProfile = profiles.find((p) => p.id === settings.defaultProfileId) ?? profiles.find((p) => p.isDefault) ?? profiles[0]
  const displayName = name.trim() || agent.name

  return (
    <div className="space-y-8 pb-4">
      {/* Identity */}
      <div
        className="relative -mx-6 -mt-5 overflow-hidden px-6 pt-6 pb-6"
        style={{ background: `radial-gradient(120% 90% at 0% 0%, ${hexToRgba(agent.color, 0.22)}, transparent 60%)` }}
      >
        <div className="flex items-start gap-5">
          <AgentAvatar agent={{ ...agent, name: displayName }} size="xl" active />
          <div className="min-w-0 flex-1 space-y-2 pt-1">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => !name.trim() && setName(agent.name)}
              aria-label="Name"
              className="w-full rounded-lg bg-transparent font-display text-[28px] leading-tight font-semibold tracking-tight outline-none placeholder:text-faint focus:bg-white/[0.04]"
            />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Job title"
              placeholder={role.name}
              className="w-full rounded-lg bg-transparent text-[14px] text-soft outline-none placeholder:text-muted focus:bg-white/[0.04]"
            />
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {agent.isLead && (
                <Badge tone="warn">
                  <Crown className="size-3" /> Your lead
                </Badge>
              )}
              <Badge tone={agent.status === 'active' ? 'good' : 'neutral'} dot>
                {agent.status === 'active' ? 'On duty' : 'On the bench'}
              </Badge>
            </div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-1.5">
          {AGENT_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => save({ color: c })}
              aria-label={`Colour ${c}`}
              className={cn('size-6 rounded-full transition', agent.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-ink-900' : 'hover:scale-110')}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>

      {/* Role */}
      <Section title="Role">
        <div className="flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
          <RoleIcon role={role} size={48} />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{role.name}</div>
            <p className="text-[13px] text-muted">{role.tagline}</p>
          </div>
          <Button size="sm" variant="secondary" icon={<Repeat2 />} onClick={() => setPicking(true)}>
            Change role
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {role.skills.map((s) => (
            <span key={s} className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[12px] text-soft">
              {s}
            </span>
          ))}
        </div>
      </Section>

      {/* Personality */}
      <Section title="Personality">
        <div className="space-y-5 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5">
          {PERSONALITY.map((p) => (
            <div key={p.key} className="grid grid-cols-[64px_1fr] items-start gap-4">
              <span className="pt-0.5 text-[13px] font-medium text-soft">{p.label}</span>
              <Slider value={personality[p.key]} onChange={(v) => setPersonality((cur) => ({ ...cur, [p.key]: v }))} left={p.left} right={p.right} />
            </div>
          ))}
          <div className="flex items-start gap-2.5 rounded-xl bg-black/20 px-3.5 py-3 text-[13px] text-soft">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" />
            {personalityPreview(displayName, personality)}
          </div>
        </div>
      </Section>

      {/* Instructions */}
      <Section title="House rules" hint={`Anything ${displayName} should always keep in mind.`}>
        <Textarea
          rows={4}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder={`e.g. Our biggest client is Northwind. Keep press releases under 400 words.`}
        />
        <div className="flex flex-wrap gap-1.5">
          {INSTRUCTION_IDEAS.filter((i) => !instructions.includes(i)).map((i) => (
            <button
              key={i}
              onClick={() => setInstructions(instructions.trim() ? `${instructions.trim()}\n${i}` : i)}
              className="flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[12px] text-muted transition hover:border-white/[0.16] hover:text-fg"
            >
              <Plus className="size-3" /> {i}
            </button>
          ))}
        </div>
      </Section>

      {/* Memory */}
      <Section title="Memory" hint={`Facts ${displayName} remembers in every conversation.`}>
        <div className="space-y-2">
          {agent.memory.map((m, i) => (
            <div key={`${m}-${i}`} className="group flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3.5 py-2.5">
              <Brain className="mt-0.5 size-4 shrink-0 text-faint" />
              <span className="flex-1 text-[13px] text-soft">{m}</span>
              <button
                onClick={() => save({ memory: agent.memory.filter((_, j) => j !== i) })}
                aria-label="Forget"
                className="text-faint opacity-0 transition group-hover:opacity-100 hover:text-fg"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input
              value={memoryInput}
              onChange={(e) => setMemoryInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addMemory()
                }
              }}
              placeholder="e.g. I prefer calls before 10am"
            />
            <Button variant="secondary" onClick={addMemory} icon={<Plus />}>
              Remember
            </Button>
          </div>
        </div>
      </Section>

      {/* Abilities */}
      <Section title="Abilities">
        <div className="divide-y divide-white/[0.05] rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4">
          {TOOL_ORDER.map((t) => {
            const leadOnly = t === 'delegate' && !agent.isLead
            return (
              <div key={t} className="py-3">
                <Toggle
                  checked={agent.tools.includes(t)}
                  onChange={(v) => toggleTool(t, v)}
                  disabled={leadOnly}
                  label={TOOL_INFO[t].label}
                  description={leadOnly ? 'Only your lead hands out work.' : TOOL_INFO[t].description}
                />
              </div>
            )
          })}
        </div>
      </Section>

      {/* AI */}
      <Section title="Thinks with" hint="Give specialists different AIs, for example Claude for writing and Perplexity for research.">
        {profiles.length === 0 ? (
          <div className="flex items-center gap-4 rounded-2xl border border-dashed border-white/[0.12] p-4">
            <Sparkles className="size-5 shrink-0 text-warn" />
            <p className="flex-1 text-[13px] text-soft">You’re in demo mode, so {displayName} is giving sample answers.</p>
            <Button size="sm" variant="primary" onClick={() => navigate('/settings?tab=ai')}>
              Connect an AI
            </Button>
          </div>
        ) : (
          <div className="grid gap-2">
            {[undefined, ...profiles].map((p) => {
              const selected = (agent.profileId ?? undefined) === p?.id
              const shown = p ?? defaultProfile
              return (
                <button
                  key={p?.id ?? 'default'}
                  onClick={() => save({ profileId: p?.id })}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition',
                    selected ? 'border-[color-mix(in_oklab,var(--accent)_55%,transparent)] bg-white/[0.06]' : 'border-white/[0.07] hover:bg-white/[0.04]',
                  )}
                >
                  {shown ? <ServiceMark id={shown.provider} size={34} /> : <div className="size-[34px]" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-medium">{p ? p.name : 'Your default AI'}</div>
                    <div className="truncate text-[12px] text-muted">{shown ? `${getProvider(shown.provider).company} · ${modelLabel(shown.provider, shown.model)}` : ''}</div>
                  </div>
                  <span className={cn('grid size-5 place-items-center rounded-full border', selected ? 'border-transparent bg-[var(--accent)] text-white' : 'border-white/20')}>
                    {selected && <Check className="size-3" strokeWidth={3} />}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </Section>

      <RolePickerModal
        open={picking}
        onClose={() => setPicking(false)}
        roles={roles}
        agents={agents}
        initialId={agent.roleId}
        title={`Change ${displayName}’s role`}
        subtitle="Their name, personality, rules and memory stay the same. Their abilities update to suit the new role."
        confirmLabel="Change role"
        onConfirm={async (r) => {
          await changeRole(agent.id, r.id)
          setPicking(false)
          toast.success(`${displayName} is now your ${r.name}`)
        }}
      />
    </div>
  )
}

export function AgentEditorDrawer({ agentId, onClose }: { agentId?: string; onClose: () => void }) {
  const agents = useAgents()
  const roles = useRoles()
  const navigate = useNavigate()
  const agent = agents.find((a) => a.id === agentId)
  const role = agent ? (roles.find((r) => r.id === agent.roleId) ?? roles[0]) : undefined

  return (
    <Drawer
      open={!!agent}
      onClose={onClose}
      width="max-w-2xl"
      title={
        <span className="flex items-center gap-2">
          Agent profile
          <span className="flex items-center gap-1 text-[12px] font-normal text-good">
            <Check className="size-3.5" /> Saves automatically
          </span>
        </span>
      }
      footer={
        agent && (
          <>
            <Menu
              align="left"
              trigger={(open) => (
                <Button variant="ghost" onClick={open} className="mr-auto">
                  More
                </Button>
              )}
              items={[
                ...(!agent.isLead
                  ? [
                      {
                        label: 'Make lead',
                        icon: <Crown />,
                        onSelect: async () => {
                          await setLead(agent.id)
                          toast.success(`${agent.name} is now your lead`)
                        },
                      },
                      agent.status === 'active'
                        ? { label: 'Move to the bench', icon: <Repeat2 />, onSelect: () => void setDuty(agent.id, 'bench') }
                        : { label: 'Put on duty', icon: <Repeat2 />, onSelect: () => void setDuty(agent.id, 'active') },
                    ]
                  : []),
                {
                  label: 'Duplicate',
                  icon: <Copy />,
                  onSelect: async () => {
                    const copy = await duplicateAgent(agent.id)
                    if (copy) {
                      toast.success(`Created ${copy.name}`, 'They’re on the bench, ready to go.')
                      navigate(`/agents/${copy.id}`)
                    }
                  },
                },
                ...(!agent.isLead
                  ? [
                      'divider' as const,
                      {
                        label: 'Remove from team',
                        icon: <Trash2 />,
                        danger: true,
                        onSelect: async () => {
                          if (!window.confirm(`Remove ${agent.name}? Their one-to-one chats will be deleted.`)) return
                          await removeAgent(agent.id)
                          toast.info(`${agent.name} has left the team`)
                          onClose()
                        },
                      },
                    ]
                  : []),
              ]}
            />
            {agent.status === 'bench' && (
              <Button variant="secondary" onClick={() => void setDuty(agent.id, 'active')}>
                Put on duty
              </Button>
            )}
            <Button variant="primary" icon={<MessageSquare />} onClick={() => navigate(`/comms?agent=${agent.id}`)}>
              Chat with {agent.name}
            </Button>
          </>
        )
      }
    >
      {agent && role && <EditorBody key={agent.id} agent={agent} role={role} roles={roles} />}
    </Drawer>
  )
}
