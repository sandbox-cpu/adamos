import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Brain, CircleStop, Copy, Download, Mail, Pencil, Share2, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { db } from '../../lib/db'
import { contentLiveKey, startContent, writeContent } from '../../lib/press/generate'
import { CONTENT_TEMPLATES, contentTemplate, type ContentTemplate } from '../../lib/press/templates'
import { saveNewNote } from '../../lib/brain/vault-fs'
import type { ContentPiece } from '../../lib/types'
import { cn, copyText, downloadText, errorMessage, hexToRgba, mixHex, safeFileName, timeAgo } from '../../lib/utils'
import { useLive } from '../../stores/live'
import { useSettings } from '../../stores/settings'
import { useAgents, useContent, useProjects } from '../../hooks/data'
import { useDraftField } from '../../hooks/useDraftField'
import { AgentAvatar } from '../../components/agents/AgentAvatar'
import { ActivityList } from '../../components/chat/Activity'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/bits'
import { Field, Input, Select, Textarea, Toggle } from '../../components/ui/Field'
import { Icon } from '../../components/ui/Icon'
import { Markdown } from '../../components/ui/Markdown'
import { Modal } from '../../components/ui/Modal'
import { toast } from '../../components/ui/Toast'

const REWRITES = ['Make it shorter', 'More formal', 'Warmer and more human', 'Stronger headline', 'Add three email subject lines', 'Turn it into a LinkedIn post']

/** Markdown to plain text for pasting into email and other apps. */
export function toPlainText(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*]\s+/gm, '• ')
    .trim()
}

/* ------------------------------------------------------------------ */
/*  Brief                                                              */
/* ------------------------------------------------------------------ */

