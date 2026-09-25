import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Copy, MoreHorizontal, Palette, Plus, Presentation, Sparkles, Trash2, Upload, Wand2 } from 'lucide-react'
import { db } from '../../lib/db'
import { createDeck, generateDeck } from '../../lib/decks/generate'
import { DECK_THEMES, resolveDeckTheme } from '../../lib/decks/themes'
import type { BrandKit, Deck, DeckBrief, Slide } from '../../lib/types'
import { cn, errorMessage, readFileAsDataURL, timeAgo, uid } from '../../lib/utils'
import { useAgents, useDecks, useProjects } from '../../hooks/data'
import { AgentAvatar } from '../../components/agents/AgentAvatar'
import { PageHeader } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Menu } from '../../components/ui/bits'
import { Field, Input, Select, Slider, Textarea, Toggle } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { toast } from '../../components/ui/Toast'
import { SlideFrame, SlideView } from './SlideView'

const STARTERS: { label: string; topic: string; audience: string; goal: string }[] = [
  { label: 'New business pitch', topic: 'Our pitch to win a new client’s PR account', audience: 'the client’s marketing leadership', goal: 'Appoint us as their agency' },
  { label: 'Campaign proposal', topic: 'A campaign proposal for a product launch', audience: 'Client stakeholders', goal: 'Approve the campaign and budget' },
  { label: 'Results report', topic: 'Campaign results and what we learned', audience: 'the client team', goal: 'See the value and renew the retainer' },
  { label: 'Crisis briefing', topic: 'Our crisis response plan and holding lines', audience: 'the client’s leadership team', goal: 'Agree the response and spokespeople' },
  { label: 'Awards entry', topic: 'An awards entry presenting our best campaign', audience: 'Awards judges', goal: 'Shortlist and win' },
  { label: 'Thought leadership talk', topic: 'A conference talk on the future of PR and AI', audience: 'Industry peers', goal: 'Position us as leading thinkers' },
]

const TONES = ['Confident and clear', 'Warm and human', 'Bold and punchy', 'Formal and polished', 'Playful and energetic']

const SAMPLE: Slide = { id: 'sample', layout: 'title', title: 'The big idea', subtitle: 'A preview of this look' }

/* ------------------------------------------------------------------ */
/*  New deck                                                           */
/* ------------------------------------------------------------------ */

function ThemeTile({ id, brand, selected, onClick }: { id: string; brand?: BrandKit; selected: boolean; onClick: () => void }) {
  const theme = resolveDeckTheme(id, brand)
  return (
    <button
      onClick={onClick}
      className={cn(
        'group overflow-hidden rounded-2xl border text-left transition',
        selected ? 'border-transparent ring-2 ring-[var(--accent)]' : 'border-white/[0.08] hover:border-white/[0.2]',
      )}
    >
      <SlideFrame>
        <SlideView slide={SAMPLE} theme={theme} index={0} total={1} />
      </SlideFrame>
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[12.5px] font-medium">{theme.name}</span>
        <span className="flex gap-1">
          <span className="size-2.5 rounded-full" style={{ background: theme.accent }} />
          <span className="size-2.5 rounded-full" style={{ background: theme.accent2 }} />
        </span>
      </div>
    </button>
  )
}

