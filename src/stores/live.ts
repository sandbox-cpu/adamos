import { create } from 'zustand'
import type { ActivityItem, Citation } from '../lib/types'

export interface LiveMessage {
  text: string
  thinking: string
  activities: ActivityItem[]
  citations: Citation[]
  notices: string[]
}

interface LiveState {
  messages: Record<string, LiveMessage>
  /** Conversation / job ids currently running, with their abort controllers. */
  running: Record<string, AbortController>
  begin: (id: string) => void
  patch: (id: string, patch: Partial<LiveMessage>) => void
  end: (id: string) => void
  setRunning: (key: string, controller: AbortController | null) => void
  stop: (key: string) => void
}

export const useLive = create<LiveState>((set, get) => ({
  messages: {},
  running: {},
  begin: (id) => set((s) => ({ messages: { ...s.messages, [id]: { text: '', thinking: '', activities: [], citations: [], notices: [] } } })),
  patch: (id, patch) =>
    set((s) => {
      const current = s.messages[id]
      if (!current) return s
      return { messages: { ...s.messages, [id]: { ...current, ...patch } } }
    }),
  end: (id) =>
    set((s) => {
      const next = { ...s.messages }
      delete next[id]
      return { messages: next }
    }),
  setRunning: (key, controller) =>
    set((s) => {
      const next = { ...s.running }
      if (controller) next[key] = controller
      else delete next[key]
      return { running: next }
    }),
  stop: (key) => {
    get().running[key]?.abort()
  },
}))

/**
 * Collects streamed text and flushes it to the store at most once per frame,
 * so fast token streams stay smooth.
 */
export function createStreamWriter(id: string) {
  let text = ''
  let thinking = ''
  let pending = false
  const flush = () => {
    pending = false
    useLive.getState().patch(id, { text, thinking })
  }
  const schedule = () => {
    if (pending) return
    pending = true
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush)
    else setTimeout(flush, 16)
  }
  return {
    text: (delta: string) => {
      text += delta
      schedule()
    },
    reset: () => {
      text = ''
      schedule()
    },
    thinking: (delta: string) => {
      thinking += delta
      schedule()
    },
    get value() {
      return text
    },
    get thoughts() {
      return thinking
    },
    flush,
  }
}
