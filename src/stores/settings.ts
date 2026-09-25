import { create } from 'zustand'
import { kvGet, kvSet } from '../lib/db'
import type { AccentId, Settings } from '../lib/types'

export const DEFAULT_SETTINGS: Settings = {
  userName: 'Adam',
  companyName: 'Your PR Agency',
  userRole: 'Founder & Managing Director',
  osName: '',
  spelling: 'british',
  accent: 'aurora',
  introMode: 'always',
  reduceMotion: false,
  onboarded: false,
  demoData: true,
  brain: {
    mode: 'none',
    writeFolder: 'OS',
    dailyFolder: 'Daily',
  },
  calendar: {
    weekStartsOn: 1,
    dayStart: 7,
    dayEnd: 20,
  },
  vault: {
    autoLockMinutes: 30,
    rememberDevice: true,
  },
  media: {
    provider: 'pollinations',
    geminiModel: 'gemini-2.5-flash-image',
    openaiModel: 'gpt-image-1',
  },
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

interface SettingsState {
  settings: Settings
  loaded: boolean
  load: () => Promise<void>
  update: (patch: DeepPartial<Settings>) => Promise<void>
}

function merge<T extends object>(base: T, patch: DeepPartial<T>): T {
  const out = { ...base } as Record<string, unknown>
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const current = out[k]
    if (v && typeof v === 'object' && !Array.isArray(v) && current && typeof current === 'object' && !Array.isArray(current)) {
      out[k] = merge(current as object, v as DeepPartial<object>)
    } else {
      out[k] = v
    }
  }
  return out as T
}

export const ACCENTS: { id: AccentId; name: string; colors: [string, string] }[] = [
  { id: 'aurora', name: 'Aurora', colors: ['#8b6cff', '#2dd4f0'] },
  { id: 'ember', name: 'Ember', colors: ['#fb7185', '#fbbf24'] },
  { id: 'emerald', name: 'Emerald', colors: ['#10b981', '#a3e635'] },
  { id: 'ocean', name: 'Ocean', colors: ['#3b82f6', '#22d3ee'] },
  { id: 'solar', name: 'Solar', colors: ['#f59e0b', '#fde047'] },
  { id: 'mono', name: 'Mono', colors: ['#e4e7ef', '#9aa3b8'] },
]

export function applyAccent(accent: AccentId) {
  document.documentElement.dataset.accent = accent
}

function applyMotion(reduce: boolean) {
  if (reduce) document.documentElement.dataset.motion = 'reduced'
  else delete document.documentElement.dataset.motion
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  load: async () => {
    const stored = await kvGet<Partial<Settings>>('settings')
    const settings = merge(DEFAULT_SETTINGS, (stored ?? {}) as DeepPartial<Settings>)
    applyAccent(settings.accent)
    applyMotion(settings.reduceMotion)
    set({ settings, loaded: true })
  },
  update: async (patch) => {
    const settings = merge(get().settings, patch)
    set({ settings })
    if (patch.accent) applyAccent(settings.accent)
    if (patch.reduceMotion !== undefined) applyMotion(settings.reduceMotion)
    await kvSet('settings', settings)
  },
}))

/** The OS brand, e.g. "AdamOS". */
export function osNameOf(settings: Settings): string {
  if (settings.osName.trim()) return settings.osName.trim()
  const first = settings.userName.trim().split(/\s+/)[0] || 'My'
  return `${first}OS`
}

export function useOsName(): string {
  return useSettings((s) => osNameOf(s.settings))
}

export function useUserName(): string {
  return useSettings((s) => s.settings.userName.trim().split(/\s+/)[0] || 'there')
}
