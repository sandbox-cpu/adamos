import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Brain,
  Camera,
  CameraOff,
  Check,
  ClipboardList,
  Copy,
  Hand,
  KeyRound,
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  PhoneOff,
  Radio,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Volume2,
} from 'lucide-react'
import { db } from '../../lib/db'
import { FriendlyError } from '../../lib/llm/errors'
import { BrowserVoiceSession, browserVoices, canUseBrowserVoice } from '../../lib/live/browser-voice'
import { GeminiLiveSession } from '../../lib/live/gemini-live'
import { OpenAIRealtimeSession } from '../../lib/live/openai-realtime'
import { liveInstructions, liveToolkit } from '../../lib/live/context'
import { canShareScreen, startCamera, startScreenShare } from '../../lib/live/screen'
import { GEMINI_VOICES, OPENAI_VOICES, type LiveEngineId, type LiveEvents, type LiveSession, type LiveStatus, type TranscriptEntry } from '../../lib/live/types'
import { addCallActions, logCall, saveCallToBrain, summariseCall, transcriptText, type CallSummary } from '../../lib/live/wrapup'
import type { Agent } from '../../lib/types'
import { cn, copyText, errorMessage, uid } from '../../lib/utils'
import { useAgents, useProfiles, useRoles, useSecrets } from '../../hooks/data'
import { useSettings } from '../../stores/settings'
import { useVault } from '../../stores/vault'
import { AgentAvatar } from '../../components/agents/AgentAvatar'
import { Button } from '../../components/ui/Button'
import { Markdown } from '../../components/ui/Markdown'
import { Select } from '../../components/ui/Field'
import { toast } from '../../components/ui/Toast'
import { Orb } from './Orb'

type Sharing = 'none' | 'screen' | 'camera'

const ENGINES: { id: LiveEngineId; name: string; blurb: string; needs?: 'gemini' | 'openai'; keyHelp?: string }[] = [
  {
    id: 'gemini',
    name: 'Gemini Live',
    blurb: 'Natural two-way voice with the shortest delay. Watches your shared screen as you talk.',
    needs: 'gemini',
    keyHelp: 'Needs a Gemini key, free from Google AI Studio',
  },
  { id: 'openai', name: 'OpenAI Realtime', blurb: 'Natural two-way voice. Sees your screen through regular snapshots.', needs: 'openai', keyHelp: 'Needs an OpenAI key' },
  {
    id: 'browser',
    name: 'Browser voice',
    blurb: 'Your browser listens and speaks while your usual AI, including Claude, does the thinking. Shares a snapshot of your screen with each question.',
  },
]

/** The saved key for Gemini or OpenAI, from an AI connection or the vault. */
async function providerKey(provider: 'gemini' | 'openai'): Promise<string> {
  const profile = (await db.profiles.toArray()).find((p) => p.provider === provider && p.keyId)
  const secretId = profile?.keyId ?? (await db.secrets.where('service').equals(provider).first())?.id
  if (!secretId) throw new FriendlyError(`Add your ${provider === 'gemini' ? 'Gemini' : 'OpenAI'} key first.`, 'Open Settings, then AI, to connect it.')
  return useVault.getState().getValue(secretId)
}

async function createSession(engine: LiveEngineId, agent: Agent, events: LiveEvents): Promise<LiveSession> {
  const live = useSettings.getState().settings.live
  if (engine === 'browser') return new BrowserVoiceSession({ agent, voiceName: live.browserVoice || undefined, events })
  const system = await liveInstructions(agent)
  const kit = liveToolkit(agent, (item) =>
    events.onTranscript({ id: `act-${item.id}`, role: 'event', text: item.label, final: item.status !== 'running', at: Date.now(), activity: item }),
  )
  if (engine === 'gemini')
    return new GeminiLiveSession({
      apiKey: await providerKey('gemini'),
      model: live.geminiModel || undefined,
      voice: live.geminiVoice,
      system,
      tools: kit.specs,
      runTool: (call) => kit.run(call),
      events,
    })
  return new OpenAIRealtimeSession({
    apiKey: await providerKey('openai'),
    model: live.openaiModel,
    voice: live.openaiVoice,
    system,
    tools: kit.specs,
    runTool: (call) => kit.run(call),
    events,
  })
}

