import type { BrandKit } from '../types'

export interface DeckTheme {
  id: string
  name: string
  description: string
  dark: boolean
  background: string
  /** CSS background (may be a gradient). */
  canvas: string
  surface: string
  text: string
  muted: string
  accent: string
  accent2: string
  headingFont: string
  bodyFont: string
  pptxHeading: string
  pptxBody: string
  uppercaseTitles?: boolean
  decor: 'glow' | 'lines' | 'blocks' | 'grain' | 'none'
}

export const DECK_THEMES: DeckTheme[] = [
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Dark, cinematic, glowing accents',
    dark: true,
    background: '#0a0b12',
    canvas: 'radial-gradient(120% 90% at 85% 0%, #2a1f5c 0%, transparent 55%), radial-gradient(90% 80% at 0% 100%, #0e3a4a 0%, transparent 55%), #0a0b12',
    surface: 'rgba(255,255,255,0.06)',
    text: '#f5f6fb',
    muted: '#a5abc2',
    accent: '#9b87ff',
    accent2: '#35d6ee',
    headingFont: "'Bricolage Grotesque Variable', 'Inter Variable', sans-serif",
    bodyFont: "'Inter Variable', sans-serif",
    pptxHeading: 'Arial Black',
    pptxBody: 'Arial',
    decor: 'glow',
  },
  {
    id: 'paper',
    name: 'Paper',
    description: 'Warm editorial with a serif voice',
    dark: false,
    background: '#f6f1e7',
    canvas: '#f6f1e7',
    surface: 'rgba(43,33,24,0.06)',
    text: '#231a12',
    muted: '#6f5e4d',
    accent: '#c2410c',
    accent2: '#0f766e',
    headingFont: "'Instrument Serif', Georgia, serif",
    bodyFont: "'Inter Variable', sans-serif",
    pptxHeading: 'Georgia',
    pptxBody: 'Arial',
    decor: 'lines',
  },
  {
    id: 'neon',
    name: 'Neon',
    description: 'Loud, black and electric',
    dark: true,
    background: '#050505',
    canvas: '#050505',
    surface: 'rgba(255,255,255,0.07)',
    text: '#ffffff',
    muted: '#9f9f9f',
    accent: '#c6ff3d',
    accent2: '#3de8ff',
    headingFont: "'Bricolage Grotesque Variable', sans-serif",
    bodyFont: "'Inter Variable', sans-serif",
    pptxHeading: 'Arial Black',
    pptxBody: 'Arial',
    uppercaseTitles: true,
    decor: 'blocks',
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Clean white, sharp and corporate',
    dark: false,
    background: '#ffffff',
    canvas: '#ffffff',
    surface: '#f2f4f8',
    text: '#0d1017',
    muted: '#5b6272',
    accent: '#2563eb',
    accent2: '#7c3aed',
    headingFont: "'Inter Variable', sans-serif",
    bodyFont: "'Inter Variable', sans-serif",
    pptxHeading: 'Arial',
    pptxBody: 'Arial',
    decor: 'none',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Rich plum-to-amber gradient',
    dark: true,
    background: '#2b0f2e',
    canvas: 'linear-gradient(135deg, #2b0f2e 0%, #5b1a3a 45%, #b4432a 100%)',
    surface: 'rgba(255,255,255,0.1)',
    text: '#fff6ec',
    muted: '#f2cdbd',
    accent: '#ffb347',
    accent2: '#ff7a9c',
    headingFont: "'Bricolage Grotesque Variable', sans-serif",
    bodyFont: "'Inter Variable', sans-serif",
    pptxHeading: 'Arial Black',
    pptxBody: 'Arial',
    decor: 'grain',
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Deep green with gold, calm and premium',
    dark: true,
    background: '#0f2419',
    canvas: 'radial-gradient(100% 80% at 100% 0%, #1f4a33 0%, transparent 60%), #0f2419',
    surface: 'rgba(255,255,255,0.07)',
    text: '#f3efe2',
    muted: '#b9c4b3',
    accent: '#e3b95b',
    accent2: '#8fd3a8',
    headingFont: "'Instrument Serif', Georgia, serif",
    bodyFont: "'Inter Variable', sans-serif",
    pptxHeading: 'Georgia',
    pptxBody: 'Arial',
    decor: 'lines',
  },
]

const BRAND_FONTS: Record<NonNullable<BrandKit['font']>, { heading: string; pptx: string }> = {
  grotesk: { heading: "'Bricolage Grotesque Variable', sans-serif", pptx: 'Arial Black' },
  serif: { heading: "'Instrument Serif', Georgia, serif", pptx: 'Georgia' },
  mono: { heading: "'JetBrains Mono Variable', monospace", pptx: 'Courier New' },
  rounded: { heading: "'Inter Variable', sans-serif", pptx: 'Arial Rounded MT Bold' },
}

function isDark(hex: string): boolean {
  const h = hex.replace('#', '')
  if (h.length < 6) return true
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 140
}

export function resolveDeckTheme(themeId: string, brand?: BrandKit): DeckTheme {
  if (themeId === 'brand' && brand) {
    const bg = brand.background || '#0b0c12'
    const dark = isDark(bg)
    const font = BRAND_FONTS[brand.font ?? 'grotesk']
    return {
      id: 'brand',
      name: 'Your brand',
      description: 'Built from your brand kit',
      dark,
      background: bg,
      canvas: bg,
      surface: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
      text: dark ? '#f5f6fb' : '#101218',
      muted: dark ? '#a9afc3' : '#5b6272',
      accent: brand.primary,
      accent2: brand.secondary,
      headingFont: font.heading,
      bodyFont: "'Inter Variable', sans-serif",
      pptxHeading: font.pptx,
      pptxBody: 'Arial',
      decor: 'none',
    }
  }
  return DECK_THEMES.find((t) => t.id === themeId) ?? DECK_THEMES[0]
}
