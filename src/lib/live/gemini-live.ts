import type { ToolCall, ToolSpec } from '../llm/types'
import { toGeminiSchema } from '../llm/gemini'
import { uid } from '../utils'
import { PcmPlayer, rateFromMime, startMicCapture, type MicCapture } from './audio'
import { FrameGrabber } from './screen'
import type { LiveEvents, LiveSession } from './types'

const WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'
const FALLBACK_MODEL = 'gemini-live-2.5-flash-preview'

/** Finds a model that supports live (bidirectional) sessions for this key. */
export async function discoverLiveModels(apiKey: string): Promise<string[]> {
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': apiKey } })
    if (!res.ok) return []
    const data = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] }
    const live = (data.models ?? []).filter((m) => m.supportedGenerationMethods?.includes('bidiGenerateContent')).map((m) => m.name.replace(/^models\//, ''))
    const score = (id: string) => (id.includes('native-audio') ? 0 : id.includes('live') ? 1 : 2) + (id.includes('preview') ? 0.5 : 0)
    return live.sort((a, b) => score(a) - score(b))
  } catch {
    return []
  }
}

interface ServerMessage {
  setupComplete?: object
  serverContent?: {
    modelTurn?: { parts?: { inlineData?: { mimeType?: string; data?: string }; text?: string }[] }
    turnComplete?: boolean
    interrupted?: boolean
    inputTranscription?: { text?: string }
    outputTranscription?: { text?: string }
  }
  toolCall?: { functionCalls?: { id?: string; name: string; args?: Record<string, unknown> }[] }
  goAway?: { timeLeft?: string }
}

export interface GeminiLiveOptions {
  apiKey: string
  model?: string
  voice: string
  system: string
  tools?: ToolSpec[]
  runTool?: (call: ToolCall) => Promise<{ content: string; isError?: boolean }>
  events: LiveEvents
}

export class GeminiLiveSession implements LiveSession {
  private ws?: WebSocket
  private mic?: MicCapture
  private player = new PcmPlayer()
  private grabber?: FrameGrabber
  private frameTimer?: ReturnType<typeof setInterval>
  private levelTimer?: ReturnType<typeof setInterval>
  private stopped = false
  private ready = false
  private userEntry?: { id: string; text: string }
  private assistantEntry?: { id: string; text: string }
  private lastFrameAt = 0
  private inputLevel = 0
  private useTools: boolean

  private opts: GeminiLiveOptions

  constructor(opts: GeminiLiveOptions) {
    this.opts = opts
    this.useTools = !!opts.tools?.length
    this.player.onIdle = () => opts.events.onSpeaking(false)
  }

  async start(): Promise<void> {
    const { events } = this.opts
    events.onStatus('connecting', 'Finding a live model…')
    await this.player.resume()
    const model = this.opts.model || (await discoverLiveModels(this.opts.apiKey))[0] || FALLBACK_MODEL
    events.onStatus('connecting', `Connecting to ${model}…`)
    this.connect(model)
    this.levelTimer = setInterval(() => events.onLevels?.(this.inputLevel, this.player.level()), 80)
  }

