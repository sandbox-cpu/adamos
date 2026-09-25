import { useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Check, Copy, Download, Eye, EyeOff, KeyRound, Lock, LockOpen, MoreHorizontal, Pencil, Plus, ShieldCheck, Sparkles, Trash2, Upload } from 'lucide-react'
import { passphraseStrength } from '../../lib/crypto'
import { SERVICES, getService, type ServiceInfo } from '../../lib/services'
import type { VaultSecret } from '../../lib/types'
import { cn, copyText, downloadText, groupBy, isoDate, timeAgo } from '../../lib/utils'
import { useVault } from '../../stores/vault'
import { useSettings } from '../../stores/settings'
import { useProfiles, useSecrets } from '../../hooks/data'
import { PageHeader, Panel } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Empty, Menu } from '../../components/ui/bits'
import { Field, Input, Select, Toggle } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { toast } from '../../components/ui/Toast'
import { ServiceMark } from '../../components/ui/ProviderMark'

function LockHero({ status }: { status: string }) {
  const open = status === 'unlocked'
  return (
    <div className="relative grid size-24 place-items-center">
      <motion.div className="absolute inset-0 rounded-[30%]" animate={{ rotate: 360 }} transition={{ duration: 18, repeat: Infinity, ease: 'linear' }} style={{ background: 'conic-gradient(from 0deg, var(--accent), var(--accent-2), var(--accent-3), var(--accent))', opacity: 0.55, filter: 'blur(14px)' }} />
      <div className="relative grid size-20 place-items-center rounded-[28%] border border-white/15 bg-ink-900">
        {open ? <LockOpen className="size-9 text-good" /> : <Lock className="size-9 text-fg" />}
      </div>
    </div>
  )
}

function SetupVault() {
  const setup = useVault((s) => s.setup)
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const strength = passphraseStrength(pass)
  return (
    <Panel className="mx-auto max-w-xl p-8 text-center">
      <div className="flex justify-center">
        <LockHero status="uninitialized" />
      </div>
      <h2 className="mt-6 font-display text-2xl font-semibold">Create your vault</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">Your API keys are locked with a password only you know. They’re encrypted on this device and never sent anywhere except the service they belong to.</p>
      <div className="mt-6 space-y-3 text-left">
        <Input type="password" placeholder="Choose a vault password" value={pass} onChange={(e) => setPass(e.target.value)} />
        <Input type="password" placeholder="Type it again" value={pass2} onChange={(e) => setPass2(e.target.value)} />
        <div className="flex items-center gap-2">
          <div className="flex flex-1 gap-1">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className={cn('h-1 flex-1 rounded-full', strength.score >= n ? (strength.score >= 3 ? 'bg-good' : strength.score === 2 ? 'bg-warn' : 'bg-bad') : 'bg-white/10')} />
            ))}
          </div>
          <span className="w-16 text-right text-[11px] text-muted">{pass ? strength.label : ''}</span>
        </div>
        <p className="text-xs text-faint">Tip: four random words make a strong, memorable password.</p>
        <Toggle checked={remember} onChange={setRemember} label="Keep unlocked on this computer" description="Recommended for your own device." />
      </div>
      <Button
        variant="primary"
        size="lg"
        className="mt-6 w-full"
        disabled={strength.score < 2 || pass !== pass2}
        loading={busy}
        onClick={async () => {
          setBusy(true)
          await setup(pass, remember)
          setBusy(false)
          toast.success('Vault created', 'Add your first key.')
        }}
      >
        Create vault
      </Button>
    </Panel>
  )
}

