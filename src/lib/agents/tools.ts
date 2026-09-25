import { addDays, format, parseISO } from 'date-fns'
import { db } from '../db'
import { searchBrain, getNote } from '../brain/search'
import { appendToDailyNote, saveNewNote } from '../brain/vault-fs'
import type { ToolCall, ToolOutcome, ToolSpec } from '../llm/types'
import { createEvent, createProject, createTask, eventsBetween, findAgentByName, findProject, findTask, logActivity, MINUTES_SAVED, updateTask } from '../ops'
import type { ActivityItem, Agent, AgentTool, Priority, ProjectStatus, Settings, TaskStatus } from '../types'
import { truncate, uid } from '../utils'

export interface ToolContext {
  agent: Agent
  settings: Settings
  depth: number
  signal?: AbortSignal
  report: (item: ActivityItem) => void
  delegateBudget: { remaining: number }
  runDelegate?: (teammate: Agent, task: string, context: string | undefined, activity: ActivityItem) => Promise<string>
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v))
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

function dateOnly(v: unknown): string | undefined {
  const s = str(v).trim()
  if (!s) return undefined
  const m = s.match(/^\d{4}-\d{2}-\d{2}/)
  return m ? m[0] : undefined
}

const PRIORITIES = ['low', 'medium', 'high']
const TASK_STATUSES = ['todo', 'doing', 'review', 'done']

