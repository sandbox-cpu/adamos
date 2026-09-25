import type { SiteTheme } from '../types'

export interface SitePreset {
  id: string
  name: string
  description: string
  theme: SiteTheme
}

export const SITE_PRESETS: SitePreset[] = [
  {
    id: 'midnight',
    name: 'Midnight Editorial',
    description: 'Dark, premium and magazine-like',
    theme: {
      presetId: 'midnight',
      background: '#0b0b10',
      surface: '#15151d',
      text: '#f4f4f5',
      muted: '#a1a1aa',
      primary: '#f59e0b',
      secondary: '#fb7185',
      font: 'serif',
      radius: 'soft',
      mode: 'dark',
    },
  },
  {
    id: 'clean',
    name: 'Clean Light',
    description: 'Bright, modern and trustworthy',
    theme: {
      presetId: 'clean',
      background: '#ffffff',
      surface: '#f4f5f7',
      text: '#0b0c10',
      muted: '#555b6b',
      primary: '#2563eb',
      secondary: '#7c3aed',
      font: 'grotesk',
      radius: 'round',
      mode: 'light',
    },
  },
  {
    id: 'neon',
    name: 'Bold Neon',
    description: 'Loud, confident, made for launches',
    theme: {
      presetId: 'neon',
      background: '#050505',
      surface: '#111111',
      text: '#ffffff',
      muted: '#a3a3a3',
      primary: '#a3e635',
      secondary: '#22d3ee',
      font: 'display',
      radius: 'sharp',
      mode: 'dark',
    },
  },
  {
    id: 'paper',
    name: 'Warm Paper',
    description: 'Crafted, warm and human',
    theme: {
      presetId: 'paper',
      background: '#faf6ef',
      surface: '#f1e9dc',
      text: '#2b2118',
      muted: '#6b5b4b',
      primary: '#c2410c',
      secondary: '#0f766e',
      font: 'serif',
      radius: 'soft',
      mode: 'light',
    },
  },
  {
    id: 'ocean',
    name: 'Deep Ocean',
    description: 'Calm, techy and polished',
    theme: {
      presetId: 'ocean',
      background: '#06172b',
      surface: '#0b2440',
      text: '#eaf4ff',
      muted: '#9fb6cf',
      primary: '#38bdf8',
      secondary: '#818cf8',
      font: 'grotesk',
      radius: 'round',
      mode: 'dark',
    },
  },
  {
    id: 'blush',
    name: 'Blush',
    description: 'Soft and elegant for beauty and lifestyle',
    theme: {
      presetId: 'blush',
      background: '#fff5f7',
      surface: '#ffe4ea',
      text: '#3b0a1a',
      muted: '#8a4a5c',
      primary: '#e11d48',
      secondary: '#f59e0b',
      font: 'serif',
      radius: 'round',
      mode: 'light',
    },
  },
]

export const SITE_FONTS: Record<SiteTheme['font'], { label: string; heading: string; body: string; google: string }> = {
  grotesk: { label: 'Modern sans', heading: "'Inter', system-ui, sans-serif", body: "'Inter', system-ui, sans-serif", google: 'Inter:wght@400;500;600;700;800' },
  serif: {
    label: 'Editorial serif',
    heading: "'Instrument Serif', Georgia, serif",
    body: "'Inter', system-ui, sans-serif",
    google: 'Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700',
  },
  mono: {
    label: 'Technical mono',
    heading: "'JetBrains Mono', ui-monospace, monospace",
    body: "'Inter', system-ui, sans-serif",
    google: 'JetBrains+Mono:wght@500;700&family=Inter:wght@400;500;600',
  },
  rounded: { label: 'Friendly rounded', heading: "'Nunito', system-ui, sans-serif", body: "'Nunito', system-ui, sans-serif", google: 'Nunito:wght@400;600;700;800;900' },
  display: {
    label: 'Bold display',
    heading: "'Bricolage Grotesque', system-ui, sans-serif",
    body: "'Inter', system-ui, sans-serif",
    google: 'Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Inter:wght@400;500;600',
  },
}

export function presetById(id: string): SitePreset {
  return SITE_PRESETS.find((p) => p.id === id) ?? SITE_PRESETS[0]
}