function useEngineAvailability() {
  const profiles = useProfiles()
  const secrets = useSecrets()
  const has = (p: 'gemini' | 'openai') => profiles.some((x) => x.provider === p && !!x.keyId) || secrets.some((s) => s.service === p)
  return { gemini: has('gemini'), openai: has('openai'), browser: canUseBrowserVoice() }
}

function useClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return now
}

function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

/* ------------------------------------------------------------------ */
/*  The call itself                                                    */
/* ------------------------------------------------------------------ */

function useLiveCall() {
  const [status, setStatus] = useState<LiveStatus>('idle')
  const [detail, setDetail] = useState<string>()
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [speaking, setSpeaking] = useState(false)
  const [muted, setMutedState] = useState(false)
  const [sharing, setSharing] = useState<Sharing>('none')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [call, setCall] = useState<{ engine: LiveEngineId; agent: Agent; startedAt: number } | null>(null)
  const [endedAt, setEndedAt] = useState<number>()
  const [notice, setNotice] = useState<string>()
  const levels = useRef({ input: 0, output: 0 })
  const session = useRef<LiveSession | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const cancelled = useRef(false)

  const events = useMemo<LiveEvents>(
    () => ({
      onStatus: (s, d) => {
        setStatus(s)
        setDetail(d)
        if (s === 'ended' || s === 'error') setEndedAt(Date.now())
      },
      onTranscript: (entry) =>
        setTranscript((list) => {
          const i = list.findIndex((e) => e.id === entry.id)
          if (i === -1) return [...list, entry]
          const next = list.slice()
          next[i] = entry
          return next
        }),
      onSpeaking: setSpeaking,
      onLevels: (input, output) => {
        levels.current = { input, output }
      },
      onError: (message) => setNotice(message),
    }),
    [],
  )

  const note = (text: string) => events.onTranscript({ id: uid(), role: 'event', text, final: true, at: Date.now() })

  const releaseStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setStream(null)
    setSharing('none')
  }

  const stopSharing = () => {
    if (!streamRef.current) return
    session.current?.setVideo(null)
    releaseStream()
    note('You stopped sharing')
  }

  const useStream = (media: MediaStream, kind: 'screen' | 'camera') => {
    media.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (streamRef.current === media) stopSharing()
    })
    streamRef.current = media
    setStream(media)
    setSharing(kind)
    session.current?.setVideo(media)
    note(kind === 'screen' ? 'You started sharing your screen' : 'You turned on your camera')
  }

  const share = async (kind: 'screen' | 'camera') => {
    try {
      const media = kind === 'screen' ? await startScreenShare() : await startCamera()
      if (streamRef.current) {
        session.current?.setVideo(null)
        releaseStream()
      }
      useStream(media, kind)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') toast.info(kind === 'screen' ? 'Screen sharing was cancelled' : 'The camera wasn’t allowed')
      else toast.error(kind === 'screen' ? 'Couldn’t share your screen' : 'Couldn’t turn on the camera', errorMessage(err))
    }
  }

  const start = async (agent: Agent, engine: LiveEngineId, withScreen: boolean) => {
    // Ask for the screen first, while the click still counts as permission.
    let media: MediaStream | null = null
    if (withScreen) {
      try {
        media = await startScreenShare()
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'NotAllowedError')) toast.error('Couldn’t share your screen', errorMessage(err))
      }
    }
    cancelled.current = false
    levels.current = { input: 0, output: 0 }
    setTranscript([])
    setNotice(undefined)
    setEndedAt(undefined)
    setMutedState(false)
    setSpeaking(false)
    setCall({ engine, agent, startedAt: Date.now() })
    setStatus('connecting')
    setDetail('Getting ready…')
    try {
      const s = await createSession(engine, agent, events)
      if (cancelled.current) {
        media?.getTracks().forEach((t) => t.stop())
        return
      }
      session.current = s
      await s.start()
      if (media) useStream(media, 'screen')
    } catch (err) {
      media?.getTracks().forEach((t) => t.stop())
      session.current = null
      setStatus('error')
      setDetail(errorMessage(err))
      setEndedAt(Date.now())
    }
  }

  const end = () => {
    cancelled.current = true
    if (session.current) session.current.stop()
    else {
      // Still connecting: call it off before it starts.
      setStatus('ended')
      setEndedAt(Date.now())
    }
    session.current = null
    releaseStream()
  }

  const reset = () => {
    end()
    setStatus('idle')
    setCall(null)
    setTranscript([])
    setNotice(undefined)
  }

  useEffect(
    () => () => {
      session.current?.stop()
      streamRef.current?.getTracks().forEach((t) => t.stop())
    },
    [],
  )

  return {
    status,
    detail,
    transcript,
    speaking,
    muted,
    sharing,
    stream,
    call,
    endedAt,
    notice,
    levels,
    start,
    end,
    reset,
    share,
    stopSharing,
    setMuted: (m: boolean) => {
      session.current?.setMuted(m)
      setMutedState(m)
    },
    sendText: (text: string) => session.current?.sendText(text),
    interrupt: () => session.current?.interrupt(),
    dismissNotice: () => setNotice(undefined),
  }
}

