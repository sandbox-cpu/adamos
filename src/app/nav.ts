import {
  Bot,
  Brain,
  BrainCircuit,
  CalendarDays,
  FlaskConical,
  FolderKanban,
  ImagePlus,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  MessagesSquare,
  Newspaper,
  PanelsTopLeft,
  Presentation,
  Radio,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  badge?: string
  description: string
}

export interface NavGroup {
  group: string
  items: NavItem[]
}

export const NAV: NavGroup[] = [
  {
    group: 'Command',
    items: [
      { to: '/', label: 'Home', icon: LayoutDashboard, description: 'Your day at a glance' },
      { to: '/live', label: 'Live', icon: Radio, badge: 'LIVE', description: 'Talk out loud and share your screen' },
    ],
  },
  {
    group: 'Work',
    items: [
      { to: '/projects', label: 'Projects', icon: FolderKanban, description: 'Current projects and task boards' },
      { to: '/calendar', label: 'Calendar', icon: CalendarDays, description: 'Meetings, deadlines and focus time' },
      { to: '/mastermind', label: 'Mastermind', icon: BrainCircuit, description: 'Plan with your whole team' },
    ],
  },
  {
    group: 'Team',
    items: [
      { to: '/agents', label: 'Agents', icon: Bot, description: 'Your AI team and specialists' },
      { to: '/comms', label: 'Direct', icon: MessageSquare, description: 'One-to-one chats' },
      { to: '/huddle', label: 'Huddle', icon: MessagesSquare, description: 'Group chat with up to four agents' },
    ],
  },
  {
    group: 'Studios',
    items: [
      { to: '/research', label: 'Research Lab', icon: FlaskConical, description: 'Market, competitor and trend research' },
      { to: '/decks', label: 'Deck Studio', icon: Presentation, description: 'Presentations made for you' },
      { to: '/sites', label: 'Landing Pages', icon: PanelsTopLeft, description: 'Launch pages and microsites' },
      { to: '/media', label: 'Media Studio', icon: ImagePlus, description: 'Images and social graphics' },
      { to: '/press', label: 'Press Office', icon: Newspaper, description: 'Releases, pitches, contacts and coverage' },
    ],
  },
  {
    group: 'Knowledge',
    items: [{ to: '/brain', label: 'Brain', icon: Brain, description: 'Your Obsidian second brain in 3D' }],
  },
  {
    group: 'System',
    items: [
      { to: '/vault', label: 'Vault', icon: KeyRound, description: 'Encrypted API keys' },
      { to: '/settings', label: 'Settings', icon: Settings, description: 'AI, integrations and preferences' },
    ],
  },
]

export const ALL_NAV: NavItem[] = NAV.flatMap((g) => g.items)

export function navFor(pathname: string): NavItem | undefined {
  if (pathname === '/') return ALL_NAV[0]
  return ALL_NAV.filter((n) => n.to !== '/').find((n) => pathname === n.to || pathname.startsWith(n.to + '/'))
}
