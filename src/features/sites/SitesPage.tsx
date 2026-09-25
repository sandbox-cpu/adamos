import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Copy, Layers, MoreHorizontal, PanelsTopLeft, Plus, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { db } from '../../lib/db'
import { createSite, generateSite, pageNameFrom } from '../../lib/sites/generate'
import { renderSiteHTML } from '../../lib/sites/render'
import { SITE_PRESETS } from '../../lib/sites/themes'
import { imageRefs, pageImages } from '../../lib/sites/images'
import type { Site } from '../../lib/types'
import { cn, errorMessage, timeAgo, uid } from '../../lib/utils'
import { useAgents, useProjects, useSites } from '../../hooks/data'
import { AgentAvatar } from '../../components/agents/AgentAvatar'
import { PageHeader } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Menu } from '../../components/ui/bits'
import { Field, Input, Select, Textarea, Toggle } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { toast } from '../../components/ui/Toast'

const STYLES = ['Premium and minimal', 'Bold and loud', 'Warm and friendly', 'Elegant and editorial', 'Techy and modern']

const STARTERS: { label: string; purpose: string; cta: string }[] = [
  { label: 'Product launch', purpose: 'A launch page for a new product, building excitement and capturing pre-orders', cta: 'Pre-order now' },
  { label: 'Event sign-up', purpose: 'An event page with the agenda, speakers and a sign-up form', cta: 'Save my place' },
  { label: 'Campaign microsite', purpose: 'A campaign microsite telling the story behind a cause and asking people to take part', cta: 'Join in' },
  { label: 'Newsroom', purpose: 'A press page with the latest news, assets and media contacts', cta: 'Contact the press office' },
  { label: 'Agency showcase', purpose: 'A page presenting our agency, our best work and how to work with us', cta: 'Start a conversation' },
]

/** A live, scaled-down render of a page for cards and previews. */
export function SiteThumb({ site, className }: { site: Site; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.25)
  const [images, setImages] = useState<Record<string, string>>({})
  const refs = imageRefs(site).join('|')
  useEffect(() => {
    let alive = true
    void pageImages(refs.split('|')).then((m) => alive && setImages(m))
    return () => {
      alive = false
    }
  }, [refs])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setScale(el.clientWidth / 1280))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const html = useMemo(() => (site.sections.length || site.html ? renderSiteHTML(site, images, { still: true }) : ''), [site, images])
  return (
    <div ref={ref} className={cn('relative aspect-[16/10] overflow-hidden', className)} style={{ background: site.theme.background }}>
      {html && (
        <iframe
          title={site.name}
          srcDoc={html}
          sandbox="allow-scripts"
          loading="lazy"
          tabIndex={-1}
          className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
          style={{ width: 1280, height: 800, transform: `scale(${scale})` }}
        />
      )}
    </div>
  )
}

