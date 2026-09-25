import type { ContentKind } from '../types'

export interface ContentField {
  key: string
  label: string
  placeholder?: string
  multiline?: boolean
  optional?: boolean
}

export interface ContentTemplate {
  kind: ContentKind
  name: string
  description: string
  icon: string
  color: string
  roleId: string
  fields: ContentField[]
  instructions: string
}

const newsField: ContentField = { key: 'news', label: 'What’s the news?', placeholder: 'e.g. Northwind launches a limited-edition Autumn Blend', multiline: true }
const detailsField: ContentField = { key: 'details', label: 'Key facts and details', placeholder: 'Dates, prices, names, numbers, quotes you already have…', multiline: true, optional: true }
const audienceField: ContentField = { key: 'audience', label: 'Who is it for?', placeholder: 'e.g. National consumer journalists', optional: true }

export const CONTENT_TEMPLATES: ContentTemplate[] = [
  {
    kind: 'press_release',
    name: 'Press release',
    description: 'A newsroom-ready release with headline, quote and notes to editors.',
    icon: 'Newspaper',
    color: '#38bdf8',
    roleId: 'pr-media',
    fields: [newsField, detailsField, { key: 'spokesperson', label: 'Spokesperson for the quote', placeholder: 'e.g. Founder, Jane Smith', optional: true }, { key: 'boilerplate', label: 'About the company (boilerplate)', multiline: true, optional: true }],
    instructions:
      'Write a press release: headline, subheadline, dateline placeholder, a strong lead paragraph (who, what, when, where, why), two to four supporting paragraphs, one quote that sounds human, notes to editors, boilerplate and a media contact placeholder. Use [PLACEHOLDERS] for anything not provided.',
  },
  {
    kind: 'pitch',
    name: 'Media pitch',
    description: 'A short, personal email journalists actually read.',
    icon: 'Send',
    color: '#60a5fa',
    roleId: 'pr-media',
    fields: [newsField, { key: 'outlet', label: 'Outlet or journalist type', placeholder: 'e.g. Consumer editor at a national paper' }, { key: 'offer', label: 'What can you offer?', placeholder: 'Exclusive, interview, samples, data…', optional: true }],
    instructions: 'Write three subject line options and a pitch email under 150 words: a personal opener, the hook in one line, why it matters to their readers, what you can offer, and a simple ask. Add a two-line follow-up email.',
  },
  {
    kind: 'statement',
    name: 'Holding statement',
    description: 'Calm, fast words for when something goes wrong.',
    icon: 'ShieldAlert',
    color: '#f87171',
    roleId: 'crisis',
    fields: [{ key: 'situation', label: 'What has happened?', multiline: true }, { key: 'known', label: 'What do we know for certain?', multiline: true, optional: true }, { key: 'actions', label: 'What are we doing about it?', multiline: true, optional: true }],
    instructions: 'Write a holding statement (under 120 words) that acknowledges the situation, shows genuine concern, states what is being done and commits to updates, without speculating or admitting liability. Then give three alternative opening lines and five likely media questions with suggested answers. Flag anything that needs legal review.',
  },
  {
    kind: 'social',
    name: 'Social media pack',
    description: 'Posts tailored to every platform, ready to schedule.',
    icon: 'Hash',
    color: '#e879f9',
    roleId: 'social',
    fields: [newsField, audienceField, { key: 'platforms', label: 'Platforms', placeholder: 'e.g. Instagram, LinkedIn, TikTok, X', optional: true }],
    instructions: 'Write a social pack: for each platform requested (default Instagram, LinkedIn, TikTok and X), two post options with platform-appropriate length, hook, emojis where suitable, hashtags and a call to action. For video platforms add a 15-second script outline.',
  },
  {
    kind: 'linkedin',
    name: 'LinkedIn post',
    description: 'Thought leadership in the principal’s voice.',
    icon: 'PenTool',
    color: '#0a66c2',
    roleId: 'speechwriter',
    fields: [{ key: 'topic', label: 'What do you want to say?', multiline: true }, { key: 'story', label: 'A story or example to include', multiline: true, optional: true }],
    instructions: 'Write a LinkedIn post (150–250 words) in a first-person, human voice: a scroll-stopping first line, a short story or insight, one clear takeaway, and a question to spark comments. Offer two alternative first lines.',
  },
  {
    kind: 'bio',
    name: 'Biography',
    description: 'Short, medium and long bios for speakers or spokespeople.',
    icon: 'UserRound',
    color: '#a78bfa',
    roleId: 'copywriter',
    fields: [{ key: 'person', label: 'Who is it about?' }, { key: 'facts', label: 'Career highlights and facts', multiline: true }],
    instructions: 'Write three bios: a one-line version, a 60-word version and a 150-word version. Third person, confident but not boastful. Only use the facts given.',
  },
  {
    kind: 'award',
    name: 'Award entry',
    description: 'A persuasive entry built around challenge, idea and results.',
    icon: 'Trophy',
    color: '#fbbf24',
    roleId: 'new-business',
    fields: [{ key: 'campaign', label: 'Which campaign?', multiline: true }, { key: 'results', label: 'Results and evidence', multiline: true }, { key: 'category', label: 'Award and category', optional: true }],
    instructions: 'Write an award entry with sections: summary (50 words), the challenge, the insight, the idea, the execution, the results (only the evidence provided) and why it deserves to win. Keep it vivid and specific.',
  },
  {
    kind: 'newsletter',
    name: 'Newsletter',
    description: 'A client or company newsletter people want to open.',
    icon: 'Mail',
    color: '#2dd4bf',
    roleId: 'copywriter',
    fields: [{ key: 'items', label: 'What should it cover?', multiline: true }, audienceField],
    instructions: 'Write a newsletter: three subject line options, a warm intro, sections for each item with short headlines, and a sign-off. Keep each section under 90 words.',
  },
  {
    kind: 'talking_points',
    name: 'Talking points',
    description: 'Key messages and proof points for an interview or meeting.',
    icon: 'Mic',
    color: '#c084fc',
    roleId: 'speechwriter',
    fields: [{ key: 'topic', label: 'Interview or meeting topic', multiline: true }, { key: 'messages', label: 'Messages we must land', multiline: true, optional: true }],
    instructions: 'Create talking points: three key messages with a proof point and a memorable soundbite each, bridging phrases, and the five toughest questions with suggested answers.',
  },
  {
    kind: 'qa',
    name: 'Q&A document',
    description: 'Anticipated questions with approved answers.',
    icon: 'CircleHelp',
    color: '#94a3b8',
    roleId: 'crisis',
    fields: [{ key: 'topic', label: 'Topic or announcement', multiline: true }, detailsField],
    instructions: 'Write an internal Q&A: 12–15 likely questions from media, customers and staff, grouped by theme, each with a concise approved answer. Mark any answer that needs sign-off.',
  },
  {
    kind: 'email',
    name: 'Email',
    description: 'A clear, well-judged email for any situation.',
    icon: 'AtSign',
    color: '#5eead4',
    roleId: 'personal-assistant',
    fields: [{ key: 'purpose', label: 'What do you need to say?', multiline: true }, { key: 'recipient', label: 'Who is it to?', optional: true }],
    instructions: 'Write the email with a subject line. Warm, clear and concise. Offer a shorter alternative version below it.',
  },
  {
    kind: 'blog',
    name: 'Blog article',
    description: 'An engaging article for the website or LinkedIn.',
    icon: 'BookOpen',
    color: '#fb923c',
    roleId: 'copywriter',
    fields: [{ key: 'topic', label: 'Topic', multiline: true }, audienceField, { key: 'length', label: 'Length', placeholder: 'e.g. 600 words', optional: true }],
    instructions: 'Write a blog article with a strong headline, standfirst, scannable subheadings, and a clear conclusion with a call to action. Default to about 700 words.',
  },
]

export function contentTemplate(kind: ContentKind): ContentTemplate {
  return CONTENT_TEMPLATES.find((t) => t.kind === kind) ?? CONTENT_TEMPLATES[0]
}
