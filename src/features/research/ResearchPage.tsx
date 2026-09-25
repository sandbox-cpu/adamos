import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { ArrowLeft, Brain, CircleStop, Copy, ExternalLink, FlaskConical, Globe, Presentation, RotateCcw, Search, Sparkles, Trash2, TriangleAlert } from 'lucide-react'
import { db } from '../../lib/db'
import { researchLiveKey, runResearch, saveResearchToBrain, startResearch } from '../../lib/research/run'
import { RESEARCH_TEMPLATES, templateById, type ResearchTemplate } from '../../lib/research/templates'
import { startDeckFromBrief } from '../../lib/decks/generate'
import type { Agent, ResearchReport } from '../../lib/types'
import { cn, copyText, errorMessage, hexToRgba, mixHex, timeAgo } from '../../lib/utils'
import { useLive } from '../../stores/live'
import { useAgents, useProjects, useResearch } from '../../hooks/data'
import { AgentAvatar } from '../../components/agents/AgentAvatar'
import { ActivityList } from '../../components/chat/Activity'
import { PageHeader } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/bits'
import { Field, Input, Select, Textarea } from '../../components/ui/Field'
import { Icon } from '../../components/ui/Icon'
import { Markdown } from '../../components/ui/Markdown'
import { Modal } from '../../components/ui/Modal'
import { toast } from '../../components/ui/Toast'

type Depth = 'quick' | 'balanced' | 'deep'

const DEPTHS: { id: Depth; label: string; hint: string }[] = [
  { id: 'quick', label: 'Quick', hint: 'A fast scan' },
  { id: 'balanced', label: 'Thorough', hint: 'Recommended' },
  { id: 'deep', label: 'Deep dive', hint: 'Takes longer' },
]

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Picks the specialist whose role suits the template, falling back to anyone on duty. */
function defaultAgent(template: ResearchTemplate, agents: Agent[]): Agent | undefined {
  const active = agents.filter((a) => a.status === 'active')
  return active.find((a) => a.roleId === template.roleId) ?? active.find((a) => a.roleId === 'research' || a.roleId === 'competitor') ?? active[0]
}

/* ------------------------------------------------------------------ */
/*  Brief                                                              */
/* ------------------------------------------------------------------ */

