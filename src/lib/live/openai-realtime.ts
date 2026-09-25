import type { ToolCall, ToolSpec } from '../llm/types'
import { FriendlyError, httpError } from '../llm/errors'
import { uid } from '../utils'
import { FrameGrabber } from './screen'
import type { LiveEvents, LiveSession } from './types'

const API = 'https://api.openai.com/v1'

interface RealtimeEvent {
  type: string
  delta?: string
  transcript?: string
  item_id?: string
  call_id?: string
  name?: string
  arguments?: string
  error?: { message?: string }
}

export interface OpenAIRealtimeOptions {
  apiKey: string
  model: string
  voice: string
  system: string
  tools?: ToolSpec[]
  runTool?: (call: ToolCall) => Promise<{ content: string; isError?: boolean }>
  events: LiveEvents
}

/** OpenAI Realtime over WebRTC: live voice both ways, plus screen snapshots. */
export class OpenAIRealtimeSession implements LiveSession {
  private pc?: RTCPeerConnection
  private dc?: RTCDataChannel
  private mic?: MediaStream
  private audio = new Audio()
  private grabber?: FrameGrabber
  private frameTimer?: ReturnType<typeof setInterval>
  private levelTimer?: ReturnType<typeof setInterval>
  private analyserCtx?: AudioContext
  private assistant = new Map<string, string>()
  private stopped = false
  private lastFrameAt = 0

  private opts: OpenAIRealtimeOptions

  constructor(opts: OpenAIRealtimeOptions) {
    this.opts = opts
    this.audio.autoplay = true
  }

