/**
 * Calendar link proxy (optional)
 *
 * Google, Outlook and Apple calendar links can't be read by a web page
 * directly, because those services don't allow it. Deploy this tiny
 * Cloudflare Worker (free) and paste its address into
 * Settings → Integrations → "Proxy for iCal links", ending in ?url=
 * for example: https://calendar-proxy.yourname.workers.dev/?url=
 *
 * It only passes calendar files (.ics) through, nothing else, and stores nothing.
 */
export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors() })
    if (request.method !== 'GET') return new Response('Only GET is supported', { status: 405, headers: cors() })

    const target = new URL(request.url).searchParams.get('url')
    if (!target || !/^https:\/\//i.test(target)) return new Response('Add ?url= followed by an https calendar link', { status: 400, headers: cors() })

    const upstream = await fetch(target, { headers: { Accept: 'text/calendar, text/plain' }, cf: { cacheTtl: 300 } })
    const body = await upstream.text()
    if (!body.includes('BEGIN:VCALENDAR')) return new Response('That link is not a calendar', { status: 422, headers: cors() })

    return new Response(body, {
      status: upstream.status,
      headers: { ...cors(), 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=300' },
    })
  },
}

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' }
}
