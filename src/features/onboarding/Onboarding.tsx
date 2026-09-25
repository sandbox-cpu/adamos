import { useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ArrowRight, Brain, Check, ChevronDown, FolderSync, Sparkles, Upload } from 'lucide-react'
import { canLinkFolders } from '../../lib/brain/vault-fs'
import { linkVaultFolder, loadSampleBrain, uploadVault } from '../../lib/brain/link'
import { getProvider, modelLabel } from '../../lib/llm/providers'
import { clearDemoData } from '../../lib/seed'
import type { Settings } from '../../lib/types'
import { cn, errorMessage, formatNumber, isAbortError } from '../../lib/utils'
import { ACCENTS, osNameOf, useSettings } from '../../stores/settings'
import { useActiveAgents, useLead, useProfiles, useRoles } from '../../hooks/data'
import { AgentAvatar } from '../../components/agents/AgentAvatar'
import { Button } from '../../components/ui/Button'
import { Field, Input } from '../../components/ui/Field'
import { ProgressBar } from '../../components/ui/bits'
import { toast } from '../../components/ui/Toast'
import { ServiceMark } from '../../components/ui/ProviderMark'
import { BrandMark } from '../../app/Sidebar'
import { ConnectAIFlow } from '../settings/ConnectAI'

type Step = 'you' | 'look' | 'ai' | 'brain' | 'team'

const STEPS: { id: Step; label: string }[] = [
  { id: 'you', label: 'You' },
  { id: 'look', label: 'Look' },
  { id: 'ai', label: 'AI' },
  { id: 'brain', label: 'Brain' },
  { id: 'team', label: 'Team' },
]

