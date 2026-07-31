import { useCallback, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { AppShell } from './components/AppShell'
import { AppIdentityBar } from './components/AppIdentityBar'
import { AgentDrawer } from './components/AgentDrawer'
import { AgentLauncher } from './components/AgentLauncher'
import { BottomNavigation } from './components/BottomNavigation'
import { initialMapViewport } from './data/learningMap'
import { KnowledgeLibraryPage } from './pages/KnowledgeLibraryPage'
import { FileUnderstandingPage } from './pages/FileUnderstandingPage'
import { LearningExplanationPage } from './pages/LearningExplanationPage'
import { LearningVerificationPage } from './pages/LearningVerificationPage'
import { LearningCompletionPage } from './pages/LearningCompletionPage'
import { LearningMapPage } from './pages/LearningMapPage'
import { TodayPage } from './pages/TodayPage'
import type { Destination, DrawerSnap, MapViewport } from './types/prototype'

const documentHash = '#library/ml-chapter-03'
const learningExplanationHash = '#learn/supervised-learning/explanation'
const learningVerificationHash = '#learn/supervised-learning/verification'
const learningCompletionHash = '#learn/supervised-learning/completion'
const learningMapChangeHash = '#learning/supervised-learning/change'
const todayOutcomeHash = '#today/learning-result'

type LearningStage = 'explanation' | 'verification' | 'completion'

type ViewTransitionLike = {
  ready?: Promise<unknown>
  finished?: Promise<unknown>
  updateCallbackDone?: Promise<unknown>
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => ViewTransitionLike
}

function updateWithViewTransition(update: () => void) {
  const viewTransitionDocument = document as ViewTransitionDocument
  if (!viewTransitionDocument.startViewTransition) {
    update()
    return
  }

  try {
    const transition = viewTransitionDocument.startViewTransition(() => flushSync(update))
    transition.ready?.catch(() => undefined)
    transition.finished?.catch(() => undefined)
    transition.updateCallbackDone?.catch(() => undefined)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'InvalidStateError') {
      update()
      return
    }
    throw error
  }
}

