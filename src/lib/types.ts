export type ID = string

/* ------------------------------------------------------------------ */
/*  AI providers & profiles                                            */
/* ------------------------------------------------------------------ */

export type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'groq' | 'mistral' | 'perplexity' | 'deepseek' | 'xai' | 'ollama' | 'custom'

/** How hard the model should think. Mapped to provider specific settings. */
export type Depth = 'quick' | 'balanced' | 'deep'

export interface AIProfile {
  id: ID
  name: string
  provider: ProviderId
  model: string
  /** Vault secret holding the API key (not needed for local providers). */
  keyId?: ID
  /** Only for custom / self-hosted providers. */
  baseUrl?: string
  depth: Depth
  /** 0..1, only used by providers that accept a sampling temperature. */
  creativity?: number
  maxTokens?: number
  /** Allow live web research when the provider supports it. */
  webSearch: boolean
  color: string
  isDefault?: boolean
  createdAt: number
  updatedAt: number
}

/* ------------------------------------------------------------------ */
/*  Agents & roles                                                     */
/* ------------------------------------------------------------------ */

export type AgentTool = 'web' | 'brain' | 'brain_write' | 'projects' | 'calendar' | 'delegate' | 'studios'

export type RoleCategory = 'Leadership' | 'Communications' | 'Strategy' | 'Creative' | 'Research' | 'Specialist' | 'Operations'

export interface Role {
  id: ID
  name: string
  category: RoleCategory
  tagline: string
  description: string
  /** lucide icon name */
  icon: string
  color: string
  prompt: string
  tools: AgentTool[]
  skills: string[]
  starters: string[]
  lead?: boolean
  custom?: boolean
  createdAt?: number
}

export interface Personality {
  /** 0 = relaxed, 100 = formal */
  formality: number
  /** 0 = brief, 100 = thorough */
  detail: number
  /** 0 = cautious, 100 = bold */
  boldness: number
}

export interface Agent {
  id: ID
  name: string
  roleId: ID
  title?: string
  color: string
  icon?: string
  personality: Personality
  instructions: string
  memory: string[]
  tools: AgentTool[]
  profileId?: ID
  status: 'active' | 'bench'
  isLead?: boolean
  order: number
  createdAt: number
  updatedAt: number
}

/* ------------------------------------------------------------------ */
/*  Projects & tasks                                                   */
/* ------------------------------------------------------------------ */

export type ProjectStatus = 'pitch' | 'active' | 'on_hold' | 'done'
export type Priority = 'low' | 'medium' | 'high'

export interface Project {
  id: ID
  name: string
  client?: string
  status: ProjectStatus
  priority: Priority
  color: string
  emoji?: string
  description?: string
  goals: string[]
  startDate?: string
  dueDate?: string
  budget?: string
  squad: ID[]
  notes: string[]
  createdAt: number
  updatedAt: number
  demo?: boolean
}

export type TaskStatus = 'todo' | 'doing' | 'review' | 'done'

export interface ChecklistItem {
  id: ID
  text: string
  done: boolean
}

export interface Task {
  id: ID
  projectId?: ID
  title: string
  description?: string
  status: TaskStatus
  priority: Priority
  dueDate?: string
  /** 'me' for the owner of the OS, otherwise an agent id */
  assigneeId?: ID
  order: number
  checklist: ChecklistItem[]
  /** Work produced by an agent for this task. */
  output?: string
  source?: string
  createdAt: number
  updatedAt: number
  completedAt?: number
  demo?: boolean
}

/* ------------------------------------------------------------------ */
/*  Conversations                                                      */
/* ------------------------------------------------------------------ */

export type ConversationKind = 'direct' | 'group' | 'lead'

export interface Conversation {
  id: ID
  kind: ConversationKind
  title: string
  agentIds: ID[]
  topic?: string
  projectId?: ID
  pinned?: boolean
  createdAt: number
  updatedAt: number
  preview?: string
}

export interface Citation {
  url: string
  title?: string
}

export interface ActivityItem {
  id: ID
  kind: 'tool' | 'delegate' | 'web' | 'brain' | 'status'
  label: string
  detail?: string
  status: 'running' | 'done' | 'error'
  agentId?: ID
  output?: string
  link?: string
}

export interface SummaryAction {
  title: string
  owner: string
  dueInDays: number
}

export interface Message {
  id: ID
  conversationId: ID
  role: 'user' | 'agent' | 'system'
  agentId?: ID
  content: string
  thinking?: string
  activities?: ActivityItem[]
  citations?: Citation[]
  notices?: string[]
  /** Structured actions extracted from a group discussion summary. */
  summary?: { actions: SummaryAction[]; added?: boolean }
  status: 'done' | 'streaming' | 'error'
  error?: string
  hint?: string
  createdAt: number
  demo?: boolean
}

/* ------------------------------------------------------------------ */
/*  Mastermind                                                         */
/* ------------------------------------------------------------------ */

export type MastermindPhase = 'setup' | 'opening' | 'challenge' | 'synthesis' | 'plan' | 'done' | 'error'

