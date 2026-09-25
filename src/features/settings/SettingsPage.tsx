import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Brain, CalendarDays, Check, Cpu, Database, Download, ImagePlus, Info, Keyboard, MoreHorizontal, Palette, Pencil, Plus, Sparkles, Star, Trash2, Upload, UserRound, Zap } from 'lucide-react'
import { db } from '../../lib/db'
import { DEPTH_LABELS, getProvider, modelLabel } from '../../lib/llm/providers'
import { testProfile } from '../../lib/llm'
import { exportEverything, importEverything } from '../../lib/backup'
import { clearDemoData, resetEverything } from '../../lib/seed'
import { IMAGE_PROVIDERS } from '../../lib/media/generate'
import type { AccentId, AIProfile, Settings } from '../../lib/types'
import { cn, downloadText, isoDate } from '../../lib/utils'
import { osNameOf, useSettings } from '../../stores/settings'
import { useUI } from '../../stores/ui'
import { useAgents, useProfiles, useRoles, useSecrets } from '../../hooks/data'
import { PageHeader, Panel, PanelHeader } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Badge, Empty, Kbd, Menu, Tabs } from '../../components/ui/bits'
import { Field, Input, Select, Toggle } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { toast } from '../../components/ui/Toast'
import { AgentAvatar } from '../../components/agents/AgentAvatar'
import { ServiceMark } from '../../components/ui/ProviderMark'
import { ConnectAIFlow } from './ConnectAI'

type Tab = 'ai' | 'profile' | 'appearance' | 'integrations' | 'data' | 'about'

const ACCENTS: { id: AccentId; name: string; colors: [string, string] }[] = [
  { id: 'aurora', name: 'Aurora', colors: ['#8b6cff', '#2dd4f0'] },
  { id: 'ember', name: 'Ember', colors: ['#fb7185', '#fbbf24'] },
  { id: 'emerald', name: 'Emerald', colors: ['#10b981', '#a3e635'] },
  { id: 'ocean', name: 'Ocean', colors: ['#3b82f6', '#22d3ee'] },
  { id: 'solar', name: 'Solar', colors: ['#f59e0b', '#fde047'] },
  { id: 'mono', name: 'Mono', colors: ['#e4e7ef', '#9aa3b8'] },
]

function ProfileCard({ profile, agentsUsing, onEdit }: { profile: AIProfile; agentsUsing: number; onEdit: () => void }) {
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const secrets = useSecrets()
  const [testing, setTesting] = useState(false)
  const info = getProvider(profile.provider)
  const secret = secrets.find((s) => s.id === profile.keyId)
  const isDefault = settings.defaultProfileId === profile.id
  const test = async () => {
    setTesting(true)
    try {
      const r = await testProfile(profile)
      toast.success(`${profile.name} is working`, `“${r.reply}” (${(r.ms / 1000).toFixed(1)}s)`)
    } catch (err) {
      toast.error(`${profile.name} couldn’t connect`, err instanceof Error ? err.message : undefined)
    } finally {
      setTesting(false)
    }
  }
  return (
    <div className={cn('glass relative flex flex-col gap-4 rounded-3xl p-5', isDefault && 'border-[color-mix(in_oklab,var(--accent)_45%,transparent)]')}>
      <div className="flex items-start gap-3">
        <ServiceMark id={profile.provider} size={42} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold">{profile.name}</h3>
            {isDefault && <Badge tone="accent">Default</Badge>}
          </div>
          <div className="truncate text-xs text-muted">
            {info.company} · {modelLabel(profile.provider, profile.model)}
          </div>
        </div>
        <Menu
          trigger={(open) => (
            <button onClick={open} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/[0.07] hover:text-fg" aria-label="More">
              <MoreHorizontal className="size-4" />
            </button>
          )}
          items={[
            { label: 'Edit', icon: <Pencil />, onSelect: onEdit },
            { label: 'Make default', icon: <Star />, onSelect: () => void update({ defaultProfileId: profile.id }), disabled: isDefault },
            'divider',
            {
              label: 'Remove',
              icon: <Trash2 />,
              danger: true,
              onSelect: async () => {
                await db.profiles.delete(profile.id)
                const agents = await db.agents.filter((a) => a.profileId === profile.id).toArray()
                await Promise.all(agents.map((a) => db.agents.update(a.id, { profileId: undefined })))
                if (isDefault) await update({ defaultProfileId: undefined })
                toast.info('AI profile removed')
              },
            },
          ]}
        />
      </div>
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-soft">{DEPTH_LABELS[profile.depth].label} thinking</span>
        {profile.webSearch && (
          <span className="flex items-center gap-1 rounded-full bg-good/10 px-2.5 py-1 text-good">
            <Zap className="size-3" /> Web research
          </span>
        )}
        {info.needsKey && <span className="rounded-full bg-white/[0.06] px-2.5 py-1 font-mono text-soft">{secret ? `••••${secret.hint}` : 'No key'}</span>}
        <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-soft">
          {agentsUsing} agent{agentsUsing === 1 ? '' : 's'}
          {isDefault ? ' + default' : ''}
        </span>
      </div>
      <Button size="sm" variant="secondary" onClick={() => void test()} loading={testing} icon={<Sparkles />} className="self-start">
        Test
      </Button>
    </div>
  )
}