function UnlockVault() {
  const unlock = useVault((s) => s.unlock)
  const remembered = useVault((s) => s.remembered)
  const [pass, setPass] = useState('')
  const [remember, setRemember] = useState(remembered)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Panel className="mx-auto max-w-md p-8 text-center">
      <div className="flex justify-center">
        <LockHero status="locked" />
      </div>
      <h2 className="mt-6 font-display text-2xl font-semibold">Vault locked</h2>
      <p className="mt-2 text-sm text-muted">Enter your vault password to manage keys and let your agents work.</p>
      <form
        className="mt-6 space-y-3 text-left"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError('')
          const ok = await unlock(pass, remember)
          setBusy(false)
          if (!ok) setError('That password didn’t work.')
        }}
      >
        <Input autoFocus type="password" placeholder="Vault password" value={pass} onChange={(e) => setPass(e.target.value)} />
        {error && <p className="text-sm text-bad">{error}</p>}
        <Toggle checked={remember} onChange={setRemember} label="Keep unlocked on this computer" />
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={!pass}>
          Unlock
        </Button>
      </form>
    </Panel>
  )
}

function SecretRow({ secret, usedBy, onEdit }: { secret: VaultSecret; usedBy: number; onEdit: () => void }) {
  const reveal = useVault((s) => s.reveal)
  const deleteSecret = useVault((s) => s.deleteSecret)
  const [shown, setShown] = useState<string | null>(null)
  const service = getService(secret.service)
  const show = async () => {
    if (shown) {
      setShown(null)
      return
    }
    const values = await reveal(secret.id)
    setShown(values.apiKey ?? values.clientId ?? Object.values(values)[0] ?? '')
    setTimeout(() => setShown(null), 12_000)
  }
  return (
    <div className="flex flex-wrap items-center gap-4 px-5 py-4">
      <ServiceMark id={secret.service} size={40} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{secret.label}</div>
        <div className="text-xs text-muted">
          {service.name}
          {usedBy > 0 && ` · used by ${usedBy} AI profile${usedBy === 1 ? '' : 's'}`}
          {secret.lastUsed ? ` · last used ${timeAgo(secret.lastUsed)}` : ' · not used yet'}
        </div>
      </div>
      <code className="max-w-[260px] truncate rounded-lg bg-black/30 px-2.5 py-1 font-mono text-xs text-soft">{shown ?? `••••••••${secret.hint}`}</code>
      <div className="flex items-center gap-1">
        <button onClick={() => void show()} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/[0.07] hover:text-fg" aria-label={shown ? 'Hide' : 'Reveal'} title={shown ? 'Hide' : 'Reveal for 12 seconds'}>
          {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
        <button
          onClick={async () => {
            const values = await reveal(secret.id)
            await copyText(values.apiKey ?? values.clientId ?? Object.values(values)[0] ?? '')
            toast.success('Copied to clipboard')
          }}
          className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/[0.07] hover:text-fg"
          aria-label="Copy"
        >
          <Copy className="size-4" />
        </button>
        <Menu
          trigger={(open) => (
            <button onClick={open} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/[0.07] hover:text-fg" aria-label="More">
              <MoreHorizontal className="size-4" />
            </button>
          )}
          items={[
            { label: 'Edit or replace', icon: <Pencil />, onSelect: onEdit },
            'divider',
            {
              label: 'Delete key',
              icon: <Trash2 />,
              danger: true,
              onSelect: async () => {
                await deleteSecret(secret.id)
                toast.info('Key deleted', usedBy ? 'Profiles that used it will need a new key.' : undefined)
              },
            },
          ]}
        />
      </div>
    </div>
  )
}

function SecretModal({ open, onClose, editing }: { open: boolean; onClose: () => void; editing?: VaultSecret }) {
  const addSecret = useVault((s) => s.addSecret)
  const updateSecret = useVault((s) => s.updateSecret)
  const [service, setService] = useState<ServiceInfo | null>(editing ? getService(editing.service) : null)
  const [label, setLabel] = useState(editing?.label ?? '')
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const grouped = useMemo(() => groupBy(SERVICES, (s) => s.category), [])
  const reset = () => {
    setService(null)
    setLabel('')
    setValues({})
  }
  const close = () => {
    reset()
    onClose()
  }
  const ready = service && service.fields.every((f) => f.optional || (values[f.key] ?? '').trim()) && (editing ? true : true)
  return (
    <Modal
      open={open}
      onClose={close}
      title={editing ? 'Edit key' : service ? `Add ${service.name}` : 'Add a key'}
      subtitle={service?.description ?? 'Choose what this key is for.'}
      icon={<KeyRound />}
      size="lg"
      footer={
        service ? (
          <>
            {!editing && (
              <Button variant="ghost" onClick={() => setService(null)}>
                Back
              </Button>
            )}
            <Button
              variant="primary"
              loading={busy}
              disabled={!ready && !editing}
              onClick={async () => {
                setBusy(true)
                try {
                  const clean = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]))
                  if (editing) await updateSecret(editing.id, { label: label || editing.label, values: Object.keys(clean).length ? clean : undefined })
                  else await addSecret({ service: service.id, label: label || `${service.name} key`, values: clean })
                  toast.success(editing ? 'Key updated' : 'Key saved', 'Encrypted in your vault.')
                  close()
                } catch (err) {
                  toast.error('Couldn’t save the key', err instanceof Error ? err.message : undefined)
                } finally {
                  setBusy(false)
                }
              }}
            >
              {editing ? 'Save' : 'Save key'}
            </Button>
          </>
        ) : undefined
      }
    >
      {!service ? (
        <div className="space-y-5">
          {Object.entries(grouped).map(([cat, list]) => (
            <div key={cat}>
              <div className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-faint uppercase">{cat}</div>
              <div className="grid gap-2 sm:grid-cols-3">
                {list.map((s) => (
                  <button key={s.id} onClick={() => setService(s)} className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-left transition hover:border-white/20 hover:bg-white/[0.05]">
                    <ServiceMark id={s.id} size={30} />
                    <span className="truncate text-sm">{s.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Label">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={editing?.label ?? `${service.name} key`} />
          </Field>
          {service.fields.map((f) => (
            <Field key={f.key} label={f.label} hint={editing ? 'leave blank to keep the current value' : f.optional ? 'optional' : undefined}>
              <Input
                type={f.secret ? 'password' : 'text'}
                value={values[f.key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="font-mono text-[13px]"
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
          ))}
          {service.helpUrl && (
            <a href={service.helpUrl} target="_blank" rel="noopener noreferrer" className="inline-flex text-[13px] font-medium text-[color-mix(in_oklab,var(--accent)_60%,white)] hover:underline">
              Where do I find this?
            </a>
          )}
        </div>
      )}
    </Modal>
  )
}

function Security() {
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const remembered = useVault((s) => s.remembered)
  const setRemember = useVault((s) => s.setRemember)
  const setAutoLock = useVault((s) => s.setAutoLock)
  const lock = useVault((s) => s.lock)
  const changePassphrase = useVault((s) => s.changePassphrase)
  const exportBackup = useVault((s) => s.exportBackup)
  const importBackup = useVault((s) => s.importBackup)
  const [changing, setChanging] = useState(false)
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <Panel className="space-y-5 p-6">
      <div className="flex items-center gap-2.5">
        <ShieldCheck className="size-5 text-good" />
        <h3 className="font-semibold">Security</h3>
      </div>
      <ul className="space-y-2 text-[13px] text-muted">
        <li className="flex gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-good" /> AES-256 encryption with a key made from your password (600,000 rounds of PBKDF2).
        </li>
        <li className="flex gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-good" /> Keys are stored only on this device and only decrypted in memory when needed.
        </li>
        <li className="flex gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-good" /> Each key is only ever sent to the service it belongs to.
        </li>
      </ul>
      <div className="space-y-4 border-t border-white/[0.06] pt-5">
        <Toggle checked={remembered} onChange={(v) => void setRemember(v)} label="Keep unlocked on this computer" description="When off, you’ll be asked for your password after a period of inactivity." />
        {!remembered && (
          <Field label="Lock automatically after">
            <Select
              value={settings.vault.autoLockMinutes}
              onChange={(e) => {
                const m = Number(e.target.value)
                setAutoLock(m)
                void update({ vault: { autoLockMinutes: m } })
              }}
            >
              <option value={5}>5 minutes</option>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
              <option value={240}>4 hours</option>
              <option value={0}>Only when I close the browser</option>
            </Select>
          </Field>
        )}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-5">
        <Button variant="secondary" size="sm" icon={<Lock />} onClick={() => void lock()}>
          Lock now
        </Button>
        <Button variant="secondary" size="sm" icon={<KeyRound />} onClick={() => setChanging(true)}>
          Change password
        </Button>
        <Button variant="secondary" size="sm" icon={<Download />} onClick={async () => downloadText(await exportBackup(), `vault-backup-${isoDate()}.json`, 'application/json')}>
          Encrypted backup
        </Button>
        <Button variant="secondary" size="sm" icon={<Upload />} onClick={() => fileRef.current?.click()}>
          Import backup
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            const pass = window.prompt('Password for that backup')
            if (!pass) return
            try {
              const n = await importBackup(await f.text(), pass)
              toast.success(`${n} keys imported`)
            } catch (err) {
              toast.error('Import failed', err instanceof Error ? err.message : undefined)
            }
          }}
        />
      </div>
      <Modal
        open={changing}
        onClose={() => setChanging(false)}
        title="Change vault password"
        size="sm"
        footer={
          <Button
            variant="primary"
            disabled={passphraseStrength(next).score < 2 || !cur}
            onClick={async () => {
              const ok = await changePassphrase(cur, next)
              if (ok) {
                toast.success('Password changed')
                setChanging(false)
                setCur('')
                setNext('')
              } else toast.error('Current password is wrong')
            }}
          >
            Change password
          </Button>
        }
      >
        <div className="space-y-3">
          <Input type="password" placeholder="Current password" value={cur} onChange={(e) => setCur(e.target.value)} />
          <Input type="password" placeholder="New password" value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
      </Modal>
    </Panel>
  )
}

export default function VaultPage() {
  const status = useVault((s) => s.status)
  const secrets = useSecrets()
  const profiles = useProfiles()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<VaultSecret | undefined>()
  const grouped = useMemo(() => groupBy(secrets, (s) => getService(s.service).category), [secrets])

  return (
    <div>
      <PageHeader
        eyebrow="System"
        title="API Vault"
        subtitle="Every key your OS uses, encrypted and in one place."
        actions={
          status === 'unlocked' && (
            <Button variant="primary" icon={<Plus />} onClick={() => setAdding(true)}>
              Add a key
            </Button>
          )
        }
      />
      {status === 'uninitialized' && <SetupVault />}
      {status === 'locked' && <UnlockVault />}
      {status === 'unlocked' && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-5">
            {secrets.length === 0 && (
              <Empty
                icon={<Sparkles />}
                title="Your vault is ready"
                body="Add keys for AI services, image tools and anything else. The easiest way to connect an AI is Settings → AI."
                action={
                  <Button variant="primary" icon={<Plus />} onClick={() => setAdding(true)}>
                    Add a key
                  </Button>
                }
              />
            )}
            {Object.entries(grouped).map(([cat, list]) => (
              <Panel key={cat}>
                <div className="px-5 pt-4 text-[11px] font-semibold tracking-[0.16em] text-faint uppercase">{cat}</div>
                <div className="divide-y divide-white/[0.05]">
                  {list.map((s) => (
                    <SecretRow key={s.id} secret={s} usedBy={profiles.filter((p) => p.keyId === s.id).length} onEdit={() => setEditing(s)} />
                  ))}
                </div>
              </Panel>
            ))}
          </div>
          <Security />
        </div>
      )}
      <SecretModal key={adding ? 'add' : 'closed'} open={adding} onClose={() => setAdding(false)} />
      <SecretModal key={editing?.id ?? 'none'} open={!!editing} editing={editing} onClose={() => setEditing(undefined)} />
    </div>
  )
}