function NewSiteModal({ initialPurpose, onClose }: { initialPurpose?: string; onClose: () => void }) {
  const navigate = useNavigate()
  const agents = useAgents()
  const projects = useProjects()
  const team = agents.filter((a) => a.status === 'active')
  const [purpose, setPurpose] = useState(initialPurpose ?? '')
  const [name, setName] = useState('')
  const [audience, setAudience] = useState('')
  const [keyMessages, setKeyMessages] = useState('')
  const [cta, setCta] = useState('')
  const [ctaLink, setCtaLink] = useState('')
  const [style, setStyle] = useState(STYLES[0])
  const [presetId, setPresetId] = useState('midnight')
  const [freeform, setFreeform] = useState(false)
  const [useWeb, setUseWeb] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [agentId, setAgentId] = useState(team.find((a) => a.roleId === 'technical')?.id ?? team.find((a) => a.roleId === 'creative')?.id ?? team[0]?.id ?? '')
  const [creating, setCreating] = useState(false)

  const create = async () => {
    if (!purpose.trim()) return
    setCreating(true)
    try {
      const site = await createSite({
        name: name.trim() || pageNameFrom(purpose),
        presetId,
        mode: freeform ? 'freeform' : 'sections',
        agentId: agentId || undefined,
        projectId: projectId || undefined,
        brief: {
          purpose: purpose.trim(),
          audience: audience.trim(),
          keyMessages: keyMessages.trim(),
          cta: cta.trim(),
          ctaLink: ctaLink.trim(),
          style,
          useWeb,
          autoName: !name.trim(),
        },
      })
      void generateSite(site.id).catch((err) => toast.error('The page couldn’t be finished', errorMessage(err)))
      navigate(`/sites/${site.id}`)
    } catch (err) {
      toast.error('Couldn’t start the page', errorMessage(err))
      setCreating(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      icon={<PanelsTopLeft />}
      title="New landing page"
      subtitle="Describe the page and your team will design and write it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Wand2 />} loading={creating} disabled={!purpose.trim()} onClick={() => void create()}>
            Make my page
          </Button>
        </>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-5">
          <Field label="What’s the page for?">
            <Textarea
              autoFocus
              rows={3}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. A launch page for Northwind’s Autumn Blend with the pop-up dates and a pre-order button"
              className="text-[15px]"
            />
          </Field>
          {!purpose.trim() && (
            <div className="flex flex-wrap gap-1.5">
              {STARTERS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => {
                    setPurpose(s.purpose)
                    setCta(s.cta)
                  }}
                  className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[12.5px] text-soft transition hover:border-white/[0.16] hover:text-fg"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Who’s it for?">
              <Input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. Coffee lovers in London" />
            </Field>
            <Field label="Page name" hint="optional">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="We’ll name it if blank" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Main button says">
              <Input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="e.g. Pre-order now" />
            </Field>
            <Field label="Button goes to" hint="optional">
              <Input value={ctaLink} onChange={(e) => setCtaLink(e.target.value)} placeholder="https://… or an email address" />
            </Field>
          </div>
          <Field label="Key messages, facts and dates" hint="optional">
            <Textarea
              rows={3}
              value={keyMessages}
              onChange={(e) => setKeyMessages(e.target.value)}
              placeholder="Anything that must be on the page: dates, prices, locations, quotes you’re allowed to use…"
            />
          </Field>
          <Field label="Feel">
            <div className="flex flex-wrap gap-1.5">
              {STYLES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStyle(s)}
                  className={cn(
                    'h-8 rounded-full border px-3 text-[12.5px] transition',
                    style === s ? 'border-transparent bg-white text-ink-950' : 'border-white/[0.08] text-muted hover:text-fg',
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <div className="space-y-5">
          <Field label="Colours and type">
            <div className="grid grid-cols-2 gap-2">
              {SITE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPresetId(p.id)}
                  className={cn(
                    'overflow-hidden rounded-2xl border text-left transition',
                    presetId === p.id ? 'border-transparent ring-2 ring-[var(--accent)]' : 'border-white/[0.08] hover:border-white/[0.2]',
                  )}
                >
                  <div className="relative h-20 p-3" style={{ background: p.theme.background }}>
                    <div className="text-[15px] leading-tight font-bold" style={{ color: p.theme.text, fontFamily: p.theme.font === 'serif' ? 'Georgia, serif' : undefined }}>
                      Aa
                    </div>
                    <div className="mt-2 h-1.5 w-12 rounded-full" style={{ background: p.theme.primary }} />
                    <div
                      className="absolute right-3 bottom-3 h-5 w-14"
                      style={{ background: p.theme.primary, borderRadius: p.theme.radius === 'sharp' ? 0 : p.theme.radius === 'soft' ? 6 : 999 }}
                    />
                  </div>
                  <div className="px-3 py-2 text-[12px] font-medium">{p.name}</div>
                </button>
              ))}
            </div>
          </Field>
          <div className="grid gap-2">
            {[
              { value: false, title: 'Easy to edit', body: 'Built from sections you can change yourself or by asking.', icon: <Layers className="size-4" /> },
              { value: true, title: 'Designer freestyle', body: 'A one-of-a-kind design. Change it by asking.', icon: <Sparkles className="size-4" /> },
            ].map((o) => (
              <button
                key={String(o.value)}
                onClick={() => setFreeform(o.value)}
                className={cn(
                  'flex items-start gap-3 rounded-2xl border p-3.5 text-left transition',
                  freeform === o.value ? 'border-[color-mix(in_oklab,var(--accent)_60%,transparent)] bg-white/[0.05]' : 'border-white/[0.07] hover:border-white/[0.15]',
                )}
              >
                <span className="mt-0.5 text-[var(--accent)]">{o.icon}</span>
                <span>
                  <span className="block text-[13.5px] font-semibold">{o.title}</span>
                  <span className="block text-[12.5px] text-muted">{o.body}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
            <Toggle checked={useWeb} onChange={setUseWeb} label="Research the topic first" description="Finds current facts to use, when your AI supports it." />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Who builds it">
              <Select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                {team.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            {projects.length > 0 && (
              <Field label="Project">
                <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">None</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

function SiteCard({ site }: { site: Site }) {
  const navigate = useNavigate()
  const agents = useAgents()
  const agent = agents.find((a) => a.id === site.agentId)
  return (
    <div className="group relative overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.02] transition hover:-translate-y-1 hover:border-white/[0.15]">
      <button onClick={() => navigate(`/sites/${site.id}`)} className="block w-full text-left">
        <div className="relative">
          <SiteThumb site={site} />
          {site.status === 'generating' && (
            <div className="absolute inset-0 grid place-items-center bg-black/55 backdrop-blur-[2px]">
              <div className="flex items-center gap-2 rounded-full bg-black/60 px-3.5 py-1.5 text-[12.5px] text-fg">
                <Sparkles className="size-3.5 animate-pulse text-[var(--accent)]" /> {site.stage ?? 'Working on it…'}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold">{site.name}</div>
            <div className="mt-0.5 text-[12px] text-muted">
              {site.mode === 'freeform' ? 'Freestyle design' : `${site.sections.length} sections`} · {timeAgo(site.updatedAt)}
            </div>
          </div>
          {agent && <AgentAvatar agent={agent} size="xs" />}
        </div>
      </button>
      <div className="absolute top-3 right-3 opacity-0 transition group-hover:opacity-100">
        <Menu
          trigger={(open) => (
            <button onClick={open} className="grid size-8 place-items-center rounded-lg bg-black/60 text-soft backdrop-blur hover:text-fg" aria-label="More">
              <MoreHorizontal className="size-4" />
            </button>
          )}
          items={[
            {
              label: 'Duplicate',
              icon: <Copy />,
              onSelect: async () => {
                await db.sites.put({
                  ...site,
                  id: uid(),
                  name: `${site.name} (copy)`,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                  demo: undefined,
                  sections: site.sections.map((s) => ({ ...s, id: uid() })),
                })
                toast.success('Page duplicated')
              },
            },
            'divider',
            {
              label: 'Delete',
              icon: <Trash2 />,
              danger: true,
              onSelect: async () => {
                if (window.confirm(`Delete “${site.name}”?`)) await db.sites.delete(site.id)
              },
            },
          ]}
        />
      </div>
    </div>
  )
}

export default function SitesPage() {
  const sites = useSites()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState<{ key: number; purpose?: string } | null>(params.has('new') ? { key: Date.now() } : null)
  const [prompt, setPrompt] = useState('')
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Studios"
        title="Landing Pages"
        subtitle="Launch pages, event sign-ups and campaign microsites, designed and written for you, ready to put online."
        actions={
          <Button variant="primary" icon={<Plus />} onClick={() => setCreating({ key: Date.now() })}>
            New page
          </Button>
        }
      />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (prompt.trim()) setCreating({ key: Date.now(), purpose: prompt.trim() })
        }}
        className="glass relative overflow-hidden rounded-[28px] p-2"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_140%_at_0%_0%,color-mix(in_oklab,var(--accent)_16%,transparent),transparent_60%)]" />
        <div className="relative flex items-center gap-3 rounded-[22px] bg-black/20 py-2 pr-2 pl-5">
          <PanelsTopLeft className="size-5 shrink-0 text-[var(--accent)]" />
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What’s the page for? e.g. A sign-up page for our summer client party"
            className="h-12 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint"
          />
          <Button type="submit" variant="primary" size="lg" icon={<Wand2 />} disabled={!prompt.trim()}>
            Start
          </Button>
        </div>
      </form>
      {sites.length ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {sites.map((s) => (
            <SiteCard key={s.id} site={s} />
          ))}
        </div>
      ) : (
        <div className="rounded-[28px] border border-dashed border-white/[0.1] p-12 text-center">
          <PanelsTopLeft className="mx-auto size-8 text-faint" />
          <p className="mt-3 font-medium">No pages yet</p>
          <p className="mt-1 text-sm text-muted">Describe one above and it’ll be ready in a couple of minutes.</p>
        </div>
      )}
      {creating && (
        <NewSiteModal
          key={creating.key}
          initialPurpose={creating.purpose}
          onClose={() => {
            setCreating(null)
            if (params.has('new')) setParams({}, { replace: true })
          }}
        />
      )}
    </div>
  )
}
