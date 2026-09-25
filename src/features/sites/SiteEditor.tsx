import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Globe,
  GripVertical,
  ImageOff,
  Images,
  Layers,
  Monitor,
  MoreHorizontal,
  Palette,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Tablet,
  Trash2,
  TriangleAlert,
  Undo2,
  Upload,
  Wand2,
  X,
} from 'lucide-react'
import { db } from '../../lib/db'
import { SECTION_TYPES, generateSite, reviseSite } from '../../lib/sites/generate'
import { contrastRatio, editorDocument, guardedDocument, renderSiteHTML, renderSiteParts } from '../../lib/sites/render'
import { SITE_FONTS, SITE_PRESETS, presetById } from '../../lib/sites/themes'
import { downloadImages, imageRefs, pageImages } from '../../lib/sites/images'
import { generateAndSaveImage, uploadImage } from '../../lib/media/generate'
import type { Agent, Site, SiteItem, SiteSection, SiteSectionType, SiteTheme } from '../../lib/types'
import { cn, downloadText, errorMessage, safeFileName, slugify, timeAgo, uid } from '../../lib/utils'
import { useDraftField } from '../../hooks/useDraftField'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useAgents } from '../../hooks/data'
import { AgentAvatar } from '../../components/agents/AgentAvatar'
import { Button } from '../../components/ui/Button'
import { Menu, Tabs } from '../../components/ui/bits'
import { Input, Textarea } from '../../components/ui/Field'
import { Drawer, Modal } from '../../components/ui/Modal'
import { toast } from '../../components/ui/Toast'
import { MediaPicker } from '../media/MediaPicker'

const LABELS = Object.fromEntries(SECTION_TYPES.map((t) => [t.id, t.name])) as Record<SiteSectionType, string>
const typeInfo = (t: SiteSectionType) => SECTION_TYPES.find((x) => x.id === t) ?? SECTION_TYPES[0]

const PAGE_IDEAS = [
  'Make the headline punchier',
  'Add a questions and answers section',
  'Make it feel more premium',
  'Shorten all the text',
  'Add a “how it works” section',
  'Make the main button stand out',
]

type Device = 'desktop' | 'tablet' | 'phone'
const DEVICES: { id: Device; label: string; icon: typeof Monitor; width: number }[] = [
  { id: 'desktop', label: 'Computer', icon: Monitor, width: 1280 },
  { id: 'tablet', label: 'Tablet', icon: Tablet, width: 820 },
  { id: 'phone', label: 'Phone', icon: Smartphone, width: 390 },
]
const PHONE_HEIGHT = 844

type Draft = { sections: SiteSection[]; theme: SiteTheme }
type Selection = { id?: string; scroll: boolean }
type PanelTab = 'ask' | 'edit' | 'style'

function agentFor(site: Site, agents: Agent[]): Agent | undefined {
  return agents.find((a) => a.id === site.agentId) ?? agents.find((a) => a.roleId === 'copywriter') ?? agents.find((a) => a.roleId === 'creative')
}

/** Ready-to-edit content for a newly added section. */
function starterSection(type: SiteSectionType, site: Site): SiteSection {
  const base = { id: uid(), type }
  const cta = { label: site.brief.cta || 'Get started', href: site.brief.ctaLink || '' }
  switch (type) {
    case 'hero':
      return { ...base, eyebrow: 'Introducing', heading: 'A big, bold headline', subheading: 'One or two lines on why it matters.', cta }
    case 'logos':
      return { ...base, heading: 'As featured in', items: [{ title: 'Name one' }, { title: 'Name two' }, { title: 'Name three' }] }
    case 'features':
      return {
        ...base,
        eyebrow: 'Why it matters',
        heading: 'Three reasons to care',
        items: [
          { icon: '✨', title: 'First reason', body: 'A short sentence on why this matters.' },
          { icon: '⚡', title: 'Second reason', body: 'A short sentence on why this matters.' },
          { icon: '🤝', title: 'Third reason', body: 'A short sentence on why this matters.' },
        ],
      }
    case 'stats':
      return { ...base, heading: 'By the numbers', items: [1, 2, 3].map(() => ({ value: '[X]', label: 'What this number shows' })) }
    case 'split':
      return { ...base, eyebrow: 'The story', heading: 'Tell the story', body: 'Two short paragraphs: the problem, the idea and the difference it makes.' }
    case 'testimonials':
      return { ...base, heading: 'What people say', items: [{ quote: 'Add a real quote you have permission to use.', name: 'Their name', role: 'Their role' }] }
    case 'timeline':
      return {
        ...base,
        heading: 'How it works',
        items: [
          { title: 'Step one', body: 'What happens first.' },
          { title: 'Step two', body: 'What happens next.' },
          { title: 'Step three', body: 'The result.' },
        ],
      }
    case 'faq':
      return { ...base, heading: 'Questions, answered', items: [{ title: 'A common question?', body: 'A short, helpful answer.' }] }
    case 'cta':
      return { ...base, heading: 'Ready when you are', body: 'It only takes a minute to get started.', cta }
    case 'contact':
      return { ...base, heading: 'Get in touch', body: 'Tell people the best way to reach you.', cta: { label: 'Email us', href: '' } }
    case 'footer':
      return { ...base, heading: site.name, body: 'Made with care.' }
  }
}

interface ItemSpec {
  title: string
  add: string
  max: number
  blank: SiteItem
  fields: { key: keyof SiteItem; label: string; long?: boolean; narrow?: boolean }[]
}

const ITEM_SPECS: Partial<Record<SiteSectionType, ItemSpec>> = {
  features: {
    title: 'Features',
    add: 'Add a feature',
    max: 6,
    blank: { icon: '✨', title: 'New feature', body: '' },
    fields: [
      { key: 'icon', label: 'Emoji', narrow: true },
      { key: 'title', label: 'Title' },
      { key: 'body', label: 'Description', long: true },
    ],
  },
  stats: {
    title: 'Numbers',
    add: 'Add a number',
    max: 4,
    blank: { value: '[X]', label: '' },
    fields: [
      { key: 'value', label: 'Number', narrow: true },
      { key: 'label', label: 'What it shows' },
    ],
  },
  testimonials: {
    title: 'Quotes',
    add: 'Add a quote',
    max: 6,
    blank: { quote: '', name: '', role: '' },
    fields: [
      { key: 'quote', label: 'Quote', long: true },
      { key: 'name', label: 'Name' },
      { key: 'role', label: 'Role' },
    ],
  },
  timeline: {
    title: 'Steps',
    add: 'Add a step',
    max: 8,
    blank: { title: 'New step', body: '' },
    fields: [
      { key: 'title', label: 'Step' },
      { key: 'body', label: 'Details', long: true },
    ],
  },
  faq: {
    title: 'Questions',
    add: 'Add a question',
    max: 8,
    blank: { title: 'A new question?', body: '' },
    fields: [
      { key: 'title', label: 'Question' },
      { key: 'body', label: 'Answer', long: true },
    ],
  },
  logos: { title: 'Names', add: 'Add a name', max: 8, blank: { title: 'New name' }, fields: [{ key: 'title', label: 'Name' }] },
  split: { title: 'Tick list', add: 'Add a point', max: 6, blank: { title: '' }, fields: [{ key: 'title', label: 'Point' }] },
}

