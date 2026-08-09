import { useCallback, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { AppShell } from './components/AppShell'
import { AppIdentityBar } from './components/AppIdentityBar'
import { AgentDrawer } from './components/AgentDrawer'
import { AgentLauncher } from './components/AgentLauncher'
import { BottomNavigation } from './components/BottomNavigation'
import { learningBookFixture } from './data/learningBook'
import { initialMapViewport } from './data/learningMap'
import { orchestrateAgentRequest } from './domain/agentOrchestration'
import { recordDeepLearningEvidence, resolveAgentContext, startBookGeneration } from './domain/learningBook'
import { KnowledgeLibraryPage } from './pages/KnowledgeLibraryPage'
import { BookProposalPage } from './pages/BookProposalPage'
import { InteractiveBookPage } from './pages/InteractiveBookPage'
import { LearningExplanationPage } from './pages/LearningExplanationPage'
import { LearningVerificationPage } from './pages/LearningVerificationPage'
import { LearningCompletionPage } from './pages/LearningCompletionPage'
import { LearningMapPage } from './pages/LearningMapPage'
import { TodayPage } from './pages/TodayPage'
import type { AgentContextScope } from './types/learningBook'
import type { Destination, DrawerSnap, MapViewport } from './types/prototype'

const documentHash = '#library/ml-chapter-03'
const learningExplanationHash = '#learn/supervised-learning/explanation'
const learningVerificationHash = '#learn/supervised-learning/verification'
const learningCompletionHash = '#learn/supervised-learning/completion'
const learningMapChangeHash = '#learning/supervised-learning/change'
const todayOutcomeHash = '#today/learning-result'

function bookChapterIdFromHash(hash: string): string | null {
  const match = hash.match(/^#book\/[^/]+\/(ch-[^/]+)$/)
  return match?.[1] ?? null
}

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
  const [activeDestination, setActiveDestination] = useState<Destination>(() => window.location.hash === learningMapChangeHash || window.location.hash === '#learning' ? 'learning' : window.location.hash === '#library' || window.location.hash === documentHash || window.location.hash.startsWith('#book/') || window.location.hash === learningExplanationHash || window.location.hash === learningVerificationHash || window.location.hash === learningCompletionHash ? 'library' : 'today')
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(() => window.location.hash === documentHash ? 'ml-chapter-03' : null)
  const [isInteractiveBook, setIsInteractiveBook] = useState(() => window.location.hash.startsWith('#book/'))
  const [learningBook, setLearningBook] = useState(learningBookFixture)
  const [activeBookChapterId, setActiveBookChapterId] = useState(() => bookChapterIdFromHash(window.location.hash) ?? learningBookFixture.activeChapterId)
  const [bookContextScope, setBookContextScope] = useState<AgentContextScope>('chapter')
  const [activeLearningBlockId, setActiveLearningBlockId] = useState<string | null>(null)
  const [agentModeLabel, setAgentModeLabel] = useState<string | undefined>(undefined)
  const [activeLearningId, setActiveLearningId] = useState<string | null>(() => window.location.hash === learningExplanationHash || window.location.hash === learningVerificationHash || window.location.hash === learningCompletionHash ? 'supervised-learning' : null)
  const [activeLearningStage, setActiveLearningStage] = useState<LearningStage | null>(() => window.location.hash === learningCompletionHash ? 'completion' : window.location.hash === learningVerificationHash ? 'verification' : window.location.hash === learningExplanationHash ? 'explanation' : null)
  const [isMapChangeFocus, setIsMapChangeFocus] = useState(() => window.location.hash === learningMapChangeHash)
  const [isTodayOutcome, setIsTodayOutcome] = useState(() => window.location.hash === todayOutcomeHash)
  const [drawerSnap, setDrawerSnap] = useState<DrawerSnap>(() => window.history.state?.overlay === 'agent' ? window.history.state.agentSnap ?? 'default' : 'closed')
  const [agentDraft, setAgentDraft] = useState('')
  const [mapViewport, setMapViewport] = useState<MapViewport>(initialMapViewport)
  const isPrimaryShell = !activeDocumentId
    && !isInteractiveBook
    && !activeLearningId
    && !isMapChangeFocus
  const isThirdBatchToday = isPrimaryShell
    && !isTodayOutcome
    && activeDestination === 'today'
  const readyBookChapterCount = learningBook.chapters.filter((chapter) => chapter.status === 'ready').length
  const bookStatusLabel = learningBook.status === 'proposal'
    ? '目录待确认'
    : learningBook.status === 'ready'
      ? '可阅读'
      : learningBook.status === 'partial'
        ? '部分可读'
        : `生成中 ${readyBookChapterCount}/${learningBook.chapters.length}`

  useEffect(() => {
    const syncHistoryState = () => {
      updateWithViewTransition(() => {
        const nextDocumentId = window.location.hash === documentHash ? 'ml-chapter-03' : null
        const nextInteractiveBook = window.location.hash.startsWith('#book/')
        const nextLearningId = window.location.hash === learningExplanationHash || window.location.hash === learningVerificationHash || window.location.hash === learningCompletionHash ? 'supervised-learning' : null
        const nextLearningStage = window.location.hash === learningCompletionHash ? 'completion' : window.location.hash === learningVerificationHash ? 'verification' : window.location.hash === learningExplanationHash ? 'explanation' : null
        const nextMapChangeFocus = window.location.hash === learningMapChangeHash
        const nextTodayOutcome = window.location.hash === todayOutcomeHash
        const nextDrawerSnap: DrawerSnap = window.history.state?.overlay === 'agent' ? window.history.state.agentSnap ?? 'default' : 'closed'
        setActiveDocumentId(nextDocumentId)
        setIsInteractiveBook(nextInteractiveBook)
        if (nextInteractiveBook) setActiveBookChapterId(bookChapterIdFromHash(window.location.hash) ?? learningBookFixture.activeChapterId)
        setActiveLearningId(nextLearningId)
        setActiveLearningStage(nextLearningStage)
        setIsMapChangeFocus(nextMapChangeFocus)
        setIsTodayOutcome(nextTodayOutcome)
        setDrawerSnap(nextDrawerSnap)
        if (!nextInteractiveBook && !nextLearningId && !nextMapChangeFocus) setAgentModeLabel(undefined)
        if (nextDocumentId || nextInteractiveBook || nextLearningId) setActiveDestination('library')
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
    document.title = isInteractiveBook ? `${learningBook.proposal.title} · 互动学习书` : activeDocumentId ? '互动学习书 · 目录提案' : 'loci · 个人知识 Agent'
  }, [activeDocumentId, activeLearningId, activeLearningStage, drawerSnap, isInteractiveBook, isMapChangeFocus, isTodayOutcome, learningBook.proposal.title])

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
      setIsInteractiveBook(false)
      setAgentModeLabel(undefined)
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

  const confirmBookProposal = () => {
    const nextBook = startBookGeneration(learningBook)
    const firstChapterId = nextBook.activeChapterId
    const executionPlan = orchestrateAgentRequest({ intent: 'generate_book', bookId: nextBook.id, chapterId: firstChapterId, contextScope: 'chapter' })
    window.history.pushState({ screen: 'interactive-book', bookId: learningBook.id, chapterId: firstChapterId }, '', `#book/ml-chapter-03/${firstChapterId}`)
    updateWithViewTransition(() => {
      setActiveDocumentId(null)
      setIsInteractiveBook(true)
      setLearningBook(nextBook)
      setActiveBookChapterId(firstChapterId)
      setAgentModeLabel(executionPlan.workflow === 'learning_book_generation' ? '互动学习书生成工作流' : undefined)
    })
  }

  const changeBookChapter = (chapterId: string) => {
    window.history.replaceState({ ...window.history.state, screen: 'interactive-book', bookId: learningBook.id, chapterId }, '', `#book/ml-chapter-03/${chapterId}`)
    setActiveBookChapterId(chapterId)
  }

  const askBookAgent = () => {
    const executionPlan = orchestrateAgentRequest({
      intent: 'ask_question',
      bookId: learningBook.id,
      chapterId: activeBookChapterId,
      contextScope: bookContextScope,
    })
    setAgentModeLabel(executionPlan.workflow === 'free_qa' ? '自由问答工作流 · 只读学习状态' : undefined)
    openAgent()
  }

  const closeInteractiveBook = () => {
    window.history.replaceState({ destination: 'library' }, '', '#library')
    updateWithViewTransition(() => {
      setIsInteractiveBook(false)
      setActiveDestination('library')
    })
  }

  const startLearning = (sourceBlockId?: string) => {
    const executionPlan = orchestrateAgentRequest({
      intent: 'submit_validation',
      bookId: learningBook.id,
      chapterId: activeBookChapterId,
      contextScope: 'chapter',
    })
    window.history.pushState({ screen: 'learning-explanation', learningId: 'supervised-learning' }, '', learningExplanationHash)
    updateWithViewTransition(() => {
      setActiveDocumentId(null)
      setIsInteractiveBook(false)
      setActiveLearningId('supervised-learning')
      setActiveLearningBlockId(sourceBlockId ?? null)
      setAgentModeLabel(executionPlan.workflow === 'deep_learning_validation' ? '深入学习与验证工作流' : undefined)
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
      if (activeLearningBlockId) setLearningBook((current) => recordDeepLearningEvidence(current, activeLearningBlockId))
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
      setIsInteractiveBook(false)
      setAgentModeLabel(undefined)
      setActiveLearningId(null)
      setActiveLearningStage(null)
      setIsMapChangeFocus(false)
      setIsTodayOutcome(true)
      setActiveDestination('today')
    })
  }

  const viewLearningMapChange = () => {
    window.history.pushState({ screen: 'learning-map-change', learningId: 'supervised-learning' }, '', learningMapChangeHash)
    updateWithViewTransition(() => {
      setActiveDocumentId(null)
      setIsInteractiveBook(false)
      setActiveLearningId(null)
      setActiveLearningStage(null)
      setIsMapChangeFocus(true)
      setIsTodayOutcome(false)
      setActiveDestination('learning')
    })
  }

  const selectDestination = (destination: Destination) => {
    if (destination === 'learning') {
      const projectionPlan = orchestrateAgentRequest({ intent: 'project_map', bookId: learningBook.id, chapterId: activeBookChapterId, contextScope: 'book' })
      setAgentModeLabel(projectionPlan.agentVisible ? undefined : '确定性学习状态投影 · 非 Agent')
    } else {
      setAgentModeLabel(undefined)
    }
    window.history.pushState({ destination }, '', `#${destination}`)
    updateWithViewTransition(() => {
      setActiveDocumentId(null)
      setIsInteractiveBook(false)
      setActiveLearningId(null)
      setActiveLearningStage(null)
      setIsMapChangeFocus(false)
      setIsTodayOutcome(false)
      setActiveDestination(destination)
    })
  }

  const continueTodayLearning = () => {
    const latestEvidence = learningBook.evidence[learningBook.evidence.length - 1]
    if (!latestEvidence) {
      startLearning()
      return
    }
    const evidenceChapter = learningBook.chapters.find((chapter) => chapter.id === latestEvidence.chapterId)
    const targetChapter = latestEvidence.outcome === 'mastered' && evidenceChapter
      ? learningBook.chapters[evidenceChapter.order + 1] ?? evidenceChapter
      : evidenceChapter ?? learningBook.chapters[0]
    window.history.pushState({ screen: 'interactive-book', bookId: learningBook.id, chapterId: targetChapter.id }, '', `#book/ml-chapter-03/${targetChapter.id}`)
    updateWithViewTransition(() => {
      setActiveDestination('library')
      setIsInteractiveBook(true)
      setActiveBookChapterId(targetChapter.id)
      setIsTodayOutcome(false)
    })
  }

  return (
    <AppShell
      className={`prototype-app--lighting-pilot prototype-app--third-batch-shell ${isPrimaryShell ? '' : 'prototype-app--third-batch-deep'} ${isThirdBatchToday ? 'prototype-app--third-batch-today' : ''}`}
      identity={<AppIdentityBar />}
      controls={
        activeDocumentId || isInteractiveBook || activeLearningId || isMapChangeFocus ? null : <>
          <BottomNavigation activeDestination={activeDestination} onSelect={selectDestination} />
          <AgentLauncher isOpen={drawerSnap !== 'closed'} onOpen={openAgent} />
        </>
      }
      overlay={
        <AgentDrawer
          snap={drawerSnap}
          activeDestination={activeDestination}
          contextLabel={isTodayOutcome ? '今日成果 · 下一次安排' : isMapChangeFocus ? '监督学习 · 地图变化' : activeLearningStage === 'completion' ? '监督学习 · 学习证据' : activeLearningStage === 'verification' ? '监督学习 · 验证阶段' : activeLearningId ? `深入学习 · ${activeLearningBlockId ?? '监督学习'}` : isInteractiveBook ? resolveAgentContext(learningBook, activeBookChapterId, bookContextScope).label : activeDocumentId ? '目录提案 · 机器学习第三章' : undefined}
          modeLabel={agentModeLabel}
          draft={agentDraft}
          onDraftChange={setAgentDraft}
          onSnapChange={changeDrawerSnap}
        />
      }
    >
        <TodayPage
          isActive={!activeDocumentId && !isInteractiveBook && !activeLearningId && activeDestination === 'today'}
          isOutcomeMode={isTodayOutcome}
          onContinue={continueTodayLearning}
          learningEvidenceCount={learningBook.evidence.length}
          learningBook={learningBook}
        />
        <LearningMapPage
          isActive={!activeDocumentId && !isInteractiveBook && !activeLearningId && activeDestination === 'learning'}
          viewport={mapViewport}
          onViewportChange={setMapViewport}
          isChangeFocus={isMapChangeFocus}
          onScheduleNext={openTodayOutcome}
          learningEvidence={learningBook.evidence}
        />
        <KnowledgeLibraryPage
          isActive={!activeDocumentId && !isInteractiveBook && !activeLearningId && activeDestination === 'library'}
          onOpenDocument={openDocument}
          bookStatusLabel={bookStatusLabel}
        />
        {activeDocumentId === 'ml-chapter-03' && (
          <BookProposalPage
            book={learningBook}
            onBookChange={setLearningBook}
            onConfirm={confirmBookProposal}
            onBack={closeDocument}
          />
        )}
        {isInteractiveBook && (
          <InteractiveBookPage
            book={learningBook}
            activeChapterId={activeBookChapterId}
            contextScope={bookContextScope}
            onBookChange={setLearningBook}
            onChapterChange={changeBookChapter}
            onContextScopeChange={setBookContextScope}
            onAskAgent={askBookAgent}
            onBack={closeInteractiveBook}
            onStartDeepLearning={startLearning}
          />
        )}
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
