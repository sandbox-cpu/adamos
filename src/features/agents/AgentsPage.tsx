import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeftRight,
  Brain,
  CalendarDays,
  Crown,
  FolderKanban,
  Globe,
  MessageSquare,
  MoreHorizontal,
  Palette,
  PenLine,
  Pencil,
  Sparkles,
  UserPlus,
  UsersRound,
  Wand2,
  type LucideIcon,
} from 'lucide-react'
import { setDuty, setLead, TOOL_INFO, TOOL_ORDER } from '../../lib/agents/manage'
import { modelLabel } from '../../lib/llm/providers'
import type { Agent, AgentTool, Role } from '../../lib/types'
import { hexToRgba, mixHex } from '../../lib/utils'
import { useSettings } from '../../stores/settings'
import { useJobs } from '../../stores/jobs'
import { useAgents, useProfiles, useRoles } from '../../hooks/data'
import { AgentAvatar } from '../../components/agents/AgentAvatar'
import { PageHeader } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Menu, SectionLabel, Tabs } from '../../components/ui/bits'
import { toast } from '../../components/ui/Toast'
import { ServiceMark } from '../../components/ui/ProviderMark'
import { AgentEditorDrawer } from './AgentEditor'
import { CreateRoleTile, RoleDesignerModal, RoleDetailModal, RoleFilterBar, RoleGrid, useRoleFilter } from './roles-ui'
import { AssignRoleModal, HireAgentModal, SwapModal } from './team-ui'

const TOOL_ICONS: Record<AgentTool, LucideIcon> = {
  web: Globe,
  brain: Brain,
  brain_write: PenLine,
  projects: FolderKanban,
  calendar: CalendarDays,
  delegate: UsersRound,
  studios: Palette,
}

function useBusyAgents(): Set<string> {
  const jobs = useJobs((s) => s.jobs)
  return useMemo(() => new Set(jobs.filter((j) => j.status === 'running' && j.agentId).map((j) => j.agentId!)), [jobs])
}

