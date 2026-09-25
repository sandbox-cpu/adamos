import type { Agent, AgentTool, Personality } from '../types'
import { ROLE_BANK } from './roles'

interface AgentSeed {
  id: string
  name: string
  roleId: string
  personality: Personality
  status: Agent['status']
  isLead?: boolean
}

const SEEDS: AgentSeed[] = [
  { id: 'atlas', name: 'Atlas', roleId: 'chief-of-staff', personality: { formality: 55, detail: 40, boldness: 60 }, status: 'active', isLead: true },
  { id: 'echo', name: 'Echo', roleId: 'pr-media', personality: { formality: 45, detail: 45, boldness: 65 }, status: 'active' },
  { id: 'nova', name: 'Nova', roleId: 'marketing', personality: { formality: 50, detail: 55, boldness: 60 }, status: 'active' },
  { id: 'scout', name: 'Scout', roleId: 'competitor', personality: { formality: 60, detail: 75, boldness: 40 }, status: 'active' },
  { id: 'lex', name: 'Lex', roleId: 'legal', personality: { formality: 80, detail: 70, boldness: 25 }, status: 'active' },
  { id: 'quill', name: 'Quill', roleId: 'copywriter', personality: { formality: 35, detail: 40, boldness: 70 }, status: 'active' },
  { id: 'iris', name: 'Iris', roleId: 'creative', personality: { formality: 30, detail: 50, boldness: 85 }, status: 'active' },
  { id: 'byte', name: 'Byte', roleId: 'technical', personality: { formality: 45, detail: 50, boldness: 50 }, status: 'active' },
  { id: 'aegis', name: 'Aegis', roleId: 'crisis', personality: { formality: 70, detail: 55, boldness: 35 }, status: 'bench' },
  { id: 'pulse', name: 'Pulse', roleId: 'social', personality: { formality: 20, detail: 35, boldness: 80 }, status: 'bench' },
  { id: 'sage', name: 'Sage', roleId: 'research', personality: { formality: 65, detail: 85, boldness: 30 }, status: 'bench' },
  { id: 'ledger', name: 'Ledger', roleId: 'finance', personality: { formality: 75, detail: 70, boldness: 30 }, status: 'bench' },
  { id: 'vox', name: 'Vox', roleId: 'speechwriter', personality: { formality: 55, detail: 55, boldness: 60 }, status: 'bench' },
  { id: 'rook', name: 'Rook', roleId: 'devils-advocate', personality: { formality: 50, detail: 60, boldness: 90 }, status: 'bench' },
  { id: 'muse', name: 'Muse', roleId: 'influencer', personality: { formality: 30, detail: 40, boldness: 70 }, status: 'bench' },
  { id: 'tempo', name: 'Tempo', roleId: 'project-manager', personality: { formality: 60, detail: 55, boldness: 40 }, status: 'bench' },
]

export function roleTools(roleId: string): AgentTool[] {
  return [...(ROLE_BANK.find((r) => r.id === roleId)?.tools ?? ['brain'])]
}

export function roleColor(roleId: string): string {
  return ROLE_BANK.find((r) => r.id === roleId)?.color ?? '#8b6cff'
}

export function defaultAgents(): Agent[] {
  const t = Date.now()
  return SEEDS.map((s, i) => ({
    id: s.id,
    name: s.name,
    roleId: s.roleId,
    color: roleColor(s.roleId),
    personality: s.personality,
    instructions: '',
    memory: [],
    tools: roleTools(s.roleId),
    status: s.status,
    isLead: s.isLead,
    order: i,
    createdAt: t,
    updatedAt: t,
  }))
}

/** Palette offered when personalising an agent. */
export const AGENT_COLORS = [
  '#f4c95d',
  '#fbbf24',
  '#fb923c',
  '#f87171',
  '#fb7185',
  '#f472b6',
  '#e879f9',
  '#c084fc',
  '#a78bfa',
  '#818cf8',
  '#60a5fa',
  '#38bdf8',
  '#22d3ee',
  '#2dd4bf',
  '#34d399',
  '#4ade80',
  '#a3e635',
  '#a8a29e',
  '#94a3b8',
  '#e5e7eb',
]

export const AGENT_NAME_IDEAS = ['Orion', 'Juno', 'Vega', 'Kai', 'Mira', 'Onyx', 'Sol', 'Wren', 'Finch', 'Rhea', 'Pax', 'Ember', 'Nyx', 'Arlo', 'Cleo', 'Zed']