function Heading({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-8 text-center">
      <div className="text-[11px] font-semibold tracking-[0.2em] text-[color-mix(in_oklab,var(--accent)_65%,white)] uppercase">{eyebrow}</div>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-balance md:text-5xl">{title}</h1>
      {children && <p className="mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-pretty text-soft">{children}</p>}
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'h-9 rounded-full border px-4 text-[13px] font-medium transition',
        active ? 'border-transparent bg-white text-ink-950' : 'border-white/[0.1] bg-white/[0.03] text-soft hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  Steps                                                              */
/* ------------------------------------------------------------------ */

function YouStep({ settings, update }: { settings: Settings; update: (p: Partial<Settings>) => void }) {
  const [rename, setRename] = useState(!!settings.osName)
  const osName = osNameOf(settings)
  return (
    <>
      <Heading eyebrow="Step one" title="Let’s make it yours">
        A few details so your team knows who they’re working for.
      </Heading>
      <div className="mb-8 text-center">
        <motion.div
          key={osName}
          initial={{ opacity: 0.4, y: 6, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          className="font-display text-6xl font-bold tracking-tight md:text-7xl"
        >
          <span className="text-gradient">{osName}</span>
        </motion.div>
        <p className="mt-2 text-[13px] text-muted">Your own operating system</p>
      </div>
      <div className="glass space-y-4 rounded-3xl p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name">
            <Input value={settings.userName} onChange={(e) => update({ userName: e.target.value })} placeholder="e.g. Adam Smith" autoFocus />
          </Field>
          <Field label="Company">
            <Input value={settings.companyName} onChange={(e) => update({ companyName: e.target.value })} placeholder="e.g. Brightside PR" />
          </Field>
        </div>
        <Field label="What you do">
          <Input value={settings.userRole} onChange={(e) => update({ userRole: e.target.value })} placeholder="e.g. Founder and managing director" />
        </Field>
        {rename ? (
          <Field label="Call it something else" hint="Leave blank to use your name.">
            <Input value={settings.osName} onChange={(e) => update({ osName: e.target.value })} placeholder={osNameOf({ ...settings, osName: '' })} />
          </Field>
        ) : (
          <button onClick={() => setRename(true)} className="text-[13px] text-muted underline-offset-4 hover:text-fg hover:underline">
            Want to call it something else?
          </button>
        )}
      </div>
    </>
  )
}

function LookStep({ settings, update }: { settings: Settings; update: (p: Partial<Settings>) => void }) {
  return (
    <>
      <Heading eyebrow="Step two" title="Pick your colours">
        Changes the whole OS instantly. You can switch any time in Settings.
      </Heading>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ACCENTS.map((a) => {
          const active = settings.accent === a.id
          return (
            <button
              key={a.id}
              onClick={() => update({ accent: a.id })}
              className={cn(
                'group relative overflow-hidden rounded-3xl border p-4 text-left transition',
                active ? 'border-transparent bg-white/[0.07]' : 'border-white/[0.08] bg-white/[0.03] hover:-translate-y-0.5 hover:border-white/[0.16]',
              )}
              style={active ? { boxShadow: `inset 0 0 0 2px ${a.colors[0]}, 0 18px 50px -24px ${a.colors[0]}` } : undefined}
            >
              <div className="relative mb-4 h-20 overflow-hidden rounded-2xl bg-ink-900">
                <div className="absolute -top-6 -left-4 size-24 rounded-full opacity-70 blur-2xl" style={{ background: a.colors[0] }} />
                <div className="absolute -right-6 -bottom-8 size-24 rounded-full opacity-60 blur-2xl" style={{ background: a.colors[1] }} />
                <div
                  className="absolute top-1/2 left-1/2 size-9 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ background: `radial-gradient(circle at 32% 28%, #fff, ${a.colors[0]} 45%, #0b0c12 100%)`, boxShadow: `0 0 22px ${a.colors[0]}` }}
                />
                <div className="absolute bottom-2.5 left-3 h-1.5 w-12 rounded-full" style={{ background: `linear-gradient(90deg, ${a.colors[0]}, ${a.colors[1]})` }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold">{a.name}</span>
                {active && (
                  <span className="grid size-5 place-items-center rounded-full text-ink-950" style={{ background: a.colors[0] }}>
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div>
          <div className="mb-2.5 text-[12px] font-medium text-muted">Welcome animation</div>
          <div className="flex flex-wrap gap-2">
            <Chip active={settings.introMode === 'always'} onClick={() => update({ introMode: 'always' })}>
              Every time
            </Chip>
            <Chip active={settings.introMode === 'daily'} onClick={() => update({ introMode: 'daily' })}>
              Once a day
            </Chip>
            <Chip active={settings.introMode === 'never'} onClick={() => update({ introMode: 'never' })}>
              Never
            </Chip>
          </div>
        </div>
        <div>
          <div className="mb-2.5 text-[12px] font-medium text-muted">Spelling</div>
          <div className="flex flex-wrap gap-2">
            <Chip active={settings.spelling === 'british'} onClick={() => update({ spelling: 'british' })}>
              British
            </Chip>
            <Chip active={settings.spelling === 'american'} onClick={() => update({ spelling: 'american' })}>
              American
            </Chip>
          </div>
        </div>
      </div>
    </>
  )
}

function AIStep({ onNext }: { onNext: () => void }) {
  const profiles = useProfiles()
  const [adding, setAdding] = useState(false)
  const connected = profiles[0]
  return (
    <>
      <Heading eyebrow="Step three" title="Connect an AI">
        Your agents think with an AI service such as Claude. You’ll need an account and a key, and we’ll show you exactly where to find it.
      </Heading>
      {connected && !adding ? (
        <div className="glass flex flex-col items-center gap-4 rounded-3xl p-8 text-center">
          <div className="relative">
            <ServiceMark id={connected.provider} size={64} />
            <span className="absolute -right-1.5 -bottom-1.5 grid size-7 place-items-center rounded-full bg-good text-ink-950 ring-4 ring-ink-900">
              <Check className="size-4" strokeWidth={3} />
            </span>
          </div>
          <div>
            <div className="text-lg font-semibold">You’re connected</div>
            <div className="text-sm text-muted">
              {getProvider(connected.provider).company} · {modelLabel(connected.provider, connected.model)}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setAdding(true)}>
              Add another
            </Button>
            <Button variant="primary" iconRight={<ArrowRight />} onClick={onNext}>
              Continue
            </Button>
          </div>
        </div>
      ) : (
        <div className="glass rounded-3xl p-6">
          <ConnectAIFlow
            onDone={(p) => {
              setAdding(false)
              toast.success(`${p.name} connected`, 'Your agents are now live.')
            }}
          />
        </div>
      )}
      {!connected && (
        <p className="mt-5 text-center text-[13px] text-muted">
          Not ready yet?{' '}
          <button onClick={onNext} className="text-soft underline-offset-4 hover:text-fg hover:underline">
            Explore in demo mode first
          </button>
          . Your agents will give sample answers until you connect.
        </p>
      )}
    </>
  )
}

function BrainStep() {
  const brain = useSettings((s) => s.settings.brain)
  const [busy, setBusy] = useState<'fs' | 'upload' | 'sample' | null>(null)
  const [progress, setProgress] = useState<{ found: number; read: number } | null>(null)
  const [help, setHelp] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const linked = brain.mode !== 'none'

  const run = async (kind: 'fs' | 'upload' | 'sample', fn: () => Promise<{ name: string; count: number } | number>) => {
    setBusy(kind)
    setProgress(null)
    try {
      const r = await fn()
      if (typeof r === 'number') toast.success('Sample brain ready', `${formatNumber(r)} example notes to explore.`)
      else toast.success(`“${r.name}” linked`, `${formatNumber(r.count)} notes are ready for your team.`)
    } catch (err) {
      if (!isAbortError(err)) toast.error('Couldn’t read your vault', errorMessage(err))
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }

  const options = [
    ...(canLinkFolders()
      ? [
          {
            id: 'fs' as const,
            icon: <FolderSync />,
            title: 'Link my vault folder',
            body: 'Stays up to date, and agents can save new notes into it. They never change your existing notes.',
            tag: 'Best',
            onClick: () => void run('fs', () => linkVaultFolder(setProgress)),
          },
        ]
      : []),
    {
      id: 'upload' as const,
      icon: <Upload />,
      title: canLinkFolders() ? 'Upload a copy instead' : 'Upload my vault',
      body: 'Works in any browser. Upload again whenever you want to refresh it.',
      onClick: () => fileRef.current?.click(),
    },
    {
      id: 'sample' as const,
      icon: <Sparkles />,
      title: 'Try the sample brain first',
      body: 'Explore with example notes from a fictional PR agency. Link your own whenever you like.',
      onClick: () => void run('sample', loadSampleBrain),
    },
  ]

  return (
    <>
      <Heading eyebrow="Step four" title="Link your Obsidian brain">
        Your notes give every agent context about clients, people and past work. Everything stays on this computer.
      </Heading>
      {linked && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-good/25 bg-good/10 px-4 py-3">
          <Brain className="size-5 text-good" />
          <div className="flex-1 text-sm">
            <span className="font-semibold">{brain.name}</span> is linked · {formatNumber(brain.noteCount ?? 0)} notes
          </div>
          <Check className="size-4 text-good" />
        </div>
      )}
      <div className="grid gap-3">
        {options.map((o) => (
          <button
            key={o.id}
            onClick={o.onClick}
            disabled={!!busy}
            className="group flex items-start gap-4 rounded-3xl border border-white/[0.08] bg-white/[0.03] p-5 text-left transition hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.05] disabled:opacity-60"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(135deg,color-mix(in_oklab,var(--accent)_30%,transparent),color-mix(in_oklab,var(--accent-2)_18%,transparent))] text-fg [&_svg]:size-5">
              {o.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 font-semibold">
                {o.title}
                {'tag' in o && o.tag && <span className="rounded-full bg-good/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-good uppercase">{o.tag}</span>}
              </span>
              <span className="mt-1 block text-[13px] leading-snug text-muted">{o.body}</span>
              {busy === o.id && (
                <span className="mt-3 block">
                  <ProgressBar value={progress && progress.found ? (progress.read / progress.found) * 100 : 8} />
                  <span className="mt-1.5 block text-[12px] text-muted">
                    {progress?.found ? `Reading notes… ${formatNumber(progress.read)} of ${formatNumber(progress.found)}` : 'Waiting for you to choose a folder…'}
                  </span>
                </span>
              )}
            </span>
            <ArrowRight className="mt-1 size-4 shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-fg" />
          </button>
        ))}
      </div>
      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        {...{ webkitdirectory: '' }}
        onChange={(e) => {
          const files = e.target.files
          if (files?.length) void run('upload', () => uploadVault(files, setProgress))
          e.target.value = ''
        }}
      />
      <div className="mt-5 text-center">
        <button onClick={() => setHelp((v) => !v)} className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
          Where’s my vault? <ChevronDown className={cn('size-4 transition', help && 'rotate-180')} />
        </button>
        {help && (
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-soft">
            In Obsidian, click your vault’s name at the bottom left and choose <b>Manage vaults</b>. The folder location is shown under each vault. It’s the folder with all your
            notes in it.
          </p>
        )}
      </div>
    </>
  )
}

function TeamStep({ keepSamples, setKeepSamples }: { keepSamples: boolean; setKeepSamples: (v: boolean) => void }) {
  const lead = useLead()
  const team = useActiveAgents().filter((a) => a.id !== lead?.id)
  const roles = useRoles()
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name
  return (
    <>
      <Heading eyebrow="Last step" title="Meet your team">
        Specialists on call around the clock. Swap anyone in or out from the Agents page whenever the job changes.
      </Heading>
      {lead && (
        <div className="glass mb-4 flex items-center gap-5 rounded-3xl p-5">
          <AgentAvatar agent={lead} size="lg" active />
          <div className="min-w-0">
            <div className="text-lg font-semibold">
              {lead.name} <span className="font-normal text-muted">· your {roleName(lead.roleId)?.toLowerCase()}</span>
            </div>
            <p className="text-[13.5px] text-soft">Ask {lead.name} anything. They’ll plan it, do it, or hand it to the right specialist.</p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {team.map((a, i) => (
          <motion.div
            key={a.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i }}
            className="flex flex-col items-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.025] px-2 py-4 text-center"
          >
            <AgentAvatar agent={a} size="md" />
            <div>
              <div className="text-[13px] font-semibold">{a.name}</div>
              <div className="line-clamp-1 text-[11.5px] text-muted">{roleName(a.roleId)}</div>
            </div>
          </motion.div>
        ))}
      </div>
      <div className="mt-8">
        <div className="mb-2.5 text-center text-[12px] font-medium text-muted">Start with example projects and meetings?</div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { value: true, title: 'Keep the examples', body: 'Sample clients, projects and a deck to explore. Remove them any time in Settings.' },
            { value: false, title: 'Start with a clean slate', body: 'An empty workspace, ready for your own projects.' },
          ].map((o) => (
            <button
              key={String(o.value)}
              onClick={() => setKeepSamples(o.value)}
              className={cn(
                'rounded-2xl border p-4 text-left transition',
                keepSamples === o.value
                  ? 'border-[color-mix(in_oklab,var(--accent)_60%,transparent)] bg-white/[0.06]'
                  : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.16]',
              )}
            >
              <div className="flex items-center justify-between gap-2 text-[14px] font-semibold">
                {o.title}
                <span
                  className={cn(
                    'grid size-5 place-items-center rounded-full border',
                    keepSamples === o.value ? 'border-transparent bg-[var(--accent)] text-white' : 'border-white/20',
                  )}
                >
                  {keepSamples === o.value && <Check className="size-3" strokeWidth={3} />}
                </span>
              </div>
              <p className="mt-1 text-[12.5px] text-muted">{o.body}</p>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Wizard                                                             */
/* ------------------------------------------------------------------ */

export default function Onboarding() {
  const navigate = useNavigate()
  const settings = useSettings((s) => s.settings)
  const updateSettings = useSettings((s) => s.update)
  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState(1)
  const [keepSamples, setKeepSamples] = useState(settings.demoData)
  const [finishing, setFinishing] = useState(false)
  const step = STEPS[index].id
  const osName = osNameOf(settings)
  const update = (p: Partial<Settings>) => void updateSettings(p)

  const go = (to: number) => {
    setDirection(to > index ? 1 : -1)
    setIndex(Math.max(0, Math.min(STEPS.length - 1, to)))
  }

  const finish = async () => {
    setFinishing(true)
    try {
      if (!keepSamples && settings.demoData) {
        await clearDemoData()
        await updateSettings({ demoData: false })
      }
      if (!settings.userName.trim()) await updateSettings({ userName: 'there' })
      await updateSettings({ onboarded: true })
      navigate('/')
      toast.success(`Welcome to ${osName}`, 'Press ⌘K any time to search or ask your team.')
    } finally {
      setFinishing(false)
    }
  }

  const canContinue = step !== 'you' || settings.userName.trim().length > 0

  return (
    <motion.div className="fixed inset-0 z-[75] overflow-y-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="app-backdrop" />
      <div
        className="pointer-events-none fixed top-[-30vh] left-1/2 size-[80vh] -translate-x-1/2 rounded-full opacity-20 blur-[120px]"
        style={{ background: 'radial-gradient(circle, var(--accent), transparent 65%)' }}
      />
      <div className="relative flex min-h-dvh flex-col">
        <header className="flex items-center justify-between px-5 py-5 md:px-8">
          <div className="flex items-center gap-3">
            <BrandMark size={32} />
            <span className="font-display text-[17px] font-semibold tracking-tight">{osName}</span>
          </div>
          <button
            onClick={() => void updateSettings({ onboarded: true })}
            className="rounded-full px-3 py-1.5 text-[13px] text-muted transition hover:bg-white/[0.06] hover:text-fg"
          >
            Skip setup
          </button>
        </header>

        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-10">
          <nav className="mb-10 flex items-center justify-center gap-2" aria-label="Setup progress">
            {STEPS.map((s, i) => (
              <button key={s.id} onClick={() => i < index && go(i)} disabled={i > index} className="group flex items-center gap-2" aria-current={i === index ? 'step' : undefined}>
                <span
                  className={cn(
                    'grid size-7 place-items-center rounded-full text-[11px] font-semibold transition',
                    i < index && 'bg-[var(--accent)] text-white',
                    i === index && 'bg-white text-ink-950 shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_35%,transparent)]',
                    i > index && 'bg-white/[0.06] text-faint',
                  )}
                >
                  {i < index ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <span className={cn('hidden text-[12.5px] font-medium sm:inline', i === index ? 'text-fg' : 'text-muted')}>{s.label}</span>
                {i < STEPS.length - 1 && <span className={cn('mx-1 h-px w-6 sm:w-10', i < index ? 'bg-[var(--accent)]' : 'bg-white/[0.1]')} />}
              </button>
            ))}
          </nav>

          <div className="flex-1">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={step}
                custom={direction}
                initial={{ opacity: 0, x: direction * 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -40 }}
                transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              >
                {step === 'you' && <YouStep settings={settings} update={update} />}
                {step === 'look' && <LookStep settings={settings} update={update} />}
                {step === 'ai' && <AIStep onNext={() => go(index + 1)} />}
                {step === 'brain' && <BrainStep />}
                {step === 'team' && <TeamStep keepSamples={keepSamples} setKeepSamples={setKeepSamples} />}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="mt-10 flex items-center justify-between">
            <Button variant="ghost" icon={<ArrowLeft />} onClick={() => go(index - 1)} className={cn(index === 0 && 'invisible')}>
              Back
            </Button>
            {step === 'team' ? (
              <Button variant="primary" size="lg" iconRight={<ArrowRight />} loading={finishing} onClick={() => void finish()}>
                Enter {osName}
              </Button>
            ) : (
              <Button variant="primary" size="lg" iconRight={<ArrowRight />} disabled={!canContinue} onClick={() => go(index + 1)}>
                {step === 'ai' ? 'Continue' : 'Next'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