function Abilities({ tools, color }: { tools: AgentTool[]; color: string }) {
  return (
    <div className="flex items-center gap-1">
      {TOOL_ORDER.filter((t) => tools.includes(t)).map((t) => {
        const Ico = TOOL_ICONS[t]
        return (
          <span
            key={t}
            title={TOOL_INFO[t].label}
            className="grid size-6 place-items-center rounded-md"
            style={{ background: hexToRgba(color, 0.1), color: mixHex(color, '#ffffff', 0.4) }}
          >
            <Ico className="size-3.5" />
          </span>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Lead spotlight                                                     */
/* ------------------------------------------------------------------ */

function LeadOrbit({ lead, team }: { lead: Agent; team: Agent[] }) {
  const size = 236
  const radius = 104
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="absolute inset-[18px] rounded-full border border-white/[0.06]" />
      <div className="absolute inset-[58px] rounded-full border border-dashed border-white/[0.08]" />
      <div className="absolute inset-0 animate-[spin_60s_linear_infinite]">
        {team.map((a, i) => {
          const angle = (i / Math.max(1, team.length)) * Math.PI * 2 - Math.PI / 2
          return (
            <div key={a.id} className="absolute" style={{ left: size / 2 + Math.cos(angle) * radius - 15, top: size / 2 + Math.sin(angle) * radius - 15 }}>
              <div className="animate-[spin_60s_linear_infinite_reverse]">
                <AgentAvatar agent={a} size="sm" />
              </div>
            </div>
          )
        })}
      </div>
      <div className="absolute inset-0 grid place-items-center">
        <div className="relative">
          <div className="absolute -inset-6 rounded-full opacity-60 blur-2xl" style={{ background: lead.color }} />
          <AgentAvatar agent={lead} size="xl" active />
        </div>
      </div>
    </div>
  )
}

function LeadSpotlight({ lead, role, team, onEdit }: { lead: Agent; role?: Role; team: Agent[]; onEdit: () => void }) {
  const navigate = useNavigate()
  const firstName = useSettings((s) => s.settings.userName.trim().split(/\s+/)[0])
  return (
    <div
      className="relative overflow-hidden rounded-[28px] border border-white/[0.08] p-6 md:p-8"
      style={{
        background: `radial-gradient(70% 120% at 12% 20%, ${hexToRgba(lead.color, 0.2)}, transparent 60%), linear-gradient(180deg, rgb(255 255 255 / 0.035), rgb(255 255 255 / 0.01))`,
      }}
    >
      <div className="grid-lines pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative flex flex-col items-center gap-8 md:flex-row md:items-center">
        <LeadOrbit lead={lead} team={team} />
        <div className="min-w-0 flex-1 text-center md:text-left">
          <div
            className="flex items-center justify-center gap-2 text-[11px] font-semibold tracking-[0.18em] uppercase md:justify-start"
            style={{ color: mixHex(lead.color, '#ffffff', 0.35) }}
          >
            <Crown className="size-3.5" /> Your lead · {lead.title || role?.name}
          </div>
          <h2 className="mt-2 font-display text-5xl font-semibold tracking-tight">{lead.name}</h2>
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-soft md:mx-0">
            {firstName ? `${firstName}’s` : 'Your'} go-to organiser. Ask {lead.name} for anything and they’ll plan it, do it, or brief the right specialist and bring the answer
            back.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 md:justify-start">
            <Button variant="primary" icon={<MessageSquare />} onClick={() => navigate(`/comms?agent=${lead.id}`)}>
              Talk to {lead.name}
            </Button>
            <Button variant="secondary" icon={<Pencil />} onClick={onEdit}>
              Edit profile
            </Button>
            {team.length > 0 && (
              <Menu
                align="left"
                trigger={(open) => (
                  <Button variant="ghost" icon={<Crown />} onClick={open}>
                    Change lead
                  </Button>
                )}
                items={team.map((a) => ({
                  label: `Make ${a.name} lead`,
                  icon: <AgentAvatar agent={a} size="xs" />,
                  onSelect: async () => {
                    await setLead(a.id)
                    toast.success(`${a.name} is now your lead`, `${lead.name} stays on the team.`)
                  },
                }))}
              />
            )}
          </div>
        </div>
        <div className="hidden w-56 shrink-0 space-y-2.5 xl:block">
          <div className="text-[11px] font-semibold tracking-[0.14em] text-faint uppercase">Delegates to</div>
          {team.slice(0, 6).map((a) => (
            <div key={a.id} className="flex items-center gap-2.5 text-[13px]">
              <span className="size-1.5 shrink-0 rounded-full" style={{ background: a.color }} />
              <span className="font-medium text-fg">{a.name}</span>
            </div>
          ))}
          {team.length > 6 && <div className="text-[12px] text-muted">and {team.length - 6} more</div>}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Agent cards                                                        */
/* ------------------------------------------------------------------ */

function AgentCard({
  agent,
  role,
  working,
  profileName,
  provider,
  onOpen,
  onSwap,
}: {
  agent: Agent
  role?: Role
  working: boolean
  profileName?: string
  provider?: string
  onOpen: () => void
  onSwap: () => void
}) {
  const navigate = useNavigate()
  return (
    <div
      className="group relative flex cursor-pointer flex-col gap-4 overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.03] p-5 transition duration-300 hover:-translate-y-1 hover:border-white/[0.13] hover:bg-white/[0.045]"
      onClick={onOpen}
    >
      <div
        className="pointer-events-none absolute -top-16 -right-16 size-44 rounded-full opacity-20 blur-3xl transition duration-500 group-hover:opacity-40"
        style={{ background: agent.color }}
      />
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px opacity-70" style={{ background: `linear-gradient(90deg, transparent, ${agent.color}, transparent)` }} />
      <div className="relative flex items-start gap-3.5">
        <AgentAvatar agent={agent} size="lg" active={working} status={working ? 'working' : 'online'} />
        <div className="min-w-0 flex-1 pt-1">
          <h3 className="truncate font-display text-lg font-semibold tracking-tight">{agent.name}</h3>
          <p className="truncate text-[13px] text-soft">{agent.title || role?.name}</p>
          {working && <p className="mt-0.5 text-[11.5px] text-warn">Working on something…</p>}
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <Menu
            trigger={(open) => (
              <button
                onClick={open}
                aria-label={`More for ${agent.name}`}
                className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-white/[0.07] hover:text-fg"
              >
                <MoreHorizontal className="size-4" />
              </button>
            )}
            items={[
              { label: 'Edit profile', icon: <Pencil />, onSelect: onOpen },
              { label: 'Swap for someone else', icon: <ArrowLeftRight />, onSelect: onSwap },
              { label: 'Make lead', icon: <Crown />, onSelect: () => void setLead(agent.id).then(() => toast.success(`${agent.name} is now your lead`)) },
              'divider',
              { label: 'Move to the bench', icon: <UsersRound />, onSelect: () => void setDuty(agent.id, 'bench') },
            ]}
          />
        </div>
      </div>
      <p className="relative line-clamp-2 min-h-[2.6em] text-[13px] leading-snug text-muted">{role?.tagline}</p>
      <div className="relative flex flex-wrap gap-1">
        {role?.skills.slice(0, 3).map((s) => (
          <span key={s} className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px] text-soft">
            {s}
          </span>
        ))}
      </div>
      <div className="relative mt-auto flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3.5">
        <Abilities tools={agent.tools} color={agent.color} />
        <div className="flex items-center gap-1.5">
          {provider && (
            <span title={profileName} className="opacity-80">
              <ServiceMark id={provider} size={22} />
            </span>
          )}
          <Button
            size="xs"
            variant="secondary"
            icon={<MessageSquare />}
            onClick={(e) => {
              e.stopPropagation()
              navigate(`/comms?agent=${agent.id}`)
            }}
          >
            Chat
          </Button>
        </div>
      </div>
    </div>
  )
}

function BenchCard({ agent, role, onOpen }: { agent: Agent; role?: Role; onOpen: () => void }) {
  return (
    <div
      onClick={onOpen}
      className="group flex cursor-pointer items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 transition hover:border-white/[0.12] hover:bg-white/[0.04]"
    >
      <div className="opacity-75 grayscale-[35%] transition group-hover:opacity-100 group-hover:grayscale-0">
        <AgentAvatar agent={agent} size="md" status="bench" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium">{agent.name}</div>
        <div className="truncate text-[12px] text-muted">{agent.title || role?.name}</div>
      </div>
      <Button
        size="xs"
        variant="subtle"
        onClick={(e) => {
          e.stopPropagation()
          void setDuty(agent.id, 'active').then(() => toast.success(`${agent.name} is on duty`))
        }}
      >
        Bring on
      </Button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

type Tab = 'team' | 'roles'

export default function AgentsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const agents = useAgents()
  const roles = useRoles()
  const profiles = useProfiles()
  const settings = useSettings((s) => s.settings)
  const busy = useBusyAgents()
  const [tab, setTab] = useState<Tab>('team')
  const [hire, setHire] = useState<{ key: number; role?: Role } | null>(null)
  const [swapFor, setSwapFor] = useState<Agent | undefined>()
  const [roleDetail, setRoleDetail] = useState<Role | undefined>()
  const [assign, setAssign] = useState<Role | undefined>()
  const [designer, setDesigner] = useState<{ key: number; editing?: Role } | null>(null)
  const filter = useRoleFilter(roles)

  const lead = agents.find((a) => a.isLead) ?? agents.find((a) => a.status === 'active')
  const onDuty = agents.filter((a) => a.status === 'active' && a.id !== lead?.id)
  const bench = agents.filter((a) => a.status === 'bench')
  const roleOf = (a: Agent) => roles.find((r) => r.id === a.roleId)
  const defaultProfile = profiles.find((p) => p.id === settings.defaultProfileId) ?? profiles[0]
  const profileOf = (a: Agent) => profiles.find((p) => p.id === a.profileId) ?? defaultProfile
  const open = (a: Agent) => navigate(`/agents/${a.id}`)
  const startHire = (role?: Role) => setHire({ key: Date.now(), role })

  return (
    <div className="mx-auto max-w-[1400px] space-y-8 px-4 pt-6 pb-24 md:px-8">
      <PageHeader
        eyebrow="Team"
        title="Your AI team"
        subtitle="Swap specialists in and out for the job at hand, or change what anyone does in a couple of clicks."
        actions={
          <>
            <Button variant="secondary" icon={<Wand2 />} onClick={() => setDesigner({ key: Date.now() })}>
              Create a role
            </Button>
            <Button variant="primary" icon={<UserPlus />} onClick={() => startHire()}>
              Hire an agent
            </Button>
          </>
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: 'team', label: 'Team', icon: <UsersRound />, count: agents.length },
          { id: 'roles', label: 'Role bank', icon: <Sparkles />, count: roles.length },
        ]}
      />

      {tab === 'team' ? (
        <div className="space-y-10">
          {lead && <LeadSpotlight lead={lead} role={roleOf(lead)} team={onDuty} onEdit={() => open(lead)} />}

          <section>
            <SectionLabel
              action={<span className="hidden text-[12px] text-muted sm:inline">Everyone here can chat, join huddles and take work from {lead?.name ?? 'your lead'}</span>}
            >
              On duty · {onDuty.length}
            </SectionLabel>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {onDuty.map((a) => {
                const p = profileOf(a)
                return (
                  <AgentCard
                    key={a.id}
                    agent={a}
                    role={roleOf(a)}
                    working={busy.has(a.id)}
                    provider={p?.provider}
                    profileName={p ? `${p.name} · ${modelLabel(p.provider, p.model)}` : undefined}
                    onOpen={() => open(a)}
                    onSwap={() => setSwapFor(a)}
                  />
                )
              })}
              <button
                onClick={() => startHire()}
                className="flex min-h-[230px] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/[0.12] text-muted transition hover:border-white/[0.24] hover:text-fg"
              >
                <span className="grid size-12 place-items-center rounded-full bg-white/[0.05]">
                  <UserPlus className="size-5" />
                </span>
                <span className="text-sm font-medium">Hire a specialist</span>
              </button>
            </div>
          </section>

          <section>
            <SectionLabel action={<span className="hidden text-[12px] text-muted sm:inline">Waiting in the wings. Bring them on when a job needs them.</span>}>
              On the bench · {bench.length}
            </SectionLabel>
            {bench.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {bench.map((a) => (
                  <BenchCard key={a.id} agent={a} role={roleOf(a)} onOpen={() => open(a)} />
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-white/[0.08] p-6 text-center text-sm text-muted">
                Everyone is on duty. Move agents here when you don’t need them.
              </p>
            )}
          </section>
        </div>
      ) : (
        <div className="space-y-5">
          <RoleFilterBar filter={filter} />
          <RoleGrid
            roles={filter.filtered}
            agents={agents}
            onSelect={setRoleDetail}
            leading={filter.category === 'All' && !filter.query ? <CreateRoleTile onClick={() => setDesigner({ key: Date.now() })} /> : undefined}
          />
          {filter.filtered.length === 0 && <p className="py-12 text-center text-sm text-muted">No roles match “{filter.query}”.</p>}
        </div>
      )}

      <AgentEditorDrawer agentId={id} onClose={() => navigate('/agents')} />

      {hire && (
        <HireAgentModal
          key={hire.key}
          open
          onClose={() => setHire(null)}
          roles={roles}
          agents={agents}
          initialRole={hire.role}
          onHired={(a) => {
            setHire(null)
            setTab('team')
            navigate(`/agents/${a.id}`)
          }}
        />
      )}

      <SwapModal
        agent={swapFor}
        bench={bench}
        roles={roles}
        onClose={() => setSwapFor(undefined)}
        onHire={() => {
          setSwapFor(undefined)
          startHire()
        }}
      />

      <RoleDetailModal
        role={roleDetail}
        agents={agents}
        onClose={() => setRoleDetail(undefined)}
        onHire={(r) => {
          setRoleDetail(undefined)
          startHire(r)
        }}
        onAssign={(r) => {
          setRoleDetail(undefined)
          setAssign(r)
        }}
        onEdit={(r) => {
          setRoleDetail(undefined)
          setDesigner({ key: Date.now(), editing: r })
        }}
      />

      <AssignRoleModal role={assign} agents={agents} roles={roles} onClose={() => setAssign(undefined)} />

      {designer && (
        <RoleDesignerModal
          key={designer.key}
          open
          editing={designer.editing}
          onClose={() => setDesigner(null)}
          onSaved={(r) => {
            if (!designer.editing) {
              setTab('roles')
              setRoleDetail(r)
            }
          }}
        />
      )}
    </div>
  )
}
