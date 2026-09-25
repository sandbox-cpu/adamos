import type { ActivityItem } from '../types'

export type LiveStatus = 'idle' | 'connecting' | 'live' | 'ended' | 'error'

export type LiveEngineId = 'gemini' | 'openai' | 'browser'

export interface TranscriptEntry {
  id: string
  role: 'user' | 'assistant' | 'event'
  text: string
  final: boolean
  at: number
  activity?: ActivityItem
}

export interface LiveEvents {
  onStatus: (status: LiveStatus, detail?: string) => void
  onTranscript: (entry: TranscriptEntry) => void
  onSpeaking: (speaking: boolean) => void
  onLevels?: (input: number, output: number) => void
  onError: (message: string) => void
}

export interface LiveSession {
  start: () => Promise<void>
  stop: () => void
  setMuted: (muted: boolean) => void
  sendText: (text: string) => void
  /** Starts (or, with null, stops) streaming a screen or camera to the model. */
  setVideo: (stream: MediaStream | null) => void
  /** Stops the assistant mid-sentence. */
  interrupt: () => void
}

export const GEMINI_VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Zephyr']
export const OPENAI_VOICES = ['marin', 'cedar', 'alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse']
