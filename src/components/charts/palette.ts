/**
 * Validated categorical chart palette (colour-blind safe in fixed order).
 * Dark steps are used on the app's dark surfaces and dark slide themes,
 * light steps on light slide themes. Never cycle past eight.
 */
export const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']
export const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948']

/** Diverging pair for ordered sentiment (negative ↔ positive) with a grey midpoint. */
export const DIVERGING = {
  dark: { negative: '#e66767', neutral: '#4a4c55', positive: '#3987e5' },
  light: { negative: '#e34948', neutral: '#d9d8d2', positive: '#2a78d6' },
}

export const CHART_INK = {
  dark: { primary: '#ffffff', secondary: '#c3c2b7', muted: '#898781', grid: '#2c2c2a', baseline: '#383835', surface: '#11131a' },
  light: { primary: '#0b0b0b', secondary: '#52514e', muted: '#898781', grid: '#e1e0d9', baseline: '#c3c2b7', surface: '#fcfcfb' },
}

export function seriesColors(dark: boolean): string[] {
  return dark ? SERIES_DARK : SERIES_LIGHT
}
