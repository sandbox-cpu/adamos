import { FriendlyError } from '../llm/errors'
import type { CalEvent } from '../types'
import type { IcsWindow } from './ics'

/**
 * Google Calendar through Google Identity Services. Everything runs in the
 * browser: Google hands over a short-lived read-only token, which is kept in
 * memory only and never stored.
 */

interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            prompt?: string
            callback: (r: TokenResponse) => void
            error_callback?: (e: { type: string; message?: string }) => void
          }) => TokenClient
        }
      }
    }
  }
}

const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
let token: { value: string; expires: number } | null = null
let loading: Promise<void> | null = null

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      loading = null
      reject(new FriendlyError('Couldn’t reach Google sign-in.', 'Check your internet connection and try again.'))
    }
    document.head.appendChild(s)
  })
  return loading
}

export function hasGoogleToken(): boolean {
  return !!token && token.expires > Date.now() + 60_000
}

export function forgetGoogleToken(): void {
  token = null
}

/** Opens Google's sign-in window. Must be called from a click. */
export async function signInToGoogle(clientId: string, forceConsent = false): Promise<string> {
  if (!clientId) throw new FriendlyError('Google Calendar isn’t set up yet.', 'Add a Google client ID in Settings → Integrations, or use a calendar link or file instead.')
  if (hasGoogleToken() && !forceConsent) return token!.value
  await loadGoogleScript()
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      prompt: forceConsent ? 'consent' : '',
      callback: (r) => {
        if (r.error || !r.access_token) {
          reject(new FriendlyError('Google didn’t allow access.', r.error_description ?? 'Try again, and tick the box to let the OS see your calendar.'))
          return
        }
        token = { value: r.access_token, expires: Date.now() + (r.expires_in ?? 3600) * 1000 }
        resolve(r.access_token)
      },
      error_callback: (e) =>
        reject(
          new FriendlyError(
            e.type === 'popup_closed' ? 'Google sign-in was closed before finishing.' : 'Google sign-in didn’t open.',
            e.type === 'popup_failed_to_open' ? 'Allow pop-ups for this site and try again.' : undefined,
          ),
        ),
    })
    client.requestAccessToken()
  })
}

async function gget<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (res.status === 401) {
    forgetGoogleToken()
    throw new FriendlyError('Your Google sign-in has expired.', 'Click sync to sign in again.')
  }
  if (!res.ok) throw new FriendlyError(`Google Calendar returned an error (${res.status}).`)
  return (await res.json()) as T
}

interface GCalendar {
  id: string
  summary: string
  primary?: boolean
  selected?: boolean
  backgroundColor?: string
}

interface GEvent {
  id: string
  status?: string
  summary?: string
  description?: string
  location?: string
  htmlLink?: string
  hangoutLink?: string
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
}

/** Reads every calendar ticked in Google Calendar, expanded into single events. */
export async function fetchGoogleEvents(accessToken: string, calendarId: string, window: IcsWindow): Promise<{ events: CalEvent[]; account?: string }> {
  const list = await gget<{ items: GCalendar[] }>('/users/me/calendarList?minAccessRole=reader', accessToken)
  const calendars = list.items.filter((c) => c.primary || c.selected)
  const account = calendars.find((c) => c.primary)?.id
  const events: CalEvent[] = []
  for (const cal of calendars) {
    let pageToken: string | undefined
    let pages = 0
    do {
      const params = new URLSearchParams({ timeMin: window.start.toISOString(), timeMax: window.end.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '2500' })
      if (pageToken) params.set('pageToken', pageToken)
      const page = await gget<{ items: GEvent[]; nextPageToken?: string }>(`/calendars/${encodeURIComponent(cal.id)}/events?${params}`, accessToken)
      for (const e of page.items) {
        if (e.status === 'cancelled' || !e.start) continue
        const allDay = !!e.start.date
        const start = allDay ? new Date(`${e.start.date}T00:00:00`) : new Date(e.start.dateTime!)
        const end = e.end ? (e.end.date ? new Date(`${e.end.date}T00:00:00`) : new Date(e.end.dateTime!)) : new Date(start.getTime() + 3_600_000)
        events.push({
          id: `${calendarId}:${cal.id}:${e.id}`,
          title: e.summary || '(No title)',
          start: start.toISOString(),
          end: end.toISOString(),
          allDay: allDay || undefined,
          location: e.location || (e.hangoutLink ? 'Google Meet' : undefined),
          description: e.description?.slice(0, 4000),
          url: e.hangoutLink ?? e.htmlLink,
          source: 'google',
          calendarId,
          color: cal.backgroundColor,
        })
      }
      pageToken = page.nextPageToken
    } while (pageToken && ++pages < 10)
  }
  return { events, account }
}
