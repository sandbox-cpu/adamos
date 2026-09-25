import { useState } from 'react'
import { ArrowLeft, ArrowLeftRight, Check, Dices, UserPlus } from 'lucide-react'
import { AGENT_COLORS } from '../../lib/agents/defaults'
import { changeRole, hireAgent, suggestAgentName, swapAgents } from '../../lib/agents/manage'
import type { Agent, Role } from '../../lib/types'
import { cn, hexToRgba } from '../../lib/utils'
import { AgentAvatar } from '../../components/agents/AgentAvatar'
import { Button } from '../../components/ui/Button'
import { Input, Toggle } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { toast } from '../../components/ui/Toast'
import { RoleFilterBar, RoleGrid, RoleIcon, useRoleFilter } from './roles-ui'

/* ------------------------------------------------------------------ */
/*  Hire                                                               */
/* ------------------------------------------------------------------ */

export function HireAgentModal({
  open,
  onClose,
  roles,
  agents,
  initialRole,
  onHired,
}: {
  open: boolean
  onClose: () => void
  roles: Role[]
  agents: Agent[]
  initialRole?: Role
  onHired: (agent: Agent) => void
}) {
  const filter = useRoleFilter(roles.filter((r) => !r.lead))
  const [role, setRole] = useState<Role | undefined>(initialRole)
  const [name, setName] = useState(() => suggestAgentName(agents.map((a) => a.name)))
  const [color, setColor] = useState<string | undefined>(initialRole?.color)
  const [onDuty, setOnDuty] = useState(true)
  const [busy, setBusy] = useState(false)
  const shown = color ?? role?.color ?? '#8b6cff'

  const hire = async () => {
    if (!role) return
    setBusy(true)
    try {
      const agent = await hireAgent({ name, roleId: role.id, color: shown, status: onDuty ? 'active' : 'bench' })
      toast.success(`${agent.name} has joined your team`, onDuty ? 'They’re on duty now.' : 'They’re waiting on the bench.')
      onHired(agent)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size={role ? 'md' : 'xl'}
      icon={<UserPlus />}
      title={role ? 'Meet your new teammate' : 'Hire an agent'}
      subtitle={role ? 'Give them a name and a look. You can change anything later.' : 'Pick the expertise you need.'}
      footer={
        role && (
          <>
            {!initialRole && (
              <Button variant="ghost" icon={<ArrowLeft />} onClick={() => setRole(undefined)} className="mr-auto">
                Other roles
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" icon={<Check />} loading={busy} disabled={!name.trim()} onClick={() => void hire()}>
              Hire {name.trim() || 'them'}
            </Button>
          </>
        )
      }
    >
      {!role ? (
        <>
          <RoleFilterBar filter={filter} className="mb-4" />
          <RoleGrid
            roles={filter.filtered}
            agents={agents}
            compact
            onSelect={(r) => {
              setRole(r)
              setColor(r.color)
            }}
          />
        </>
      ) : (
        <div className="space-y-6 py-1">
          <div
            className="relative flex flex-col items-center gap-4 overflow-hidden rounded-3xl px-4 py-8"
            style={{ background: `radial-gradient(80% 90% at 50% 0%, ${hexToRgba(shown, 0.28)}, transparent 70%)` }}
          >
            <AgentAvatar agent={{ name: name || '?', color: shown, roleId: role.id }} size="xl" active />
            <div className="text-center">
              <div className="font-display text-2xl font-semibold tracking-tight">{name.trim() || 'Unnamed'}</div>
              <div className="mt-1 flex items-center justify-center gap-2 text-sm text-soft">
                <RoleIcon role={role} size={22} /> {role.name}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name" aria-label="Name" />
            <Button variant="secondary" icon={<Dices />} onClick={() => setName(suggestAgentName([...agents.map((a) => a.name), name]))} aria-label="Suggest a name">
              Surprise me
            </Button>
          </div>
          <div className="flex flex-wrap justify-center gap-1.5">
            {AGENT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={`Colour ${c}`}
                className={cn('size-7 rounded-full transition', shown === c ? 'ring-2 ring-white ring-offset-2 ring-offset-ink-900' : 'hover:scale-110')}
                style={{ background: c }}
              />
            ))}
          </div>
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
            <Toggle checked={onDuty} onChange={setOnDuty} label="Put them on duty now" description="On-duty agents can be chatted to, join huddles and take work from your lead." />
          </div>
        </div>
      )}
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/*  Swap an active agent for someone on the bench                      */
/* ------------------------------------------------------------------ */

export function SwapModal({ agent, bench, roles, onClose, onHire }: { agent?: Agent; bench: Agent[]; roles: Role[]; onClose: () => void; onHire: () => void }) {
  return (
    <Modal
      open={!!agent}
      onClose={onClose}
      icon={<ArrowLeftRight />}
      title={agent ? `Swap ${agent.name} for…` : ''}
      subtitle={agent ? `${agent.name} moves to the bench, keeping everything they know.` : ''}
    >
      <div className="grid gap-2">
        {bench.map((b) => {
          const role = roles.find((r) => r.id === b.roleId)
          return (
            <button
              key={b.id}
              onClick={async () => {
                if (!agent) return
                await swapAgents(agent.id, b.id)
                toast.success(`${b.name} is on duty`, `${agent.name} is resting on the bench.`)
                onClose()
              }}
              className="group flex items-center gap-3.5 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3 text-left transition hover:border-white/[0.14] hover:bg-white/[0.05]"
            >
              <AgentAvatar agent={b} size="md" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{b.name}</div>
                <div className="truncate text-[12.5px] text-muted">
                  {role?.name} · {role?.tagline}
                </div>
              </div>
              <span className="rounded-full bg-white/[0.06] px-3 py-1 text-[12px] text-soft opacity-0 transition group-hover:opacity-100">Bring on</span>
            </button>
          )
        })}
        {bench.length === 0 && <p className="py-6 text-center text-sm text-muted">Nobody is on the bench yet.</p>}
        <button
          onClick={onHire}
          className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-white/[0.12] p-3 text-sm text-soft transition hover:border-white/[0.24] hover:text-fg"
        >
          <UserPlus className="size-4" /> Hire someone new instead
        </button>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/*  Give a role to an existing agent                                   */
/* ------------------------------------------------------------------ */

export function AssignRoleModal({ role, agents, roles, onClose }: { role?: Role; agents: Agent[]; roles: Role[]; onClose: () => void }) {
  const candidates = agents.filter((a) => a.roleId !== role?.id)
  return (
    <Modal
      open={!!role}
      onClose={onClose}
      title={role ? `Who should become your ${role.name}?` : ''}
      subtitle="They keep their name, personality and memory."
      icon={role ? <RoleIcon role={role} size={28} /> : undefined}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {candidates.map((a) => {
          const current = roles.find((r) => r.id === a.roleId)
          return (
            <button
              key={a.id}
              onClick={async () => {
                if (!role) return
                await changeRole(a.id, role.id)
                toast.success(`${a.name} is now your ${role.name}`)
                onClose()
              }}
              className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3 text-left transition hover:border-white/[0.14] hover:bg-white/[0.05]"
            >
              <AgentAvatar agent={a} size="sm" status={a.status === 'active' ? 'online' : 'bench'} />
              <div className="min-w-0">
                <div className="text-[13.5px] font-medium">{a.name}</div>
                <div className="truncate text-[12px] text-muted">Now: {current?.name}</div>
              </div>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