export function NewDeckModal({ initial, projectId: initialProject, onClose }: { initial?: Partial<DeckBrief> & { title?: string }; projectId?: string; onClose: () => void }) {
  const navigate = useNavigate()
  const agents = useAgents()
  const projects = useProjects()
  const team = agents.filter((a) => a.status === 'active')
  const [topic, setTopic] = useState(initial?.topic ?? '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [audience, setAudience] = useState(initial?.audience ?? '')
  const [goal, setGoal] = useState(initial?.goal ?? '')
  const [keyMessages, setKeyMessages] = useState('')
  const [tone, setTone] = useState(TONES[0])
  const [slideCount, setSlideCount] = useState(10)
  const [useWeb, setUseWeb] = useState(true)
  const [sources, setSources] = useState('')
  const [showMore, setShowMore] = useState(false)
  const [themeId, setThemeId] = useState('midnight')
  const [brand, setBrand] = useState<BrandKit>({ primary: '#7c5cff', secondary: '#22d3ee', background: '#0b0c12', font: 'grotesk' })
  const [projectId, setProjectId] = useState(initialProject ?? '')
  const [agentId, setAgentId] = useState(team.find((a) => a.roleId === 'creative')?.id ?? team[0]?.id ?? '')
  const [creating, setCreating] = useState(false)

  const create = async () => {
    if (!topic.trim()) return
    setCreating(true)
    try {
      const name =
        title.trim() ||
        topic
          .trim()
          .split(/[.!?\n]/)[0]
          .slice(0, 70)
      const deck = await createDeck({
        title: name,
        themeId,
        agentId: agentId || undefined,
        projectId: projectId || undefined,
        brief: {
          topic: topic.trim(),
          audience: audience.trim(),
          goal: goal.trim(),
          keyMessages: keyMessages.trim(),
          tone,
          slideCount,
          useWeb,
          sources: sources.trim() || undefined,
        },
      })
      if (themeId === 'brand') await db.decks.update(deck.id, { brand })
      void generateDeck(deck.id).catch((err) => toast.error('The deck couldn’t be finished', errorMessage(err)))
      navigate(`/decks/${deck.id}`)
    } catch (err) {
      toast.error('Couldn’t start the deck', errorMessage(err))
      setCreating(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      icon={<Presentation />}
      title="New deck"
      subtitle="Tell your team what it’s for. They’ll research it, write it and design it."
      footer={
        <>
          <span className="mr-auto hidden items-center gap-2 text-[12.5px] text-muted sm:flex">
            {team.find((a) => a.id === agentId) && <AgentAvatar agent={team.find((a) => a.id === agentId)!} size="xs" />}
            {team.find((a) => a.id === agentId)?.name ?? 'Your team'} will make it
          </span>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Wand2 />} loading={creating} disabled={!topic.trim()} onClick={() => void create()}>
            Make my deck
          </Button>
        </>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-5">
          <Field label="What’s the deck about?">
            <Textarea
              autoFocus
              rows={3}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Our pitch to Lumen Skincare for their UK consumer PR, showing our creative ideas and plan"
              className="text-[15px]"
            />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {STARTERS.map((s) => (
              <button
                key={s.label}
                onClick={() => {
                  setTopic(s.topic)
                  setAudience(s.audience)
                  setGoal(s.goal)
                }}
                className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[12.5px] text-soft transition hover:border-white/[0.16] hover:text-fg"
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Who’s it for?">
              <Input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. Lumen’s marketing director" />
            </Field>
            <Field label="What should they do after?">
              <Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. Appoint us" />
            </Field>
          </div>
          <Field label={`About ${slideCount} slides`}>
            <Slider value={slideCount} onChange={setSlideCount} min={5} max={20} left="Short" right="In depth" />
          </Field>
          <Field label="Tone">
            <div className="flex flex-wrap gap-1.5">
              {TONES.map((t) => (
                <button
                  key={t}
                  onClick={() => setTone(t)}
                  className={cn(
                    'h-8 rounded-full border px-3 text-[12.5px] transition',
                    tone === t ? 'border-transparent bg-white text-ink-950' : 'border-white/[0.08] text-muted hover:text-fg',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
            <Toggle checked={useWeb} onChange={setUseWeb} label="Research the latest facts and figures" description="Uses live web research when your AI supports it." />
          </div>
          <button onClick={() => setShowMore((v) => !v)} className="text-[13px] text-muted underline-offset-4 hover:text-fg hover:underline">
            {showMore ? 'Fewer options' : 'Add key messages, your own notes or data…'}
          </button>
          {showMore && (
            <div className="space-y-4">
              <Field label="Key messages" hint="optional">
                <Textarea rows={2} value={keyMessages} onChange={(e) => setKeyMessages(e.target.value)} placeholder="The three things they must remember" />
              </Field>
              <Field label="Your notes, data or text to use" hint="optional">
                <Textarea rows={4} value={sources} onChange={(e) => setSources(e.target.value)} placeholder="Paste anything: meeting notes, results, a brief, figures…" />
              </Field>
              <Field label="Deck title" hint="optional">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="We’ll write one if you leave this blank" />
              </Field>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <Field label="Pick a look">
            <div className="grid grid-cols-2 gap-2.5">
              {DECK_THEMES.map((t) => (
                <ThemeTile key={t.id} id={t.id} selected={themeId === t.id} onClick={() => setThemeId(t.id)} />
              ))}
            </div>
          </Field>
          <div
            className={cn(
              'rounded-2xl border p-4 transition',
              themeId === 'brand' ? 'border-[color-mix(in_oklab,var(--accent)_55%,transparent)] bg-white/[0.04]' : 'border-white/[0.07]',
            )}
          >
            <button onClick={() => setThemeId('brand')} className="flex w-full items-center gap-3 text-left">
              <Palette className="size-4 text-[var(--accent)]" />
              <span className="flex-1 text-[13.5px] font-medium">Use brand colours</span>
              <span className="text-[12px] text-muted">{themeId === 'brand' ? 'Selected' : 'Choose'}</span>
            </button>
            {themeId === 'brand' && (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ['primary', 'Main'],
                      ['secondary', 'Second'],
                      ['background', 'Background'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 rounded-xl border border-white/[0.08] px-2.5 py-2 text-[12px] text-soft">
                      <input
                        type="color"
                        value={brand[key] ?? '#000000'}
                        onChange={(e) => setBrand({ ...brand, [key]: e.target.value })}
                        className="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={brand.font} onChange={(e) => setBrand({ ...brand, font: e.target.value as BrandKit['font'] })} className="h-9 w-auto text-[12.5px]">
                    <option value="grotesk">Modern headings</option>
                    <option value="serif">Elegant serif headings</option>
                    <option value="rounded">Friendly headings</option>
                    <option value="mono">Technical headings</option>
                  </Select>
                  <label className="flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-white/[0.08] px-3 text-[12.5px] text-soft hover:text-fg">
                    <Upload className="size-3.5" /> {brand.logo ? 'Change logo' : 'Add logo'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0]
                        if (f) setBrand({ ...brand, logo: await readFileAsDataURL(f) })
                      }}
                    />
                  </label>
                  {brand.logo && <img src={brand.logo} alt="" className="h-8 max-w-[90px] object-contain" />}
                </div>
                <ThemeTile id="brand" brand={brand} selected onClick={() => undefined} />
              </div>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Who makes it">
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

/* ------------------------------------------------------------------ */
/*  Library                                                            */
/* ------------------------------------------------------------------ */

function DeckCard({ deck }: { deck: Deck }) {
  const navigate = useNavigate()
  const theme = resolveDeckTheme(deck.themeId, deck.brand)
  const first = deck.slides[0]
  return (
    <div className="group relative overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.02] transition hover:-translate-y-1 hover:border-white/[0.15]">
      <button onClick={() => navigate(`/decks/${deck.id}`)} className="block w-full text-left">
        <div className="relative">
          <SlideFrame>
            {first ? (
              <SlideView slide={first} theme={theme} index={0} total={deck.slides.length} logo={deck.brand?.logo} />
            ) : (
              <div style={{ width: 1600, height: 900, background: theme.canvas }} />
            )}
          </SlideFrame>
          {deck.status === 'generating' && (
            <div className="absolute inset-0 grid place-items-center bg-black/55 backdrop-blur-[2px]">
              <div className="flex items-center gap-2 rounded-full bg-black/60 px-3.5 py-1.5 text-[12.5px] text-fg">
                <Sparkles className="size-3.5 animate-pulse text-[var(--accent)]" /> {deck.stage ?? 'Working on it…'}
              </div>
            </div>
          )}
        </div>
        <div className="px-4 py-3.5">
          <div className="truncate text-[14px] font-semibold">{deck.title}</div>
          <div className="mt-0.5 text-[12px] text-muted">
            {deck.slides.length} slides · {theme.name} · {timeAgo(deck.updatedAt)}
            {deck.status === 'error' && <span className="text-bad"> · needs attention</span>}
          </div>
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
                const copy = {
                  ...deck,
                  id: uid(),
                  title: `${deck.title} (copy)`,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                  demo: undefined,
                  slides: deck.slides.map((s) => ({ ...s, id: uid() })),
                }
                await db.decks.put(copy)
                toast.success('Deck duplicated')
              },
            },
            'divider',
            {
              label: 'Delete',
              icon: <Trash2 />,
              danger: true,
              onSelect: async () => {
                if (!window.confirm(`Delete “${deck.title}”?`)) return
                await db.decks.delete(deck.id)
              },
            },
          ]}
        />
      </div>
    </div>
  )
}

export default function DecksPage() {
  const decks = useDecks()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState<{ key: number; initial?: Partial<DeckBrief> } | null>(params.has('new') ? { key: Date.now() } : null)
  const [prompt, setPrompt] = useState('')
  const projectParam = params.get('project') ?? undefined
  const sorted = useMemo(() => [...decks].sort((a, b) => b.updatedAt - a.updatedAt), [decks])

  const close = () => {
    setCreating(null)
    if (params.has('new'))
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('new')
          next.delete('project')
          return next
        },
        { replace: true },
      )
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Studios"
        title="Deck Studio"
        subtitle="Describe the deck you need. Your team researches it, writes it and designs it, ready to present or send as PowerPoint."
        actions={
          <Button variant="primary" icon={<Plus />} onClick={() => setCreating({ key: Date.now() })}>
            New deck
          </Button>
        }
      />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (prompt.trim()) setCreating({ key: Date.now(), initial: { topic: prompt.trim() } })
        }}
        className="glass relative overflow-hidden rounded-[28px] p-2"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_140%_at_0%_0%,color-mix(in_oklab,var(--accent)_16%,transparent),transparent_60%)]" />
        <div className="relative flex items-center gap-3 rounded-[22px] bg-black/20 py-2 pr-2 pl-5">
          <Presentation className="size-5 shrink-0 text-[var(--accent)]" />
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What’s the deck for? e.g. A results report for Northwind’s autumn launch"
            className="h-12 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint"
          />
          <Button type="submit" variant="primary" size="lg" icon={<Wand2 />} disabled={!prompt.trim()}>
            Start
          </Button>
        </div>
      </form>
      {sorted.length ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((d) => (
            <DeckCard key={d.id} deck={d} />
          ))}
        </div>
      ) : (
        <div className="rounded-[28px] border border-dashed border-white/[0.1] p-12 text-center">
          <Presentation className="mx-auto size-8 text-faint" />
          <p className="mt-3 font-medium">No decks yet</p>
          <p className="mt-1 text-sm text-muted">Describe one above and it’ll be ready in a few minutes.</p>
        </div>
      )}
      {creating && <NewDeckModal key={creating.key} initial={creating.initial} projectId={projectParam} onClose={close} />}
    </div>
  )
}