function specsFor(user: string): Record<string, ToolSpec> {
  return {
    search_brain: {
      name: 'search_brain',
      description: `Search ${user}'s second brain (their Obsidian notes about clients, contacts, campaigns, meetings, ideas and the agency). Call this before answering anything about ${user}'s own clients, projects, people, history or preferences, and whenever internal context would make the answer better.`,
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Keywords to search for' },
          limit: { type: 'integer', description: 'How many results (default 6)' },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
    read_note: {
      name: 'read_note',
      description: 'Read the full text of a note from the brain. Use after search_brain when a result looks relevant.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Note path or title from search results' } },
        required: ['path'],
        additionalProperties: false,
      },
    },
    save_note: {
      name: 'save_note',
      description: `Save a new note into ${user}'s brain. Use when ${user} asks you to save, capture, file or document something, or to keep a finished deliverable such as a plan, brief or research summary. Existing notes are never overwritten.`,
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          content: { type: 'string', description: 'Markdown content. Use [[wikilinks]] to link related notes.' },
          folder: { type: 'string', description: 'Optional folder, e.g. "Meetings" or "Clients"' },
        },
        required: ['title', 'content'],
        additionalProperties: false,
      },
    },
    add_to_daily_note: {
      name: 'add_to_daily_note',
      description: `Append a short entry to ${user}'s daily note for today. Use for quick captures, reminders and meeting takeaways.`,
      parameters: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
        additionalProperties: false,
      },
    },
    list_projects: {
      name: 'list_projects',
      description: 'List projects with status, client, deadline and task progress. Use for questions about workload, priorities or a particular project.',
      parameters: {
        type: 'object',
        properties: { status: { type: 'string', enum: ['pitch', 'active', 'on_hold', 'done', 'all'] } },
        additionalProperties: false,
      },
    },
    list_tasks: {
      name: 'list_tasks',
      description: `List tasks on the board. Use to answer what is due, overdue or outstanding, for ${user} or for a teammate.`,
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Project name to filter by' },
          due_within_days: { type: 'integer', description: 'Only tasks due within this many days (overdue included)' },
          assignee: { type: 'string', description: `"me" for ${user}, or a teammate's name` },
          include_done: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
    create_project: {
      name: 'create_project',
      description: `Create a new project on the board. Use when ${user} describes a new client, campaign, pitch or piece of work that needs tracking.`,
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          client: { type: 'string' },
          description: { type: 'string' },
          due_date: { type: 'string', description: 'YYYY-MM-DD' },
          status: { type: 'string', enum: ['pitch', 'active', 'on_hold'] },
          priority: { type: 'string', enum: PRIORITIES },
        },
        required: ['name'],
        additionalProperties: false,
      },
    },
    create_task: {
      name: 'create_task',
      description: `Add a task to the board. Use whenever something needs doing. Assign it to ${user} with "me", or to a teammate by name when it is their speciality.`,
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          project: { type: 'string', description: 'Project name (optional)' },
          description: { type: 'string' },
          due_date: { type: 'string', description: 'YYYY-MM-DD' },
          priority: { type: 'string', enum: PRIORITIES },
          assignee: { type: 'string', description: `"me" or a teammate's name` },
        },
        required: ['title'],
        additionalProperties: false,
      },
    },
    update_task: {
      name: 'update_task',
      description: 'Update an existing task: mark it done, move it along, change its due date, priority or owner.',
      parameters: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'Task title or id' },
          status: { type: 'string', enum: TASK_STATUSES },
          due_date: { type: 'string', description: 'YYYY-MM-DD' },
          priority: { type: 'string', enum: PRIORITIES },
          assignee: { type: 'string' },
        },
        required: ['task'],
        additionalProperties: false,
      },
    },
    get_schedule: {
      name: 'get_schedule',
      description: `Get ${user}'s calendar between two dates. Use for anything about their day, week, availability or upcoming meetings.`,
      parameters: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'YYYY-MM-DD' },
          end_date: { type: 'string', description: 'YYYY-MM-DD (inclusive)' },
        },
        required: ['start_date', 'end_date'],
        additionalProperties: false,
      },
    },
    create_event: {
      name: 'create_event',
      description: `Add an event or time block to ${user}'s calendar. Use when asked to book, schedule, block out time or set a reminder at a time.`,
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          date: { type: 'string', description: 'YYYY-MM-DD' },
          start_time: { type: 'string', description: '24-hour HH:MM' },
          duration_minutes: { type: 'integer' },
          location: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['title', 'date', 'start_time'],
        additionalProperties: false,
      },
    },
    delegate_to_agent: {
      name: 'delegate_to_agent',
      description:
        'Hand a substantial piece of work to a specialist teammate and get their finished answer back. Use when the request needs expertise a teammate has (for example legal review, a press release, competitor research or campaign ideas). Do small things yourself. Include all the context they need. Call it several times in one go for independent pieces of work.',
      parameters: {
        type: 'object',
        properties: {
          teammate: { type: 'string', description: 'Teammate name' },
          task: { type: 'string', description: 'Exactly what you need back from them' },
          context: { type: 'string', description: 'Background, constraints and anything they need to know' },
        },
        required: ['teammate', 'task'],
        additionalProperties: false,
      },
    },
    create_deck: {
      name: 'create_deck',
      description: `Start a new slide deck in the Deck Studio. It is written in the background and appears in the Deck Studio when ready. Use when ${user} asks for a presentation, deck, slides or a pitch document.`,
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          brief: { type: 'string', description: 'What the deck is about, key messages and any facts to include' },
          audience: { type: 'string' },
          slide_count: { type: 'integer' },
        },
        required: ['title', 'brief'],
        additionalProperties: false,
      },
    },
    create_landing_page: {
      name: 'create_landing_page',
      description: `Start a new landing page in the Landing Page Studio. It is written and designed in the background. Use when ${user} asks for a landing page, microsite, launch page or web page.`,
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          purpose: { type: 'string', description: 'What the page is for and its key messages' },
          audience: { type: 'string' },
          call_to_action: { type: 'string' },
        },
        required: ['name', 'purpose'],
        additionalProperties: false,
      },
    },
    generate_image: {
      name: 'generate_image',
      description: `Create an image and save it to the Media Studio library. Use when ${user} asks for a picture, visual, illustration, mood image or social image.`,
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Detailed visual description' },
          style: { type: 'string', enum: ['photo', 'editorial', 'illustration', '3d', 'minimal', 'cinematic'] },
          shape: { type: 'string', enum: ['square', 'landscape', 'portrait'] },
        },
        required: ['prompt'],
        additionalProperties: false,
      },
    },
  }
}

const CAPABILITY_TOOLS: Record<AgentTool, string[]> = {
  brain: ['search_brain', 'read_note'],
  brain_write: ['save_note', 'add_to_daily_note'],
  projects: ['list_projects', 'list_tasks', 'create_project', 'create_task', 'update_task'],
  calendar: ['get_schedule', 'create_event'],
  delegate: ['delegate_to_agent'],
  studios: ['create_deck', 'create_landing_page', 'generate_image'],
  web: [],
}

const READ_ONLY = new Set(['search_brain', 'read_note', 'list_projects', 'list_tasks', 'get_schedule'])

export interface Toolkit {
  specs: ToolSpec[]
  run: (call: ToolCall) => Promise<ToolOutcome>
}

export function buildToolkit(ctx: ToolContext, opts: { readOnly?: boolean; allowDelegate?: boolean } = {}): Toolkit {
  const user = ctx.settings.userName.split(' ')[0] || 'the user'
  const all = specsFor(user)
  const names = new Set<string>()
  for (const cap of ctx.agent.tools) for (const n of CAPABILITY_TOOLS[cap] ?? []) names.add(n)
  if (!opts.allowDelegate || ctx.depth > 0) names.delete('delegate_to_agent')
  if (opts.readOnly) for (const n of [...names]) if (!READ_ONLY.has(n)) names.delete(n)
  const specs = [...names].map((n) => all[n]).filter(Boolean)
  return { specs, run: (call) => executeTool(call, ctx) }
}