  private connect(model: string) {
    const { events } = this.opts
    const ws = new WebSocket(`${WS_URL}?key=${encodeURIComponent(this.opts.apiKey)}`)
    this.ws = ws
    ws.onopen = () => {
      const setup: Record<string, unknown> = {
        model: model.startsWith('models/') ? model : `models/${model}`,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.opts.voice } } },
        },
        systemInstruction: { parts: [{ text: this.opts.system }] },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        contextWindowCompression: { slidingWindow: {} },
      }
      if (this.useTools && this.opts.tools) {
        setup.tools = [{ functionDeclarations: this.opts.tools.map((t) => ({ name: t.name, description: t.description, parameters: toGeminiSchema(t.parameters) })) }]
      }
      ws.send(JSON.stringify({ setup }))
    }
    ws.onmessage = async (event) => {
      const raw = typeof event.data === 'string' ? event.data : await (event.data as Blob).text()
      let msg: ServerMessage
      try {
        msg = JSON.parse(raw) as ServerMessage
      } catch {
        return
      }
      await this.handle(msg)
    }
    ws.onclose = (event) => {
      if (this.stopped) return
      if (!this.ready && this.useTools) {
        // Some live models do not accept tools; reconnect without them.
        this.useTools = false
        this.connect(model)
        return
      }
      this.cleanup()
      const reason = event.reason || (this.ready ? 'The live session ended.' : 'Could not start the live session. Check the Gemini key and model.')
      if (this.ready) events.onStatus('ended', reason)
      else {
        events.onStatus('error', reason)
        events.onError(reason)
      }
    }
  }

  private async handle(msg: ServerMessage) {
    const { events } = this.opts
    if (msg.setupComplete) {
      this.ready = true
      try {
        this.mic = await startMicCapture(16000, (data, level) => {
          this.inputLevel = level
          this.send({ realtimeInput: { audio: { data, mimeType: 'audio/pcm;rate=16000' } } })
        })
      } catch {
        events.onError('Microphone access was blocked. You can still type messages.')
      }
      events.onStatus('live')
      return
    }
    if (msg.goAway) events.onTranscript({ id: uid(), role: 'event', text: 'The live session will end shortly. Start a new one to keep talking.', final: true, at: Date.now() })

    const sc = msg.serverContent
    if (sc) {
      if (sc.interrupted) {
        this.player.interrupt()
        events.onSpeaking(false)
        this.finishAssistant()
      }
      if (sc.inputTranscription?.text) {
        if (!this.userEntry || this.assistantEntry) {
          this.finishAssistant()
          this.userEntry = { id: uid(), text: '' }
        }
        this.userEntry.text += sc.inputTranscription.text
        events.onTranscript({ id: this.userEntry.id, role: 'user', text: this.userEntry.text.trim(), final: false, at: Date.now() })
      }
      for (const part of sc.modelTurn?.parts ?? []) {
        if (part.inlineData?.data && part.inlineData.mimeType?.startsWith('audio/')) {
          this.player.play(part.inlineData.data, rateFromMime(part.inlineData.mimeType))
          events.onSpeaking(true)
        }
      }
      if (sc.outputTranscription?.text) {
        this.finishUser()
        if (!this.assistantEntry) this.assistantEntry = { id: uid(), text: '' }
        this.assistantEntry.text += sc.outputTranscription.text
        events.onTranscript({ id: this.assistantEntry.id, role: 'assistant', text: this.assistantEntry.text.trim(), final: false, at: Date.now() })
      }
      if (sc.turnComplete) {
        this.finishUser()
        this.finishAssistant()
      }
    }

    if (msg.toolCall?.functionCalls?.length && this.opts.runTool) {
      const responses = await Promise.all(
        msg.toolCall.functionCalls.map(async (fc) => {
          const call: ToolCall = { id: fc.id ?? uid(), name: fc.name, input: fc.args ?? {} }
          let outcome: { content: string; isError?: boolean }
          try {
            outcome = await this.opts.runTool!(call)
          } catch (err) {
            outcome = { content: err instanceof Error ? err.message : 'Tool failed', isError: true }
          }
          return { id: fc.id, name: fc.name, response: outcome.isError ? { error: outcome.content } : { result: outcome.content } }
        }),
      )
      this.send({ toolResponse: { functionResponses: responses } })
    }
  }

  private finishUser() {
    if (this.userEntry) {
      this.opts.events.onTranscript({ id: this.userEntry.id, role: 'user', text: this.userEntry.text.trim(), final: true, at: Date.now() })
      this.userEntry = undefined
    }
  }

  private finishAssistant() {
    if (this.assistantEntry) {
      this.opts.events.onTranscript({ id: this.assistantEntry.id, role: 'assistant', text: this.assistantEntry.text.trim(), final: true, at: Date.now() })
      this.assistantEntry = undefined
    }
  }

  private send(payload: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(payload))
  }

  setMuted(muted: boolean) {
    this.mic?.setMuted(muted)
    if (muted) this.send({ realtimeInput: { audioStreamEnd: true } })
  }

  sendText(text: string) {
    this.finishAssistant()
    const id = uid()
    this.opts.events.onTranscript({ id, role: 'user', text, final: true, at: Date.now() })
    this.send({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } })
  }

  setVideo(stream: MediaStream | null) {
    if (this.frameTimer) clearInterval(this.frameTimer)
    this.grabber?.stop()
    this.grabber = undefined
    if (!stream) return
    this.grabber = new FrameGrabber(stream, 1024, 0.6)
    this.frameTimer = setInterval(async () => {
      const frame = await this.grabber?.grab()
      if (!frame) return
      const now = Date.now()
      // Send changes promptly, and a keep-alive frame every few seconds.
      if (frame.changed || now - this.lastFrameAt > 4000) {
        this.lastFrameAt = now
        this.send({ realtimeInput: { video: { data: frame.data, mimeType: frame.mediaType } } })
      }
    }, 1000)
  }

  interrupt() {
    this.player.interrupt()
    this.opts.events.onSpeaking(false)
  }

  private cleanup() {
    if (this.frameTimer) clearInterval(this.frameTimer)
    if (this.levelTimer) clearInterval(this.levelTimer)
    this.grabber?.stop()
    this.mic?.stop()
    this.mic = undefined
    this.player.close()
  }

  stop() {
    this.stopped = true
    this.finishUser()
    this.finishAssistant()
    this.cleanup()
    this.ws?.close()
    this.opts.events.onStatus('ended')
  }
}
