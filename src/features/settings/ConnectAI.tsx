import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ArrowRight, Check, ChevronDown, CircleAlert, ExternalLink, Eye, EyeOff, LoaderCircle, RefreshCw, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import { db } from '../../lib/db'
import { DEPTH_LABELS, getProvider, PROVIDERS, type ProviderInfo } from '../../lib/llm/providers'
import { listModels, testProfile } from '../../lib/llm'
import { FriendlyError } from '../../lib/llm/errors'
import { passphraseStrength } from '../../lib/crypto'
import type { AIProfile, Depth, ProviderId } from '../../lib/types'
import { cn, uid } from '../../lib/utils'
import { useVault } from '../../stores/vault'
import { useSettings } from '../../stores/settings'
import { Button } from '../../components/ui/Button'
import { Field, Input, Select, Slider, Toggle } from '../../components/ui/Field'
import { ServiceMark } from '../../components/ui/ProviderMark'

const KEY_STEPS: Partial<Record<ProviderId, string[]>> = {
  anthropic: ['Open the Claude Console and sign in', 'Go to Settings → API keys and press “Create key”', 'Copy the key and paste it below'],
  openai: ['Open the OpenAI platform and sign in', 'Go to API keys and create a new secret key', 'Copy the key and paste it below'],
  gemini: ['Open Google AI Studio and sign in with Google', 'Press “Get API key” then “Create API key”', 'Copy the key and paste it below'],
  openrouter: ['Open OpenRouter and sign in', 'Go to Keys and create a key', 'Copy the key and paste it below'],
  ollama: ['Install Ollama on this computer', 'Run a model, e.g. “ollama run llama3.2”', 'Allow browser access: set OLLAMA_ORIGINS to this site’s address'],
}

