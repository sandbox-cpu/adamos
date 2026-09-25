import { clsx, type ClassValue } from 'clsx'
import { nanoid } from 'nanoid'
import { addDays, differenceInCalendarDays, format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday, parseISO } from 'date-fns'

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs)
}

export function uid(size = 12): string {
  return nanoid(size)
}

export const now = (): number => Date.now()

/** Local calendar date as YYYY-MM-DD. */
export function isoDate(d: Date = new Date()): string {
  return format(d, 'yyyy-MM-dd')
}

export function dateFromNow(days: number, base: Date = new Date()): string {
  return isoDate(addDays(base, days))
}

export function parseDate(value: string): Date {
  return value.length <= 10 ? parseISO(value + 'T00:00:00') : parseISO(value)
}

export function daysUntil(value?: string): number | null {
  if (!value) return null
  return differenceInCalendarDays(parseDate(value), new Date())
}

export function friendlyDate(value?: string): string {
  if (!value) return ''
  const d = parseDate(value)
  if (isToday(d)) return 'Today'
  if (isTomorrow(d)) return 'Tomorrow'
  if (isYesterday(d)) return 'Yesterday'
  const diff = differenceInCalendarDays(d, new Date())
  if (diff > 0 && diff < 7) return format(d, 'EEEE')
  return format(d, d.getFullYear() === new Date().getFullYear() ? 'd MMM' : 'd MMM yyyy')
}

export function dueLabel(value?: string): { text: string; tone: 'bad' | 'warn' | 'good' | 'muted' } | null {
  const days = daysUntil(value)
  if (days === null) return null
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, tone: 'bad' }
  if (days === 0) return { text: 'Due today', tone: 'warn' }
  if (days === 1) return { text: 'Tomorrow', tone: 'warn' }
  if (days <= 7) return { text: `${days} days`, tone: 'good' }
  return { text: friendlyDate(value), tone: 'muted' }
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 45_000) return 'just now'
  return formatDistanceToNowStrict(ts, { addSuffix: true })
}

export function timeOfDay(d: Date = new Date()): 'morning' | 'afternoon' | 'evening' | 'night' {
  const h = d.getHours()
  if (h < 5) return 'night'
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, Math.max(0, max - 1)).trimEnd() + '…'
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}

export function plural(n: number, word: string, pluralWord?: string): string {
  return `${n} ${n === 1 ? word : pluralWord ?? word + 's'}`
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '') + 'M'
  if (n >= 10_000) return Math.round(n / 1000) + 'k'
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(n)
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const num = parseInt(full.slice(0, 6), 16)
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.replace('#', ''), 16)
  const pb = parseInt(b.replace('#', ''), 16)
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t)
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t)
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t)
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/** Filename safe for every desktop OS. */
export function safeFileName(text: string): string {
  return text.replace(/[\\/:*?"<>|#^[\]]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Untitled'
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function downloadText(text: string, filename: string, type = 'text/plain;charset=utf-8'): void {
  downloadBlob(new Blob([text], { type }), filename)
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

export function readFileAsText(file: File): Promise<string> {
  return file.text()
}

export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function groupBy<T, K extends string | number>(items: T[], key: (item: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>
  for (const item of items) {
    const k = key(item)
    ;(out[k] ||= []).push(item)
  }
  return out
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException ? err.name === 'AbortError' : (err as { name?: string })?.name === 'AbortError'
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return 'Something went wrong'
  }
}
