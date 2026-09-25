import { db } from '../db'
import { mediaDataUrl } from '../media/generate'
import type { Site } from '../types'

/** Media ids among a page's picture references (pictures uploaded or made in the Media Studio). */
function mediaIds(refs: (string | undefined)[]): string[] {
  return [...new Set(refs.filter((v): v is string => !!v && v.startsWith('media:')).map((v) => v.slice(6)))]
}

/** The picture references used by a page. */
export function imageRefs(site: Pick<Site, 'sections'>): (string | undefined)[] {
  return site.sections.map((s) => s.image)
}

const cache = new Map<string, string>()

/**
 * Picture addresses for a page. Stored pictures become embedded data, so they show inside
 * sandboxed previews and a downloaded page works anywhere on its own.
 */
export async function pageImages(refs: (string | undefined)[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const id of mediaIds(refs)) {
    let src = cache.get(id)
    if (!src) {
      const item = await db.media.get(id)
      if (!item) continue
      src = item.blob ? await mediaDataUrl(item) : item.url
      if (src) cache.set(id, src)
    }
    if (src) out[id] = src
  }
  return out
}

async function toDataUrl(blob: Blob): Promise<string | undefined> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => resolve(undefined)
    reader.readAsDataURL(blob)
  })
}

/**
 * Everything a downloaded page needs to stand on its own: library pictures plus web pictures
 * (such as ones made by the free image service), embedded where the browser is allowed to.
 */
export async function downloadImages(site: Pick<Site, 'sections'>): Promise<Record<string, string>> {
  const refs = imageRefs(site)
  const out = await pageImages(refs)
  const remote = [...new Set(refs.filter((r): r is string => !!r && /^https?:/i.test(r)))]
  await Promise.all(
    remote.map(async (url) => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
        const blob = res.ok ? await res.blob() : undefined
        const data = blob && blob.type.startsWith('image/') ? await toDataUrl(blob) : undefined
        if (data) out[url] = data
      } catch {
        // Keep the web address; the picture still loads when the page is online.
      }
    }),
  )
  return out
}
