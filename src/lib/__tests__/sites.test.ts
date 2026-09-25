import { describe, expect, it } from 'vitest'
import { pageNameFrom } from '../sites/names'
import { contrastRatio, extractHtml, inkOn, renderSiteHTML, renderSiteParts } from '../sites/render'
import { presetById } from '../sites/themes'
import type { Site } from '../types'

function site(sections: Site['sections'], extra: Partial<Site> = {}): Site {
  return {
    id: 's1',
    name: 'Test page',
    brief: { purpose: 'Testing', audience: '', keyMessages: '', cta: '', ctaLink: '', style: '', useWeb: false },
    mode: 'sections',
    theme: { ...presetById('midnight').theme },
    sections,
    history: [],
    status: 'ready',
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  }
}

describe('page names', () => {
  it('turns a description into a short name', () => {
    expect(pageNameFrom('A sign-up page for our summer client party on the rooftop')).toBe('Summer client party on the rooftop')
    expect(pageNameFrom('A launch page for Northwind’s Autumn Blend with the pop-up dates and a pre-order button')).toBe('Northwind’s Autumn Blend')
    expect(pageNameFrom('A launch page for a new product, building excitement and capturing pre-orders')).toBe('New product')
    expect(pageNameFrom('Rooftop party RSVPs')).toBe('Rooftop party RSVPs')
  })

  it('keeps long names to a sensible length', () => {
    const name = pageNameFrom('An extraordinarily detailed and remarkably comprehensive overview of absolutely everything we offer')
    expect(name.length).toBeLessThanOrEqual(48)
    expect(name.endsWith(' ')).toBe(false)
  })

  it('never returns an empty name', () => {
    expect(pageNameFrom('   ')).toBe('Untitled page')
  })
})

describe('landing page renderer', () => {
  it('escapes text so page content cannot inject markup', () => {
    const html = renderSiteHTML(site([{ id: 'h', type: 'hero', heading: '<script>alert(1)</script>', subheading: 'Fish & chips "quoted"' }]))
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('Fish &amp; chips &quot;quoted&quot;')
  })

  it('only allows safe link targets and turns email addresses into mail links', () => {
    const html = renderSiteHTML(
      site([
        { id: 'a', type: 'cta', heading: 'Go', cta: { label: 'Bad', href: 'javascript:alert(1)' }, cta2: { label: 'Mail', href: 'press@example.com' } },
        { id: 'b', type: 'hero', heading: 'Hi', cta: { label: 'Web', href: 'https://example.com/?a=1&b=2' } },
      ]),
    )
    expect(html).not.toContain('javascript:')
    expect(html).toContain('href="mailto:press@example.com"')
    expect(html).toContain('href="https://example.com/?a=1&amp;b=2"')
  })

  it('uses library pictures and falls back gracefully when a picture fails', () => {
    const html = renderSiteHTML(site([{ id: 's', type: 'split', heading: 'Story', image: 'media:abc' }]), { abc: 'data:image/png;base64,AAAA' })
    expect(html).toContain('src="data:image/png;base64,AAAA"')
    expect(html).toContain('onerror=')
    expect(html).toContain('class="panel"')
  })

  it('wraps sections for the editor only when asked', () => {
    const page = site([{ id: 'x1', type: 'features', heading: 'Why', items: [{ title: 'Fast' }] }])
    expect(renderSiteParts(page, {}, { editor: true, labels: { features: 'Features' } }).sections[0].html).toContain('data-sid="x1"')
    expect(renderSiteHTML(page)).not.toContain('data-sid')
  })

  it('returns a freestyle page as written', () => {
    const html = '<!doctype html><html><head><title>X</title></head><body>Hi</body></html>'
    expect(renderSiteHTML(site([], { mode: 'freeform', html }))).toBe(html)
  })

  it('pulls a full document out of a fenced answer', () => {
    expect(extractHtml('Here you go:\n```html\n<!doctype html><html><body>Hi</body></html>\n```\nEnjoy')).toBe('<!doctype html><html><body>Hi</body></html>')
  })

  it('picks readable button text for any brand colour', () => {
    expect(inkOn('#0b0c10')).toBe('#ffffff')
    expect(inkOn('#a3e635')).toBe('#0a0a0a')
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0)
  })
})
