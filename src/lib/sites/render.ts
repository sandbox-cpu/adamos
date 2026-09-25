import type { Site, SiteItem, SiteSection, SiteSectionType, SiteTheme } from '../types'
import { SITE_FONTS } from './themes'

function esc(text: string | undefined): string {
  return (text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Only allow safe link targets in generated pages. */
function href(value: string | undefined): string {
  const v = (value ?? '').trim()
  if (!v) return '#'
  if (/^(https?:|mailto:|tel:|#|\/)/i.test(v)) return esc(v)
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(v)) return esc(`mailto:${v}`)
  return '#'
}

/** Resolves a picture: library pictures by id, and web pictures, which may have been embedded for download. */
function imgSrc(value: string | undefined, images: Record<string, string>): string | undefined {
  if (!value) return undefined
  if (value.startsWith('media:')) return images[value.slice(6)]
  if (/^(https?:|data:image\/)/i.test(value)) return images[value] ?? value
  return undefined
}

/** If a picture can't load, show the page's own artwork instead of a broken image. */
const IMG_FALLBACK = `onerror="this.parentNode.classList.add('no-img')"`

function paragraphs(text: string | undefined): string {
  return (text ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

function buttons(s: SiteSection, center = false): string {
  const parts: string[] = []
  if (s.cta?.label) parts.push(`<a class="btn btn-primary" href="${href(s.cta.href)}">${esc(s.cta.label)}<span aria-hidden="true">→</span></a>`)
  if (s.cta2?.label) parts.push(`<a class="btn btn-ghost" href="${href(s.cta2.href)}">${esc(s.cta2.label)}</a>`)
  return parts.length ? `<div class="actions${center ? ' center' : ''}">${parts.join('')}</div>` : ''
}

function header(s: SiteSection, center = false): string {
  return `<div class="section-head${center ? ' center' : ''}">${s.eyebrow ? `<span class="eyebrow">${esc(s.eyebrow)}</span>` : ''}${s.heading ? `<h2>${esc(s.heading)}</h2>` : ''}${
    s.subheading ? `<p class="lead">${esc(s.subheading)}</p>` : ''
  }</div>`
}

function items(list: SiteItem[] | undefined): SiteItem[] {
  return (list ?? []).filter((i) => i && (i.title || i.body || i.value || i.quote || i.label))
}

function renderSection(s: SiteSection, images: Record<string, string>, brand: string): string {
  const img = imgSrc(s.image, images)
  switch (s.type) {
    case 'hero':
      return `<header class="hero${img ? ' has-image' : ''}" id="top">
  <div class="orb orb-a"></div><div class="orb orb-b"></div>
  <div class="container hero-grid">
    <div class="hero-copy reveal">
      ${s.eyebrow ? `<span class="pill">${esc(s.eyebrow)}</span>` : ''}
      <h1>${esc(s.heading)}</h1>
      ${s.subheading ? `<p class="lead">${esc(s.subheading)}</p>` : ''}
      ${buttons(s)}
    </div>
    ${img ? `<div class="hero-media reveal"><img src="${esc(img)}" alt="" loading="eager" ${IMG_FALLBACK}></div>` : ''}
  </div>
</header>`
    case 'logos':
      return `<section class="logos"><div class="container">${s.heading ? `<p class="logos-title">${esc(s.heading)}</p>` : ''}<div class="logo-row">${items(s.items)
        .map((i) => `<span>${esc(i.title || i.label)}</span>`)
        .join('')}</div></div></section>`
    case 'features':
      return `<section class="features" id="${esc(s.id)}"><div class="container">${header(s, true)}<div class="grid grid-3">${items(s.items)
        .map(
          (i) => `<article class="card reveal">${i.icon ? `<div class="icon">${esc(i.icon)}</div>` : ''}<h3>${esc(i.title)}</h3>${i.body ? `<p>${esc(i.body)}</p>` : ''}</article>`,
        )
        .join('')}</div></div></section>`
    case 'stats':
      return `<section class="stats"><div class="container">${s.heading ? header(s, true) : ''}<div class="stat-row">${items(s.items)
        .map((i) => `<div class="stat reveal"><div class="stat-value">${esc(i.value)}</div><div class="stat-label">${esc(i.label || i.title)}</div></div>`)
        .join('')}</div></div></section>`
    case 'split':
      return `<section class="split" id="${esc(s.id)}"><div class="container split-grid${s.variant === 'reverse' ? ' reverse' : ''}">
  <div class="split-copy reveal">${s.eyebrow ? `<span class="eyebrow">${esc(s.eyebrow)}</span>` : ''}<h2>${esc(s.heading)}</h2>${paragraphs(s.body)}${
    items(s.items).length
      ? `<ul class="ticks">${items(s.items)
          .map((i) => `<li>${esc(i.title || i.body)}</li>`)
          .join('')}</ul>`
      : ''
  }${buttons(s)}</div>
  <div class="split-media reveal">${img ? `<img src="${esc(img)}" alt="" loading="lazy" ${IMG_FALLBACK}>` : ''}<div class="panel"><span>${esc(brand)}</span></div></div>
</div></section>`
    case 'testimonials':
      return `<section class="quotes"><div class="container">${header(s, true)}<div class="grid grid-3">${items(s.items)
        .map(
          (i) =>
            `<figure class="card quote reveal"><blockquote>“${esc(i.quote || i.body)}”</blockquote><figcaption><strong>${esc(i.name || i.title)}</strong>${
              i.role ? `<span>${esc(i.role)}</span>` : ''
            }</figcaption></figure>`,
        )
        .join('')}</div></div></section>`
    case 'timeline':
      return `<section class="timeline"><div class="container narrow">${header(s, true)}<ol class="steps">${items(s.items)
        .map((i, n) => `<li class="reveal"><span class="step-dot">${n + 1}</span><div><h3>${esc(i.title || i.label)}</h3>${i.body ? `<p>${esc(i.body)}</p>` : ''}</div></li>`)
        .join('')}</ol></div></section>`
    case 'faq':
      return `<section class="faq"><div class="container narrow">${header(s, true)}${items(s.items)
        .map((i) => `<details class="reveal"><summary>${esc(i.title)}</summary><p>${esc(i.body)}</p></details>`)
        .join('')}</div></section>`
    case 'cta':
      return `<section class="cta-band" id="${esc(s.id)}"><div class="container"><div class="cta-card reveal"><h2>${esc(s.heading)}</h2>${s.body ? `<p class="lead">${esc(s.body)}</p>` : ''}${buttons(s, true)}</div></div></section>`
    case 'contact':
      return `<section class="contact" id="contact"><div class="container narrow center">${header(s, true)}${paragraphs(s.body)}${buttons(s, true)}</div></section>`
    case 'footer':
      return `<footer class="footer"><div class="container footer-row"><strong>${esc(s.heading || brand)}</strong><span>${esc(s.body || '')}</span><span>© ${new Date().getFullYear()}</span></div></footer>`
    default:
      return ''
  }
}

function luminance(hex: string): number {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16)
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** How readable one colour is on another (WCAG contrast ratio, 1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** White or near-black, whichever reads better on the given colour. */
export function inkOn(hex: string): string {
  return contrastRatio('#ffffff', hex) >= contrastRatio('#0a0a0a', hex) ? '#ffffff' : '#0a0a0a'
}

function css(theme: SiteTheme): string {
  const f = SITE_FONTS[theme.font] ?? SITE_FONTS.grotesk
  const radius = theme.radius === 'sharp' ? '2px' : theme.radius === 'round' ? '26px' : '14px'
  const light = theme.mode === 'light'
  const ink = inkOn(theme.primary)
  return `
:root{--bg:${theme.background};--surface:${theme.surface};--text:${theme.text};--muted:${theme.muted};--primary:${theme.primary};--secondary:${theme.secondary};--radius:${radius};--heading:${f.heading};--body:${f.body};--line:${light ? 'rgba(0,0,0,.09)' : 'rgba(255,255,255,.1)'}}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font-family:var(--body);font-size:17px;line-height:1.65;-webkit-font-smoothing:antialiased}
img{max-width:100%;display:block}a{color:inherit}
.container{width:min(1160px,100% - 40px);margin-inline:auto}.narrow{width:min(760px,100% - 40px)}.center{text-align:center}
h1,h2,h3{font-family:var(--heading);line-height:1.05;letter-spacing:-.02em;margin:0 0 .5em;font-weight:${theme.font === 'serif' ? 400 : 750}}
h1{font-size:clamp(44px,7.4vw,104px)}h2{font-size:clamp(32px,4.6vw,60px)}h3{font-size:clamp(19px,1.6vw,22px);letter-spacing:-.01em;line-height:1.25}
p{margin:0 0 1em;color:var(--muted)}.lead{font-size:clamp(18px,1.6vw,21px);color:var(--muted);max-width:640px}
.center .lead,.section-head.center .lead{margin-inline:auto}
.eyebrow{display:inline-block;font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--primary);margin-bottom:14px}
.pill{display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border:1px solid var(--line);border-radius:999px;font-size:14px;margin-bottom:26px;background:color-mix(in srgb,var(--surface) 70%,transparent);backdrop-filter:blur(8px)}
.pill::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--primary);box-shadow:0 0 12px var(--primary)}
.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}.actions.center{justify-content:center}
.btn{display:inline-flex;align-items:center;gap:10px;padding:15px 26px;border-radius:var(--radius);font-weight:650;text-decoration:none;transition:transform .2s ease,box-shadow .2s ease,background .2s}
.btn:hover{transform:translateY(-2px)}
.btn-primary{background:var(--primary);color:${ink};box-shadow:0 12px 30px -10px var(--primary)}
.btn-ghost{border:1px solid var(--line);background:color-mix(in srgb,var(--surface) 60%,transparent)}
section{padding:clamp(72px,10vw,128px) 0;position:relative}
.section-head{margin-bottom:48px}.section-head.center{text-align:center}
.hero{position:relative;min-height:92vh;display:flex;align-items:center;padding:120px 0 90px;overflow:hidden}
.hero-grid{display:grid;gap:56px;align-items:center;position:relative;z-index:1}.hero.has-image .hero-grid{grid-template-columns:1.1fr .9fr}
.hero-media img{border-radius:calc(var(--radius) + 8px);aspect-ratio:4/5;object-fit:cover;width:100%;box-shadow:0 40px 80px -30px rgba(0,0,0,.55)}
.orb{position:absolute;border-radius:50%;filter:blur(90px);opacity:${light ? 0.35 : 0.55};pointer-events:none}
.orb-a{width:560px;height:560px;background:var(--primary);top:-180px;right:-120px;animation:drift 18s ease-in-out infinite}
.orb-b{width:460px;height:460px;background:var(--secondary);bottom:-200px;left:-140px;animation:drift 22s ease-in-out infinite reverse}
@keyframes drift{50%{transform:translate(40px,30px) scale(1.08)}}
.logos{padding:36px 0;border-block:1px solid var(--line)}.logos-title{text-align:center;font-size:14px;letter-spacing:.12em;text-transform:uppercase}
.logo-row{display:flex;flex-wrap:wrap;justify-content:center;gap:18px 48px;font-family:var(--heading);font-size:22px;opacity:.7}
.grid{display:grid;gap:22px}.grid-3{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.card{background:var(--surface);border:1px solid var(--line);border-radius:calc(var(--radius) + 4px);padding:32px;transition:transform .25s ease,border-color .25s}
.card:hover{transform:translateY(-4px);border-color:color-mix(in srgb,var(--primary) 45%,var(--line))}
.icon{width:52px;height:52px;display:grid;place-items:center;border-radius:var(--radius);background:color-mix(in srgb,var(--primary) 16%,transparent);font-size:26px;margin-bottom:22px}
.stats{background:var(--surface)}.stat-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:28px;text-align:center}
.stat-value{font-family:var(--heading);font-size:clamp(46px,6vw,76px);line-height:1;background:linear-gradient(120deg,var(--primary),var(--secondary));-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:800}
.stat-label{margin-top:10px;color:var(--muted)}
.split-grid{display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center}.split-grid.reverse .split-copy{order:2}
.split-media img,.panel{border-radius:calc(var(--radius) + 8px);width:100%;aspect-ratio:5/4;object-fit:cover}.split-media img+.panel,.no-img>img{display:none}.no-img>img+.panel{display:grid}
.hero.has-image .hero-grid:has(.no-img){grid-template-columns:1fr}.hero-media.no-img{display:none}
.panel{display:grid;place-items:center;background:linear-gradient(135deg,var(--primary),var(--secondary));font-family:var(--heading);font-size:34px;color:${ink}}
.ticks{list-style:none;padding:0;margin:0 0 10px}.ticks li{padding-left:30px;position:relative;margin:10px 0}.ticks li::before{content:"✓";position:absolute;left:0;color:var(--primary);font-weight:800}
.quote blockquote{margin:0 0 20px;font-size:18px;line-height:1.6}.quote figcaption{display:flex;flex-direction:column;font-size:15px}.quote figcaption span{color:var(--muted)}
.steps{list-style:none;padding:0;margin:0;position:relative}.steps::before{content:"";position:absolute;left:21px;top:8px;bottom:8px;width:2px;background:var(--line)}
.steps li{display:flex;gap:22px;margin-bottom:34px;position:relative}.step-dot{flex:none;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:var(--primary);color:${ink};font-weight:800}
details{border-bottom:1px solid var(--line);padding:22px 0}summary{cursor:pointer;font-family:var(--heading);font-size:21px;list-style:none;display:flex;justify-content:space-between;gap:20px}
summary::after{content:"+";color:var(--primary);font-size:28px;line-height:1}details[open] summary::after{content:"–"}details p{margin-top:14px}
.cta-card{text-align:center;padding:clamp(48px,8vw,96px) 28px;border-radius:calc(var(--radius) + 16px);background:radial-gradient(120% 140% at 50% 0%,color-mix(in srgb,var(--primary) 45%,transparent),transparent 60%),var(--surface);border:1px solid var(--line)}
.footer{padding:40px 0;border-top:1px solid var(--line);font-size:14px;color:var(--muted)}.footer-row{display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between;align-items:center}.footer strong{color:var(--text)}
.reveal{opacity:0;transform:translateY(22px);transition:opacity .8s ease,transform .8s cubic-bezier(.2,.8,.2,1)}.reveal.in{opacity:1;transform:none}
@media (max-width:860px){.hero.has-image .hero-grid,.split-grid{grid-template-columns:1fr}.split-grid.reverse .split-copy{order:0}.hero{min-height:auto;padding-top:96px}}
@media (prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none}.orb{animation:none}}
`
}

export interface RenderOptions {
  /** Editing inside the app: sections can be clicked and nothing animates in. */
  editor?: boolean
  /** A still picture of the page, for thumbnails: no scripts or entrance animations. */
  still?: boolean
  /** Friendly section names shown while editing. */
  labels?: Partial<Record<SiteSectionType, string>>
}

export interface SiteParts {
  title: string
  description: string
  fontHref: string
  css: string
  sections: { id: string; html: string }[]
}

const STILL_CSS = '.reveal{opacity:1!important;transform:none!important;transition:none!important}.orb{animation:none!important}'

function editorCss(theme: SiteTheme): string {
  const ink = inkOn(theme.primary)
  return `${STILL_CSS}
[data-sid]{position:relative;cursor:pointer}
[data-sid]::after{content:"";position:absolute;inset:0;z-index:60;pointer-events:none;border:2px solid transparent;transition:border-color .15s,background-color .15s}
[data-sid]:hover::after{border-color:color-mix(in srgb,var(--primary) 55%,transparent);background:color-mix(in srgb,var(--primary) 4%,transparent)}
[data-sid][data-selected]::after{border:3px solid var(--primary);background:none}
[data-sid]::before{content:attr(data-label);position:absolute;top:14px;left:14px;z-index:61;padding:7px 13px;border-radius:999px;background:var(--primary);color:${ink};font:600 13px/1 system-ui,sans-serif;opacity:0;transform:translateY(-4px);transition:opacity .15s,transform .15s;pointer-events:none}
[data-sid]:hover::before,[data-sid][data-selected]::before{opacity:1;transform:none}`
}

/** Receives live updates from the editor and reports which section was clicked. */
const EDITOR_SCRIPT = `<script>
(function(){
  var selected = null
  function mark(){ document.querySelectorAll('[data-sid]').forEach(function(el){ if (el.getAttribute('data-sid') === selected) el.setAttribute('data-selected', ''); else el.removeAttribute('data-selected') }) }
  window.addEventListener('message', function(e){
    var d = e.data
    if (!d || !d.__site) return
    if (d.css !== undefined) document.getElementById('site-css').textContent = d.css
    if (d.font !== undefined) document.getElementById('site-font').setAttribute('href', d.font)
    if (d.body !== undefined) document.body.innerHTML = d.body
    if (d.patch) d.patch.forEach(function(p){ var el = document.querySelector('[data-sid="' + p.id + '"]'); if (el) el.outerHTML = p.html })
    if (d.select !== undefined) {
      selected = d.select
      if (d.scroll && selected) { var el = document.querySelector('[data-sid="' + selected + '"]'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
    }
    mark()
  })
  document.addEventListener('click', function(e){
    var t = e.target
    if (!t || !t.closest) return
    var a = t.closest('a')
    if (a && (a.getAttribute('href') || '').charAt(0) !== '#') e.preventDefault()
    var s = t.closest('[data-sid]')
    if (s) parent.postMessage({ __site: 1, pick: s.getAttribute('data-sid') }, '*')
  }, true)
})()
</script>`

/** Stops links in a preview from leaving the page. */
const LINK_GUARD = `<script>document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a');if(a&&(a.getAttribute('href')||'').charAt(0)!=='#')e.preventDefault()},true)</script>`

const REVEAL_SCRIPT = `<script>
(function(){var els=document.querySelectorAll('.reveal');if(!('IntersectionObserver' in window)){els.forEach(function(e){e.classList.add('in')});return}
var io=new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:.12});
els.forEach(function(e){io.observe(e)});})();
</script>`

export function renderSiteParts(site: Site, images: Record<string, string> = {}, opts: RenderOptions = {}): SiteParts {
  const theme = site.theme
  const f = SITE_FONTS[theme.font] ?? SITE_FONTS.grotesk
  const hero = site.sections.find((s) => s.type === 'hero')
  return {
    title: hero?.heading ? `${site.name} · ${hero.heading}` : site.name,
    description: hero?.subheading ?? site.brief.purpose,
    fontHref: `https://fonts.googleapis.com/css2?family=${f.google}&display=swap`,
    css: css(theme) + (opts.editor ? editorCss(theme) : opts.still ? STILL_CSS : ''),
    sections: site.sections.map((s) => {
      const html = renderSection(s, images, site.name)
      return { id: s.id, html: opts.editor ? `<div data-sid="${esc(s.id)}" data-label="${esc(`✎  ${opts.labels?.[s.type] ?? s.type}`)}">${html}</div>` : html }
    }),
  }
}

function documentFrom(p: SiteParts, head = '', tail = ''): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link id="site-font" href="${esc(p.fontHref)}" rel="stylesheet">
<style id="site-css">${p.css}</style>${head}
</head>
<body>
${p.sections.map((s) => s.html).join('\n')}${tail}
</body>
</html>`
}

/** The finished page as a single, self-contained HTML document. */
export function renderSiteHTML(site: Site, images: Record<string, string> = {}, opts: Pick<RenderOptions, 'still'> = {}): string {
  if (site.mode === 'freeform' && site.html) return site.html
  return documentFrom(renderSiteParts(site, images, opts), '', opts.still ? '' : `\n${REVEAL_SCRIPT}`)
}

/** The page as shown in the editor, ready to receive live updates. Build the parts with `editor: true`. */
export function editorDocument(parts: SiteParts): string {
  return documentFrom(parts, `\n${EDITOR_SCRIPT}`)
}

/** A one-of-a-kind (freestyle) page, with links kept inside the preview. */
export function guardedDocument(html: string): string {
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${LINK_GUARD}</head>`) : `${LINK_GUARD}${html}`
}

/** Pulls a complete HTML document out of model output. */
export function extractHtml(text: string): string {
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i)
  const raw = (fenced ? fenced[1] : text).trim()
  const start = raw.search(/<!doctype html|<html/i)
  const html = start >= 0 ? raw.slice(start) : raw
  const end = html.toLowerCase().lastIndexOf('</html>')
  return end >= 0 ? html.slice(0, end + 7) : html
}