function AISettings() {
  const profiles = useProfiles()
  const agents = useAgents()
  const roles = useRoles()
  const [connecting, setConnecting] = useState(false)
  const [editing, setEditing] = useState<AIProfile | undefined>()
  const settings = useSettings((s) => s.settings)
  return (
    <div className="space-y-6">
      <Panel className="relative overflow-hidden p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_120%_at_100%_0%,color-mix(in_oklab,var(--accent)_18%,transparent),transparent_60%)]" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-xl">
            <h2 className="font-display text-xl font-semibold">Your AI</h2>
            <p className="mt-1 text-sm text-muted">
              Connect one or more AI services. Each agent can use a different one, so your researcher could run on Claude with live web search while your copywriter uses something else.
            </p>
          </div>
          <Button variant="primary" icon={<Plus />} onClick={() => setConnecting(true)}>
            Connect an AI
          </Button>
        </div>
      </Panel>

      {profiles.length === 0 ? (
        <Empty
          icon={<Sparkles />}
          title="You’re in demo mode"
          body="Your agents are giving sample answers. Connect an AI service to bring them to life. Claude is recommended."
          action={
            <Button variant="primary" icon={<Plus />} onClick={() => setConnecting(true)}>
              Connect an AI
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {profiles.map((p) => (
            <ProfileCard key={p.id} profile={p} agentsUsing={agents.filter((a) => a.profileId === p.id).length} onEdit={() => setEditing(p)} />
          ))}
        </div>
      )}

      {profiles.length > 0 && (
        <Panel>
          <PanelHeader title="Which AI does each agent use?" icon={<Cpu />} subtitle="Agents on “Default” use your default AI." />
          <div className="divide-y divide-white/[0.05] px-5 pb-3">
            {agents.map((a) => (
              <div key={a.id} className="flex items-center gap-3 py-3">
                <AgentAvatar agent={a} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{a.name}</div>
                  <div className="truncate text-xs text-muted">{roles.find((r) => r.id === a.roleId)?.name}</div>
                </div>
                <div className="w-56 sm:w-72">
                  <Select value={a.profileId ?? ''} onChange={(e) => void db.agents.update(a.id, { profileId: e.target.value || undefined, updatedAt: Date.now() })}>
                    <option value="">Default ({profiles.find((p) => p.id === settings.defaultProfileId)?.name ?? profiles[0]?.name})</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Modal open={connecting} onClose={() => setConnecting(false)} title="Connect an AI" subtitle="Takes about a minute." icon={<Sparkles />} size="lg">
        <ConnectAIFlow
          onCancel={() => setConnecting(false)}
          onDone={(p) => {
            setConnecting(false)
            toast.success(`${p.name} connected`, 'Your agents are now live.')
          }}
        />
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(undefined)} title="Edit AI profile" icon={<Pencil />} size="lg">
        {editing && (
          <ConnectAIFlow
            existing={editing}
            onCancel={() => setEditing(undefined)}
            onDone={() => {
              setEditing(undefined)
              toast.success('Saved')
            }}
          />
        )}
      </Modal>
    </div>
  )
}

function ProfileSettings() {
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const set = (patch: Partial<Settings>) => void update(patch)
  return (
    <Panel className="max-w-2xl p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name">
          <Input value={settings.userName} onChange={(e) => set({ userName: e.target.value })} />
        </Field>
        <Field label="Your role">
          <Input value={settings.userRole} onChange={(e) => set({ userRole: e.target.value })} />
        </Field>
        <Field label="Company">
          <Input value={settings.companyName} onChange={(e) => set({ companyName: e.target.value })} />
        </Field>
        <Field label="Name of this OS" hint={`Currently “${osNameOf(settings)}”`}>
          <Input value={settings.osName} onChange={(e) => set({ osName: e.target.value })} placeholder={`${settings.userName.split(' ')[0] || 'My'}OS`} />
        </Field>
        <Field label="Spelling">
          <Select value={settings.spelling} onChange={(e) => set({ spelling: e.target.value as Settings['spelling'] })}>
            <option value="british">British English</option>
            <option value="american">American English</option>
          </Select>
        </Field>
      </div>
      <p className="mt-4 text-xs text-faint">Your agents use these details to write in your voice and address you properly.</p>
    </Panel>
  )
}

function AppearanceSettings() {
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const setShowIntro = useUI((s) => s.setShowIntro)
  return (
    <div className="max-w-3xl space-y-5">
      <Panel className="p-6">
        <h3 className="mb-4 font-semibold">Accent colour</h3>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              onClick={() => void update({ accent: a.id })}
              className={cn('flex flex-col items-center gap-2 rounded-2xl border p-3 transition', settings.accent === a.id ? 'border-white/40 bg-white/[0.06]' : 'border-white/[0.07] hover:border-white/20')}
            >
              <span className="relative size-10 rounded-full" style={{ background: `linear-gradient(135deg, ${a.colors[0]}, ${a.colors[1]})`, boxShadow: `0 0 22px -4px ${a.colors[0]}` }}>
                {settings.accent === a.id && <Check className="absolute inset-0 m-auto size-5 text-white drop-shadow" />}
              </span>
              <span className="text-xs text-soft">{a.name}</span>
            </button>
          ))}
        </div>
      </Panel>
      <Panel className="space-y-5 p-6">
        <Field label="Welcome intro">
          <Select value={settings.introMode} onChange={(e) => void update({ introMode: e.target.value as Settings['introMode'] })}>
            <option value="always">Every time the OS opens</option>
            <option value="daily">Once a day</option>
            <option value="never">Never</option>
          </Select>
        </Field>
        <Button variant="secondary" icon={<Sparkles />} onClick={() => setShowIntro(true)}>
          Replay the intro
        </Button>
        <Toggle checked={settings.reduceMotion} onChange={(v) => void update({ reduceMotion: v })} label="Reduce motion" description="Calmer animations and a simpler intro." />
      </Panel>
    </div>
  )
}

function IntegrationSettings() {
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const navigate = useNavigate()
  const secrets = useSecrets()
  return (
    <div className="grid max-w-5xl gap-5 lg:grid-cols-2">
      <Panel>
        <PanelHeader title="Obsidian brain" icon={<Brain />} subtitle={settings.brain.mode === 'none' ? 'Not linked yet' : `Linked: ${settings.brain.name ?? 'vault'}`} />
        <div className="space-y-4 px-5 pb-5">
          <Field label="Folder for notes your agents create" hint="inside your vault">
            <Input value={settings.brain.writeFolder} onChange={(e) => void update({ brain: { writeFolder: e.target.value } })} />
          </Field>
          <Field label="Daily notes folder">
            <Input value={settings.brain.dailyFolder} onChange={(e) => void update({ brain: { dailyFolder: e.target.value } })} />
          </Field>
          <Button variant="secondary" onClick={() => navigate('/brain')} icon={<Brain />}>
            {settings.brain.mode === 'none' ? 'Link your vault' : 'Open your brain'}
          </Button>
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="Calendar" icon={<CalendarDays />} subtitle="Google Calendar and iCal feeds" />
        <div className="space-y-4 px-5 pb-5">
          <Field label="Google OAuth client ID" hint="for Google Calendar">
            <Input value={settings.calendar.googleClientId ?? ''} onChange={(e) => void update({ calendar: { googleClientId: e.target.value.trim() || undefined } })} placeholder="….apps.googleusercontent.com" className="font-mono text-[12px]" />
          </Field>
          <Field label="Proxy for iCal links" hint="optional, advanced">
            <Input value={settings.calendar.corsProxy ?? ''} onChange={(e) => void update({ calendar: { corsProxy: e.target.value.trim() || undefined } })} placeholder="https://your-proxy.example/?url=" className="font-mono text-[12px]" />
          </Field>
          <Field label="Week starts on">
            <Select value={settings.calendar.weekStartsOn} onChange={(e) => void update({ calendar: { weekStartsOn: Number(e.target.value) as 0 | 1 } })}>
              <option value={1}>Monday</option>
              <option value={0}>Sunday</option>
            </Select>
          </Field>
          <Button variant="secondary" onClick={() => navigate('/calendar?connect=1')} icon={<CalendarDays />}>
            Connect a calendar
          </Button>
        </div>
      </Panel>
      <Panel className="lg:col-span-2">
        <PanelHeader title="Image generation" icon={<ImagePlus />} subtitle="Used by the Media Studio, decks and landing pages" />
        <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-4">
          {IMAGE_PROVIDERS.map((p) => {
            const hasKey = !p.needs || secrets.some((s) => s.service === p.needs)
            const active = settings.media.provider === p.id
            return (
              <button
                key={p.id}
                onClick={() => void update({ media: { provider: p.id } })}
                className={cn('rounded-2xl border p-4 text-left transition', active ? 'border-[color-mix(in_oklab,var(--accent)_60%,transparent)] bg-[color-mix(in_oklab,var(--accent)_10%,transparent)]' : 'border-white/[0.08] hover:border-white/20')}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{p.name}</span>
                  {p.free ? <Badge tone="good">Free</Badge> : <Badge>Your key</Badge>}
                </div>
                <p className="mt-1.5 text-xs text-muted">{p.blurb}</p>
                {!hasKey && <p className="mt-2 text-[11px] text-warn">Needs a key in the Vault</p>}
              </button>
            )
          })}
        </div>
      </Panel>
    </div>
  )
}

function DataSettings() {
  const fileRef = useRef<HTMLInputElement>(null)
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const [confirmReset, setConfirmReset] = useState('')
  const [resetOpen, setResetOpen] = useState(false)
  return (
    <div className="grid max-w-5xl gap-5 lg:grid-cols-2">
      <Panel className="space-y-4 p-6">
        <h3 className="font-semibold">Backup</h3>
        <p className="text-sm text-muted">Everything lives privately in this browser. Download a backup to move it to another computer. Your API keys stay encrypted inside the backup.</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            icon={<Download />}
            onClick={async () => downloadText(await exportEverything(), `${osNameOf(settings)}-backup-${isoDate()}.json`, 'application/json')}
          >
            Download backup
          </Button>
          <Button variant="secondary" icon={<Upload />} onClick={() => fileRef.current?.click()}>
            Restore a backup
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              try {
                const n = await importEverything(await f.text())
                toast.success('Backup restored', `${n} items imported. Reloading…`)
                setTimeout(() => location.reload(), 1200)
              } catch (err) {
                toast.error('Restore failed', err instanceof Error ? err.message : undefined)
              }
              e.target.value = ''
            }}
          />
        </div>
      </Panel>
      <Panel className="space-y-4 p-6">
        <h3 className="font-semibold">Sample workspace</h3>
        <p className="text-sm text-muted">The OS ships with example clients, projects, meetings and notes so you can explore. Remove them when you’re ready to go live.</p>
        <Button
          variant="secondary"
          icon={<Trash2 />}
          disabled={!settings.demoData}
          onClick={async () => {
            await clearDemoData()
            await update({ demoData: false })
            toast.success('Sample workspace removed', 'Your own data is untouched.')
          }}
        >
          {settings.demoData ? 'Remove sample data' : 'Sample data removed'}
        </Button>
      </Panel>
      <Panel className="space-y-4 p-6 lg:col-span-2">
        <h3 className="font-semibold text-bad">Start over</h3>
        <p className="text-sm text-muted">Erase everything in this browser: agents, projects, chats, keys and notes. Your Obsidian files are never touched.</p>
        <Button variant="danger" icon={<Database />} onClick={() => setResetOpen(true)}>
          Reset everything
        </Button>
      </Panel>
      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset everything?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={confirmReset !== 'RESET'} onClick={() => void resetEverything()}>
              Erase and restart
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-muted">This can’t be undone. Type RESET to confirm.</p>
        <Input value={confirmReset} onChange={(e) => setConfirmReset(e.target.value)} placeholder="RESET" />
      </Modal>
    </div>
  )
}

