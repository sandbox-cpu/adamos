import type { Agent } from '../types'
import type { ChatTurn, ImageInput } from '../llm/types'
import { isAbortError, uid } from '../utils'
import { runAgent } from '../agents/runtime'
import { FrameGrabber } from './screen'
import type { LiveEvents, LiveSession } from './types'

interface RecognitionResult {
  isFinal: boolean
  0: { transcript: string }
}

interface RecognitionEvent {
  resultIndex: number
  results: ArrayLike<RecognitionResult>
}

interface Recognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type RecognitionCtor = new () => Recognition

function recognitionCtor(): RecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export function canUseBrowserVoice(): boolean {
  return typeof window !== 'undefined' && !!recognitionCtor() && 'speechSynthesis' in window
}

export function browserVoices(): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) return []
  return window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'))
}

function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_#>`~|]/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'a link')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface BrowserVoiceOptions {
  agent: Agent
  voiceName?: string
  lang?: string
  events: LiveEvents
}

/**
 * Voice conversation with any text AI (e.g. Claude): the browser listens and
 * speaks; each turn can include a snapshot of the shared screen.
 */
export class BrowserVoiceSession implements LiveSession {
  private recognition?: Recognition
  private history: ChatTurn[] = []
  private grabber?: FrameGrabber
  private muted = false
  private busy = false
  private stopped = false
  private listening = false
  private controller?: AbortController
  private interim?: { id: string; text: string }

  private opts: BrowserVoiceOptions

  constructor(opts: BrowserVoiceOptions) {
    this.opts = opts
  }

  async start(): Promise<void> {
    const Ctor = recognitionCtor()
    const { events } = this.opts
    if (!Ctor || !('speechSynthesis' in window)) {
      events.onError('This browser can’t do voice conversations. Try Chrome, Edge or Safari, or type your messages.')
      events.onStatus('live')
      return
    }
    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = this.opts.lang ?? navigator.language ?? 'en-GB'
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        const text = r[0].transcript.trim()
        if (!text) continue
        if (!this.interim) this.interim = { id: uid(), text: '' }
        this.interim.text = text
        events.onTranscript({ id: this.interim.id, role: 'user', text, final: r.isFinal, at: Date.now() })
        if (r.isFinal) {
          const finalText = this.interim.text
          this.interim = undefined
          void this.respond(finalText, false)
        }
      }
    }
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') events.onError('Microphone access was blocked. You can still type messages.')
    }
    rec.onend = () => {
      this.listening = false
      if (!this.stopped && !this.busy && !this.muted) this.listen()
    }
    this.recognition = rec
    this.listen()
    events.onStatus('live')
  }

  private listen() {
    if (!this.recognition || this.listening || this.stopped || this.muted) return
    try {
      this.recognition.start()
      this.listening = true
    } catch {
      /* already started */
    }
  }

  private pauseListening() {
    if (this.recognition && this.listening) {
      this.recognition.stop()
      this.listening = false
    }
  }

  private async respond(text: string, typed: boolean) {
    if (this.busy) this.interrupt()
    const { events, agent } = this.opts
    if (typed) events.onTranscript({ id: uid(), role: 'user', text, final: true, at: Date.now() })
    this.busy = true
    this.pauseListening()
    const id = uid()
    let full = ''
    let spoken = 0
    this.controller = new AbortController()
    let images: ImageInput[] | undefined
    if (this.grabber) {
      const frame = await this.grabber.grab()
      if (frame) images = [{ mediaType: frame.mediaType, data: frame.data }]
    }
    const speakReady = (force: boolean) => {
      const pending = full.slice(spoken)
      const match = force ? pending : pending.match(/^[\s\S]*?[.!?](\s|$)/)?.[0]
      if (!match || !match.trim()) return
      spoken += match.length
      const utter = new SpeechSynthesisUtterance(speakable(match))
      const voice = window.speechSynthesis.getVoices().find((v) => v.name === this.opts.voiceName)
      if (voice) utter.voice = voice
      utter.onstart = () => events.onSpeaking(true)
      utter.onend = () => {
        if (!window.speechSynthesis.speaking && !this.busy) {
          events.onSpeaking(false)
          this.listen()
        }
      }
      window.speechSynthesis.speak(utter)
    }
    try {
      const res = await runAgent({
        agent,
        prompt: text,
        history: this.history,
        mode: 'voice',
        images,
        latencySensitive: true,
        thinkingDepth: 'quick',
        maxTokens: 4000,
        signal: this.controller.signal,
        handlers: {
          onText: (delta) => {
            full += delta
            events.onTranscript({ id, role: 'assistant', text: full, final: false, at: Date.now() })
            speakReady(false)
          },
          onActivities: (items) => {
            const last = items[items.length - 1]
            if (last) events.onTranscript({ id: `act-${last.id}`, role: 'event', text: last.label, final: last.status !== 'running', at: Date.now(), activity: last })
          },
        },
      })
      full = res.text || full
      speakReady(true)
      events.onTranscript({ id, role: 'assistant', text: full, final: true, at: Date.now() })
      this.history.push({ role: 'user', content: text }, { role: 'assistant', content: full })
      this.history = this.history.slice(-20)
    } catch (err) {
      if (!isAbortError(err)) events.onError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      this.busy = false
      if (!window.speechSynthesis.speaking) {
        events.onSpeaking(false)
        this.listen()
      }
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted
    if (muted) this.pauseListening()
    else if (!this.busy) this.listen()
  }

  sendText(text: string) {
    void this.respond(text, true)
  }

  setVideo(stream: MediaStream | null) {
    this.grabber?.stop()
    this.grabber = stream ? new FrameGrabber(stream, 1280, 0.7) : undefined
  }

  interrupt() {
    this.controller?.abort()
    window.speechSynthesis.cancel()
    this.opts.events.onSpeaking(false)
  }

  stop() {
    this.stopped = true
    this.interrupt()
    this.recognition?.abort()
    this.grabber?.stop()
    this.opts.events.onStatus('ended')
  }
}
