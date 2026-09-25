import type { ImageInput } from '../llm/types'

export function canShareScreen(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia
}

export async function startScreenShare(): Promise<MediaStream> {
  if (!canShareScreen()) throw new Error('Screen sharing isn’t available in this browser.')
  return navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false })
}

export async function startCamera(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false })
}

/**
 * Grabs JPEG frames from a video stream and reports whether the picture has
 * changed since the last frame (so unchanged screens are not re-sent).
 */
export class FrameGrabber {
  private video: HTMLVideoElement
  private canvas = document.createElement('canvas')
  private tiny = document.createElement('canvas')
  private lastSignature: number[] = []
  private ready: Promise<void>

  private maxSize: number
  private quality: number

  constructor(stream: MediaStream, maxSize = 1280, quality = 0.65) {
    this.maxSize = maxSize
    this.quality = quality
    this.video = document.createElement('video')
    this.video.muted = true
    this.video.playsInline = true
    this.video.srcObject = stream
    this.ready = this.video.play().then(() => undefined).catch(() => undefined)
    this.tiny.width = 24
    this.tiny.height = 14
  }

  async grab(): Promise<(ImageInput & { changed: boolean }) | null> {
    await this.ready
    const vw = this.video.videoWidth
    const vh = this.video.videoHeight
    if (!vw || !vh) return null
    const scale = Math.min(1, this.maxSize / Math.max(vw, vh))
    this.canvas.width = Math.round(vw * scale)
    this.canvas.height = Math.round(vh * scale)
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height)

    const tctx = this.tiny.getContext('2d', { willReadFrequently: true })
    let changed = true
    if (tctx) {
      tctx.drawImage(this.canvas, 0, 0, this.tiny.width, this.tiny.height)
      const px = tctx.getImageData(0, 0, this.tiny.width, this.tiny.height).data
      const sig: number[] = []
      for (let i = 0; i < px.length; i += 4) sig.push((px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000)
      if (this.lastSignature.length === sig.length) {
        let diff = 0
        for (let i = 0; i < sig.length; i++) diff += Math.abs(sig[i] - this.lastSignature[i])
        changed = diff / sig.length > 3
      }
      this.lastSignature = sig
    }
    const dataUrl = this.canvas.toDataURL('image/jpeg', this.quality)
    return { mediaType: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1), changed }
  }

  stop() {
    this.video.pause()
    this.video.srcObject = null
  }
}