export function ConnectAIFlow({ existing, onDone, onCancel }: { existing?: AIProfile; onDone: (profile: AIProfile) => void; onCancel?: () => void }) {
  const vaultStatus = useVault((s) => s.status)
  const settings = useSettings((s) => s.settings)
  const [step, setStep] = useState<'provider' | 'setup'>(existing ? 'setup' : 'provider')
  const [provider, setProvider] = useState<ProviderId>(existing?.provider ?? 'anthropic')
  const info = getProvider(provider)
  const [key, setKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [reuseKeyId, setReuseKeyId] = useState<string | undefined>(existing?.keyId)
  const [model, setModel] = useState(existing?.model ?? info.models.find((m) => m.recommended)?.id ?? info.models[0]?.id ?? '')
  const [customModel, setCustomModel] = useState('')
  const [depth, setDepth] = useState<Depth>(existing?.depth ?? 'balanced')
  const [webSearch, setWebSearch] = useState(existing?.webSearch ?? true)
  const [name, setName] = useState(existing?.name ?? '')
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? info.baseUrl ?? '')
  const [creativity, setCreativity] = useState<number | undefined>(existing?.creativity)
  const [advanced, setAdvanced] = useState(false)
  const [models, setModels] = useState<{ id: string; label: string }[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [remember, setRemember] = useState(true)
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<{ ok: boolean; message: string; hint?: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [existingKeys, setExistingKeys] = useState<{ id: string; label: string; hint: string }[]>([])
  const [more, setMore] = useState(false)

  useEffect(() => {
    void db.secrets
      .where('service')
      .equals(provider)
      .toArray()
      .then((rows) => {
        setExistingKeys(rows.map((r) => ({ id: r.id, label: r.label, hint: r.hint })))
        if (!existing && rows[0]) setReuseKeyId(rows[0].id)
        if (!rows.length) setReuseKeyId(undefined)
      })
  }, [provider, existing])

  const chooseProvider = (p: ProviderInfo) => {
    setProvider(p.id)
    setModel(p.models.find((m) => m.recommended)?.id ?? p.models[0]?.id ?? '')
    setBaseUrl(p.baseUrl ?? '')
    setWebSearch(p.webSearch)
    setModels([])
    setTest(null)
    setStep('setup')
  }

  const effectiveModel = model === '__custom' ? customModel.trim() : model
  const needsVault = info.needsKey && !reuseKeyId && vaultStatus === 'uninitialized'
  const strength = passphraseStrength(pass)
  const vaultReady = !needsVault || (strength.score >= 2 && pass === pass2)
  const keyReady = !info.needsKey || !!reuseKeyId || key.trim().length > 8
  const canSave = !!effectiveModel && keyReady && vaultReady && (provider !== 'custom' || !!baseUrl.trim())

  const draftProfile = (): AIProfile => ({
    id: existing?.id ?? uid(),
    name: name.trim() || `${info.name} · ${info.models.find((m) => m.id === effectiveModel)?.label ?? effectiveModel}`,
    provider,
    model: effectiveModel,
    keyId: reuseKeyId,
    baseUrl: baseUrl.trim() && baseUrl.trim() !== info.baseUrl ? baseUrl.trim() : undefined,
    depth,
    creativity,
    webSearch: info.webSearch && webSearch,
    color: info.color,
    isDefault: existing?.isDefault,
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  })

  const liveKey = async (): Promise<string | undefined> => {
    if (!info.needsKey) return undefined
    if (key.trim()) return key.trim()
    if (reuseKeyId) return useVault.getState().getValue(reuseKeyId)
    return undefined
  }

  const runTest = async () => {
    setTesting(true)
    setTest(null)
    try {
      const res = await testProfile(draftProfile(), await liveKey())
      setTest({ ok: true, message: `Connected in ${(res.ms / 1000).toFixed(1)}s. It says: “${res.reply}”` })
    } catch (err) {
      setTest({ ok: false, message: err instanceof Error ? err.message : 'Connection failed', hint: err instanceof FriendlyError ? err.hint : undefined })
    } finally {
      setTesting(false)
    }
  }

  const fetchModels = async () => {
    setLoadingModels(true)
    try {
      const list = await listModels(draftProfile(), await liveKey())
      setModels(list)
      setTest(null)
    } catch (err) {
      setTest({ ok: false, message: err instanceof Error ? err.message : 'Couldn’t load models', hint: err instanceof FriendlyError ? err.hint : undefined })
    } finally {
      setLoadingModels(false)
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      const vault = useVault.getState()
      let keyId = reuseKeyId
      if (info.needsKey && key.trim()) {
        if (vault.status === 'uninitialized') await vault.setup(pass, remember)
        else if (vault.status === 'locked') await vault.requestUnlock('Unlock the vault to store this key.')
        const secret = await useVault.getState().addSecret({ service: provider, label: `${info.name} key`, values: { apiKey: key.trim() } })
        keyId = secret.id
      }
      const profile = { ...draftProfile(), keyId }
      const count = await db.profiles.count()
      if (!existing && count === 0) profile.isDefault = true
      await db.profiles.put(profile)
      if (profile.isDefault || !settings.defaultProfileId) await useSettings.getState().update({ defaultProfileId: profile.id })
      onDone(profile)
    } catch (err) {
      setTest({ ok: false, message: err instanceof Error ? err.message : 'Couldn’t save', hint: err instanceof FriendlyError ? err.hint : undefined })
    } finally {
      setSaving(false)
    }
  }

  const modelOptions = useMemo(() => {
    const base = info.models.map((m) => ({ id: m.id, label: `${m.label}${m.note ? ` — ${m.note}` : ''}` }))
    const extra = models.filter((m) => !base.some((b) => b.id === m.id)).map((m) => ({ id: m.id, label: m.label === m.id ? m.id : `${m.label} (${m.id})` }))
    return [...base, ...extra]
  }, [info, models])

  const featured = PROVIDERS.filter((p) => p.featured)
  const others = PROVIDERS.filter((p) => !p.featured)

  return (
    <AnimatePresence mode="wait">
      {step === 'provider' ? (
        <motion.div key="provider" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
          <p className="mb-4 text-sm text-muted">Pick the AI service your agents should think with. You can add more later and give different agents different AIs.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {featured.map((p) => (
              <button
                key={p.id}
                onClick={() => chooseProvider(p)}
                className="group relative flex items-start gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 text-left transition hover:border-white/20 hover:bg-white/[0.06]"
              >
                <ServiceMark id={p.id} size={42} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-semibold text-fg">
                    {p.name}
                    {p.id === 'anthropic' && (
                      <span className="rounded-full bg-[color-mix(in_oklab,var(--accent)_20%,transparent)] px-2 py-0.5 text-[10px] font-semibold text-[color-mix(in_oklab,var(--accent)_60%,white)]">
                        RECOMMENDED
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-faint">{p.company}</div>
                  <p className="mt-1.5 text-[13px] leading-snug text-muted">{p.blurb}</p>
                  {p.webSearch && (
                    <div className="mt-2 flex items-center gap-1 text-[11px] text-good">
                      <Zap className="size-3" /> Live web research
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
          <button onClick={() => setMore((m) => !m)} className="mt-4 flex items-center gap-1.5 text-sm text-muted hover:text-fg">
            More providers <ChevronDown className={cn('size-4 transition', more && 'rotate-180')} />
          </button>
          {more && (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {others.map((p) => (
                <button
                  key={p.id}
                  onClick={() => chooseProvider(p)}
                  className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-left text-sm transition hover:border-white/20"
                >
                  <ServiceMark id={p.id} size={30} />
                  <span className="min-w-0">
                    <span className="block truncate text-fg">{p.name}</span>
                    <span className="block truncate text-[11px] text-faint">{p.company}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {onCancel && (
            <div className="mt-6 flex justify-end">
              <Button variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            </div>
          )}
        </motion.div>
      ) : (
        <motion.div key="setup" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} className="space-y-5">
          <div className="flex items-center gap-3">
            {!existing && (
              <button onClick={() => setStep('provider')} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/[0.07] hover:text-fg" aria-label="Back">
                <ArrowLeft className="size-4" />
              </button>
            )}
            <ServiceMark id={provider} size={40} />
            <div>
              <div className="font-semibold">{info.name}</div>
              <div className="text-xs text-muted">{info.blurb}</div>
            </div>
          </div>

          {info.needsKey && (
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
              <div className="mb-3 text-sm font-medium">Your {info.name} key</div>
              {existingKeys.length > 0 && (
                <Select value={reuseKeyId ?? '__new'} onChange={(e) => setReuseKeyId(e.target.value === '__new' ? undefined : e.target.value)} className="mb-3">
                  {existingKeys.map((k) => (
                    <option key={k.id} value={k.id}>
                      Use saved key: {k.label} (••••{k.hint})
                    </option>
                  ))}
                  <option value="__new">Add a new key</option>
                </Select>
              )}
              {!reuseKeyId && (
                <>
                  {KEY_STEPS[provider] && (
                    <ol className="mb-3 space-y-1 text-[13px] text-muted">
                      {KEY_STEPS[provider]!.map((s, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-white/[0.08] text-[11px] font-semibold text-soft">{i + 1}</span>
                          {s}
                        </li>
                      ))}
                    </ol>
                  )}
                  {info.keyUrl && (
                    <a
                      href={info.keyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-[color-mix(in_oklab,var(--accent)_60%,white)] hover:underline"
                    >
                      Get a key <ExternalLink className="size-3.5" />
                    </a>
                  )}
                  <div className="relative">
                    <Input
                      type={showKey ? 'text' : 'password'}
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                      placeholder={info.keyPlaceholder ?? 'Paste your key'}
                      className="pr-10 font-mono text-[13px]"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button
                      onClick={() => setShowKey((s) => !s)}
                      className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-fg"
                      aria-label={showKey ? 'Hide key' : 'Show key'}
                    >
                      {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-faint">
                    <ShieldCheck className="size-3.5 text-good" /> Encrypted in your vault. It only ever goes to {info.company}.
                  </p>
                </>
              )}
            </div>
          )}

          {needsVault && key.trim() && (
            <div className="rounded-2xl border border-[color-mix(in_oklab,var(--accent)_30%,transparent)] bg-[color-mix(in_oklab,var(--accent)_7%,transparent)] p-4">
              <div className="text-sm font-medium">Create a vault password</div>
              <p className="mt-1 mb-3 text-xs text-muted">Your keys are locked with this password. Choose something memorable, like four random words.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input type="password" placeholder="Vault password" value={pass} onChange={(e) => setPass(e.target.value)} />
                <Input type="password" placeholder="Type it again" value={pass2} onChange={(e) => setPass2(e.target.value)} />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex flex-1 gap-1">
                  {[1, 2, 3, 4].map((n) => (
                    <div
                      key={n}
                      className={cn(
                        'h-1 flex-1 rounded-full',
                        strength.score >= n ? (strength.score >= 3 ? 'bg-good' : strength.score === 2 ? 'bg-warn' : 'bg-bad') : 'bg-white/10',
                      )}
                    />
                  ))}
                </div>
                <span className="text-[11px] text-muted">{pass ? strength.label : ''}</span>
              </div>
              {pass2 && pass !== pass2 && <p className="mt-1.5 text-xs text-bad">The passwords don’t match yet.</p>}
              <div className="mt-3">
                <Toggle
                  checked={remember}
                  onChange={setRemember}
                  label="Keep unlocked on this computer"
                  description="Recommended on your own device. Turn off to be asked each time."
                />
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Model"
              hint={
                info.needsKey || provider === 'ollama' ? (
                  <button onClick={() => void fetchModels()} className="flex items-center gap-1 text-[11px] text-muted hover:text-fg" disabled={loadingModels}>
                    {loadingModels ? <LoaderCircle className="size-3 animate-spin" /> : <RefreshCw className="size-3" />} Find models
                  </button>
                ) : undefined
              }
            >
              <Select value={model} onChange={(e) => setModel(e.target.value)}>
                {modelOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
                <option value="__custom">Other model…</option>
              </Select>
            </Field>
            {model === '__custom' ? (
              <Field label="Model name">
                <Input value={customModel} onChange={(e) => setCustomModel(e.target.value)} placeholder="Exact model id" />
              </Field>
            ) : (
              <Field label="Name this AI" hint="optional">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${info.name} · ${info.models.find((m) => m.id === model)?.label ?? ''}`} />
              </Field>
            )}
          </div>

          <div>
            <div className="mb-2 text-[13px] font-medium text-soft">How hard should it think?</div>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(DEPTH_LABELS) as Depth[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDepth(d)}
                  className={cn(
                    'rounded-2xl border px-3 py-2.5 text-left transition',
                    depth === d
                      ? 'border-[color-mix(in_oklab,var(--accent)_60%,transparent)] bg-[color-mix(in_oklab,var(--accent)_12%,transparent)]'
                      : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20',
                  )}
                >
                  <div className="text-sm font-medium">{DEPTH_LABELS[d].label}</div>
                  <div className="text-[11px] leading-snug text-muted">{DEPTH_LABELS[d].hint}</div>
                </button>
              ))}
            </div>
          </div>

          {info.webSearch && (
            <Toggle checked={webSearch} onChange={setWebSearch} label="Allow live web research" description="Research agents can search the web and cite sources." />
          )}

          <div>
            <button onClick={() => setAdvanced((a) => !a)} className="flex items-center gap-1.5 text-xs text-muted hover:text-fg">
              Advanced <ChevronDown className={cn('size-3.5 transition', advanced && 'rotate-180')} />
            </button>
            {advanced && (
              <div className="mt-3 space-y-4 rounded-2xl border border-white/[0.07] p-4">
                {info.protocol !== 'gemini' && (
                  <Field label="Service address" hint={provider === 'custom' ? 'required' : 'optional'}>
                    <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={info.baseUrl || 'https://…/v1'} className="font-mono text-[13px]" />
                  </Field>
                )}
                {info.protocol !== 'anthropic' && (
                  <div>
                    <div className="mb-2 flex items-center justify-between text-[13px] text-soft">
                      Creativity
                      <button onClick={() => setCreativity(undefined)} className="text-[11px] text-faint hover:text-fg">
                        {creativity === undefined ? 'Using default' : 'Reset'}
                      </button>
                    </div>
                    <Slider value={creativity ?? 0.7} min={0} max={1} step={0.05} onChange={setCreativity} left="Precise" right="Imaginative" />
                  </div>
                )}
              </div>
            )}
          </div>

          {test && (
            <div className={cn('flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm', test.ok ? 'border-good/25 bg-good/[0.06]' : 'border-bad/25 bg-bad/[0.06]')}>
              {test.ok ? <Check className="mt-0.5 size-4 shrink-0 text-good" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-bad" />}
              <div>
                <div className="text-fg">{test.message}</div>
                {test.hint && <div className="mt-0.5 text-xs text-muted">{test.hint}</div>}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
            <Button variant="secondary" onClick={() => void runTest()} loading={testing} disabled={!effectiveModel || (info.needsKey && !keyReady)} icon={<Sparkles />}>
              Test connection
            </Button>
            <div className="flex gap-2">
              {onCancel && (
                <Button variant="ghost" onClick={onCancel}>
                  Cancel
                </Button>
              )}
              <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!canSave} iconRight={<ArrowRight />}>
                {existing ? 'Save changes' : 'Connect'}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