function activity(kind: ActivityItem['kind'], label: string, extra: Partial<ActivityItem> = {}): ActivityItem {
  return { id: uid(), kind, label, status: 'running', ...extra }
}

async function executeTool(call: ToolCall, ctx: ToolContext): Promise<ToolOutcome> {
  const input = call.input
  const act = (kind: ActivityItem['kind'], label: string, extra?: Partial<ActivityItem>) => {
    const item = activity(kind, label, { id: call.id, ...extra })
    ctx.report(item)
    return item
  }
  const finish = (item: ActivityItem, patch: Partial<ActivityItem>) => ctx.report({ ...item, status: 'done', ...patch })

  switch (call.name) {
    case 'search_brain': {
      const query = str(input.query)
      const item = act('brain', `Searching your brain for “${truncate(query, 48)}”`)
      const hits = await searchBrain(query, Math.min(num(input.limit, 6), 12))
      finish(item, { detail: hits.length ? `${hits.length} notes found` : 'No matching notes', output: hits.map((h) => h.title).join(' · ') })
      if (!hits.length) return { content: 'No matching notes found in the brain.' }
      return { content: JSON.stringify(hits.map((h) => ({ path: h.path, title: h.title, folder: h.folder, tags: h.tags, snippet: h.snippet }))) }
    }
    case 'read_note': {
      const path = str(input.path)
      const item = act('brain', `Reading “${truncate(path.replace(/\.md$/i, ''), 48)}”`)
      const note = await getNote(path)
      if (!note) {
        finish(item, { status: 'error', detail: 'Note not found' })
        return { content: `No note found at "${path}". Use search_brain to find the right path.`, isError: true }
      }
      finish(item, { detail: `${note.words} words`, link: `/brain?note=${encodeURIComponent(note.path)}` })
      return { content: `# ${note.title}\nPath: ${note.path}\n\n${truncate(note.content, 14000)}` }
    }
    case 'save_note': {
      const title = str(input.title)
      const folder = str(input.folder) || ctx.settings.brain.writeFolder
      const item = act('brain', `Saving note “${truncate(title, 48)}”`)
      const res = await saveNewNote(folder, title, str(input.content))
      finish(item, { detail: res.savedToDisk ? 'Saved to your Obsidian vault' : 'Saved to your brain', link: `/brain?note=${encodeURIComponent(res.path)}` })
      void logActivity('note', `${ctx.agent.name} saved “${title}” to your brain`, { agentId: ctx.agent.id, minutesSaved: MINUTES_SAVED.note })
      return { content: `Saved as ${res.path}${res.savedToDisk ? ' in the Obsidian vault' : ''}.` }
    }
    case 'add_to_daily_note': {
      const item = act('brain', 'Adding to today’s daily note')
      const res = await appendToDailyNote(ctx.settings.brain.dailyFolder, `- ${str(input.text)}`)
      finish(item, { link: `/brain?note=${encodeURIComponent(res.path)}` })
      return { content: `Added to ${res.path}.` }
    }
    case 'list_projects': {
      const status = str(input.status) || 'all'
      const item = act('tool', 'Checking your projects')
      const projects = (await db.projects.toArray()).filter((p) => status === 'all' || p.status === status)
      const tasks = await db.tasks.toArray()
      const rows = projects.map((p) => {
        const pt = tasks.filter((t) => t.projectId === p.id)
        const done = pt.filter((t) => t.status === 'done').length
        return { id: p.id, name: p.name, client: p.client, status: p.status, priority: p.priority, due: p.dueDate, tasks_done: done, tasks_total: pt.length }
      })
      finish(item, { detail: `${rows.length} projects` })
      return { content: JSON.stringify(rows) }
    }
    case 'list_tasks': {
      const item = act('tool', 'Checking the task board')
      let tasks = await db.tasks.toArray()
      const projectName = str(input.project)
      if (projectName) {
        const p = await findProject(projectName)
        tasks = p ? tasks.filter((t) => t.projectId === p.id) : []
      }
      if (!input.include_done) tasks = tasks.filter((t) => t.status !== 'done')
      const within = typeof input.due_within_days === 'number' ? input.due_within_days : undefined
      if (within !== undefined) {
        const limit = format(addDays(new Date(), within), 'yyyy-MM-dd')
        tasks = tasks.filter((t) => t.dueDate && t.dueDate <= limit)
      }
      const who = str(input.assignee).toLowerCase()
      const agents = await db.agents.toArray()
      if (who) {
        const target = who === 'me' ? 'me' : agents.find((a) => a.name.toLowerCase() === who)?.id
        tasks = tasks.filter((t) => t.assigneeId === target)
      }
      const projects = await db.projects.toArray()
      const rows = tasks
        .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
        .slice(0, 60)
        .map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          due: t.dueDate,
          project: projects.find((p) => p.id === t.projectId)?.name,
          owner: t.assigneeId === 'me' ? 'me' : agents.find((a) => a.id === t.assigneeId)?.name,
        }))
      finish(item, { detail: `${rows.length} tasks` })
      return { content: JSON.stringify(rows) }
    }
    case 'create_project': {
      const name = str(input.name)
      const item = act('tool', `Creating project “${truncate(name, 40)}”`)
      const status = (['pitch', 'active', 'on_hold'].includes(str(input.status)) ? str(input.status) : 'active') as ProjectStatus
      const p = await createProject({
        name,
        client: str(input.client) || undefined,
        description: str(input.description) || undefined,
        dueDate: dateOnly(input.due_date),
        status,
        priority: (PRIORITIES.includes(str(input.priority)) ? str(input.priority) : 'medium') as Priority,
        squad: [ctx.agent.id],
      })
      finish(item, { detail: 'Added to Projects', link: `/projects/${p.id}` })
      void logActivity('task', `${ctx.agent.name} created project “${p.name}”`, { agentId: ctx.agent.id, minutesSaved: 5, link: `/projects/${p.id}` })
      return { content: `Created project "${p.name}" (id ${p.id}).` }
    }
    case 'create_task': {
      const title = str(input.title)
      const item = act('tool', `Adding task “${truncate(title, 44)}”`)
      const project = str(input.project) ? await findProject(str(input.project)) : undefined
      let assigneeId = 'me'
      const who = str(input.assignee).trim()
      if (who && who.toLowerCase() !== 'me') {
        const a = await findAgentByName(who)
        if (a) assigneeId = a.id
      }
      const task = await createTask({
        title,
        projectId: project?.id,
        description: str(input.description) || undefined,
        dueDate: dateOnly(input.due_date),
        priority: (PRIORITIES.includes(str(input.priority)) ? str(input.priority) : 'medium') as Priority,
        assigneeId,
        source: ctx.agent.name,
      })
      finish(item, { detail: project ? `On ${project.name}` : 'Added to your tasks', link: project ? `/projects/${project.id}` : '/projects' })
      return { content: `Created task "${task.title}"${project ? ` in project ${project.name}` : ''}${task.dueDate ? `, due ${task.dueDate}` : ''}.` }
    }
    case 'update_task': {
      const item = act('tool', `Updating task “${truncate(str(input.task), 40)}”`)
      const task = await findTask(str(input.task))
      if (!task) {
        finish(item, { status: 'error', detail: 'Task not found' })
        return { content: 'No task found with that title or id. Use list_tasks to find it.', isError: true }
      }
      const patch: Record<string, unknown> = {}
      if (TASK_STATUSES.includes(str(input.status))) patch.status = str(input.status) as TaskStatus
      if (dateOnly(input.due_date)) patch.dueDate = dateOnly(input.due_date)
      if (PRIORITIES.includes(str(input.priority))) patch.priority = str(input.priority)
      if (str(input.assignee)) {
        const who = str(input.assignee)
        if (who.toLowerCase() === 'me') patch.assigneeId = 'me'
        else {
          const a = await findAgentByName(who)
          if (a) patch.assigneeId = a.id
        }
      }
      await updateTask(task.id, patch)
      finish(item, { detail: Object.keys(patch).join(', ') || 'No changes', link: task.projectId ? `/projects/${task.projectId}` : '/projects' })
      return { content: `Updated "${task.title}".` }
    }
    case 'get_schedule': {
      const start = dateOnly(input.start_date) ?? format(new Date(), 'yyyy-MM-dd')
      const end = dateOnly(input.end_date) ?? start
      const item = act('tool', start === end ? `Checking your calendar for ${start}` : `Checking your calendar ${start} → ${end}`)
      const events = await eventsBetween(parseISO(start + 'T00:00:00'), addDays(parseISO(end + 'T00:00:00'), 1))
      finish(item, { detail: `${events.length} events`, link: '/calendar' })
      return {
        content: JSON.stringify(
          events.map((e) => ({
            title: e.title,
            start: e.allDay ? e.start.slice(0, 10) : format(new Date(e.start), 'yyyy-MM-dd HH:mm'),
            end: e.allDay ? undefined : format(new Date(e.end), 'HH:mm'),
            all_day: e.allDay || undefined,
            location: e.location,
            notes: e.description ? truncate(e.description, 200) : undefined,
          })),
        ),
      }
    }
    case 'create_event': {
      const title = str(input.title)
      const date = dateOnly(input.date)
      const time = str(input.start_time).match(/^(\d{1,2}):(\d{2})/)
      if (!date || !time) return { content: 'Please provide date as YYYY-MM-DD and start_time as HH:MM.', isError: true }
      const item = act('tool', `Booking “${truncate(title, 40)}”`)
      const start = new Date(`${date}T${time[1].padStart(2, '0')}:${time[2]}:00`)
      const minutes = Math.max(5, Math.min(num(input.duration_minutes, 60), 24 * 60))
      const ev = await createEvent({
        title,
        start: start.toISOString(),
        end: new Date(start.getTime() + minutes * 60_000).toISOString(),
        location: str(input.location) || undefined,
        description: str(input.notes) || undefined,
      })
      finish(item, { detail: format(start, 'EEE d MMM, HH:mm'), link: `/calendar?date=${date}` })
      return { content: `Added "${ev.title}" on ${format(start, 'EEEE d MMMM')} at ${format(start, 'HH:mm')} for ${minutes} minutes.` }
    }
    case 'delegate_to_agent': {
      const name = str(input.teammate)
      const teammate = await findAgentByName(name)
      if (!teammate || teammate.id === ctx.agent.id) {
        const agents = await db.agents.toArray()
        return {
          content: `No teammate called "${name}". Available: ${agents
            .filter((a) => a.id !== ctx.agent.id)
            .map((a) => a.name)
            .join(', ')}.`,
          isError: true,
        }
      }
      if (ctx.delegateBudget.remaining <= 0 || !ctx.runDelegate) {
        return { content: 'Delegation limit reached for this request. Finish the work yourself.', isError: true }
      }
      ctx.delegateBudget.remaining--
      const item = activity('delegate', `Asked ${teammate.name}`, { id: call.id, agentId: teammate.id, detail: truncate(str(input.task), 120), output: '' })
      ctx.report(item)
      const answer = await ctx.runDelegate(teammate, str(input.task), str(input.context) || undefined, item)
      void logActivity('delegation', `${ctx.agent.name} handed work to ${teammate.name}`, { agentId: teammate.id, minutesSaved: MINUTES_SAVED.delegation })
      return { content: `${teammate.name} replied:\n\n${truncate(answer, 12000)}` }
    }
    case 'create_deck': {
      const title = str(input.title)
      const item = act('tool', `Starting deck “${truncate(title, 40)}”`)
      const { startDeckFromBrief } = await import('../decks/generate')
      const deck = await startDeckFromBrief({
        title,
        topic: str(input.brief),
        audience: str(input.audience),
        slideCount: Math.min(Math.max(num(input.slide_count, 10), 4), 20),
        agentId: ctx.agent.id,
      })
      finish(item, { detail: 'Being written in Deck Studio', link: `/decks/${deck.id}` })
      return { content: `Deck "${title}" has been started and is being written now. It will appear in the Deck Studio in a minute or two.` }
    }
    case 'create_landing_page': {
      const name = str(input.name)
      const item = act('tool', `Starting landing page “${truncate(name, 40)}”`)
      const { startSiteFromBrief } = await import('../sites/generate')
      const site = await startSiteFromBrief({
        name,
        purpose: str(input.purpose),
        audience: str(input.audience),
        cta: str(input.call_to_action),
        agentId: ctx.agent.id,
      })
      finish(item, { detail: 'Being designed in Landing Page Studio', link: `/sites/${site.id}` })
      return { content: `Landing page "${name}" has been started and is being designed now. It will appear in the Landing Page Studio shortly.` }
    }
    case 'generate_image': {
      const prompt = str(input.prompt)
      const item = act('tool', `Creating an image: “${truncate(prompt, 40)}”`)
      const { generateAndSaveImage } = await import('../media/generate')
      const shape = str(input.shape)
      const media = await generateAndSaveImage({
        prompt,
        styleId: str(input.style) || 'photo',
        aspectId: shape === 'landscape' ? 'landscape' : shape === 'portrait' ? 'portrait' : 'square',
        signal: ctx.signal,
      })
      finish(item, { detail: 'Saved to Media Studio', link: `/media?item=${media.id}` })
      return { content: `Image created and saved to the Media Studio library as "${media.title}".` }
    }
    default:
      return { content: `Unknown tool ${call.name}`, isError: true }
  }
}
