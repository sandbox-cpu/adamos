import { create } from 'zustand'

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === '1'
  } catch {
    return fallback
  }
}

function writeBool(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    /* storage unavailable */
  }
}

interface UIState {
  sidebarCollapsed: boolean
  mobileNav: boolean
  palette: boolean
  dock: boolean
  dockDraft: string
  showIntro: boolean
  toggleSidebar: () => void
  setMobileNav: (v: boolean) => void
  setPalette: (v: boolean) => void
  setDock: (v: boolean) => void
  /** Opens the lead agent dock, optionally pre-filling (and sending) a message. */
  askLead: (text?: string) => void
  setShowIntro: (v: boolean) => void
}

export const useUI = create<UIState>((set) => ({
  sidebarCollapsed: readBool('ui.sidebarCollapsed', false),
  mobileNav: false,
  palette: false,
  dock: false,
  dockDraft: '',
  showIntro: false,
  toggleSidebar: () =>
    set((s) => {
      writeBool('ui.sidebarCollapsed', !s.sidebarCollapsed)
      return { sidebarCollapsed: !s.sidebarCollapsed }
    }),
  setMobileNav: (v) => set({ mobileNav: v }),
  setPalette: (v) => set({ palette: v }),
  setDock: (v) => set({ dock: v }),
  askLead: (text) => set({ dock: true, dockDraft: text ?? '' }),
  setShowIntro: (v) => set({ showIntro: v }),
}))