type Call = ReturnType<typeof useLiveCall>

/* ------------------------------------------------------------------ */
/*  Lobby                                                              */
/* ------------------------------------------------------------------ */

function Lobby({ call }: { call: Call }) {
  const navigate = useNavigate()
  const agents = useAgents()
  const roles = useRoles()
  const profiles = useProfiles()
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const live = settings.live
  const available = useEngineAvailability()
  const team = agents.filter((a) => a.status === 'active')
  const agent = team.find((a) => a.id === live.agentId) ?? team.find((a) => a.isLead) ?? team[0]
  const role = agent ? roles.find((r) => r.id === agent.roleId) : undefined
  const auto: LiveEngineId = available.gemini ? 'gemini' : available.openai ? 'openai' : 'browser'
  const engine: LiveEngineId = live.engine === 'auto' ? auto : live.engine
  const ready = engine === 'browser' ? available.browser : available[engine]
  const idle = useRef({ input: 0, output: 0 })
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => browserVoices())
  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    const load = () => setVoices(browserVoices())
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])
  const thinksWith = agent ? (profiles.find((p) => p.id === agent.profileId) ?? profiles.find((p) => p.isDefault) ?? profiles[0]) : undefined

  const hear = () => {
    const u = new SpeechSynthesisUtterance(`Hi ${settings.userName.split(' ')[0] || 'there'}, it's ${agent?.name ?? 'your assistant'}. Ready when you are.`)
    const v = voices.find((x) => x.name === live.browserVoice)
    if (v) u.voice = v
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  }

  if (!agent) return null

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col items-center px-4 pt-8 pb-16 sm:px-8">
        <span className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[12px] text-soft">
          <Radio className="size-3.5 text-[var(--accent)]" /> Live
        </span>
        <h1 className="mt-4 text-center font-display text-4xl font-semibold tracking-tight sm:text-5xl">Talk it through</h1>
        <p className="mt-3 max-w-xl text-center text-[15px] text-muted">
          Speak naturally, share your screen so {agent.name} can see what you see, and every word is written down so you can turn it into tasks.
        </p>

        <div className="relative mt-4 size-[300px] sm:size-[360px]">
          <Orb levels={idle} speaking={false} active tint={agent.color} />
        </div>
        <div className="-mt-6 flex items-center gap-3">
          <AgentAvatar agent={agent} size="md" />
          <div>
            <div className="text-[17px] leading-tight font-semibold">{agent.name}</div>
            <div className="text-[13px] text-muted">{role?.name ?? 'Assistant'}</div>
          </div>
        </div>

        <div className="mt-5 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-1 no-scrollbar" role="radiogroup" aria-label="Who to talk to">
          {team.map((a) => (
            <button
              key={a.id}
              role="radio"
              aria-checked={a.id === agent.id}
              onClick={() => void update({ live: { agentId: a.id } })}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-[12.5px] transition',
                a.id === agent.id ? 'border-transparent bg-white/[0.1] text-fg ring-2 ring-[var(--accent)]' : 'border-white/[0.08] text-muted hover:text-fg',
              )}
            >
              <AgentAvatar agent={a} size="xs" />
              {a.name}
            </button>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button size="lg" variant="primary" icon={<Mic />} disabled={!ready} onClick={() => void call.start(agent, engine, false)}>
            Start talking
          </Button>
          {canShareScreen() && (
            <Button size="lg" variant="secondary" icon={<MonitorUp />} disabled={!ready} onClick={() => void call.start(agent, engine, true)}>
              Talk and share my screen
            </Button>
          )}
        </div>

        <section className="mt-12 w-full">
          <h2 className="mb-3 text-[11px] font-semibold tracking-[0.12em] text-faint uppercase">How {agent.name} talks</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {ENGINES.map((e) => {
              const ok = e.id === 'browser' ? available.browser : available[e.id]
              const selected = engine === e.id
              return (
                <button
                  key={e.id}
                  onClick={() => (ok ? void update({ live: { engine: e.id } }) : navigate('/settings?tab=ai'))}
                  className={cn(
                    'flex flex-col rounded-2xl border p-4 text-left transition',
                    selected && ok
                      ? 'border-[color-mix(in_oklab,var(--accent)_60%,transparent)] bg-[color-mix(in_oklab,var(--accent)_9%,transparent)]'
                      : 'border-white/[0.08] hover:border-white/[0.18]',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{e.name}</span>
                    {ok ? (
                      selected ? (
                        <span className="flex items-center gap-1 text-[11.5px] text-[var(--accent)]">
                          <Check className="size-3.5" /> In use
                        </span>
                      ) : (
                        <span className="text-[11.5px] text-good">Ready</span>
                      )
                    ) : (
                      <span className="flex items-center gap-1 text-[11.5px] text-warn">
                        <KeyRound className="size-3" /> {e.id === 'browser' ? 'Not in this browser' : 'Needs a key'}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{e.blurb}</p>
                  {!ok && e.keyHelp && <p className="mt-2 text-[12px] text-soft underline decoration-white/20 underline-offset-2">{e.keyHelp}. Set it up →</p>}
                  {e.id === 'browser' && ok && <p className="mt-2 text-[12px] text-soft">Thinks with {thinksWith ? thinksWith.name : 'sample replies until you connect an AI'}</p>}
                </button>
              )
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[13px] text-muted">
              <Volume2 className="size-4" /> Voice
              {engine === 'gemini' && (
                <Select value={live.geminiVoice} onChange={(e) => void update({ live: { geminiVoice: e.target.value } })} className="h-9 w-40 text-[13px]">
                  {GEMINI_VOICES.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </Select>
              )}
              {engine === 'openai' && (
                <Select value={live.openaiVoice} onChange={(e) => void update({ live: { openaiVoice: e.target.value } })} className="h-9 w-40 text-[13px] capitalize">
                  {OPENAI_VOICES.map((v) => (
                    <option key={v} value={v}>
                      {v[0].toUpperCase() + v.slice(1)}
                    </option>
                  ))}
                </Select>
              )}
              {engine === 'browser' && (
                <Select value={live.browserVoice} onChange={(e) => void update({ live: { browserVoice: e.target.value } })} className="h-9 w-56 text-[13px]">
                  <option value="">Browser default</option>
                  {voices.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name}
                    </option>
                  ))}
                </Select>
              )}
            </label>
            {engine === 'browser' && available.browser && (
              <Button size="sm" variant="ghost" icon={<Volume2 />} onClick={hear}>
                Hear it
              </Button>
            )}
          </div>
          <p className="mt-6 flex items-start gap-2 text-[12.5px] text-faint">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            Your microphone and screen are only used while a call is on. Sound and pictures go straight from this browser to the service you choose, never through anyone else.
          </p>
        </section>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  In the call                                                        */
/* ------------------------------------------------------------------ */

function TranscriptList({ entries, agent }: { entries: TranscriptEntry[]; agent: Agent }) {
  const endRef = useRef<HTMLDivElement>(null)
  const last = entries[entries.length - 1]
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [entries.length, last?.text])
  if (!entries.length) return <p className="px-2 py-8 text-center text-[13px] text-faint">What you both say will appear here.</p>
  return (
    <div className="space-y-3">
      {entries.map((e) =>
        e.role === 'event' ? (
          <div key={e.id} className="flex items-center justify-center gap-1.5 text-[11.5px] text-faint">
            <Sparkles className="size-3" /> {e.text}
          </div>
        ) : e.role === 'user' ? (
          <div key={e.id} className="flex justify-end">
            <p className={cn('max-w-[85%] rounded-2xl rounded-br-md bg-white/[0.08] px-3.5 py-2 text-[13.5px] whitespace-pre-wrap', !e.final && 'opacity-60')}>{e.text}</p>
          </div>
        ) : (
          <div key={e.id} className="flex gap-2.5">
            <AgentAvatar agent={agent} size="xs" className="mt-0.5" />
            <Markdown className={cn('max-w-[88%] text-[13.5px] leading-relaxed text-soft', !e.final && 'opacity-75')}>{e.text}</Markdown>
          </div>
        ),
      )}
      <div ref={endRef} />
    </div>
  )
}

function ControlButton({ on, onClick, label, icon, tone }: { on?: boolean; onClick: () => void; label: string; icon: ReactNode; tone?: 'danger' }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      title={label}
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2 text-[11px] transition sm:px-3 sm:text-[11.5px] [&_svg]:size-5',
        tone === 'danger' ? 'text-white' : on ? 'text-fg' : 'text-soft hover:text-fg',
      )}
    >
      <span
        className={cn(
          'grid size-12 place-items-center rounded-full transition',
          tone === 'danger' ? 'bg-rose-500 hover:bg-rose-400' : on ? 'bg-white text-ink-950' : 'bg-white/[0.08] hover:bg-white/[0.14]',
        )}
      >
        {icon}
      </span>
      {label}
    </button>
  )
}

function CallView({ call }: { call: Call }) {
  const info = call.call!
  const agent = info.agent
  const engineName = ENGINES.find((e) => e.id === info.engine)?.name ?? ''
  const now = useClock(call.status === 'live')
  const [text, setText] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const connecting = call.status === 'connecting'
  const lastAssistant = [...call.transcript].reverse().find((e) => e.role === 'assistant')
  const lastUser = [...call.transcript].reverse().find((e) => e.role === 'user')
  const caption = call.speaking ? lastAssistant : lastUser && !lastUser.final ? lastUser : undefined

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = call.stream
  }, [call.stream])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return
      if (e.key.toLowerCase() === 'm') call.setMuted(!call.muted)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [call])

  const send = () => {
    const t = text.trim()
    if (!t) return
    call.sendText(t)
    setText('')
  }

  const statusLine = connecting
    ? (call.detail ?? 'Connecting…')
    : call.speaking
      ? `${agent.name} is speaking`
      : call.muted
        ? 'You’re muted. Press M or the microphone to talk.'
        : 'Listening…'

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <div className="relative flex min-h-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <span
            className={cn('flex items-center gap-2 rounded-full px-3 py-1 text-[12px] font-semibold', connecting ? 'bg-white/[0.06] text-soft' : 'bg-rose-500/15 text-rose-300')}
          >
            <span className={cn('size-2 rounded-full', connecting ? 'animate-pulse bg-white/50' : 'animate-pulse bg-rose-400')} />
            {connecting ? 'Connecting' : `Live · ${duration(now - info.startedAt)}`}
          </span>
          <span className="text-[13px] text-muted">
            {agent.name} · {engineName}
          </span>
        </header>

        <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4">
          {call.stream ? (
            <div className="relative flex size-full max-h-full items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="max-h-full max-w-full rounded-2xl bg-black object-contain shadow-[0_30px_100px_-30px_rgb(0_0_0)] ring-1 ring-white/10"
              />
              <span className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1 text-[12px] text-white backdrop-blur">
                {call.sharing === 'screen' ? <MonitorUp className="size-3.5" /> : <Camera className="size-3.5" />}
                {agent.name} can see your {call.sharing === 'screen' ? 'screen' : 'camera'}
              </span>
              <div className="absolute right-3 bottom-3 size-28 overflow-hidden rounded-full bg-black/40 backdrop-blur sm:size-36">
                <Orb levels={call.levels} speaking={call.speaking} active={!connecting} tint={agent.color} />
              </div>
            </div>
          ) : (
            <div className="relative aspect-square w-full max-w-[520px]">
              <Orb levels={call.levels} speaking={call.speaking} active={!connecting} tint={agent.color} />
            </div>
          )}
        </div>

        <div className="px-4 text-center">
          <p className="text-[13px] font-medium text-soft" aria-live="polite">
            {statusLine}
          </p>
          <p className="mx-auto mt-1 line-clamp-2 min-h-[2.8em] max-w-2xl text-[15px] text-fg/90">{(caption?.text ?? '').replace(/[*_`#>]/g, '')}</p>
        </div>

        {call.notice && (
          <div className="mx-auto mt-2 flex max-w-xl items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.07] px-3 py-2 text-[12.5px] text-amber-100">
            <span className="min-w-0 flex-1">{call.notice}</span>
            <button onClick={call.dismissNotice} className="text-amber-200/70 hover:text-amber-100" aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-end justify-center gap-1 px-4 pt-3 pb-5 sm:gap-2">
          <ControlButton on={!call.muted} onClick={() => call.setMuted(!call.muted)} label={call.muted ? 'Unmute' : 'Mute'} icon={call.muted ? <MicOff /> : <Mic />} />
          {canShareScreen() && (
            <ControlButton
              on={call.sharing === 'screen'}
              onClick={() => (call.sharing === 'screen' ? call.stopSharing() : void call.share('screen'))}
              label={call.sharing === 'screen' ? 'Stop sharing' : 'Share screen'}
              icon={call.sharing === 'screen' ? <MonitorX /> : <MonitorUp />}
            />
          )}
          <ControlButton
            on={call.sharing === 'camera'}
            onClick={() => (call.sharing === 'camera' ? call.stopSharing() : void call.share('camera'))}
            label={call.sharing === 'camera' ? 'Camera off' : 'Camera'}
            icon={call.sharing === 'camera' ? <CameraOff /> : <Camera />}
          />
          <ControlButton onClick={call.interrupt} label="Stop talking" icon={<Hand />} />
          <ControlButton onClick={call.end} label="End call" icon={<PhoneOff />} tone="danger" />
        </div>
      </div>

      <aside className="flex max-h-[42vh] min-h-0 flex-col border-t border-white/[0.06] lg:max-h-none lg:w-[380px] lg:border-t-0 lg:border-l">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-[11px] font-semibold tracking-[0.12em] text-faint uppercase">Live transcript</h2>
          <span className="hidden text-[11.5px] text-faint sm:inline">Press M to mute</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
          <TranscriptList entries={call.transcript} agent={agent} />
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
          className="flex items-center gap-2 border-t border-white/[0.06] p-3"
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={connecting ? 'Connecting…' : `Or type to ${agent.name}…`}
            disabled={connecting}
            aria-label={`Type a message to ${agent.name}`}
            className="h-10 min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 text-[13.5px] outline-none placeholder:text-faint focus:border-white/[0.2]"
          />
          <Button type="submit" size="sm" variant="primary" icon={<Send />} disabled={!text.trim() || connecting} className="h-10" aria-label="Send">
            <span className="sr-only">Send</span>
          </Button>
        </form>
      </aside>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  After the call                                                     */
/* ------------------------------------------------------------------ */

function WrapUp({ call }: { call: Call }) {
  const navigate = useNavigate()
  const info = call.call!
  const agent = info.agent
  const userName = useSettings((s) => s.settings.userName.split(' ')[0] || 'Me')
  const spoken = call.transcript.filter((e) => e.role !== 'event' && e.text.trim())
  const minutes = ((call.endedAt ?? Date.now()) - info.startedAt) / 60000
  const [summary, setSummary] = useState<CallSummary | null>(null)
  const [summarising, setSummarising] = useState(spoken.length > 1)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [added, setAdded] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const failed = call.status === 'error'

  useEffect(() => {
    if (failed) return
    void logCall(agent, minutes)
    if (spoken.length < 2) return
    let alive = true
    summariseCall(agent, call.transcript)
      .then((s) => {
        if (!alive) return
        setSummary(s)
        setPicked(new Set(s.actions.map((_, i) => i)))
      })
      .catch((err) => alive && toast.error('Couldn’t sum up the call', errorMessage(err)))
      .finally(() => alive && setSummarising(false))
    return () => {
      alive = false
    }
    // Runs once, when the call ends.
  }, [])

  if (failed)
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-rose-500/15 text-rose-300">
            <PhoneOff className="size-5" />
          </div>
          <h2 className="mt-4 font-display text-2xl font-semibold">The call couldn’t start</h2>
          <p className="mt-2 text-sm text-muted">{call.detail}</p>
          <div className="mt-6 flex justify-center gap-2">
            <Button variant="ghost" onClick={() => navigate('/settings?tab=ai')}>
              Check AI settings
            </Button>
            <Button variant="primary" icon={<RotateCcw />} onClick={call.reset}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    )

  const actions = summary?.actions ?? []
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 pt-10 pb-16 sm:px-8">
        <div className="flex items-center gap-4">
          <AgentAvatar agent={agent} size="lg" />
          <div>
            <p className="text-[12px] tracking-[0.12em] text-faint uppercase">Call ended</p>
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              {Math.max(1, Math.round(minutes))} min with {agent.name}
            </h1>
          </div>
        </div>

        {spoken.length === 0 ? (
          <p className="mt-8 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 text-[14px] text-muted">Nothing was said on this call, so there’s nothing to save.</p>
        ) : (
          <>
            <section className="glass mt-8 rounded-3xl p-6">
              <h2 className="flex items-center gap-2 text-[13px] font-semibold">
                <Sparkles className="size-4 text-[var(--accent)]" /> Summary
              </h2>
              {summarising ? (
                <div className="mt-3 space-y-2">
                  <div className="skeleton h-3.5 w-5/6 rounded" />
                  <div className="skeleton h-3.5 w-2/3 rounded" />
                  <p className="pt-1 text-[12.5px] text-faint">{agent.name} is summing up the call…</p>
                </div>
              ) : (
                <p className="mt-2 text-[14px] leading-relaxed text-soft">{summary?.summary || 'A quick conversation.'}</p>
              )}
              {actions.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-[11px] font-semibold tracking-[0.12em] text-faint uppercase">Actions</h3>
                  <ul className="mt-2 space-y-1.5">
                    {actions.map((a, i) => (
                      <li key={i}>
                        <label className="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-1.5 hover:bg-white/[0.04]">
                          <input
                            type="checkbox"
                            checked={picked.has(i)}
                            disabled={added}
                            onChange={() =>
                              setPicked((p) => {
                                const next = new Set(p)
                                if (next.has(i)) next.delete(i)
                                else next.add(i)
                                return next
                              })
                            }
                            className="mt-1 size-4 accent-[var(--accent)]"
                          />
                          <span className="min-w-0 flex-1 text-[13.5px]">
                            {a.title}
                            <span className="ml-2 text-[12px] text-faint">
                              {a.owner.toLowerCase() === 'me' ? 'You' : a.owner} · {a.dueInDays === 0 ? 'today' : `in ${a.dueInDays} day${a.dueInDays === 1 ? '' : 's'}`}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <Button
                    size="sm"
                    variant={added ? 'secondary' : 'primary'}
                    icon={added ? <Check /> : <ClipboardList />}
                    className="mt-3"
                    disabled={added || picked.size === 0}
                    onClick={async () => {
                      const n = await addCallActions(actions.filter((_, i) => picked.has(i)))
                      setAdded(true)
                      toast.success(`${n} task${n === 1 ? '' : 's'} added`, undefined, { label: 'View', onClick: () => navigate('/projects?view=tasks') })
                    }}
                  >
                    {added ? 'Added to your tasks' : `Add ${picked.size} to my tasks`}
                  </Button>
                </div>
              )}
            </section>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                icon={saved ? <Check /> : <Brain />}
                disabled={!!saved}
                onClick={async () => {
                  try {
                    const path = await saveCallToBrain(agent, call.transcript, info.startedAt, summary ?? undefined)
                    setSaved(path)
                    toast.success('Saved to your brain', path)
                  } catch (err) {
                    toast.error('Couldn’t save the call', errorMessage(err))
                  }
                }}
              >
                {saved ? 'Saved to your brain' : 'Save to brain'}
              </Button>
              <Button
                variant="secondary"
                icon={<Copy />}
                onClick={async () => {
                  await copyText(transcriptText(call.transcript, agent.name, userName))
                  toast.success('Transcript copied')
                }}
              >
                Copy transcript
              </Button>
              <Button variant="primary" icon={<Mic />} className="sm:ml-auto" onClick={call.reset}>
                Talk again
              </Button>
            </div>

            <section className="mt-10">
              <h2 className="mb-3 text-[11px] font-semibold tracking-[0.12em] text-faint uppercase">Transcript</h2>
              <div className="rounded-3xl border border-white/[0.06] bg-white/[0.02] p-5">
                <TranscriptList entries={call.transcript} agent={agent} />
              </div>
            </section>
          </>
        )}
        {spoken.length === 0 && (
          <Button variant="primary" icon={<Mic />} className="mt-6" onClick={call.reset}>
            Talk again
          </Button>
        )}
      </div>
    </div>
  )
}

export default function LivePage() {
  const call = useLiveCall()
  if (call.status === 'idle' || !call.call) return <Lobby call={call} />
  if (call.status === 'connecting' || call.status === 'live') return <CallView call={call} />
  return <WrapUp key={call.call.startedAt} call={call} />
}