export interface Contribution {
  id: ID
  phase: 'opening' | 'challenge'
  agentId: ID
  content: string
  status: 'waiting' | 'streaming' | 'done' | 'error'
}

export interface PlanAction {
  id: ID
  title: string
  description: string
  owner: string
  workstream: string
  dueInDays: number
  priority: Priority
  taskId?: ID
}

export interface ActionPlan {
  title: string
  summary: string
  objectives: string[]
  workstreams: { name: string; owner: string; description: string }[]
  actions: PlanAction[]
  milestones: { title: string; dueInDays: number }[]
  risks: { risk: string; impact: Priority; mitigation: string }[]
  kpis: { metric: string; target: string }[]
  nextSteps: string[]
}

export interface MastermindSession {
  id: ID
  title: string
  objective: string
  context?: string
  projectId?: ID
  participantIds: ID[]
  leadId: ID
  depth: 'quick' | 'standard' | 'deep'
  phase: MastermindPhase
  contributions: Contribution[]
  synthesis?: string
  plan?: ActionPlan
  error?: string
  createdAt: number
  updatedAt: number
}

/* ------------------------------------------------------------------ */
/*  Research                                                           */
/* ------------------------------------------------------------------ */

export interface ResearchReport {
  id: ID
  title: string
  templateId: string
  subject: string
  context?: string
  agentId: ID
  content: string
  citations: Citation[]
  status: 'running' | 'done' | 'error'
  error?: string
  usedWeb: boolean
  projectId?: ID
  createdAt: number
  updatedAt: number
  demo?: boolean
}

/* ------------------------------------------------------------------ */
/*  Decks                                                              */
/* ------------------------------------------------------------------ */

export type SlideLayout = 'title' | 'section' | 'bullets' | 'two-column' | 'big-stat' | 'stats' | 'quote' | 'image' | 'timeline' | 'comparison' | 'chart' | 'agenda' | 'closing'

export interface SlideChart {
  kind: 'bar' | 'line' | 'donut'
  labels: string[]
  series: { name: string; values: number[] }[]
}

export interface Slide {
  id: ID
  layout: SlideLayout
  title: string
  subtitle?: string
  body?: string
  bullets?: string[]
  columns?: { heading: string; bullets: string[] }[]
  stats?: { value: string; label: string }[]
  quote?: { text: string; author?: string; role?: string }
  items?: { label: string; detail?: string }[]
  chart?: SlideChart
  image?: { mediaId?: string; url?: string; alt?: string }
  imagePrompt?: string
  notes?: string
}

export interface DeckBrief {
  topic: string
  audience: string
  goal: string
  keyMessages: string
  tone: string
  slideCount: number
  sources?: string
  useWeb: boolean
}

export interface BrandKit {
  primary: string
  secondary: string
  background?: string
  logo?: string
  font?: 'grotesk' | 'serif' | 'mono' | 'rounded'
}

export interface Deck {
  id: ID
  title: string
  brief: DeckBrief
  themeId: string
  brand?: BrandKit
  slides: Slide[]
  status: 'draft' | 'generating' | 'ready' | 'error'
  stage?: string
  error?: string
  research?: string
  agentId?: ID
  projectId?: ID
  createdAt: number
  updatedAt: number
  demo?: boolean
}

/* ------------------------------------------------------------------ */
/*  Landing pages                                                      */
/* ------------------------------------------------------------------ */

export type SiteSectionType = 'hero' | 'logos' | 'features' | 'stats' | 'split' | 'testimonials' | 'timeline' | 'faq' | 'cta' | 'contact' | 'footer'

export interface SiteItem {
  title?: string
  body?: string
  value?: string
  label?: string
  icon?: string
  name?: string
  role?: string
  quote?: string
}

export interface SiteSection {
  id: ID
  type: SiteSectionType
  eyebrow?: string
  heading?: string
  subheading?: string
  body?: string
  items?: SiteItem[]
  cta?: { label: string; href: string }
  cta2?: { label: string; href: string }
  image?: string
  variant?: string
}

export interface SiteTheme {
  presetId: string
  background: string
  surface: string
  text: string
  muted: string
  primary: string
  secondary: string
  font: 'grotesk' | 'serif' | 'mono' | 'rounded' | 'display'
  radius: 'sharp' | 'soft' | 'round'
  mode: 'dark' | 'light'
}

export interface SiteBrief {
  purpose: string
  audience: string
  keyMessages: string
  cta: string
  ctaLink: string
  style: string
  useWeb: boolean
  /** The name was made up from the purpose, so the finished page's own title can replace it. */
  autoName?: boolean
}

export interface Site {
  id: ID
  name: string
  brief: SiteBrief
  mode: 'sections' | 'freeform'
  theme: SiteTheme
  sections: SiteSection[]
  html?: string
  history: { prompt: string; at: number }[]
  status: 'draft' | 'generating' | 'ready' | 'error'
  stage?: string
  error?: string
  agentId?: ID
  projectId?: ID
  createdAt: number
  updatedAt: number
  demo?: boolean
}

