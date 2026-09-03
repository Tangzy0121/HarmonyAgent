import { useEffect } from 'react'

import { AppShell } from '../components/shell/AppShell'
import { CreateProjectPage } from '../pages/CreateProjectPage'
import { LibraryPage } from '../pages/LibraryPage'
import { SettingsPage } from '../pages/SettingsPage'
import { AccountPage } from '../pages/AccountPage'
import { PlanPage } from '../pages/PlanPage'
import { ProjectOverviewPage } from '../pages/ProjectOverviewPage'
import { ReviewPage } from '../pages/ReviewPage'
import { SummaryPage } from '../pages/SummaryPage'
import { TodayPage } from '../pages/TodayPage'
import { WorkspacePage } from '../pages/WorkspacePage'
import { usePrototype } from './PrototypeContext'

const screens = {
  today: TodayPage,
  library: LibraryPage,
  settings: SettingsPage,
  account: AccountPage,
  create: CreateProjectPage,
  plan: PlanPage,
  overview: ProjectOverviewPage,
  workspace: WorkspacePage,
  review: ReviewPage,
  summary: SummaryPage,
}

export function App() {
  const { state } = usePrototype()
  const Screen = screens[state.screen]
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [state.screen])
  return <AppShell><Screen /></AppShell>
}
