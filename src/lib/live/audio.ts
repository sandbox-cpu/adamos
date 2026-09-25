import { toBase64 } from '../crypto'

/**
 * Microphone capture as 16-bit PCM at a target sample rate, using an
 * AudioWorklet that resamples from whatever rate the device runs at.
 */
const WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.target = (options.processorOptions && options.processorOptions.targetRate) || 16000;
    this.ratio = sampleRate / this.target;
    this.pos = 0;
    this.chunkSize = Math.round(this.target / 10);
    this.out = new Int16Array(this.chunkSize);
    this.idx = 0;
    this.sumSq = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const ch = input[0];
    while (this.pos < ch.length) {
      const i = Math.floor(this.pos);
      const frac = this.pos - i;
      const s0 = ch[i];
      const s1 = i + 1 < ch.length ? ch[i + 1] : s0;
      let v = s0 + (s1 - s0) * frac;
      v = Math.max(-1, Math.min(1, v));
      this.sumSq += v * v;
      this.out[this.idx++] = v < 0 ? v * 0x8000 : v * 0x7fff;
      if (this.idx === this.chunkSize) {
        const level = Math.sqrt(this.sumSq / this.chunkSize);
        this.port.postMessage({ pcm: this.out.buffer, level }, [this.out.buffer]);
        this.out = new Int16Array(this.chunkSize);
        this.idx = 0;
        this.sumSq = 0;
      }
      this.pos += this.ratio;
    }
    this.pos -= ch.length;
    return true;
  }
}
registerProcessor('pcm-capture', PcmCapture);
`

export interface MicCapture {
  stream: MediaStream
  stop: () => void
  setMuted: (muted: boolean) => void
}

export async function startMicCapture(targetRate: number, onChunk: (base64Pcm: string, level: number) => void): Promise<MicCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
  const ctx = new AudioContext()
  const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
  await ctx.audioWorklet.addModule(url)
  URL.revokeObjectURL(url)
  const source = ctx.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(ctx, 'pcm-capture', { processorOptions: { targetRate } })
  let muted = false
  node.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => {
    if (muted) return
    onChunk(toBase64(new Uint8Array(e.data.pcm)), e.data.level)
  }
  source.connect(node)
  // Keep the graph pulling audio without playing the mic back to the speakers.
  const sink = ctx.createGain()
  sink.gain.value = 0
  node.connect(sink)
  sink.connect(ctx.destination)
  return {
    stream,
    setMuted: (m) => {
      muted = m
      stream.getAudioTracks().forEach((t) => (t.enabled = !m))
    },
    stop: () => {
      node.port.onmessage = null
      source.disconnect()
      node.disconnect()
      stream.getTracks().forEach((t) => t.stop())
      void ctx.close()
    },
  }
}

/** Gapless playback of streamed 16-bit PCM audio, with instant interruption. */
export class PcmPlayer {
  private ctx: AudioContext
  private gain: GainNode
  private analyser: AnalyserNode
  private nextTime = 0
  private sources = new Set<AudioBufferSourceNode>()
  private levelData: Uint8Array<ArrayBuffer>
  onIdle?: () => void

  constructor() {
    this.ctx = new AudioContext()
    this.gain = this.ctx.createGain()
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 512
    this.levelData = new Uint8Array(this.analyser.fftSize)
    this.gain.connect(this.analyser)
    this.analyser.connect(this.ctx.destination)
  }

  async resume() {
    if (this.ctx.state === 'suspended') await this.ctx.resume()
  }

  play(base64: string, sampleRate = 24000) {
    const bin = atob(base64)
    const len = bin.length >> 1
    if (!len) return
    const buffer = this.ctx.createBuffer(1, len, sampleRate)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < len; i++) {
      const lo = bin.charCodeAt(i * 2)
      const hi = bin.charCodeAt(i * 2 + 1)
      let v = (hi << 8) | lo
      if (v >= 0x8000) v -= 0x10000
      channel[i] = v / 0x8000
    }
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.connect(this.gain)
    const start = Math.max(this.ctx.currentTime + 0.03, this.nextTime)
    src.start(start)
    this.nextTime = start + buffer.duration
    this.sources.add(src)
    src.onended = () => {
      this.sources.delete(src)
      if (!this.sources.size) this.onIdle?.()
    }
  }

  interrupt() {
    for (const s of this.sources) {
      try {
        s.stop()
      } catch {
        /* already stopped */
      }
    }
    this.sources.clear()
    this.nextTime = 0
  }

  get speaking(): boolean {
    return this.sources.size > 0
  }

  level(): number {
    this.analyser.getByteTimeDomainData(this.levelData)
    let sum = 0
    for (const v of this.levelData) {
      const d = (v - 128) / 128
      sum += d * d
    }
    return Math.sqrt(sum / this.levelData.length)
  }

  close() {
    this.interrupt()
    void this.ctx.close()
  }
}

export function rateFromMime(mime: string | undefined, fallback = 24000): number {
  const m = mime?.match(/rate=(\d+)/)
  return m ? Number(m[1]) : fallback
}