  async start(): Promise<void> {
    const { events } = this.opts
    events.onStatus('connecting', 'Opening a secure session…')
    let res: Response
    try {
      res = await fetch(`${API}/realtime/client_secrets`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.opts.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: {
            type: 'realtime',
            model: this.opts.model,
            instructions: this.opts.system,
            audio: { input: { transcription: { model: 'gpt-4o-mini-transcribe' } }, output: { voice: this.opts.voice } },
            tools: (this.opts.tools ?? []).map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters })),
          },
        }),
      })
    } catch {
      throw new FriendlyError('Couldn’t reach OpenAI to start the live session.', 'Check your connection, or use Gemini Live instead.')
    }
    if (!res.ok) throw httpError('OpenAI Realtime', res.status, await res.text().catch(() => ''), this.opts.model)
    const secret = (await res.json()) as { value?: string; client_secret?: { value?: string } }
    const ephemeral = secret.value ?? secret.client_secret?.value
    if (!ephemeral) throw new FriendlyError('OpenAI didn’t return a session key.')

    const pc = new RTCPeerConnection()
    this.pc = pc
    pc.ontrack = (e) => {
      this.audio.srcObject = e.streams[0]
      this.watchOutput(e.streams[0])
    }
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      pc.addTrack(this.mic.getAudioTracks()[0], this.mic)
    } catch {
      pc.addTransceiver('audio', { direction: 'recvonly' })
      events.onError('Microphone access was blocked. You can still type messages.')
    }
    const dc = pc.createDataChannel('oai-events')
    this.dc = dc
    dc.onmessage = (e) => {
      try {
        void this.handle(JSON.parse(String(e.data)) as RealtimeEvent)
      } catch {
        /* ignore malformed events */
      }
    }
    dc.onopen = () => events.onStatus('live')
    pc.onconnectionstatechange = () => {
      if (this.stopped) return
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        events.onStatus('ended', 'The live connection dropped.')
      }
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    const sdp = await fetch(`${API}/realtime/calls?model=${encodeURIComponent(this.opts.model)}`, {
      method: 'POST',
      body: offer.sdp,
      headers: { Authorization: `Bearer ${ephemeral}`, 'Content-Type': 'application/sdp' },
    })
    if (!sdp.ok) throw httpError('OpenAI Realtime', sdp.status, await sdp.text().catch(() => ''), this.opts.model)
    await pc.setRemoteDescription({ type: 'answer', sdp: await sdp.text() })
  }

  private watchOutput(stream: MediaStream) {
    try {
      const ctx = new AudioContext()
      this.analyserCtx = ctx
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      src.connect(analyser)
      const data = new Uint8Array(analyser.fftSize)
      this.levelTimer = setInterval(() => {
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (const v of data) sum += ((v - 128) / 128) ** 2
        this.opts.events.onLevels?.(0, Math.sqrt(sum / data.length))
      }, 80)
    } catch {
      /* level meter is optional */
    }
  }

  private async handle(e: RealtimeEvent) {
    const { events } = this.opts
    switch (e.type) {
      case 'conversation.item.input_audio_transcription.completed':
        if (e.transcript?.trim()) events.onTranscript({ id: e.item_id ?? uid(), role: 'user', text: e.transcript.trim(), final: true, at: Date.now() })
        break
      case 'response.output_audio_transcript.delta':
      case 'response.audio_transcript.delta': {
        const id = e.item_id ?? 'current'
        const text = (this.assistant.get(id) ?? '') + (e.delta ?? '')
        this.assistant.set(id, text)
        events.onSpeaking(true)
        events.onTranscript({ id, role: 'assistant', text, final: false, at: Date.now() })
        break
      }
      case 'response.output_audio_transcript.done':
      case 'response.audio_transcript.done': {
        const id = e.item_id ?? 'current'
        events.onTranscript({ id, role: 'assistant', text: e.transcript ?? this.assistant.get(id) ?? '', final: true, at: Date.now() })
        this.assistant.delete(id)
        break
      }
      case 'output_audio_buffer.stopped':
      case 'response.done':
        events.onSpeaking(false)
        break
      case 'input_audio_buffer.speech_started':
        events.onSpeaking(false)
        break
      case 'response.function_call_arguments.done': {
        if (!this.opts.runTool || !e.call_id || !e.name) break
        let input: Record<string, unknown> = {}
        try {
          input = JSON.parse(e.arguments || '{}') as Record<string, unknown>
        } catch {
          /* send an error result below */
        }
        let outcome: { content: string; isError?: boolean }
        try {
          outcome = await this.opts.runTool({ id: e.call_id, name: e.name, input })
        } catch (err) {
          outcome = { content: err instanceof Error ? err.message : 'Tool failed', isError: true }
        }
        this.send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: e.call_id, output: outcome.content } })
        this.send({ type: 'response.create' })
        break
      }
      case 'error':
        if (e.error?.message) events.onError(e.error.message)
        break
    }
  }

  private send(payload: unknown) {
    if (this.dc?.readyState === 'open') this.dc.send(JSON.stringify(payload))
  }

  setMuted(muted: boolean) {
    this.mic?.getAudioTracks().forEach((t) => (t.enabled = !muted))
  }

  sendText(text: string) {
    this.opts.events.onTranscript({ id: uid(), role: 'user', text, final: true, at: Date.now() })
    this.send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } })
    this.send({ type: 'response.create' })
  }

  setVideo(stream: MediaStream | null) {
    if (this.frameTimer) clearInterval(this.frameTimer)
    this.grabber?.stop()
    this.grabber = undefined
    if (!stream) return
    this.grabber = new FrameGrabber(stream, 1024, 0.6)
    // Snapshots are part of the conversation, so they are sent sparingly.
    this.frameTimer = setInterval(async () => {
      const frame = await this.grabber?.grab()
      if (!frame) return
      const now = Date.now()
      if ((frame.changed && now - this.lastFrameAt > 5000) || this.lastFrameAt === 0) {
        this.lastFrameAt = now
        this.send({
          type: 'conversation.item.create',
          item: { type: 'message', role: 'user', content: [{ type: 'input_image', image_url: `data:${frame.mediaType};base64,${frame.data}` }] },
        })
      }
    }, 1500)
  }

  interrupt() {
    this.send({ type: 'response.cancel' })
    this.send({ type: 'output_audio_buffer.clear' })
    this.opts.events.onSpeaking(false)
  }

  stop() {
    this.stopped = true
    if (this.frameTimer) clearInterval(this.frameTimer)
    if (this.levelTimer) clearInterval(this.levelTimer)
    this.grabber?.stop()
    this.dc?.close()
    this.pc?.close()
    this.mic?.getTracks().forEach((t) => t.stop())
    this.audio.srcObject = null
    void this.analyserCtx?.close()
    this.opts.events.onStatus('ended')
  }
}