/* ------------------------------------------------------------------ */
/*  Small pieces                                                       */
/* ------------------------------------------------------------------ */

function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <span className="text-[11px] font-semibold tracking-[0.12em] text-faint uppercase">{children}</span>
      {hint && <span className="text-[11px] text-faint">{hint}</span>}
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  long,
  rows = 1,
  hint,
  strong,
}: {
  label: string
  value?: string
  onChange: (v: string) => void
  placeholder?: string
  long?: boolean
  rows?: number
  hint?: string
  strong?: boolean
}) {
  return (
    <div>
      <Label hint={hint}>{label}</Label>
      {long ? (
        <Textarea
          rows={rows}
          autoGrow
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn('text-[13px]', strong && 'text-[14px] font-medium')}
        />
      ) : (
        <Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cn('h-9 text-[13px]', strong && 'font-medium')} />
      )}
    </div>
  )
}

function ButtonFields({ label, value, onChange }: { label: string; value?: { label: string; href: string }; onChange: (v?: { label: string; href: string }) => void }) {
  const set = (patch: Partial<{ label: string; href: string }>) => {
    const next = { label: value?.label ?? '', href: value?.href ?? '', ...patch }
    onChange(next.label || next.href ? next : undefined)
  }
  return (
    <div className="space-y-1.5 rounded-xl border border-white/[0.06] bg-black/10 p-2.5">
      <Label hint="leave blank to hide">{label}</Label>
      <Input value={value?.label ?? ''} onChange={(e) => set({ label: e.target.value })} placeholder="What the button says" className="h-9 text-[13px]" />
      <Input value={value?.href ?? ''} onChange={(e) => set({ href: e.target.value })} placeholder="Where it goes: a web address or an email" className="h-9 text-[13px]" />
    </div>
  )
}

function ItemsEditor({ spec, items, onChange }: { spec: ItemSpec; items: SiteItem[]; onChange: (items: SiteItem[]) => void }) {
  const setItem = (i: number, patch: Partial<SiteItem>) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  return (
    <div>
      <Label>{spec.title}</Label>
      <div className="space-y-2">
        {items.map((item, i) => {
          const rows: ReactNode[] = []
          for (let f = 0; f < spec.fields.length; f++) {
            const field = spec.fields[f]
            const input = (key: keyof SiteItem, label: string, long?: boolean, className?: string) =>
              long ? (
                <Textarea
                  key={key}
                  rows={2}
                  autoGrow
                  value={item[key] ?? ''}
                  onChange={(e) => setItem(i, { [key]: e.target.value })}
                  placeholder={label}
                  aria-label={label}
                  className="text-[12.5px]"
                />
              ) : (
                <Input
                  key={key}
                  value={item[key] ?? ''}
                  onChange={(e) => setItem(i, { [key]: e.target.value })}
                  placeholder={label}
                  aria-label={label}
                  className={cn('h-8 text-[12.5px]', className)}
                />
              )
            if (field.narrow && spec.fields[f + 1]) {
              const next = spec.fields[f + 1]
              rows.push(
                <div key={field.key} className="flex gap-1.5">
                  <div className="w-[76px] shrink-0">{input(field.key, field.label, false, 'text-center')}</div>
                  <div className="min-w-0 flex-1">{input(next.key, next.label, next.long)}</div>
                </div>,
              )
              f++
            } else rows.push(input(field.key, field.label, field.long))
          }
          return (
            <div key={i} className="group relative space-y-1.5 rounded-xl border border-white/[0.06] bg-black/10 p-2 pr-9">
              {rows}
              <button
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-lg text-faint hover:bg-white/[0.06] hover:text-fg"
                aria-label="Remove"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )
        })}
      </div>
      {items.length < spec.max && (
        <button
          onClick={() => onChange([...items, { ...spec.blank }])}
          className="mt-1.5 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] text-muted hover:bg-white/[0.04] hover:text-fg"
        >
          <Plus className="size-3.5" /> {spec.add}
        </button>
      )}
    </div>
  )
}

function ImageField({ section, images, projectId, onChange }: { section: SiteSection; images: Record<string, string>; projectId?: string; onChange: (s: SiteSection) => void }) {
  const [idea, setIdea] = useState(section.imagePrompt ?? '')
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const src = section.image?.startsWith('media:') ? images[section.image.slice(6)] : section.image
  const hero = section.type === 'hero'
  const coming = !!section.imagePrompt && !section.image

  const create = async () => {
    setBusy(true)
    try {
      const prompt = idea.trim() || `${section.heading ?? 'A striking scene'}, aspirational and on-brand`
      const media = await generateAndSaveImage({ prompt, styleId: 'editorial', aspectId: hero ? 'portrait' : 'landscape', projectId })
      onChange({ ...section, image: `media:${media.id}` })
      setIdea('')
    } catch (err) {
      toast.error('Couldn’t create the picture', errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <Label>Picture</Label>
      <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-black/20">
        {coming ? (
          <div className={cn('grid place-items-center text-center text-[12px] text-soft', hero ? 'aspect-[4/3]' : 'aspect-[16/10]', 'animate-pulse bg-white/[0.03]')}>
            <div>
              <Sparkles className="mx-auto mb-1.5 size-5 text-[var(--accent)]" />A picture is being made for this section…
            </div>
          </div>
        ) : src && failed !== src ? (
          <img src={src} alt="" onError={() => setFailed(src)} className={cn('w-full object-cover', hero ? 'aspect-[4/3]' : 'aspect-[16/10]')} />
        ) : (
          <div className={cn('grid place-items-center gap-1 text-center text-[12px] text-faint', hero ? 'aspect-[4/3]' : 'aspect-[16/10]')}>
            <div>
              <ImageOff className="mx-auto mb-1.5 size-5" />
              {src ? 'This picture can’t be shown right now' : 'No picture yet'}
            </div>
          </div>
        )}
      </div>
      <Textarea
        rows={2}
        autoGrow
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        placeholder="Describe a picture, e.g. friends sharing coffee in a sunny café"
        className="mt-2 text-[12.5px]"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button size="sm" variant="secondary" icon={<Wand2 />} loading={busy} onClick={() => void create()}>
          {src ? 'New picture' : 'Create picture'}
        </Button>
        <label className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 text-[13px] text-soft transition hover:border-white/[0.16] hover:text-fg">
          <Upload className="size-3.5" /> Upload
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              try {
                const media = await uploadImage(f, projectId)
                onChange({ ...section, image: `media:${media.id}` })
              } catch (err) {
                toast.error('Couldn’t add that picture', errorMessage(err))
              }
            }}
          />
        </label>
        <Button size="sm" variant="ghost" icon={<Images />} onClick={() => setPicking(true)}>
          Library
        </Button>
        {section.image && (
          <Button size="sm" variant="ghost" icon={<X />} onClick={() => onChange({ ...section, image: undefined })}>
            Remove
          </Button>
        )}
      </div>
      <MediaPicker open={picking} onClose={() => setPicking(false)} projectId={projectId} onPick={(m) => onChange({ ...section, image: `media:${m.id}` })} />
    </div>
  )
}