function AboutSettings() {
  const settings = useSettings((s) => s.settings)
  const shortcuts: [string[], string][] = [
    [['⌘', 'K'], 'Search, jump anywhere or ask your lead'],
    [['⌘', 'J'], 'Open your lead agent'],
    [['Enter'], 'Send a message'],
    [['Shift', 'Enter'], 'New line in a message'],
    [['@'], 'Mention an agent in a huddle'],
  ]
  return (
    <div className="grid max-w-5xl gap-5 lg:grid-cols-2">
      <Panel className="p-6">
        <div className="flex items-center gap-3">
          <Info className="size-5 text-muted" />
          <h3 className="font-semibold">{osNameOf(settings)}</h3>
        </div>
        <p className="mt-3 text-sm text-muted">
          A private, local-first operating system for your AI team. Your data stays in this browser, your keys are encrypted, and your agents talk directly to the AI services you choose.
        </p>
        <p className="mt-3 text-xs text-faint">Version 1.0</p>
      </Panel>
      <Panel className="p-6">
        <div className="mb-3 flex items-center gap-3">
          <Keyboard className="size-5 text-muted" />
          <h3 className="font-semibold">Shortcuts</h3>
        </div>
        <div className="space-y-2.5">
          {shortcuts.map(([keys, label]) => (
            <div key={label} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-soft">{label}</span>
              <span className="flex gap-1">
                {keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

export default function SettingsPage() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) ?? 'ai'
  return (
    <div>
      <PageHeader eyebrow="System" title="Settings" subtitle="Connect your AI, tune the look and manage your data." />
      <Tabs<Tab>
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
        className="mb-6"
        items={[
          { id: 'ai', label: 'AI', icon: <Sparkles /> },
          { id: 'profile', label: 'You', icon: <UserRound /> },
          { id: 'appearance', label: 'Appearance', icon: <Palette /> },
          { id: 'integrations', label: 'Integrations', icon: <Zap /> },
          { id: 'data', label: 'Data', icon: <Database /> },
          { id: 'about', label: 'About', icon: <Info /> },
        ]}
      />
      {tab === 'ai' && <AISettings />}
      {tab === 'profile' && <ProfileSettings />}
      {tab === 'appearance' && <AppearanceSettings />}
      {tab === 'integrations' && <IntegrationSettings />}
      {tab === 'data' && <DataSettings />}
      {tab === 'about' && <AboutSettings />}
    </div>
  )
}
