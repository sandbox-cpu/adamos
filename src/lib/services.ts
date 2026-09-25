import { PROVIDERS } from './llm/providers'

export interface ServiceField {
  key: string
  label: string
  placeholder?: string
  secret?: boolean
  optional?: boolean
}

export interface ServiceInfo {
  id: string
  name: string
  category: 'AI models' | 'Research' | 'Calendar & productivity' | 'PR & media' | 'Creative' | 'Other'
  color: string
  description: string
  helpUrl?: string
  fields: ServiceField[]
}

const apiKeyField = (placeholder?: string): ServiceField => ({ key: 'apiKey', label: 'API key', placeholder, secret: true })

const aiServices: ServiceInfo[] = PROVIDERS.filter((p) => p.needsKey).map((p) => ({
  id: p.id,
  name: p.id === 'custom' ? 'Other AI service' : p.company && p.company !== p.name ? `${p.name} · ${p.company}` : p.name,
  category: 'AI models' as const,
  color: p.color,
  description: p.blurb,
  helpUrl: p.keyUrl,
  fields: [apiKeyField(p.keyPlaceholder)],
}))

export const SERVICES: ServiceInfo[] = [
  ...aiServices,
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    category: 'Calendar & productivity',
    color: '#4285f4',
    description: 'OAuth client ID that lets the OS read your Google Calendar.',
    helpUrl: 'https://console.cloud.google.com/apis/credentials',
    fields: [{ key: 'clientId', label: 'OAuth client ID', placeholder: '…apps.googleusercontent.com' }],
  },
  {
    id: 'notion',
    name: 'Notion',
    category: 'Calendar & productivity',
    color: '#e5e5e5',
    description: 'Internal integration token for Notion workspaces.',
    helpUrl: 'https://www.notion.so/my-integrations',
    fields: [apiKeyField('secret_…')],
  },
  {
    id: 'slack',
    name: 'Slack',
    category: 'Calendar & productivity',
    color: '#e01e5a',
    description: 'Bot token for posting updates to Slack.',
    helpUrl: 'https://api.slack.com/apps',
    fields: [apiKeyField('xoxb-…')],
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    category: 'Calendar & productivity',
    color: '#ff7a59',
    description: 'Private app token for CRM access.',
    helpUrl: 'https://developers.hubspot.com/docs/api/private-apps',
    fields: [apiKeyField('pat-…')],
  },
  {
    id: 'muckrack',
    name: 'Muck Rack',
    category: 'PR & media',
    color: '#2b6cb0',
    description: 'Media database and monitoring.',
    fields: [apiKeyField()],
  },
  {
    id: 'cision',
    name: 'Cision',
    category: 'PR & media',
    color: '#00a3e0',
    description: 'Media contacts, distribution and monitoring.',
    fields: [apiKeyField(), { key: 'secret', label: 'API secret', secret: true, optional: true }],
  },
  {
    id: 'meltwater',
    name: 'Meltwater',
    category: 'PR & media',
    color: '#7b61ff',
    description: 'Media intelligence and social listening.',
    fields: [apiKeyField()],
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    category: 'Creative',
    color: '#ffcc4d',
    description: 'Free access token for image generation models such as FLUX.',
    helpUrl: 'https://huggingface.co/settings/tokens',
    fields: [{ key: 'apiKey', label: 'Access token', placeholder: 'hf_…', secret: true }],
  },
  {
    id: 'pollinations',
    name: 'Pollinations',
    category: 'Creative',
    color: '#34d399',
    description: 'Optional key for faster pictures from the free Pollinations service.',
    helpUrl: 'https://enter.pollinations.ai',
    fields: [{ key: 'apiKey', label: 'Key', placeholder: 'sk_…', secret: true }],
  },
  {
    id: 'tavily',
    name: 'Tavily',
    category: 'Research',
    color: '#0ea5e9',
    description: 'Web search API for research agents.',
    helpUrl: 'https://app.tavily.com',
    fields: [apiKeyField('tvly-…')],
  },
  {
    id: 'unsplash',
    name: 'Unsplash',
    category: 'Creative',
    color: '#f4f4f5',
    description: 'Free high-quality photography for decks and landing pages.',
    helpUrl: 'https://unsplash.com/oauth/applications',
    fields: [{ key: 'apiKey', label: 'Access key', secret: true }],
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    category: 'Creative',
    color: '#a3a3a3',
    description: 'Natural voice generation.',
    helpUrl: 'https://elevenlabs.io/app/settings/api-keys',
    fields: [apiKeyField()],
  },
  {
    id: 'canva',
    name: 'Canva',
    category: 'Creative',
    color: '#00c4cc',
    description: 'Design platform integration.',
    fields: [apiKeyField()],
  },
  {
    id: 'other',
    name: 'Something else',
    category: 'Other',
    color: '#94a3b8',
    description: 'Any other key, token or password you want to keep safe.',
    fields: [
      { key: 'apiKey', label: 'Key or token', secret: true },
      { key: 'note', label: 'Note', optional: true },
    ],
  },
]

export function getService(id: string): ServiceInfo {
  return SERVICES.find((s) => s.id === id) ?? SERVICES[SERVICES.length - 1]
}