function SectionFields({
  section: s,
  images,
  projectId,
  onChange,
}: {
  section: SiteSection
  images: Record<string, string>
  projectId?: string
  onChange: (s: SiteSection) => void
}) {
  const set = (patch: Partial<SiteSection>) => onChange({ ...s, ...patch })
  const is = (...types: SiteSectionType[]) => types.includes(s.type)
  const spec = ITEM_SPECS[s.type]
  return (
    <div className="space-y-4">
      {is('hero', 'features', 'stats', 'split', 'testimonials', 'timeline', 'faq', 'contact') && (
        <TextField label="Small label above" value={s.eyebrow} onChange={(v) => set({ eyebrow: v || undefined })} placeholder="e.g. New this autumn" />
      )}
      <TextField label={s.type === 'footer' ? 'Name' : s.type === 'logos' ? 'Title' : 'Headline'} value={s.heading} onChange={(v) => set({ heading: v })} long strong />
      {is('hero', 'features', 'stats', 'testimonials', 'timeline', 'faq', 'contact') && (
        <TextField label="Supporting line" value={s.subheading} onChange={(v) => set({ subheading: v || undefined })} long />
      )}
      {is('split', 'cta', 'contact', 'footer') && (
        <TextField
          label="Text"
          value={s.body}
          onChange={(v) => set({ body: v || undefined })}
          long
          rows={s.type === 'split' ? 4 : 2}
          hint={s.type === 'split' ? 'blank line = new paragraph' : undefined}
        />
      )}
      {is('hero', 'split') && <ImageField section={s} images={images} projectId={projectId} onChange={onChange} />}
      {s.type === 'split' && (
        <div>
          <Label>Picture side</Label>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { v: undefined, label: 'Right' },
              { v: 'reverse', label: 'Left' },
            ].map((o) => (
              <button
                key={o.label}
                onClick={() => set({ variant: o.v })}
                className={cn(
                  'h-8 rounded-lg border text-[12.5px] transition',
                  s.variant === o.v ? 'border-transparent bg-white text-ink-950' : 'border-white/[0.08] text-muted hover:text-fg',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {spec && <ItemsEditor spec={spec} items={s.items ?? []} onChange={(items) => set({ items })} />}
      {is('hero', 'split', 'cta', 'contact') && <ButtonFields label="Main button" value={s.cta} onChange={(cta) => set({ cta })} />}
      {is('hero', 'cta') && <ButtonFields label="Second button" value={s.cta2} onChange={(cta2) => set({ cta2 })} />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Sections list                                                      */
/* ------------------------------------------------------------------ */

function SectionRow({
  section,
  open,
  first,
  last,
  images,
  projectId,
  onToggle,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
}: {
  section: SiteSection
  open: boolean
  first: boolean
  last: boolean
  images: Record<string, string>
  projectId?: string
  onToggle: () => void
  onChange: (s: SiteSection) => void
  onMove: (dir: -1 | 1) => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id })
  const rowRef = useRef<HTMLDivElement | null>(null)
  const info = typeInfo(section.type)
  useEffect(() => {
    if (open) rowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [open])
  return (
    <div
      ref={(el) => {
        setNodeRef(el)
        rowRef.current = el
      }}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'scroll-mt-3 rounded-2xl border transition-colors',
        open ? 'border-[color-mix(in_oklab,var(--accent)_45%,transparent)] bg-white/[0.04]' : 'border-white/[0.06] hover:border-white/[0.12]',
        isDragging && 'relative z-10 bg-ink-900 shadow-2xl',
      )}
    >
      <div className="flex items-center pr-1.5">
        <button
          {...attributes}
          {...listeners}
          className="grid h-12 w-8 shrink-0 cursor-grab touch-none place-items-center text-faint hover:text-soft active:cursor-grabbing"
          aria-label={`Drag to move ${info.name}`}
        >
          <GripVertical className="size-4" />
        </button>
        <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2.5 py-2 text-left" aria-expanded={open}>
          <span className="text-[17px] leading-none">{info.emoji}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold">{info.name}</span>
            <span className="block truncate text-[12px] text-muted">{section.heading || info.hint}</span>
          </span>
          <ChevronDown className={cn('size-4 shrink-0 text-faint transition', open && 'rotate-180')} />
        </button>
        <Menu
          trigger={(openMenu) => (
            <button
              onClick={openMenu}
              className="ml-0.5 grid size-8 shrink-0 place-items-center rounded-lg text-faint hover:bg-white/[0.06] hover:text-fg"
              aria-label={`${info.name} options`}
            >
              <MoreHorizontal className="size-4" />
            </button>
          )}
          items={[
            ...(!first ? [{ label: 'Move up', icon: <ArrowUp />, onSelect: () => onMove(-1) }] : []),
            ...(!last ? [{ label: 'Move down', icon: <ArrowDown />, onSelect: () => onMove(1) }] : []),
            { label: 'Duplicate', icon: <Copy />, onSelect: onDuplicate },
            'divider' as const,
            { label: 'Remove section', icon: <Trash2 />, danger: true, onSelect: onDelete },
          ]}
        />
      </div>
      {open && (
        <div className="border-t border-white/[0.06] p-3.5">
          <SectionFields section={section} images={images} projectId={projectId} onChange={onChange} />
        </div>
      )}
    </div>
  )
}

function SectionsPanel({
  site,
  sections,
  images,
  selectedId,
  onSelect,
  onChange,
  onRestore,
}: {
  site: Site
  sections: SiteSection[]
  images: Record<string, string>
  selectedId?: string
  onSelect: (id: string | undefined, scroll: boolean) => void
  onChange: (sections: SiteSection[]) => void
  onRestore: (section: SiteSection, index: number) => void
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    onChange(
      arrayMove(
        sections,
        sections.findIndex((s) => s.id === active.id),
        sections.findIndex((s) => s.id === over.id),
      ),
    )
  }
  const add = (type: SiteSectionType) => {
    const section = starterSection(type, site)
    const next = [...sections]
    const selected = sections.findIndex((s) => s.id === selectedId)
    const footer = sections.findIndex((s) => s.type === 'footer')
    const at = type === 'hero' ? 0 : type === 'footer' ? sections.length : selected >= 0 ? selected + 1 : footer >= 0 ? footer : sections.length
    next.splice(at, 0, section)
    onChange(next)
    onSelect(section.id, true)
  }
  return (
    <div className="space-y-2">
      <p className="px-0.5 pb-1 text-[12.5px] leading-relaxed text-muted">Click any part of the page, or pick a section here. Drag the handles to reorder.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {sections.map((s, i) => (
            <SectionRow
              key={s.id}
              section={s}
              open={s.id === selectedId}
              first={i === 0}
              last={i === sections.length - 1}
              images={images}
              projectId={site.projectId}
              onToggle={() => onSelect(s.id === selectedId ? undefined : s.id, true)}
              onChange={(next) => onChange(sections.map((x) => (x.id === s.id ? next : x)))}
              onMove={(dir) => onChange(arrayMove(sections, i, i + dir))}
              onDuplicate={() => {
                const copy = { ...s, id: uid() }
                const next = [...sections]
                next.splice(i + 1, 0, copy)
                onChange(next)
                onSelect(copy.id, true)
              }}
              onDelete={() => {
                onChange(sections.filter((x) => x.id !== s.id))
                toast.info(`${typeInfo(s.type).name} removed`, undefined, { label: 'Undo', onClick: () => onRestore(s, i) })
              }}
            />
          ))}
        </SortableContext>
      </DndContext>
      <Menu
        align="left"
        trigger={(open) => (
          <Button size="sm" variant="secondary" icon={<Plus />} onClick={open} className="mt-1 w-full">
            Add a section
          </Button>
        )}
        items={SECTION_TYPES.map((t) => ({
          label: (
            <span className="flex items-center gap-2.5">
              <span className="w-5 text-center">{t.emoji}</span>
              <span>
                <span className="block">{t.name}</span>
                <span className="block text-[11.5px] text-faint">{t.hint}</span>
              </span>
            </span>
          ),
          onSelect: () => add(t.id),
        }))}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Style                                                              */
/* ------------------------------------------------------------------ */

const SWATCHES = ['#f59e0b', '#f97316', '#e11d48', '#db2777', '#7c3aed', '#4f46e5', '#2563eb', '#0ea5e9', '#14b8a6', '#65a30d']

const FONT_PREVIEW: Record<SiteTheme['font'], string> = {
  grotesk: "'Inter Variable', sans-serif",
  serif: "'Instrument Serif', Georgia, serif",
  mono: "'JetBrains Mono Variable', monospace",
  rounded: "ui-rounded, 'Nunito', 'Arial Rounded MT Bold', system-ui, sans-serif",
  display: "'Bricolage Grotesque Variable', sans-serif",
}

function HexInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [text, setText] = useState(value)
  const [focused, setFocused] = useState(false)
  const commit = () => {
    const v = text.trim().replace(/^#?/, '#')
    const full = /^#[0-9a-f]{3}$/i.test(v) ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : v
    if (/^#[0-9a-f]{6}$/i.test(full)) onChange(full.toLowerCase())
    else setText(value)
  }
  return (
    <input
      value={focused ? text : value}
      onFocus={() => {
        setText(value)
        setFocused(true)
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        commit()
        setFocused(false)
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      aria-label={`${label} colour code`}
      className="h-8 w-[84px] rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 font-mono text-[12px] text-soft uppercase outline-none focus:border-white/[0.25]"
    />
  )
}

function ColorRow({ label, hint, value, onChange, swatches }: { label: string; hint?: string; value: string; onChange: (v: string) => void; swatches?: string[] }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <label
          className="relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-xl ring-1 ring-white/[0.18]"
          style={{ background: value }}
          title={`Pick a ${label.toLowerCase()}`}
        >
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" aria-label={label} />
        </label>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium">{label}</div>
          {hint && <div className="text-[11.5px] text-faint">{hint}</div>}
        </div>
        <HexInput value={value} onChange={onChange} label={label} />
      </div>
      {swatches && (
        <div className="flex flex-wrap gap-1.5 pl-12">
          {swatches.map((c) => (
            <button
              key={c}
              onClick={() => onChange(c)}
              className={cn('size-5 rounded-full ring-1 ring-white/10 transition hover:scale-110', value.toLowerCase() === c && 'ring-2 ring-white')}
              style={{ background: c }}
              aria-label={`Use ${c}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function StylePanel({ theme, onChange }: { theme: SiteTheme; onChange: (t: SiteTheme) => void }) {
  const set = (patch: Partial<SiteTheme>) => onChange({ ...theme, ...patch })
  const setMode = (mode: SiteTheme['mode']) => {
    if (mode === theme.mode) return
    const base = presetById(mode === 'light' ? 'clean' : 'midnight').theme
    set({ mode, background: base.background, surface: base.surface, text: base.text, muted: base.muted })
  }
  const warnings = [
    contrastRatio(theme.text, theme.background) < 4.5 && 'The main text may be hard to read on this background.',
    contrastRatio(theme.muted, theme.background) < 3 && 'The soft text may be hard to read on this background.',
  ].filter((w): w is string => !!w)

  return (
    <div className="space-y-7">
      <section>
        <Label>Looks</Label>
        <div className="grid grid-cols-2 gap-2">
          {SITE_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => onChange({ ...p.theme })}
              className={cn(
                'overflow-hidden rounded-xl border text-left transition',
                theme.presetId === p.id ? 'border-transparent ring-2 ring-[var(--accent)]' : 'border-white/[0.08] hover:border-white/[0.2]',
              )}
            >
              <div className="relative h-14 p-2.5" style={{ background: p.theme.background }}>
                <div className="text-[14px] leading-none font-bold" style={{ color: p.theme.text, fontFamily: FONT_PREVIEW[p.theme.font] }}>
                  Aa
                </div>
                <div
                  className="absolute right-2.5 bottom-2.5 h-4 w-10"
                  style={{ background: p.theme.primary, borderRadius: p.theme.radius === 'sharp' ? 0 : p.theme.radius === 'soft' ? 5 : 999 }}
                />
                <div className="absolute bottom-2.5 left-2.5 h-1 w-8 rounded-full" style={{ background: p.theme.secondary }} />
              </div>
              <div className="flex items-center justify-between px-2.5 py-1.5 text-[11.5px] font-medium">
                {p.name}
                {theme.presetId === p.id && <Check className="size-3.5 text-[var(--accent)]" />}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <Label>Light or dark</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {(['light', 'dark'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'h-9 rounded-lg border text-[12.5px] capitalize transition',
                theme.mode === m ? 'border-transparent bg-white text-ink-950' : 'border-white/[0.08] text-muted hover:text-fg',
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <Label>Colours</Label>
        <ColorRow label="Main colour" hint="Buttons and highlights" value={theme.primary} onChange={(primary) => set({ primary })} swatches={SWATCHES} />
        <ColorRow label="Second colour" hint="Glows and gradients" value={theme.secondary} onChange={(secondary) => set({ secondary })} swatches={SWATCHES} />
        <ColorRow label="Background" value={theme.background} onChange={(background) => set({ background })} />
        <ColorRow label="Cards" hint="Boxes and panels" value={theme.surface} onChange={(surface) => set({ surface })} />
        <ColorRow label="Text" value={theme.text} onChange={(text) => set({ text })} />
        <ColorRow label="Soft text" hint="Descriptions and captions" value={theme.muted} onChange={(muted) => set({ muted })} />
        {warnings.map((w) => (
          <p key={w} className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-[12px] text-amber-200">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {w}
          </p>
        ))}
      </section>

      <section>
        <Label>Lettering</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(SITE_FONTS) as SiteTheme['font'][]).map((f) => (
            <button
              key={f}
              onClick={() => set({ font: f })}
              className={cn(
                'flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition',
                theme.font === f ? 'border-transparent bg-white/[0.09] ring-2 ring-[var(--accent)]' : 'border-white/[0.08] hover:border-white/[0.18]',
              )}
            >
              <span className="text-[20px] leading-none" style={{ fontFamily: FONT_PREVIEW[f], fontWeight: f === 'serif' ? 400 : 700 }}>
                Aa
              </span>
              <span className="text-[12px] text-soft">{SITE_FONTS[f].label}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <Label>Corners</Label>
        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              { id: 'sharp', label: 'Sharp', r: 1 },
              { id: 'soft', label: 'Soft', r: 6 },
              { id: 'round', label: 'Round', r: 999 },
            ] as const
          ).map((o) => (
            <button
              key={o.id}
              onClick={() => set({ radius: o.id })}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-xl border py-2.5 text-[12px] transition',
                theme.radius === o.id ? 'border-transparent bg-white/[0.09] text-fg ring-2 ring-[var(--accent)]' : 'border-white/[0.08] text-muted hover:text-fg',
              )}
            >
              <span className="h-4 w-10 bg-current opacity-70" style={{ borderRadius: o.r }} />
              {o.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Ask                                                                */
/* ------------------------------------------------------------------ */

function AskPanel({ site, agent, onAsk, canUndo, onUndo }: { site: Site; agent?: Agent; onAsk: (text: string) => Promise<void>; canUndo: boolean; onUndo: () => void }) {
  const [ask, setAsk] = useState('')
  const [busy, setBusy] = useState(false)
  const generating = site.status === 'generating'
  const submit = async () => {
    const text = ask.trim()
    if (!text || busy || generating) return
    setBusy(true)
    try {
      await onAsk(text)
      setAsk('')
      toast.success('Page updated', 'Have a look. You can undo it if it’s not right.')
    } catch (err) {
      toast.error('That change didn’t work', errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        {agent && <AgentAvatar agent={agent} size="sm" active={generating} />}
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold">{agent?.name ?? 'Your team'}</div>
          <div className="text-[12px] text-muted">{generating ? (site.stage ?? 'Working on it…') : 'Tell me what to change, in your own words.'}</div>
        </div>
      </div>
      <div className="space-y-2.5">
        <Textarea
          rows={4}
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void submit()
            }
          }}
          placeholder="e.g. Add the pop-up dates and make the headline shorter"
          className="text-[13.5px]"
        />
        <div className="flex flex-wrap gap-1.5">
          {PAGE_IDEAS.map((i) => (
            <button
              key={i}
              onClick={() => setAsk(i)}
              className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[11.5px] text-muted transition hover:border-white/[0.16] hover:text-fg"
            >
              {i}
            </button>
          ))}
        </div>
        <Button variant="primary" icon={<Wand2 />} className="w-full" loading={busy || generating} disabled={!ask.trim()} onClick={() => void submit()}>
          {generating ? 'Working on it…' : 'Make the change'}
        </Button>
      </div>
      {canUndo && !generating && (
        <div className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-3">
          <p className="min-w-0 flex-1 text-[12.5px] text-soft">Not quite right?</p>
          <Button size="xs" variant="secondary" icon={<Undo2 />} onClick={onUndo}>
            Undo that change
          </Button>
        </div>
      )}
      {site.history.length > 0 && (
        <section>
          <Label>Changes so far</Label>
          <ol className="space-y-1.5">
            {[...site.history]
              .reverse()
              .slice(0, 8)
              .map((h, i) => (
                <li key={`${h.at}-${i}`} className="rounded-xl bg-white/[0.03] px-3 py-2">
                  <p className="text-[12.5px] text-soft">“{h.prompt}”</p>
                  <p className="mt-0.5 text-[11px] text-faint">{timeAgo(h.at)}</p>
                </li>
              ))}
          </ol>
        </section>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Live preview                                                       */
/* ------------------------------------------------------------------ */

function Preview({
  site,
  draft,
  images,
  device,
  selection,
  onPick,
}: {
  site: Site
  draft: Draft
  images: Record<string, string>
  device: Device
  selection: Selection
  onPick: (id: string) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const freeform = site.mode === 'freeform' && !!site.html
  const view = useMemo(() => ({ ...site, sections: draft.sections, theme: draft.theme }), [site, draft])
  const parts = useMemo(() => renderSiteParts(view, images, { editor: true, labels: LABELS }), [view, images])
  const freeDoc = useMemo(() => (freeform && site.html ? guardedDocument(site.html) : ''), [freeform, site.html])

  // The page loads once, then takes each change in place, so editing never reloads it or loses your spot.
  const [boot] = useState(() => ({ parts, doc: editorDocument(parts) }))
  const sent = useRef(boot.parts)
  const ready = useRef(false)
  const post = (msg: Record<string, unknown>) => frameRef.current?.contentWindow?.postMessage({ __site: 1, ...msg }, '*')
  const sync = () => {
    if (!ready.current || freeform) return
    const last = sent.current
    const msg: Record<string, unknown> = {}
    if (parts.css !== last.css) msg.css = parts.css
    if (parts.fontHref !== last.fontHref) msg.font = parts.fontHref
    const sameOrder = parts.sections.length === last.sections.length && parts.sections.every((s, i) => s.id === last.sections[i].id)
    if (!sameOrder) msg.body = parts.sections.map((s) => s.html).join('\n')
    else {
      const patch = parts.sections.filter((s, i) => s.html !== last.sections[i].html)
      if (patch.length) msg.patch = patch
    }
    if (Object.keys(msg).length) post(msg)
    sent.current = parts
  }
  useEffect(sync)
  useEffect(() => {
    if (ready.current) post({ select: selection.id ?? null, scroll: selection.scroll })
  }, [selection])

  const onPickRef = useRef(onPick)
  useEffect(() => {
    onPickRef.current = onPick
  })
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return
      const d = e.data as { __site?: number; pick?: string } | null
      if (d?.__site && d.pick) onPickRef.current(d.pick)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const dev = DEVICES.find((d) => d.id === device)!
  const phone = device === 'phone'
  const compact = size.w < 640
  const pad = compact ? 12 : 28
  const bar = device === 'desktop' ? 34 : 0
  const bezel = phone ? 10 : device === 'tablet' ? 8 : 0
  const availW = Math.max(120, size.w - pad * 2 - bezel * 2)
  const availH = Math.max(120, size.h - pad * 2 - bar - bezel * 2)
  const scale = phone ? Math.min(1, availW / dev.width, availH / PHONE_HEIGHT) : Math.min(1, availW / dev.width)
  const vh = phone ? PHONE_HEIGHT : Math.floor(availH / scale)
  const generating = site.status === 'generating'

  return (
    <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(80%_60%_at_50%_0%,rgb(255_255_255/0.035),transparent)]">
      {size.w > 0 && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ padding: pad }}>
          <div
            className={cn(
              'relative overflow-hidden shadow-[0_40px_120px_-40px_rgb(0_0_0/0.9)] ring-1 ring-white/[0.1] transition-opacity',
              device === 'desktop' ? 'rounded-xl bg-[#17171d]' : 'rounded-[34px] bg-[#0c0c10]',
              generating && 'opacity-60',
            )}
            style={{ padding: bezel }}
          >
            {device === 'desktop' && (
              <div className="flex h-[34px] items-center gap-1.5 px-3.5">
                <span className="size-2.5 rounded-full bg-[#ff5f57]/80" />
                <span className="size-2.5 rounded-full bg-[#febc2e]/80" />
                <span className="size-2.5 rounded-full bg-[#28c840]/80" />
                <span className="mx-auto flex h-[22px] max-w-[60%] min-w-0 items-center gap-1.5 truncate rounded-md bg-white/[0.06] px-3 text-[11.5px] text-muted">
                  <Globe className="size-3 shrink-0" />
                  <span className="truncate">{slugify(site.name) || 'your-page'}.com</span>
                </span>
                <span className="w-[46px]" />
              </div>
            )}
            <div
              className={cn('relative overflow-hidden', phone ? 'rounded-[26px]' : device === 'tablet' ? 'rounded-[24px]' : '')}
              style={{ width: Math.round(dev.width * scale), height: Math.round(vh * scale), background: draft.theme.background }}
            >
              <iframe
                key={freeform ? 'freeform' : 'sections'}
                ref={frameRef}
                title={`${site.name} preview`}
                srcDoc={freeform ? freeDoc : boot.doc}
                sandbox="allow-scripts"
                onLoad={() => {
                  ready.current = true
                  sent.current = boot.parts
                  sync()
                  post({ select: selection.id ?? null, scroll: false })
                }}
                className="absolute top-0 left-0 origin-top-left border-0"
                style={{ width: dev.width, height: vh, transform: `scale(${scale})` }}
              />
            </div>
          </div>
        </div>
      )}
      {generating && (
        <div className="pointer-events-none absolute inset-x-0 top-5 flex justify-center">
          <div className="flex items-center gap-2 rounded-full border border-white/[0.1] bg-ink-900/90 px-4 py-2 text-[13px] shadow-xl backdrop-blur">
            <Sparkles className="size-4 animate-pulse text-[var(--accent)]" />
            {site.stage ?? 'Making your changes…'}
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Publishing help                                                    */
/* ------------------------------------------------------------------ */

function PublishModal({ site, onClose, onDownload, downloading }: { site: Site; onClose: () => void; onDownload: () => void; downloading: boolean }) {
  const hosts = [
    {
      name: 'Netlify Drop',
      url: 'https://app.netlify.com/drop',
      steps: ['Open app.netlify.com/drop', 'Drag your downloaded file onto the page', 'It’s live in seconds. Sign up free when asked so it stays online.'],
    },
    {
      name: 'Tiiny Host',
      url: 'https://tiiny.host',
      steps: ['Open tiiny.host', 'Drop in your file and choose a web address', 'Press publish. It’s free to start.'],
    },
  ]
  return (
    <Modal open onClose={onClose} size="lg" icon={<Globe />} title="Put your page online" subtitle="No technical skills needed. It takes about two minutes.">
      <ol className="space-y-6">
        <li className="flex gap-4">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-[13px] font-bold text-ink-950">1</span>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold">Download your page</h3>
            <p className="mt-1 text-[13px] text-muted">You’ll get a single file with everything inside: words, pictures and design.</p>
            <Button variant="primary" icon={<Download />} loading={downloading} onClick={onDownload} className="mt-3">
              Download “{site.name}”
            </Button>
          </div>
        </li>
        <li className="flex gap-4">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/[0.1] text-[13px] font-bold">2</span>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold">Drop it onto a free host</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {hosts.map((h) => (
                <a
                  key={h.name}
                  href={h.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 transition hover:border-white/[0.2] hover:bg-white/[0.05]"
                >
                  <div className="flex items-center justify-between font-semibold">
                    {h.name}
                    <ExternalLink className="size-3.5 text-faint transition group-hover:text-fg" />
                  </div>
                  <ol className="mt-2.5 space-y-1.5">
                    {h.steps.map((s, i) => (
                      <li key={s} className="flex gap-2 text-[12.5px] text-soft">
                        <span className="text-faint">{i + 1}.</span>
                        {s}
                      </li>
                    ))}
                  </ol>
                </a>
              ))}
            </div>
          </div>
        </li>
        <li className="flex gap-4">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/[0.1] text-[13px] font-bold">3</span>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold">Or hand it to your web team</h3>
            <p className="mt-1 text-[13px] text-muted">
              Email them the file. It’s a standard web page that works with any website host, and they can connect your own web address.
            </p>
          </div>
        </li>
      </ol>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/*  Editor                                                             */
/* ------------------------------------------------------------------ */

function Editor({ site }: { site: Site }) {
  const navigate = useNavigate()
  const agents = useAgents()
  const agent = agentFor(site, agents)
  const wide = useMediaQuery('(min-width: 1024px)')
  const freeform = site.mode === 'freeform' && !!site.html
  const locked = site.status === 'generating'
  const [device, setDevice] = useState<Device>(() => (window.innerWidth < 640 ? 'phone' : 'desktop'))
  const [panel, setPanel] = useState<PanelTab>('ask')
  const [panelOpen, setPanelOpen] = useState(false)
  const [selection, setSelection] = useState<Selection>({ scroll: false })
  const [publishing, setPublishing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [undo, setUndo] = useState<{ sections: SiteSection[]; theme: SiteTheme; html?: string } | null>(null)
  const [name, setName] = useDraftField(site.name, (v) => void db.sites.update(site.id, { name: v.trim() || site.name, updatedAt: Date.now() }))

  // Edits are shown straight away and saved quietly shortly after.
  const [draft, setDraft] = useState<Draft>({ sections: site.sections, theme: site.theme })
  const pending = useRef(false)
  const version = useRef(0)
  const draftRef = useRef(draft)
  useEffect(() => {
    draftRef.current = draft
  })
  useEffect(() => {
    if (!pending.current) setDraft({ sections: site.sections, theme: site.theme })
  }, [site.sections, site.theme])
  const persist = async (d: Draft, v: number) => {
    await db.sites.update(site.id, { sections: d.sections, theme: d.theme, updatedAt: Date.now() })
    if (version.current === v) pending.current = false
  }
  useEffect(() => {
    if (!pending.current) return
    const v = version.current
    const t = setTimeout(() => void persist(draft, v), 450)
    return () => clearTimeout(t)
  }, [draft])
  useEffect(
    () => () => {
      if (pending.current) void persist(draftRef.current, version.current)
    },
    [],
  )
  const edit = (patch: Partial<Draft> | ((d: Draft) => Partial<Draft>)) => {
    pending.current = true
    version.current++
    setDraft((d) => ({ ...d, ...(typeof patch === 'function' ? patch(d) : patch) }))
  }
  const flush = async () => {
    if (pending.current) await persist(draftRef.current, version.current)
  }

  // Pictures from the media library, ready for the preview.
  const refsKey = imageRefs(draft).join('|')
  const [images, setImages] = useState<Record<string, string>>({})
  useEffect(() => {
    let alive = true
    void pageImages(refsKey.split('|')).then((m) => alive && setImages(m))
    return () => {
      alive = false
    }
  }, [refsKey])

  const view = { ...site, sections: draft.sections, theme: draft.theme }
  const select = (id: string | undefined, scroll: boolean) => setSelection({ id, scroll })

  const askForChange = async (text: string) => {
    await flush()
    const before = await db.sites.get(site.id)
    await reviseSite(site.id, text)
    if (before) setUndo({ sections: before.sections, theme: before.theme, html: before.html })
  }
  const undoChange = async () => {
    if (!undo) return
    const latest = await db.sites.get(site.id)
    await db.sites.update(site.id, { ...undo, history: (latest?.history ?? []).slice(0, -1), updatedAt: Date.now() })
    setUndo(null)
    toast.success('Change undone')
  }

  const download = async () => {
    setBusy('download')
    try {
      const html = renderSiteHTML(view, await downloadImages(view))
      downloadText(html, `${safeFileName(site.name)}.html`, 'text/html;charset=utf-8')
      toast.success('Page downloaded', 'It’s in your Downloads folder.')
    } catch (err) {
      toast.error('Couldn’t download the page', errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const openPreview = async () => {
    const w = window.open('', '_blank')
    if (!w) {
      toast.error('Your browser blocked the new tab', 'Allow pop-ups for this app, then try again.')
      return
    }
    const html = renderSiteHTML(view, await pageImages(imageRefs(view)))
    w.document.title = `${site.name} (preview)`
    const style = w.document.createElement('style')
    style.textContent = 'html,body{margin:0;height:100%;background:#0b0b10}iframe{display:block;border:0;width:100%;height:100%}'
    w.document.head.appendChild(style)
    const frame = w.document.createElement('iframe')
    frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox')
    frame.srcdoc = html
    w.document.body.appendChild(frame)
  }

  const rebuild = (asSections: boolean) => {
    const message = asSections
      ? 'Rebuild this page as an easy-to-edit version? The current design will be replaced.'
      : 'Make the whole page again from the original brief? Your edits will be replaced.'
    if (!window.confirm(message)) return
    void db.sites
      .update(site.id, { ...(asSections ? { mode: 'sections' as const } : {}), sections: [], html: undefined, status: 'generating', error: undefined, stage: 'Starting again' })
      .then(() => generateSite(site.id).catch((err) => toast.error('Couldn’t rebuild the page', errorMessage(err))))
  }

  const onPick = (id: string) => {
    select(id, false)
    setPanel('edit')
    if (!wide) setPanelOpen(true)
  }

  const tabs: { id: PanelTab; label: string; icon: ReactNode }[] = freeform
    ? [{ id: 'ask', label: `Ask ${agent?.name ?? 'AI'}`, icon: <Sparkles /> }]
    : [
        { id: 'ask', label: `Ask ${agent?.name ?? 'AI'}`, icon: <Sparkles /> },
        { id: 'edit', label: 'Edit', icon: <Layers /> },
        { id: 'style', label: 'Style', icon: <Palette /> },
      ]
  const tab = freeform ? 'ask' : panel

  const panelBody = (
    <>
      <div className="border-b border-white/[0.06] p-3">
        <Tabs value={tab} onChange={setPanel} className="w-full" items={tabs} />
      </div>
      <div key={tab} className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === 'ask' && (
          <div className="space-y-6">
            <AskPanel site={site} agent={agent} onAsk={askForChange} canUndo={!!undo} onUndo={() => void undoChange()} />
            {freeform && (
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
                <p className="text-[12.5px] leading-relaxed text-soft">
                  This page is a one-of-a-kind design, so changes are made by asking. Prefer to edit the words and pictures yourself?
                </p>
                <Button size="sm" variant="secondary" icon={<Layers />} className="mt-3" onClick={() => rebuild(true)} disabled={locked}>
                  Rebuild as an easy-to-edit page
                </Button>
              </div>
            )}
          </div>
        )}
        {tab !== 'ask' && (
          <fieldset disabled={locked} className={cn('min-w-0 transition-opacity', locked && 'pointer-events-none opacity-50')}>
            {locked && (
              <p className="mb-4 rounded-xl bg-white/[0.04] px-3 py-2 text-[12.5px] text-soft">
                {agent?.name ?? 'Your team'} is making changes. Editing unlocks when they’re done.
              </p>
            )}
            {tab === 'edit' && (
              <SectionsPanel
                site={site}
                sections={draft.sections}
                images={images}
                selectedId={selection.id}
                onSelect={select}
                onChange={(sections) => edit({ sections })}
                onRestore={(section, index) =>
                  edit((d) => ({ sections: d.sections.some((x) => x.id === section.id) ? d.sections : [...d.sections.slice(0, index), section, ...d.sections.slice(index)] }))
                }
              />
            )}
            {tab === 'style' && <StylePanel theme={draft.theme} onChange={(theme) => edit({ theme })} />}
          </fieldset>
        )}
      </div>
    </>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-3 py-2.5 sm:px-5">
        <button onClick={() => navigate('/sites')} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/[0.07] hover:text-fg" aria-label="All pages">
          <ArrowLeft className="size-4" />
        </button>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Page name"
          className="min-w-0 flex-1 rounded-lg bg-transparent px-2 py-1 font-display text-[17px] font-semibold tracking-tight outline-none focus:bg-white/[0.05]"
        />
        <div className="hidden sm:block">
          <Tabs
            size="sm"
            value={device}
            onChange={setDevice}
            items={DEVICES.map((d) => {
              const Icon = d.icon
              return { id: d.id, label: <span className="hidden xl:inline">{d.label}</span>, icon: <Icon aria-label={d.label} /> }
            })}
          />
        </div>
        <div className="hidden md:block">
          <Button size="sm" variant="ghost" icon={<ExternalLink />} onClick={() => void openPreview()}>
            Open preview
          </Button>
        </div>
        {!wide && (
          <Button size="sm" variant="secondary" icon={<SlidersHorizontal />} onClick={() => setPanelOpen(true)}>
            Edit
          </Button>
        )}
        <Button size="sm" variant="primary" icon={<Globe />} onClick={() => setPublishing(true)}>
          <span className="hidden sm:inline">Put it online</span>
          <span className="sm:hidden">Publish</span>
        </Button>
        <Menu
          trigger={(open) => (
            <button onClick={open} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/[0.07] hover:text-fg" aria-label="More">
              <MoreHorizontal className="size-4" />
            </button>
          )}
          items={[
            { label: 'Download page', icon: <Download />, onSelect: () => void download() },
            { label: 'Open preview in a new tab', icon: <ExternalLink />, onSelect: () => void openPreview() },
            {
              label: 'Duplicate page',
              icon: <Copy />,
              onSelect: async () => {
                await flush()
                const latest = (await db.sites.get(site.id)) ?? site
                const copy = {
                  ...latest,
                  id: uid(),
                  name: `${latest.name} (copy)`,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                  demo: undefined,
                  sections: latest.sections.map((s) => ({ ...s, id: uid() })),
                }
                await db.sites.put(copy)
                navigate(`/sites/${copy.id}`)
                toast.success('Page duplicated', 'You’re now editing the copy.')
              },
            },
            { label: 'Make it again from the brief', icon: <RotateCcw />, onSelect: () => rebuild(false) },
            'divider',
            {
              label: 'Delete page',
              icon: <Trash2 />,
              danger: true,
              onSelect: async () => {
                if (!window.confirm(`Delete “${site.name}”?`)) return
                pending.current = false
                await db.sites.delete(site.id)
                navigate('/sites')
              },
            },
          ]}
        />
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <Preview site={site} draft={draft} images={images} device={device} selection={selection} onPick={onPick} />
          <div className="flex items-center justify-center gap-1 border-t border-white/[0.06] p-2 sm:hidden">
            <Tabs
              size="sm"
              value={device}
              onChange={setDevice}
              items={DEVICES.map((d) => {
                const Icon = d.icon
                return { id: d.id, label: d.label, icon: <Icon /> }
              })}
            />
          </div>
        </main>
        {wide && <aside className="flex w-[380px] shrink-0 flex-col border-l border-white/[0.06]">{panelBody}</aside>}
      </div>

      {!wide && (
        <Drawer open={panelOpen} onClose={() => setPanelOpen(false)} title={site.name} width="max-w-md">
          <div className="-mx-6 -my-5 flex h-[calc(100%+2.5rem)] flex-col">{panelBody}</div>
        </Drawer>
      )}
      {publishing && <PublishModal site={site} onClose={() => setPublishing(false)} onDownload={() => void download()} downloading={busy === 'download'} />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  While the page is being made                                       */
/* ------------------------------------------------------------------ */

function Building({ site }: { site: Site }) {
  const agents = useAgents()
  const agent = agentFor(site, agents)
  const t = site.theme
  const radius = t.radius === 'sharp' ? 2 : t.radius === 'soft' ? 10 : 999
  return (
    <div className="grid h-full place-items-center overflow-y-auto p-6">
      <div className="w-full max-w-3xl">
        <div className="overflow-hidden rounded-xl bg-[#17171d] shadow-[0_40px_120px_-40px_rgb(0_0_0/0.9)] ring-1 ring-white/[0.1]">
          <div className="flex h-[34px] items-center gap-1.5 px-3.5">
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
          </div>
          <div className="relative aspect-[16/9] overflow-hidden p-[7%]" style={{ background: t.background }}>
            <div className="absolute -top-1/3 -right-1/4 size-2/3 animate-pulse rounded-full opacity-50 blur-3xl" style={{ background: t.primary }} />
            <div className="absolute -bottom-1/2 -left-1/4 size-2/3 rounded-full opacity-35 blur-3xl" style={{ background: t.secondary }} />
            <div className="relative space-y-4">
              <div className="h-6 w-32 rounded-full opacity-20" style={{ background: t.text }} />
              <div className="h-9 w-3/4 animate-pulse rounded-xl opacity-25" style={{ background: t.text }} />
              <div className="h-9 w-1/2 animate-pulse rounded-xl opacity-25" style={{ background: t.text }} />
              <div className="h-3.5 w-2/3 rounded-lg opacity-15" style={{ background: t.text }} />
              <div className="h-3.5 w-1/2 rounded-lg opacity-15" style={{ background: t.text }} />
              <div className="!mt-8 h-11 w-40" style={{ background: t.primary, borderRadius: radius }} />
            </div>
          </div>
        </div>
        <div className="mt-8 flex items-center justify-center gap-3">
          {agent && <AgentAvatar agent={agent} size="md" active />}
          <div>
            <div className="font-semibold">{site.stage ?? 'Getting started'}</div>
            <div className="text-[13px] text-muted">Your page will appear here. It usually takes a minute or two.</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SiteEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const site = useLiveQuery(() => (id ? db.sites.get(id) : undefined), [id])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    void db.sites.get(id).then((s) => {
      if (!cancelled && !s) navigate('/sites', { replace: true })
    })
    return () => {
      cancelled = true
    }
  }, [id, navigate])

  if (!site) return null
  if (!site.sections.length && !site.html) {
    if (site.status === 'error')
      return (
        <div className="grid h-full place-items-center p-6">
          <div className="max-w-md text-center">
            <TriangleAlert className="mx-auto size-8 text-bad" />
            <h2 className="mt-4 font-display text-2xl font-semibold">The page didn’t finish</h2>
            <p className="mt-2 text-sm text-muted">{site.error}</p>
            <div className="mt-6 flex justify-center gap-2">
              <Button variant="ghost" onClick={() => navigate('/sites')}>
                Back
              </Button>
              <Button
                variant="primary"
                icon={<RotateCcw />}
                onClick={() =>
                  void db.sites.update(site.id, { status: 'generating', error: undefined, stage: 'Starting again' }).then(() => generateSite(site.id).catch(() => undefined))
                }
              >
                Try again
              </Button>
            </div>
          </div>
        </div>
      )
    return <Building site={site} />
  }
  return <Editor key={site.id} site={site} />
}
