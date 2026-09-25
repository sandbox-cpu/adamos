import { useMemo, useState } from 'react'
import { CalendarCheck, Flame, Mail, MoreHorizontal, Pencil, Phone, Plus, Search, Send, Snowflake, Sun, Trash2, UserRound } from 'lucide-react'
import { db } from '../../lib/db'
import type { MediaContact } from '../../lib/types'
import { cn, initials, isoDate, timeAgo, uid } from '../../lib/utils'
import { useContacts } from '../../hooks/data'
import { Button } from '../../components/ui/Button'
import { Menu } from '../../components/ui/bits'
import { Field, Input, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { toast } from '../../components/ui/Toast'

export const RELATIONSHIP: Record<MediaContact['relationship'], { label: string; color: string; icon: typeof Flame; hint: string }> = {
  hot: { label: 'Strong', color: '#fb7185', icon: Flame, hint: 'Knows you well' },
  warm: { label: 'Warm', color: '#fbbf24', icon: Sun, hint: 'Some contact' },
  cold: { label: 'New', color: '#7dd3fc', icon: Snowflake, hint: 'Not yet in touch' },
}

function ContactModal({ contact, onClose }: { contact?: MediaContact; onClose: () => void }) {
  const [c, setC] = useState<MediaContact>(
    contact ?? { id: uid(), name: '', outlet: '', beat: '', email: '', phone: '', social: '', notes: '', tags: [], relationship: 'cold', createdAt: Date.now() },
  )
  const [tags, setTags] = useState((contact?.tags ?? []).join(', '))
  const save = async () => {
    if (!c.name.trim()) return
    await db.contacts.put({
      ...c,
      name: c.name.trim(),
      outlet: c.outlet.trim(),
      beat: c.beat?.trim() || undefined,
      email: c.email?.trim() || undefined,
      phone: c.phone?.trim() || undefined,
      social: c.social?.trim() || undefined,
      notes: c.notes?.trim() || undefined,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      demo: undefined,
    })
    toast.success(contact ? 'Contact updated' : 'Contact added', c.name)
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      icon={<UserRound />}
      title={contact ? 'Edit contact' : 'Add a media contact'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!c.name.trim()} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input autoFocus value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} placeholder="e.g. Priya Shah" />
          </Field>
          <Field label="Outlet">
            <Input value={c.outlet} onChange={(e) => setC({ ...c, outlet: e.target.value })} placeholder="e.g. The Daily Ledger" />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="What they cover">
            <Input value={c.beat ?? ''} onChange={(e) => setC({ ...c, beat: e.target.value })} placeholder="e.g. Food and drink" />
          </Field>
          <Field label="Tags" hint="comma separated">
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. consumer, national" />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Email">
            <Input type="email" value={c.email ?? ''} onChange={(e) => setC({ ...c, email: e.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={c.phone ?? ''} onChange={(e) => setC({ ...c, phone: e.target.value })} />
          </Field>
          <Field label="Social">
            <Input value={c.social ?? ''} onChange={(e) => setC({ ...c, social: e.target.value })} placeholder="@handle" />
          </Field>
        </div>
        <Field label="How well do you know them?">
          <div className="grid grid-cols-3 gap-2">
            {(['cold', 'warm', 'hot'] as const).map((r) => {
              const meta = RELATIONSHIP[r]
              const Ico = meta.icon
              return (
                <button
                  key={r}
                  onClick={() => setC({ ...c, relationship: r })}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-[12.5px] transition',
                    c.relationship === r ? 'border-transparent bg-white/[0.08] text-fg' : 'border-white/[0.08] text-muted hover:text-fg',
                  )}
                  style={c.relationship === r ? { boxShadow: `inset 0 0 0 1.5px ${meta.color}` } : undefined}
                >
                  <Ico className="size-4" style={{ color: meta.color }} />
                  <span className="font-medium">{meta.label}</span>
                  <span className="text-[11px] text-faint">{meta.hint}</span>
                </button>
              )
            })}
          </div>
        </Field>
        <Field label="Notes">
          <Textarea rows={3} value={c.notes ?? ''} onChange={(e) => setC({ ...c, notes: e.target.value })} placeholder="Preferences, past stories, best time to call…" />
        </Field>
      </div>
    </Modal>
  )
}

export function Contacts({ onPitch }: { onPitch: (c: MediaContact) => void }) {
  const contacts = useContacts()
  const [query, setQuery] = useState('')
  const [rel, setRel] = useState<MediaContact['relationship'] | 'all'>('all')
  const [editing, setEditing] = useState<{ contact?: MediaContact; key: number } | null>(null)
  const q = query.trim().toLowerCase()
  const visible = useMemo(
    () =>
      contacts
        .filter((c) => rel === 'all' || c.relationship === rel)
        .filter((c) => !q || [c.name, c.outlet, c.beat, c.notes, ...c.tags].join(' ').toLowerCase().includes(q))
        .sort((a, b) => ['hot', 'warm', 'cold'].indexOf(a.relationship) - ['hot', 'warm', 'cold'].indexOf(b.relationship) || a.name.localeCompare(b.name)),
    [contacts, rel, q],
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <Input icon={<Search />} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, outlet, topic or tag…" className="md:w-80" />
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {(['all', 'hot', 'warm', 'cold'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRel(r)}
              className={cn(
                'h-8 shrink-0 rounded-full border px-3.5 text-[12.5px] transition',
                rel === r ? 'border-transparent bg-white text-ink-950' : 'border-white/[0.08] text-muted hover:text-fg',
              )}
            >
              {r === 'all' ? `All · ${contacts.length}` : RELATIONSHIP[r].label}
            </button>
          ))}
        </div>
        <Button variant="primary" icon={<Plus />} className="md:ml-auto" onClick={() => setEditing({ key: Date.now() })}>
          Add contact
        </Button>
      </div>
      {visible.length ? (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {visible.map((c) => {
            const meta = RELATIONSHIP[c.relationship]
            const Ico = meta.icon
            return (
              <div key={c.id} className="group rounded-3xl border border-white/[0.07] bg-white/[0.025] p-4 transition hover:border-white/[0.13]">
                <div className="flex items-start gap-3">
                  <div
                    className="grid size-11 shrink-0 place-items-center rounded-2xl text-[14px] font-semibold text-ink-950"
                    style={{ background: `linear-gradient(135deg, ${meta.color}, #ffffff)` }}
                  >
                    {initials(c.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold">{c.name}</span>
                      <span className="flex items-center gap-1 text-[11px]" style={{ color: meta.color }} title={meta.hint}>
                        <Ico className="size-3" /> {meta.label}
                      </span>
                    </div>
                    <div className="truncate text-[13px] text-soft">
                      {c.outlet}
                      {c.beat ? <span className="text-muted"> · {c.beat}</span> : null}
                    </div>
                  </div>
                  <Menu
                    trigger={(open) => (
                      <button
                        onClick={open}
                        className="grid size-8 place-items-center rounded-lg text-muted opacity-0 transition group-hover:opacity-100 hover:bg-white/[0.07] hover:text-fg"
                        aria-label="More"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    )}
                    items={[
                      { label: 'Edit', icon: <Pencil />, onSelect: () => setEditing({ contact: c, key: Date.now() }) },
                      'divider',
                      {
                        label: 'Delete',
                        icon: <Trash2 />,
                        danger: true,
                        onSelect: async () => {
                          if (window.confirm(`Delete ${c.name}?`)) await db.contacts.delete(c.id)
                        },
                      },
                    ]}
                  />
                </div>
                {c.notes && <p className="mt-3 line-clamp-2 text-[12.5px] text-muted">{c.notes}</p>}
                {c.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {c.tags.map((t) => (
                      <span key={t} className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px] text-soft">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-white/[0.06] pt-3">
                  <Button size="xs" variant="primary" icon={<Send />} onClick={() => onPitch(c)}>
                    Pitch
                  </Button>
                  {c.email && (
                    <Button size="xs" variant="ghost" icon={<Mail />} onClick={() => window.open(`mailto:${c.email}`, '_self')}>
                      Email
                    </Button>
                  )}
                  {c.phone && (
                    <Button size="xs" variant="ghost" icon={<Phone />} onClick={() => window.open(`tel:${c.phone}`, '_self')}>
                      Call
                    </Button>
                  )}
                  <button
                    onClick={async () => {
                      await db.contacts.update(c.id, { lastContacted: isoDate(), relationship: c.relationship === 'cold' ? 'warm' : c.relationship })
                      toast.success('Logged', `You were in touch with ${c.name} today.`)
                    }}
                    className="ml-auto flex items-center gap-1.5 text-[11.5px] text-faint hover:text-fg"
                    title="Log that you were in touch today"
                  >
                    <CalendarCheck className="size-3.5" />
                    {c.lastContacted ? `In touch ${timeAgo(new Date(c.lastContacted).getTime())}` : 'Log contact'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="rounded-3xl border border-dashed border-white/[0.08] p-8 text-center text-sm text-muted">
          {contacts.length ? 'No contacts match.' : 'Add the journalists and creators you work with.'}
        </p>
      )}
      {editing && <ContactModal key={editing.key} contact={editing.contact} onClose={() => setEditing(null)} />}
    </div>
  )
}
