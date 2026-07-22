import { useState } from 'react'
import { AppShell } from './components/AppShell'
import { AgentDrawer } from './components/AgentDrawer'
import { AgentLauncher } from './components/AgentLauncher'
import { BottomNavigation } from './components/BottomNavigation'
import { initialMapViewport } from './data/learningMap'
import { KnowledgeLibraryPage } from './pages/KnowledgeLibraryPage'
import { LearningMapPage } from './pages/LearningMapPage'
import { TodayPage } from './pages/TodayPage'
import type { Destination, DrawerSnap, MapViewport } from './types/prototype'

function App() {
  const [activeDestination, setActiveDestination] = useState<Destination>('today')
  const [drawerSnap, setDrawerSnap] = useState<DrawerSnap>('closed')
  const [agentDraft, setAgentDraft] = useState('')
  const [mapViewport, setMapViewport] = useState<MapViewport>(initialMapViewport)

  return (
    <AppShell
      controls={
        <>
          <BottomNavigation activeDestination={activeDestination} onSelect={setActiveDestination} />
          <AgentLauncher isOpen={drawerSnap !== 'closed'} onOpen={() => setDrawerSnap('default')} />
        </>
      }
      overlay={
        <AgentDrawer
          snap={drawerSnap}
          activeDestination={activeDestination}
          draft={agentDraft}
          onDraftChange={setAgentDraft}
          onSnapChange={setDrawerSnap}
        />
      }
    >
        <TodayPage isActive={activeDestination === 'today'} />
        <LearningMapPage
          isActive={activeDestination === 'learning'}
          viewport={mapViewport}
          onViewportChange={setMapViewport}
        />
        <KnowledgeLibraryPage isActive={activeDestination === 'library'} />
    </AppShell>
  )
}

export default App