/* ------------------------------------------------------------------ */
/*  Press office                                                       */
/* ------------------------------------------------------------------ */

export type ContentKind = 'press_release' | 'pitch' | 'statement' | 'social' | 'linkedin' | 'bio' | 'award' | 'newsletter' | 'talking_points' | 'qa' | 'email' | 'blog'

export interface ContentPiece {
  id: ID
  kind: ContentKind
  title: string
  brief: Record<string, string>
  content: string
  agentId?: ID
  status: 'draft' | 'generating' | 'ready' | 'error'
  error?: string
  projectId?: ID
  createdAt: number
  updatedAt: number
  demo?: boolean
}

export interface MediaContact {
  id: ID
  name: string
  outlet: string
  beat?: string
  email?: string
  phone?: string
  social?: string
  notes?: string
  tags: string[]
  relationship: 'cold' | 'warm' | 'hot'
  lastContacted?: string
  createdAt: number
  demo?: boolean
}

export interface CoverageItem {
  id: ID
  outlet: string
  headline: string
  url?: string
  date: string
  reach?: number
  sentiment: 'positive' | 'neutral' | 'negative'
  projectId?: ID
  notes?: string
  createdAt: number
  demo?: boolean
}

/* ------------------------------------------------------------------ */
/*  Calendar                                                           */
/* ------------------------------------------------------------------ */

export interface CalEvent {
  id: ID
  title: string
  start: string
  end: string
  allDay?: boolean
  location?: string
  description?: string
  source: 'local' | 'google' | 'ics'
  calendarId?: ID
  color?: string
  projectId?: ID
  url?: string
  demo?: boolean
}

export interface CalendarSource {
  id: ID
  kind: 'google' | 'ics-url' | 'ics-file'
  name: string
  url?: string
  color: string
  enabled: boolean
  lastSync?: number
  error?: string
}

/* ------------------------------------------------------------------ */
/*  Brain                                                              */
/* ------------------------------------------------------------------ */

export interface BrainNote {
  /** Vault-relative path, e.g. "Clients/Northwind.md" */
  path: string
  title: string
  folder: string
  content: string
  tags: string[]
  /** Raw wikilink / markdown link targets as written in the note. */
  links: string[]
  aliases: string[]
  frontmatter?: Record<string, unknown>
  mtime: number
  size: number
  words: number
  demo?: boolean
}

/* ------------------------------------------------------------------ */
/*  Vault                                                              */
/* ------------------------------------------------------------------ */

export interface EncryptedBlob {
  iv: string
  ct: string
}

export interface VaultMeta {
  salt: string
  iterations: number
  verifier: EncryptedBlob
  createdAt: number
}

export interface VaultSecret {
  id: ID
  service: string
  label: string
  data: EncryptedBlob
  hint: string
  createdAt: number
  updatedAt: number
  lastUsed?: number
}

/* ------------------------------------------------------------------ */
/*  Media                                                              */
/* ------------------------------------------------------------------ */

export type ImageProviderId = 'pollinations' | 'huggingface' | 'gemini' | 'openai'

export interface MediaItem {
  id: ID
  kind: 'image' | 'graphic'
  title: string
  prompt?: string
  style?: string
  provider?: ImageProviderId
  /** Stored image data when the provider allows downloading it. */
  blob?: Blob
  /** Remote address used when the image could not be stored locally. */
  url?: string
  width: number
  height: number
  favorite?: boolean
  projectId?: ID
  createdAt: number
  demo?: boolean
}

/* ------------------------------------------------------------------ */
/*  Activity log                                                       */
/* ------------------------------------------------------------------ */

export type LogKind = 'chat' | 'task' | 'research' | 'deck' | 'site' | 'plan' | 'content' | 'brief' | 'meeting' | 'delegation' | 'note' | 'system'

export interface LogEntry {
  id: ID
  at: number
  kind: LogKind
  text: string
  agentId?: ID
  minutesSaved?: number
  link?: string
  demo?: boolean
}

/* ------------------------------------------------------------------ */
/*  Settings                                                           */
/* ------------------------------------------------------------------ */

export type AccentId = 'aurora' | 'ember' | 'emerald' | 'ocean' | 'solar' | 'mono'

export interface Settings {
  userName: string
  companyName: string
  userRole: string
  osName: string
  spelling: 'british' | 'american'
  accent: AccentId
  introMode: 'always' | 'daily' | 'never'
  lastIntroDate?: string
  reduceMotion: boolean
  onboarded: boolean
  demoData: boolean
  defaultProfileId?: ID
  brain: {
    name?: string
    mode: 'none' | 'fs' | 'upload'
    writeFolder: string
    dailyFolder: string
    lastSync?: number
    noteCount?: number
  }
  calendar: {
    googleClientId?: string
    corsProxy?: string
    weekStartsOn: 0 | 1
    dayStart: number
    dayEnd: number
  }
  vault: {
    autoLockMinutes: number
    rememberDevice: boolean
  }
  media: {
    provider: ImageProviderId
    geminiModel: string
    openaiModel: string
  }
  brief?: { date: string; content: string }
}