export function BriefModal({
  template,
  prefill,
  onClose,
  onStarted,
}: {
  template: ContentTemplate
  prefill?: Record<string, string>
  onClose: () => void
  onStarted: (piece: ContentPiece) => void
}) {
  const agents = useAgents()
  const projects = useProjects()
  const team = agents.filter((a) => a.status === 'active')
  const [brief, setBrief] = useState<Record<string, string>>(prefill ?? {})
  const [agentId, setAgentId] = useState(team.find((a) => a.roleId === template.roleId)?.id ?? team.find((a) => a.roleId === 'copywriter')?.id ?? team[0]?.id ?? '')
  const [projectId, setProjectId] = useState('')
  const [useWeb, setUseWeb] = useState(false)
  const [starting, setStarting] = useState(false)
  const required = template.fields.filter((f) => !f.optional)
  const ready = required.every((f) => brief[f.key]?.trim())

  const start = async () => {
    setStarting(true)
    try {
      const piece = await startContent({ kind: template.kind, brief, agentId: agentId || undefined, projectId: projectId || undefined, useWeb })
      onStarted(piece)
    } catch (err) {
      toast.error('Couldn’t start writing', errorMessage(err))
      setStarting(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon={<Icon name={template.icon} />}
      title={template.name}
      subtitle={template.description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Wand2 />} loading={starting} disabled={!ready} onClick={() => void start()}>
            Write it
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {template.fields.map((f, i) => (
          <Field key={f.key} label={f.label} hint={f.optional ? 'optional' : undefined}>
            {f.multiline ? (
              <Textarea autoFocus={i === 0} rows={3} value={brief[f.key] ?? ''} onChange={(e) => setBrief({ ...brief, [f.key]: e.target.value })} placeholder={f.placeholder} />
            ) : (
              <Input autoFocus={i === 0} value={brief[f.key] ?? ''} onChange={(e) => setBrief({ ...brief, [f.key]: e.target.value })} placeholder={f.placeholder} />
            )}
          </Field>
        ))}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Who writes it">
            <div className="flex flex-wrap gap-1.5">
              {team.slice(0, 8).map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAgentId(a.id)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-0.5 text-[12px] transition',
                    agentId === a.id ? 'border-transparent bg-white/[0.1] text-fg' : 'border-white/[0.08] text-muted hover:text-fg',
                  )}
                  style={agentId === a.id ? { boxShadow: `inset 0 0 0 1.5px ${a.color}` } : undefined}
                >
                  <AgentAvatar agent={a} size="xs" /> {a.name}
                </button>
              ))}
            </div>
          </Field>
          {projects.length > 0 && (
            <Field label="Project" hint="optional">
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
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
          <Toggle
            checked={useWeb}
            onChange={setUseWeb}
            label="Check the latest news first"
            description="Researches current facts online before writing, when your AI supports it."
          />
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/*  Document                                                           */
/* ------------------------------------------------------------------ */

function DocView({ piece, onBack, onNew }: { piece: ContentPiece; onBack: () => void; onNew: (template: ContentTemplate, prefill: Record<string, string>) => void }) {
  const agents = useAgents()
  const settings = useSettings((s) => s.settings)
  const tpl = contentTemplate(piece.kind)
  const agent = agents.find((a) => a.id === piece.agentId)
  const live = useLive((s) => s.messages[contentLiveKey(piece.id)])
  const running = useLive((s) => !!s.running[contentLiveKey(piece.id)])
  const [editing, setEditing] = useState(false)
  const [ask, setAsk] = useState('')
  const [content, setContent] = useDraftField(piece.content, (v) => void db.content.update(piece.id, { content: v, updatedAt: Date.now() }))
  const text = running ? (live?.text ?? '') : piece.content

  const rewrite = (instruction: string) => {
    if (!instruction.trim()) return
    setEditing(false)
    void writeContent(piece.id, instruction.trim())
    setAsk('')
  }

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> All documents
      </button>
      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          <div className="glass flex flex-wrap items-center gap-3 rounded-3xl px-5 py-4">
            <span className="grid size-10 place-items-center rounded-2xl" style={{ background: hexToRgba(tpl.color, 0.16), color: mixHex(tpl.color, '#ffffff', 0.35) }}>
              <Icon name={tpl.icon} className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{piece.title}</div>
              <div className="flex items-center gap-2 text-[12px] text-muted">
                {tpl.name}
                {agent && (
                  <>
                    · <AgentAvatar agent={agent} size="xs" active={running} /> {agent.name}
                  </>
                )}
                · {timeAgo(piece.updatedAt)}
              </div>
            </div>
            {running ? (
              <Button size="sm" variant="secondary" icon={<CircleStop />} onClick={() => useLive.getState().stop(contentLiveKey(piece.id))}>
                Stop
              </Button>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant={editing ? 'primary' : 'secondary'} icon={<Pencil />} onClick={() => setEditing((v) => !v)}>
                  {editing ? 'Done' : 'Edit'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Copy />}
                  onClick={async () => {
                    await copyText(toPlainText(piece.content))
                    toast.success('Copied', 'Ready to paste into an email or document.')
                  }}
                >
                  Copy
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Mail />}
                  onClick={() => window.open(`mailto:?subject=${encodeURIComponent(piece.title)}&body=${encodeURIComponent(toPlainText(piece.content).slice(0, 1800))}`, '_self')}
                >
                  Email
                </Button>
                <Button size="sm" variant="ghost" icon={<Download />} onClick={() => downloadText(toPlainText(piece.content), `${safeFileName(piece.title)}.txt`)}>
                  Download
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Brain />}
                  onClick={async () => {
                    const r = await saveNewNote(`${settings.brain.writeFolder}/Press`, piece.title, piece.content)
                    toast.success('Saved to your brain', r.path)
                  }}
                >
                  Save
                </Button>
              </div>
            )}
          </div>
          <div className="rounded-[28px] border border-white/[0.06] bg-white/[0.02] p-6 md:p-10">
            {running && live?.activities && live.activities.length > 0 && (
              <div className="mb-5">
                <ActivityList items={live.activities} agents={agents} />
              </div>
            )}
            {editing ? (
              <Textarea
                autoFocus
                autoGrow
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[50vh] border-0 bg-transparent p-0 text-[14.5px] leading-relaxed focus:ring-0"
              />
            ) : text ? (
              <Markdown className={cn('mx-auto max-w-2xl text-[15px]', running && 'caret-live')}>{text}</Markdown>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted">{agent?.name ?? 'Your writer'} is drafting…</p>
                {[90, 75, 84, 60].map((w, i) => (
                  <div key={i} className="skeleton h-3.5 rounded" style={{ width: `${w}%` }} />
                ))}
              </div>
            )}
            {piece.status === 'error' && piece.error && <p className="mt-4 text-sm text-bad">{piece.error}</p>}
          </div>
        </div>
        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <div className="glass space-y-3 rounded-3xl p-5">
            <h3 className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">
              <Sparkles className="size-3.5 text-[var(--accent)]" /> Ask for changes
            </h3>
            <Textarea
              rows={3}
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              placeholder="e.g. Lead with the pop-up event and cut the second quote"
              className="text-[13px]"
            />
            <div className="flex flex-wrap gap-1.5">
              {REWRITES.map((r) => (
                <button
                  key={r}
                  onClick={() => rewrite(r)}
                  disabled={running}
                  className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[11.5px] text-muted hover:border-white/[0.16] hover:text-fg disabled:opacity-40"
                >
                  {r}
                </button>
              ))}
            </div>
            <Button size="sm" variant="primary" icon={<Wand2 />} className="w-full" disabled={!ask.trim() || running} onClick={() => rewrite(ask)}>
              Rewrite
            </Button>
          </div>
          <div className="glass space-y-2 rounded-3xl p-5">
            <h3 className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Make more from it</h3>
            {(['social', 'pitch', 'talking_points', 'qa'] as const)
              .filter((k) => k !== piece.kind)
              .map((k) => {
                const t = contentTemplate(k)
                return (
                  <button
                    key={k}
                    onClick={() => onNew(t, { [t.fields[0].key]: `Based on this ${tpl.name.toLowerCase()}:\n\n${toPlainText(piece.content).slice(0, 3000)}` })}
                    className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left text-[13px] text-soft transition hover:bg-white/[0.05] hover:text-fg"
                  >
                    <Icon name={t.icon} className="size-4 text-muted" />
                    {t.name}
                    <Share2 className="ml-auto size-3.5 text-faint" />
                  </button>
                )
              })}
          </div>
          <div className="glass rounded-3xl p-5">
            <h3 className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">The brief</h3>
            <dl className="space-y-2 text-[12.5px]">
              {tpl.fields
                .filter((f) => piece.brief[f.key]?.trim())
                .map((f) => (
                  <div key={f.key}>
                    <dt className="text-faint">{f.label}</dt>
                    <dd className="line-clamp-4 whitespace-pre-wrap text-soft">{piece.brief[f.key]}</dd>
                  </div>
                ))}
            </dl>
          </div>
          <Button
            variant="ghost"
            icon={<Trash2 />}
            className="w-full text-bad hover:text-bad"
            onClick={async () => {
              if (!window.confirm('Delete this document?')) return
              await db.content.delete(piece.id)
              onBack()
            }}
          >
            Delete document
          </Button>
        </aside>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Desk                                                               */
/* ------------------------------------------------------------------ */

export function WritingDesk({ docId, openDoc }: { docId?: string; openDoc: (id?: string) => void }) {
  const content = useContent()
  const agents = useAgents()
  const piece = useLiveQuery(() => (docId ? db.content.get(docId) : undefined), [docId])
  const [brief, setBrief] = useState<{ template: ContentTemplate; prefill?: Record<string, string> } | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const kinds = useMemo(() => [...new Set(content.map((c) => c.kind))], [content])

  if (docId && piece)
    return (
      <>
        <DocView key={piece.id} piece={piece} onBack={() => openDoc(undefined)} onNew={(template, prefill) => setBrief({ template, prefill })} />
        {brief && <BriefModal template={brief.template} prefill={brief.prefill} onClose={() => setBrief(null)} onStarted={(p) => (setBrief(null), openDoc(p.id))} />}
      </>
    )

  const visible = content.filter((c) => filter === 'all' || c.kind === filter)
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">What do you need written?</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {CONTENT_TEMPLATES.map((t) => (
            <button
              key={t.kind}
              onClick={() => setBrief({ template: t })}
              className="group relative flex items-start gap-3.5 overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.025] p-4 text-left transition hover:-translate-y-0.5 hover:border-white/[0.14] hover:bg-white/[0.045]"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl" style={{ background: hexToRgba(t.color, 0.16), color: mixHex(t.color, '#ffffff', 0.35) }}>
                <Icon name={t.icon} className="size-5" />
              </span>
              <span>
                <span className="block text-[14px] font-semibold">{t.name}</span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{t.description}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">Your documents · {content.length}</h2>
          {kinds.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {['all', ...kinds].map((k) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={cn(
                    'h-7 shrink-0 rounded-full border px-3 text-[12px] transition',
                    filter === k ? 'border-transparent bg-white text-ink-950' : 'border-white/[0.08] text-muted hover:text-fg',
                  )}
                >
                  {k === 'all' ? 'All' : contentTemplate(k as ContentPiece['kind']).name}
                </button>
              ))}
            </div>
          )}
        </div>
        {visible.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {visible.map((c) => {
              const t = contentTemplate(c.kind)
              const a = agents.find((x) => x.id === c.agentId)
              return (
                <button
                  key={c.id}
                  onClick={() => openDoc(c.id)}
                  className="flex gap-4 rounded-3xl border border-white/[0.06] bg-white/[0.02] p-4 text-left transition hover:border-white/[0.14] hover:bg-white/[0.04]"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl" style={{ background: hexToRgba(t.color, 0.14), color: mixHex(t.color, '#ffffff', 0.35) }}>
                    <Icon name={t.icon} className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-1 text-[14px] font-medium">{c.title}</div>
                    <div className="mt-0.5 line-clamp-2 text-[12.5px] text-muted">
                      {toPlainText(c.content).slice(0, 160) || (c.status === 'generating' ? 'Being written…' : '')}
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[11.5px] text-faint">
                      <span>{t.name}</span>
                      {a && (
                        <span className="flex items-center gap-1.5">
                          <AgentAvatar agent={a} size="xs" /> {a.name}
                        </span>
                      )}
                      <span>{timeAgo(c.updatedAt)}</span>
                      {c.status === 'generating' && <Badge tone="accent">Writing</Badge>}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <p className="rounded-3xl border border-dashed border-white/[0.08] p-8 text-center text-sm text-muted">Everything your team writes will be kept here.</p>
        )}
      </section>
      {brief && (
        <BriefModal key={brief.template.kind} template={brief.template} prefill={brief.prefill} onClose={() => setBrief(null)} onStarted={(p) => (setBrief(null), openDoc(p.id))} />
      )}
    </div>
  )
}
