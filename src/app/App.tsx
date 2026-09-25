import { lazy, Suspense, useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import { Shell, PageLoader } from './Shell'
import { useSettings } from '../stores/settings'
import { useVault } from '../stores/vault'
import { useUI } from '../stores/ui'
import { ensureSeeded, refreshDemoEvents } from '../lib/seed'
import { isoDate } from '../lib/utils'

const Intro = lazy(() => import('../features/intro/Intro'))
const Onboarding = lazy(() => import('../features/onboarding/Onboarding'))
const Dashboard = lazy(() => import('../features/dashboard/Dashboard'))
const ProjectsPage = lazy(() => import('../features/projects/ProjectsPage'))
const ProjectDetail = lazy(() => import('../features/projects/ProjectDetail'))
const CalendarPage = lazy(() => import('../features/calendar/CalendarPage'))
const AgentsPage = lazy(() => import('../features/agents/AgentsPage'))
const CommsPage = lazy(() => import('../features/comms/CommsPage'))
const HuddlePage = lazy(() => import('../features/comms/HuddlePage'))
const MastermindPage = lazy(() => import('../features/mastermind/MastermindPage'))
const ResearchPage = lazy(() => import('../features/research/ResearchPage'))
const DecksPage = lazy(() => import('../features/decks/DecksPage'))
const DeckEditor = lazy(() => import('../features/decks/DeckEditor'))
const PresentPage = lazy(() => import('../features/decks/PresentPage'))
const SitesPage = lazy(() => import('../features/sites/SitesPage'))
const SiteEditor = lazy(() => import('../features/sites/SiteEditor'))
const MediaPage = lazy(() => import('../features/media/MediaPage'))
const PressPage = lazy(() => import('../features/press/PressPage'))
const BrainPage = lazy(() => import('../features/brain/BrainPage'))
const LivePage = lazy(() => import('../features/live/LivePage'))
const VaultPage = lazy(() => import('../features/vault/VaultPage'))
const SettingsPage = lazy(() => import('../features/settings/SettingsPage'))

function useBoot() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await useSettings.getState().load()
      const settings = useSettings.getState().settings
      useVault.setState({ autoLockMinutes: settings.vault.autoLockMinutes })
      await Promise.all([useVault.getState().init(), ensureSeeded()])
      if (settings.demoData) await refreshDemoEvents()
      const today = isoDate()
      const show = settings.introMode === 'always' || (settings.introMode === 'daily' && settings.lastIntroDate !== today) || !settings.onboarded
      if (!cancelled) {
        useUI.getState().setShowIntro(show && !new URLSearchParams(location.search).has('nointro'))
        setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])
  return ready
}

export default function App() {
  const ready = useBoot()
  const showIntro = useUI((s) => s.showIntro)
  const onboarded = useSettings((s) => s.settings.onboarded)

  if (!ready) {
    return (
      <div className="grid h-dvh place-items-center bg-ink-950">
        <div className="size-10 animate-pulse rounded-full bg-[radial-gradient(circle_at_30%_30%,#fff,var(--accent)_45%,transparent_70%)]" />
      </div>
    )
  }

  return (
    <HashRouter>
      <Routes>
        <Route
          path="/present/:id"
          element={
            <Suspense fallback={<PageLoader />}>
              <PresentPage />
            </Suspense>
          }
        />
        <Route element={<Shell />}>
          <Route index element={<Dashboard />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:id" element={<ProjectDetail />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="agents/:id" element={<AgentsPage />} />
          <Route path="comms" element={<CommsPage />} />
          <Route path="comms/:id" element={<CommsPage />} />
          <Route path="huddle" element={<HuddlePage />} />
          <Route path="huddle/:id" element={<HuddlePage />} />
          <Route path="mastermind" element={<MastermindPage />} />
          <Route path="mastermind/:id" element={<MastermindPage />} />
          <Route path="research" element={<ResearchPage />} />
          <Route path="research/:id" element={<ResearchPage />} />
          <Route path="decks" element={<DecksPage />} />
          <Route path="decks/:id" element={<DeckEditor />} />
          <Route path="sites" element={<SitesPage />} />
          <Route path="sites/:id" element={<SiteEditor />} />
          <Route path="media" element={<MediaPage />} />
          <Route path="press" element={<PressPage />} />
          <Route path="brain" element={<BrainPage />} />
          <Route path="live" element={<LivePage />} />
          <Route path="vault" element={<VaultPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <AnimatePresence>
        {showIntro && (
          <Suspense fallback={null}>
            <Intro key="intro" />
          </Suspense>
        )}
      </AnimatePresence>
      {!showIntro && !onboarded && (
        <Suspense fallback={null}>
          <Onboarding />
        </Suspense>
      )}
    </HashRouter>
  )
}