function BriefModal({ template, initialSubject, onClose }: { template: ResearchTemplate; initialSubject?: string; onClose: () => void }) {
  const navigate = useNavigate()
  const agents = useAgents()
  const projects = useProjects()
  const [subject, setSubject] = useState(initialSubject ?? '')
  const [context, setContext] = useState('')
  const [projectId, setProjectId] = useState('')
  const [depth, setDepth] = useState<Depth>('balanced')
  const [agentId, setAgentId] = useState(defaultAgent(template, agents)?.id ?? '')
  const [starting, setStarting] = useState(false)
  const team = agents.filter((a) => a.status === 'active')

  const start = async () => {
    if (!subject.trim()) return
    setStarting(true)
    try {
      const r = await startResearch({
        templateId: template.id,
        subject: subject.trim(),
        context: context.trim() || undefined,
        projectId: projectId || undefined,
        agentId: agentId || undefined,
        depth,
      })
      navigate(`/research/${r.id}`)
    } catch (err) {
      toast.error('Couldn’t start that research', errorMessage(err))
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
          <Button variant="primary" icon={<FlaskConical />} loading={starting} disabled={!subject.trim()} onClick={() => void start()}>
            Start researching
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label={template.subjectLabel}>
          <Input
            autoFocus
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={template.placeholder}
            className="h-12 text-[15px]"
            onKeyDown={(e) => e.key === 'Enter' && void start()}
          />
        </Field>
        <Field label="Anything they should know?" hint="optional">
          <Textarea
            rows={3}
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="e.g. It’s for a pitch to a premium coffee brand. Focus on the UK and the last 12 months."
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Who researches it">
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
          <Field label="How deep">
            <div className="grid grid-cols-3 gap-1.5">
              {DEPTHS.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDepth(d.id)}
                  className={cn(
                    'rounded-xl border px-2 py-2 text-center transition',
                    depth === d.id ? 'border-transparent bg-white text-ink-950' : 'border-white/[0.08] text-soft hover:border-white/[0.16]',
                  )}
                >
                  <div className="text-[12.5px] font-semibold">{d.label}</div>
                  <div className={cn('text-[10.5px]', depth === d.id ? 'text-ink-700' : 'text-faint')}>{d.hint}</div>
                </button>
              ))}
            </div>
          </Field>
        </div>
        {projects.length > 0 && (
          <Field label="Link to a project" hint="optional">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.client ? `${p.client} · ${p.name}` : p.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/*  Report                                                             */
/* ------------------------------------------------------------------ */

function Report({ report }: { report: ResearchReport }) {
  const navigate = useNavigate()
  const agents = useAgents()
  const agent = agents.find((a) => a.id === report.agentId)
  const template = templateById(report.templateId)
  const live = useLive((s) => s.messages[researchLiveKey(report.id)])
  const running = useLive((s) => !!s.running[researchLiveKey(report.id)])
  const content = report.status === 'running' ? (live?.text ?? '') : report.content
  const citations = report.status === 'running' ? (live?.citations ?? []) : report.citations
  const interrupted = report.status === 'running' && !running
  const [busy, setBusy] = useState<string | null>(null)

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    try {
      await fn()
    } catch (err) {
      toast.error('That didn’t work', errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/research')} className="flex items-center gap-1.5 text-[13px] text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Research Lab
      </button>
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <article className="min-w-0">
          <div className="glass rounded-[28px] p-6 md:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium"
                style={{ background: hexToRgba(template.color, 0.14), color: mixHex(template.color, '#ffffff', 0.4) }}
              >
                <Icon name={template.icon} className="size-3.5" /> {template.name}
              </span>
              {report.usedWeb && (
                <Badge tone="good">
                  <Globe className="size-3" /> Live sources
                </Badge>
              )}
              {report.status === 'error' && <Badge tone="bad">Didn’t finish</Badge>}
            </div>
            <h1 className="mt-4 font-display text-3xl leading-tight font-semibold tracking-tight md:text-4xl">{report.title}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-[13px] text-muted">
              {agent && (
                <span className="flex items-center gap-2">
                  <AgentAvatar agent={agent} size="xs" active={running} /> {agent.name}
                </span>
              )}
              <span>{format(report.createdAt, 'd MMMM yyyy, HH:mm')}</span>
              {citations.length > 0 && <span>{citations.length} sources</span>}
            </div>
            <div className="mt-6 flex flex-wrap gap-2 border-t border-white/[0.06] pt-5">
              {running ? (
                <Button variant="secondary" icon={<CircleStop />} onClick={() => useLive.getState().stop(researchLiveKey(report.id))}>
                  Stop
                </Button>
              ) : (
                <>
                  <Button
                    variant="primary"
                    icon={<Presentation />}
                    loading={busy === 'deck'}
                    disabled={!content}
                    onClick={() =>
                      void act('deck', async () => {
                        const deck = await startDeckFromBrief({
                          title: report.subject,
                          topic: `A presentation of this research: ${report.title}`,
                          sources: content,
                          useWeb: false,
                          projectId: report.projectId,
                          agentId: report.agentId,
                        })
                        toast.success('Your deck is being made')
                        navigate(`/decks/${deck.id}`)
                      })
                    }
                  >
                    Make it a deck
                  </Button>
                  <Button
                    variant="secondary"
                    icon={<Brain />}
                    loading={busy === 'brain'}
                    disabled={!content}
                    onClick={() =>
                      void act('brain', async () => {
                        const path = await saveResearchToBrain(report.id)
                        if (path) toast.success('Saved to your brain', path)
                      })
                    }
                  >
                    Save to brain
                  </Button>
                  <Button
                    variant="ghost"
                    icon={<Copy />}
                    disabled={!content}
                    onClick={async () => {
                      await copyText(content + (citations.length ? `\n\nSources:\n${citations.map((c) => `- ${c.title ?? c.url}: ${c.url}`).join('\n')}` : ''))
                      toast.success('Report copied')
                    }}
                  >
                    Copy
                  </Button>
                  <Button
                    variant="ghost"
                    icon={<RotateCcw />}
                    onClick={() =>
                      void act('rerun', async () => {
                        await db.research.update(report.id, { status: 'running', content: '', citations: [], error: undefined, updatedAt: Date.now() })
                        void runResearch(report.id)
                      })
                    }
                  >
                    Run again
                  </Button>
                  <Button
                    variant="ghost"
                    icon={<Trash2 />}
                    className="text-bad hover:text-bad"
                    onClick={async () => {
                      if (!window.confirm('Delete this report?')) return
                      await db.research.delete(report.id)
                      navigate('/research')
                    }}
                  >
                    Delete
                  </Button>
                </>
              )}
            </div>
          </div>

          {report.error && (
            <div className="mt-5 flex gap-3 rounded-2xl border border-bad/25 bg-bad/[0.06] p-4 text-[13px]">
              <TriangleAlert className="size-4 shrink-0 text-bad" />
              <div>{report.error}</div>
            </div>
          )}
          {interrupted && <p className="mt-5 text-center text-[13px] text-muted">This research was interrupted. Run it again to finish it.</p>}

          <div className="mt-6 rounded-[28px] border border-white/[0.06] bg-white/[0.02] p-6 md:p-8">
            {running && live?.activities && live.activities.length > 0 && (
              <div className="mb-5">
                <ActivityList items={live.activities} agents={agents} />
              </div>
            )}
            {content ? (
              <Markdown className={cn('text-[15px]', running && 'caret-live')}>{content}</Markdown>
            ) : running ? (
              <div className="space-y-3 py-6">
                <p className="text-sm text-muted">{agent?.name ?? 'Your researcher'} is reading up on it…</p>
                {[92, 80, 86, 64, 74].map((w, i) => (
                  <div key={i} className="skeleton h-3.5 rounded" style={{ width: `${w}%` }} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No report yet.</p>
            )}
          </div>
        </article>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <div className="glass rounded-3xl p-5">
            <h3 className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Sources · {citations.length}</h3>
            {citations.length ? (
              <div className="space-y-1.5">
                {citations.map((c, i) => (
                  <a
                    key={c.url}
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start gap-3 rounded-2xl px-2.5 py-2 transition hover:bg-white/[0.04]"
                  >
                    <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-[11px] font-semibold text-soft">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[13px] text-soft group-hover:text-fg">{c.title ?? domainOf(c.url)}</span>
                      <span className="flex items-center gap-1 text-[11.5px] text-faint">
                        {domainOf(c.url)} <ExternalLink className="size-3" />
                      </span>
                    </span>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted">
                {running ? 'Sources appear here as they’re found.' : 'This report didn’t use live sources. Connect Claude or Gemini with web research for cited reports.'}
              </p>
            )}
          </div>
          {report.context && (
            <div className="glass rounded-3xl p-5">
              <h3 className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Your brief</h3>
              <p className="text-[13px] whitespace-pre-wrap text-soft">{report.context}</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function ResearchPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const reports = useResearch()
  const agents = useAgents()
  const report = useLiveQuery(() => (id ? db.research.get(id) : undefined), [id])
  const [brief, setBrief] = useState<{ template: ResearchTemplate; subject?: string } | null>(null)
  const [question, setQuestion] = useState('')
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    if (!id) return
    let cancelled = false
    void db.research.get(id).then((r) => {
      if (!cancelled && !r) navigate('/research', { replace: true })
    })
    return () => {
      cancelled = true
    }
  }, [id, navigate])

  const visible = useMemo(() => reports.filter((r) => filter === 'all' || r.templateId === filter), [reports, filter])
  const usedTemplates = useMemo(() => [...new Set(reports.map((r) => r.templateId))], [reports])

  if (id) return report ? <Report key={report.id} report={report} /> : null

  const ask = templateById('question')
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Studios" title="Research Lab" subtitle="Ask for any research and your specialists go and find it, with sources you can check." />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (question.trim()) setBrief({ template: ask, subject: question.trim() })
        }}
        className="glass relative overflow-hidden rounded-[28px] p-2"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_140%_at_0%_0%,color-mix(in_oklab,var(--accent)_16%,transparent),transparent_60%)]" />
        <div className="relative flex items-center gap-3 rounded-[22px] bg-black/20 py-2 pr-2 pl-5">
          <Search className="size-5 shrink-0 text-[var(--accent)]" />
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What do you want to know? e.g. What are UK consumers saying about sustainable coffee?"
            className="h-12 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint"
          />
          <Button type="submit" variant="primary" size="lg" icon={<Sparkles />} disabled={!question.trim()}>
            Research it
          </Button>
        </div>
      </form>

      <section>
        <h2 className="mb-3 text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">Or pick a type of research</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {RESEARCH_TEMPLATES.filter((t) => t.id !== 'question').map((t) => {
            const who = defaultAgent(t, agents)
            return (
              <button
                key={t.id}
                onClick={() => setBrief({ template: t })}
                className="group relative flex flex-col gap-3 overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.025] p-5 text-left transition hover:-translate-y-0.5 hover:border-white/[0.14] hover:bg-white/[0.045]"
              >
                <div
                  className="pointer-events-none absolute -top-10 -right-10 size-32 rounded-full opacity-0 blur-2xl transition group-hover:opacity-40"
                  style={{ background: t.color }}
                />
                <div className="flex items-center justify-between">
                  <span className="grid size-10 place-items-center rounded-2xl" style={{ background: hexToRgba(t.color, 0.16), color: mixHex(t.color, '#ffffff', 0.35) }}>
                    <Icon name={t.icon} className="size-5" />
                  </span>
                  {who && <AgentAvatar agent={who} size="xs" />}
                </div>
                <div>
                  <div className="font-semibold">{t.name}</div>
                  <p className="mt-1 text-[13px] leading-snug text-muted">{t.description}</p>
                </div>
                <div className="mt-auto text-[11.5px] text-faint">
                  Saves about {t.minutes >= 60 ? `${Math.round(t.minutes / 60)} hour${Math.round(t.minutes / 60) === 1 ? '' : 's'}` : `${t.minutes} minutes`}
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">Your reports · {reports.length}</h2>
          {usedTemplates.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {['all', ...usedTemplates].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'h-7 shrink-0 rounded-full border px-3 text-[12px] transition',
                    filter === f ? 'border-transparent bg-white text-ink-950' : 'border-white/[0.08] text-muted hover:text-fg',
                  )}
                >
                  {f === 'all' ? 'All' : templateById(f).name}
                </button>
              ))}
            </div>
          )}
        </div>
        {visible.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {visible.map((r) => {
              const t = templateById(r.templateId)
              const a = agents.find((x) => x.id === r.agentId)
              return (
                <button
                  key={r.id}
                  onClick={() => navigate(`/research/${r.id}`)}
                  className="flex gap-4 rounded-3xl border border-white/[0.06] bg-white/[0.02] p-4 text-left transition hover:border-white/[0.14] hover:bg-white/[0.04]"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl" style={{ background: hexToRgba(t.color, 0.14), color: mixHex(t.color, '#ffffff', 0.35) }}>
                    <Icon name={t.icon} className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-1 text-[14px] font-medium">{r.title}</div>
                    <div className="mt-0.5 line-clamp-2 text-[12.5px] text-muted">
                      {r.content
                        .replace(/[#>*_[\]()]/g, '')
                        .replace(/\s+/g, ' ')
                        .slice(0, 160) || (r.status === 'running' ? 'In progress…' : '')}
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[11.5px] text-faint">
                      {a && (
                        <span className="flex items-center gap-1.5">
                          <AgentAvatar agent={a} size="xs" /> {a.name}
                        </span>
                      )}
                      <span>{timeAgo(r.updatedAt)}</span>
                      {r.citations.length > 0 && <span>{r.citations.length} sources</span>}
                      {r.status === 'running' && <Badge tone="accent">Researching</Badge>}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <p className="rounded-3xl border border-dashed border-white/[0.08] p-8 text-center text-sm text-muted">Your research will be kept here.</p>
        )}
      </section>

      {brief && <BriefModal key={brief.template.id + (brief.subject ?? '')} template={brief.template} initialSubject={brief.subject} onClose={() => setBrief(null)} />}
    </div>
  )
}