function App() {
  const [activeDestination, setActiveDestination] = useState<Destination>(() => window.location.hash === learningMapChangeHash || window.location.hash === '#learning' ? 'learning' : window.location.hash === '#library' || window.location.hash === documentHash || window.location.hash === learningExplanationHash || window.location.hash === learningVerificationHash || window.location.hash === learningCompletionHash ? 'library' : 'today')
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(() => window.location.hash === documentHash ? 'ml-chapter-03' : null)
  const [activeLearningId, setActiveLearningId] = useState<string | null>(() => window.location.hash === learningExplanationHash || window.location.hash === learningVerificationHash || window.location.hash === learningCompletionHash ? 'supervised-learning' : null)
  const [activeLearningStage, setActiveLearningStage] = useState<LearningStage | null>(() => window.location.hash === learningCompletionHash ? 'completion' : window.location.hash === learningVerificationHash ? 'verification' : window.location.hash === learningExplanationHash ? 'explanation' : null)
  const [isMapChangeFocus, setIsMapChangeFocus] = useState(() => window.location.hash === learningMapChangeHash)
  const [isTodayOutcome, setIsTodayOutcome] = useState(() => window.location.hash === todayOutcomeHash)
  const [drawerSnap, setDrawerSnap] = useState<DrawerSnap>(() => window.history.state?.overlay === 'agent' ? window.history.state.agentSnap ?? 'default' : 'closed')
  const [agentDraft, setAgentDraft] = useState('')
  const [mapViewport, setMapViewport] = useState<MapViewport>(initialMapViewport)
  const isPrimaryShell = !activeDocumentId
    && !activeLearningId
    && !isMapChangeFocus
  const isThirdBatchToday = isPrimaryShell
    && !isTodayOutcome
    && activeDestination === 'today'

  useEffect(() => {
    const syncHistoryState = () => {
      updateWithViewTransition(() => {
        const nextDocumentId = window.location.hash === documentHash ? 'ml-chapter-03' : null
        const nextLearningId = window.location.hash === learningExplanationHash || window.location.hash === learningVerificationHash || window.location.hash === learningCompletionHash ? 'supervised-learning' : null
        const nextLearningStage = window.location.hash === learningCompletionHash ? 'completion' : window.location.hash === learningVerificationHash ? 'verification' : window.location.hash === learningExplanationHash ? 'explanation' : null
        const nextMapChangeFocus = window.location.hash === learningMapChangeHash
        const nextTodayOutcome = window.location.hash === todayOutcomeHash
        const nextDrawerSnap: DrawerSnap = window.history.state?.overlay === 'agent' ? window.history.state.agentSnap ?? 'default' : 'closed'
        setActiveDocumentId(nextDocumentId)
        setActiveLearningId(nextLearningId)
        setActiveLearningStage(nextLearningStage)
        setIsMapChangeFocus(nextMapChangeFocus)
        setIsTodayOutcome(nextTodayOutcome)
        setDrawerSnap(nextDrawerSnap)
        if (nextDocumentId || nextLearningId) setActiveDestination('library')
        if (window.location.hash === '#learning' || nextMapChangeFocus) setActiveDestination('learning')
        if (window.location.hash === '#library') setActiveDestination('library')
        if (window.location.hash === '#today' || nextTodayOutcome) setActiveDestination('today')
      })
    }

    window.addEventListener('popstate', syncHistoryState)
    return () => window.removeEventListener('popstate', syncHistoryState)
  }, [])

  useEffect(() => {
    if (drawerSnap === 'full') {
      document.title = 'Knowledge Agent · 对话'
      return
    }
    if (isTodayOutcome) {
      document.title = '今天 · 学习成果'
      return
    }
    if (isMapChangeFocus) {
      document.title = '监督学习 · 地图变化'
      return
    }
    if (activeLearningId) {
      document.title = activeLearningStage === 'completion' ? '监督学习 · 学习完成' : activeLearningStage === 'verification' ? '监督学习 · 验证' : '监督学习 · 深入学习'
      return
    }
    document.title = activeDocumentId ? '机器学习 · 第三章' : 'loci · 个人知识 Agent'
  }, [activeDocumentId, activeLearningId, activeLearningStage, drawerSnap, isMapChangeFocus, isTodayOutcome])

  const openAgent = useCallback(() => {
    if (window.history.state?.overlay === 'agent') {
      setDrawerSnap(window.history.state.agentSnap ?? 'default')
      return
    }
    window.history.pushState({ ...window.history.state, overlay: 'agent', agentSnap: 'default' }, '', window.location.href)
    setDrawerSnap('default')
  }, [])

  const changeDrawerSnap = useCallback((nextSnap: DrawerSnap) => {
    if (nextSnap === drawerSnap) return

    if (nextSnap === 'full') {
      if (window.history.state?.overlay === 'agent' && window.history.state.agentSnap === 'default') {
        window.history.pushState({ ...window.history.state, agentSnap: 'full' }, '', window.location.href)
      }
      setDrawerSnap('full')
      return
    }

    if (nextSnap === 'default') {
      if (drawerSnap === 'full' && window.history.state?.overlay === 'agent' && window.history.state.agentSnap === 'full') {
        window.history.back()
        return
      }
      if (drawerSnap === 'closed') {
        openAgent()
        return
      }
      setDrawerSnap('default')
      return
    }

    if (window.history.state?.overlay === 'agent') {
      window.history.go(drawerSnap === 'full' && window.history.state.agentSnap === 'full' ? -2 : -1)
      return
    }
    setDrawerSnap('closed')
  }, [drawerSnap, openAgent])

  useEffect(() => {
    if (drawerSnap === 'closed') return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [drawerSnap])

  useEffect(() => {
    if (drawerSnap === 'closed') return
    const closeWithKeyboard = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      changeDrawerSnap(drawerSnap === 'full' ? 'default' : 'closed')
    }
    window.addEventListener('keydown', closeWithKeyboard)
    return () => window.removeEventListener('keydown', closeWithKeyboard)
  }, [changeDrawerSnap, drawerSnap])

  const openDocument = (documentId: string) => {
    if (documentId !== 'ml-chapter-03') return
    window.history.pushState({ screen: 'file-understanding', documentId }, '', documentHash)
    updateWithViewTransition(() => {
      setActiveDestination('library')
      setActiveDocumentId(documentId)
      setActiveLearningId(null)
      setActiveLearningStage(null)
      setIsTodayOutcome(false)
    })
  }

  const closeDocument = () => {
    if (window.location.hash === documentHash) {
      window.history.back()
      return
    }
    updateWithViewTransition(() => setActiveDocumentId(null))
  }

  const startLearning = () => {
    window.history.pushState({ screen: 'learning-explanation', learningId: 'supervised-learning' }, '', learningExplanationHash)
    updateWithViewTransition(() => {
      setActiveDocumentId(null)
      setActiveLearningId('supervised-learning')
      setActiveLearningStage('explanation')
      setIsTodayOutcome(false)
    })
  }

  const closeLearning = () => {
    if (window.history.state?.screen === 'learning-explanation') {
      window.history.back()
      return
    }
    window.history.replaceState({ screen: 'file-understanding', documentId: 'ml-chapter-03' }, '', documentHash)
    updateWithViewTransition(() => {
      setActiveLearningId(null)
      setActiveLearningStage(null)
      setActiveDocumentId('ml-chapter-03')
      setActiveDestination('library')
    })
  }

  const startVerification = () => {
    window.history.pushState({ screen: 'learning-verification', learningId: 'supervised-learning' }, '', learningVerificationHash)
    updateWithViewTransition(() => {
      setActiveLearningId('supervised-learning')
      setActiveLearningStage('verification')
    })
  }

  const closeVerification = () => {
    if (window.history.state?.screen === 'learning-verification') {
      window.history.back()
      return
    }
    window.history.replaceState({ screen: 'learning-explanation', learningId: 'supervised-learning' }, '', learningExplanationHash)
    updateWithViewTransition(() => {
      setActiveLearningId('supervised-learning')
      setActiveLearningStage('explanation')
    })
  }

  const completeLearning = () => {
    window.history.pushState({ screen: 'learning-completion', learningId: 'supervised-learning' }, '', learningCompletionHash)
    updateWithViewTransition(() => {
      setActiveLearningId('supervised-learning')
      setActiveLearningStage('completion')
      setIsTodayOutcome(false)
    })
  }

  const closeCompletion = () => {
    if (window.history.state?.screen === 'learning-completion') {
      window.history.back()
      return
    }
    window.history.replaceState({ screen: 'learning-verification', learningId: 'supervised-learning' }, '', learningVerificationHash)
    updateWithViewTransition(() => {
      setActiveLearningId('supervised-learning')
      setActiveLearningStage('verification')
    })
  }

  const openTodayOutcome = () => {
    window.history.pushState({ screen: 'today-learning-result', learningId: 'supervised-learning' }, '', todayOutcomeHash)
    updateWithViewTransition(() => {
      setActiveDocumentId(null)
      setActiveLearningId(null)
      setActiveLearningStage(null)
      setIsMapChangeFocus(false)
      setIsTodayOutcome(true)
      setActiveDestination('today')
    })
  }

  const viewDocumentOnMap = () => {
    window.history.pushState({ destination: 'learning' }, '', '#learning')
    updateWithViewTransition(() => {
      setActiveDocumentId(null)
      setActiveLearningId(null)
      setActiveLearningStage(null)
      setIsMapChangeFocus(false)
      setIsTodayOutcome(false)
      setActiveDestination('learning')
    })
  }

  const viewLearningMapChange = () => {
    window.history.pushState({ screen: 'learning-map-change', learningId: 'supervised-learning' }, '', learningMapChangeHash)
    updateWithViewTransition(() => {
      setActiveDocumentId(null)
      setActiveLearningId(null)
      setActiveLearningStage(null)
      setIsMapChangeFocus(true)
      setIsTodayOutcome(false)
      setActiveDestination('learning')
    })
  }

  const selectDestination = (destination: Destination) => {
    window.history.pushState({ destination }, '', `#${destination}`)
    updateWithViewTransition(() => {
      setActiveDocumentId(null)
      setActiveLearningId(null)
      setActiveLearningStage(null)
      setIsMapChangeFocus(false)
      setIsTodayOutcome(false)
      setActiveDestination(destination)
    })
  }

  return (
    <AppShell
      className={`prototype-app--lighting-pilot prototype-app--third-batch-shell ${isPrimaryShell ? '' : 'prototype-app--third-batch-deep'} ${isThirdBatchToday ? 'prototype-app--third-batch-today' : ''}`}
      identity={<AppIdentityBar />}
      controls={
        activeDocumentId || activeLearningId || isMapChangeFocus ? null : <>
          <BottomNavigation activeDestination={activeDestination} onSelect={selectDestination} />
          <AgentLauncher isOpen={drawerSnap !== 'closed'} onOpen={openAgent} />
        </>
      }
      overlay={
        <AgentDrawer
          snap={drawerSnap}
          activeDestination={activeDestination}
          contextLabel={isTodayOutcome ? '今日成果 · 下一次安排' : isMapChangeFocus ? '监督学习 · 地图变化' : activeLearningStage === 'completion' ? '监督学习 · 学习证据' : activeLearningStage === 'verification' ? '监督学习 · 验证阶段' : activeLearningId ? '监督学习 · 解释阶段' : activeDocumentId ? '机器学习 · 第三章.pdf' : undefined}
          draft={agentDraft}
          onDraftChange={setAgentDraft}
          onSnapChange={changeDrawerSnap}
        />
      }
    >
        <TodayPage
          isActive={!activeDocumentId && !activeLearningId && activeDestination === 'today'}
          isOutcomeMode={isTodayOutcome}
          onContinue={startLearning}
        />
        <LearningMapPage
          isActive={!activeDocumentId && !activeLearningId && activeDestination === 'learning'}
          viewport={mapViewport}
          onViewportChange={setMapViewport}
          isChangeFocus={isMapChangeFocus}
          onScheduleNext={openTodayOutcome}
        />
        <KnowledgeLibraryPage
          isActive={!activeDocumentId && !activeLearningId && activeDestination === 'library'}
          onOpenDocument={openDocument}
        />
        <FileUnderstandingPage
          isActive={activeDocumentId === 'ml-chapter-03'}
          onAskAgent={openAgent}
          onBack={closeDocument}
          onStartLearning={startLearning}
          onViewMap={viewDocumentOnMap}
        />
        <LearningExplanationPage
          isActive={activeLearningId === 'supervised-learning' && activeLearningStage === 'explanation'}
          onAskAgent={openAgent}
          onBack={closeLearning}
          onStartVerification={startVerification}
        />
        <LearningVerificationPage
          isActive={activeLearningId === 'supervised-learning' && activeLearningStage === 'verification'}
          onAskAgent={openAgent}
          onBack={closeVerification}
          onCompleteLearning={completeLearning}
        />
        <LearningCompletionPage
          isActive={activeLearningId === 'supervised-learning' && activeLearningStage === 'completion'}
          onAskAgent={openAgent}
          onBack={closeCompletion}
          onReturnToday={openTodayOutcome}
          onViewMapChange={viewLearningMapChange}
        />
    </AppShell>
  )
}

export default App
