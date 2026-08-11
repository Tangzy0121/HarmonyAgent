import { useCallback, useEffect, useRef, useState } from 'react'
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
import { scrollToElementWhenReady } from './domain/scrollToElement'
import { useBookAgentSessions } from './hooks/useBookAgentSessions'
import { useBookGeneration, type BookGenerationEvent } from './hooks/useBookGeneration'
import { UploadBookSheet, type UploadBookSubmission } from './components/book/UploadBookSheet'
import { BookApiError, confirmBook, createBook, getBook, listBooks, updateProposal, uploadDocument, type ProposalEdits, type StoredBook } from './services/bookApi'
import { KnowledgeLibraryPage } from './pages/KnowledgeLibraryPage'
import { BookProposalPage } from './pages/BookProposalPage'
import { InteractiveBookPage } from './pages/InteractiveBookPage'
import { LearningExplanationPage } from './pages/LearningExplanationPage'
import { LearningVerificationPage } from './pages/LearningVerificationPage'
import { LearningCompletionPage } from './pages/LearningCompletionPage'
import { LearningMapPage } from './pages/LearningMapPage'
import { TodayPage } from './pages/TodayPage'
import type { AgentContextScope, LearningBook } from './types/learningBook'
import type { BookAgentSource } from './types/bookAgent'
import type { Destination, DrawerSnap, MapViewport } from './types/prototype'

const documentHash = '#library/ml-chapter-03'
const learningExplanationHash = '#learn/supervised-learning/explanation'
const learningVerificationHash = '#learn/supervised-learning/verification'
const learningCompletionHash = '#learn/supervised-learning/completion'
const learningMapChangeHash = '#learning/supervised-learning/change'
const todayOutcomeHash = '#today/learning-result'

function bookRouteFromHash(hash: string): { bookId: string; chapterId: string } | null {
  const match = hash.match(/^#book\/([^/]+)\/(ch-[^/]+)$/)
  return match ? { bookId: match[1], chapterId: match[2] } : null
}

// 真实书 hash 约定：提案 #proposal/{bookId}，阅读 #book/{bookId}/{chapterId}；mock 书固定 ml-chapter-03
function realBookIdFromHash(hash: string): string | null {
  const proposalMatch = hash.match(/^#proposal\/([^/]+)$/)
  if (proposalMatch) return proposalMatch[1]
  const route = bookRouteFromHash(hash)
  return route && route.bookId !== 'ml-chapter-03' ? route.bookId : null
}

// 与服务端 refreshBookStatus 对齐：全部 ready → ready；有 error 章 → partial；否则 generating
function generatedBookStatus(chapters: LearningBook['chapters']): LearningBook['status'] {
  if (chapters.every((chapter) => chapter.status === 'ready')) return 'ready'
  if (chapters.some((chapter) => chapter.status === 'error')) return 'partial'
  return 'generating'
}

const REAL_BOOK_ERROR_MESSAGES: Record<string, string> = {
  pdf_too_large: '文件超过 20MB 上限，请压缩或拆分后再上传。',
  pdf_too_many_pages: '这份 PDF 超过 30 页上限，请拆分后再上传。',
  pdf_encrypted: '这份 PDF 已加密，暂不支持解析。',
  pdf_no_text: '这份 PDF 没有可提取的文字（可能是扫描件），暂不支持。',
  pdf_unreadable: '这份 PDF 无法读取，请检查文件是否损坏。',
  invalid_proposal_edit: '目录修改未通过校验，请检查后重试。',
}

function realBookActionErrorMessage(error: unknown): string {
  if (error instanceof BookApiError) {
    return REAL_BOOK_ERROR_MESSAGES[error.code] ?? error.message
  }
  return '网络连接异常，请检查网络后重试。'
}

// 真实书载入中/失败占位：沿用 book-pending-state 样式，不新增 CSS
function RealBookStatusPanel({ error, onBack }: { error: string | null; onBack: () => void }) {
  if (error) {
    return (
      <section className="book-pending-state" role="alert">
        <h1>学习书加载失败</h1>
        <p>{error}</p>
        <button type="button" className="book-block__primary" onClick={onBack}>返回知识库</button>
      </section>
    )
  }
  return (
    <section className="book-pending-state">
      <h1>正在载入学习书</h1>
      <p>正在从云端恢复学习书内容。</p>
    </section>
  )
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
  const [activeDestination, setActiveDestination] = useState<Destination>(() => window.location.hash === learningMapChangeHash || window.location.hash === '#learning' ? 'learning' : window.location.hash === '#library' || window.location.hash === documentHash || window.location.hash.startsWith('#book/') || window.location.hash.startsWith('#proposal/') || window.location.hash === learningExplanationHash || window.location.hash === learningVerificationHash || window.location.hash === learningCompletionHash ? 'library' : 'today')
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(() => window.location.hash === documentHash ? 'ml-chapter-03' : null)
  const [isInteractiveBook, setIsInteractiveBook] = useState(() => window.location.hash.startsWith('#book/'))
  const [learningBook, setLearningBook] = useState(learningBookFixture)
  const [activeBookChapterId, setActiveBookChapterId] = useState(() => bookRouteFromHash(window.location.hash)?.chapterId ?? learningBookFixture.activeChapterId)
  const [activeRealBookId, setActiveRealBookId] = useState<string | null>(() => realBookIdFromHash(window.location.hash))
  const [realBookLoadError, setRealBookLoadError] = useState<string | null>(null)
  const [realBooks, setRealBooks] = useState<StoredBook[]>([])
  const [isUploadSheetOpen, setIsUploadSheetOpen] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isConfirmingRealBook, setIsConfirmingRealBook] = useState(false)
  const [realBookConfirmError, setRealBookConfirmError] = useState<string | null>(null)
  const [bookContextScope, setBookContextScope] = useState<AgentContextScope>('chapter')
  const [bookContextEnabled, setBookContextEnabled] = useState(true)
  const [activeLearningBlockId, setActiveLearningBlockId] = useState<string | null>(null)
  const [agentModeLabel, setAgentModeLabel] = useState<string | undefined>(undefined)
  const [activeLearningId, setActiveLearningId] = useState<string | null>(() => window.location.hash === learningExplanationHash || window.location.hash === learningVerificationHash || window.location.hash === learningCompletionHash ? 'supervised-learning' : null)
  const [activeLearningStage, setActiveLearningStage] = useState<LearningStage | null>(() => window.location.hash === learningCompletionHash ? 'completion' : window.location.hash === learningVerificationHash ? 'verification' : window.location.hash === learningExplanationHash ? 'explanation' : null)
  const [isMapChangeFocus, setIsMapChangeFocus] = useState(() => window.location.hash === learningMapChangeHash)
  const [isTodayOutcome, setIsTodayOutcome] = useState(() => window.location.hash === todayOutcomeHash)
  const [drawerSnap, setDrawerSnap] = useState<DrawerSnap>(() => window.history.state?.overlay === 'agent' ? window.history.state.agentSnap ?? 'default' : 'closed')
  const [agentDraft, setAgentDraft] = useState('')
  const [mapViewport, setMapViewport] = useState<MapViewport>(initialMapViewport)
  const bookAgent = useBookAgentSessions({
    book: learningBook,
    activeChapterId: activeBookChapterId,
    scope: bookContextScope,
    contextEnabled: bookContextEnabled,
  })
  const activeRealBookIdRef = useRef<string | null>(activeRealBookId)
  activeRealBookIdRef.current = activeRealBookId
  const mockBookSnapshotRef = useRef<LearningBook>(learningBookFixture)
  // 渐进生成事件统一落进共享的 learningBook 状态位（真实书与 mock 书共用，bookId 区分来源）
  const applyRealBookGenerationEvent = useCallback((event: BookGenerationEvent) => {
    setLearningBook((current) => {
      if (current.id !== activeRealBookIdRef.current) return current
      switch (event.type) {
        case 'chapter_start':
          return {
            ...current,
            status: 'generating',
            chapters: current.chapters.map((chapter) => chapter.id === event.chapterId
              ? { ...chapter, status: 'generating' as const, blocks: [] }
              : chapter),
          }
        case 'block':
          return {
            ...current,
            chapters: current.chapters.map((chapter) => chapter.id === event.chapterId
              ? { ...chapter, blocks: [...chapter.blocks, event.block] }
              : chapter),
          }
        case 'chapter_done':
        case 'chapter_error': {
          const chapters = current.chapters.map((chapter) => chapter.id === event.chapterId
            ? { ...chapter, status: event.type === 'chapter_done' ? 'ready' as const : 'error' as const }
            : chapter)
          return { ...current, chapters, status: generatedBookStatus(chapters) }
        }
      }
    })
  }, [])
  const realBookGeneration = useBookGeneration({
    bookId: activeRealBookId,
    chapters: learningBook.chapters,
    onEvent: applyRealBookGenerationEvent,
  })
  const restoreMockBook = () => {
    setLearningBook((current) => current.id === learningBookFixture.id ? current : mockBookSnapshotRef.current)
  }
  const isPrimaryShell = !activeDocumentId
    && !isInteractiveBook
    && !activeRealBookId
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
  const bookAgentContextLabel = (() => {
    const base = resolveAgentContext(learningBook, activeBookChapterId, bookContextScope).label
    if (!bookAgent.focusBlockId) return base
    const focusBlock = learningBook.chapters.flatMap((chapter) => chapter.blocks).find((block) => block.id === bookAgent.focusBlockId)
    return focusBlock ? `${base} · 聚焦：${focusBlock.title}` : base
  })()
  const isRealBookLoaded = activeRealBookId !== null && learningBook.id === activeRealBookId
  const isRealProposal = activeRealBookId !== null && !isInteractiveBook

  useEffect(() => {
    const syncHistoryState = () => {
      updateWithViewTransition(() => {
        const nextDocumentId = window.location.hash === documentHash ? 'ml-chapter-03' : null
        const nextInteractiveBook = window.location.hash.startsWith('#book/')
        const nextRealBookId = realBookIdFromHash(window.location.hash)
        const nextLearningId = window.location.hash === learningExplanationHash || window.location.hash === learningVerificationHash || window.location.hash === learningCompletionHash ? 'supervised-learning' : null
        const nextLearningStage = window.location.hash === learningCompletionHash ? 'completion' : window.location.hash === learningVerificationHash ? 'verification' : window.location.hash === learningExplanationHash ? 'explanation' : null
        const nextMapChangeFocus = window.location.hash === learningMapChangeHash
        const nextTodayOutcome = window.location.hash === todayOutcomeHash
        const nextDrawerSnap: DrawerSnap = window.history.state?.overlay === 'agent' ? window.history.state.agentSnap ?? 'default' : 'closed'
        setActiveDocumentId(nextDocumentId)
        setIsInteractiveBook(nextInteractiveBook)
        setActiveRealBookId(nextRealBookId)
        if (!nextRealBookId) restoreMockBook()
        if (nextInteractiveBook) setActiveBookChapterId(bookRouteFromHash(window.location.hash)?.chapterId ?? learningBookFixture.activeChapterId)
        setActiveLearningId(nextLearningId)
        setActiveLearningStage(nextLearningStage)
        setIsMapChangeFocus(nextMapChangeFocus)
        setIsTodayOutcome(nextTodayOutcome)
        setDrawerSnap(nextDrawerSnap)
        if (!nextInteractiveBook && !nextLearningId && !nextMapChangeFocus) setAgentModeLabel(undefined)
        if (nextDocumentId || nextInteractiveBook || nextLearningId || nextRealBookId) setActiveDestination('library')
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
    document.title = isInteractiveBook ? `${learningBook.proposal.title} · 互动学习书` : activeDocumentId || isRealProposal ? '互动学习书 · 目录提案' : 'loci · 个人知识 Agent'
  }, [activeDocumentId, activeLearningId, activeLearningStage, drawerSnap, isInteractiveBook, isMapChangeFocus, isRealProposal, isTodayOutcome, learningBook.proposal.title])

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

  // 真实书载入：进入 #proposal/{id} 或 #book/{id}/... 时经 getBook 恢复；失败展示可返回知识库的错误态
  useEffect(() => {
    if (!activeRealBookId) {
      setRealBookLoadError(null)
      return
    }
    let cancelled = false
    setRealBookLoadError(null)
    getBook(activeRealBookId)
      .then((book) => { if (!cancelled) setLearningBook(book) })
      .catch(() => { if (!cancelled) setRealBookLoadError('学习书加载失败，请返回知识库重试。') })
    return () => { cancelled = true }
  }, [activeRealBookId])

  // 知识库真实书列表：挂载时拉取一次，失败静默为空列表
  useEffect(() => {
    let cancelled = false
    listBooks()
      .then((books) => { if (!cancelled) setRealBooks(books) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  // mock 书会话内进度快照：真实书占用 learningBook 状态位期间保留，回到 mock 场景时恢复
  useEffect(() => {
    if (learningBook.id === learningBookFixture.id) mockBookSnapshotRef.current = learningBook
  }, [learningBook])

  const openDocument = (documentId: string) => {
    if (documentId !== 'ml-chapter-03') return
    window.history.pushState({ screen: 'file-understanding', documentId }, '', documentHash)
    updateWithViewTransition(() => {
      setActiveDestination('library')
      setActiveDocumentId(documentId)
      restoreMockBook()
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

  const confirmRealBookProposal = () => {
    const bookId = activeRealBookId
    if (!bookId || learningBook.id !== bookId || isConfirmingRealBook) return
    const edits: ProposalEdits = {
      title: learningBook.proposal.title,
      description: learningBook.proposal.description,
      chapters: learningBook.chapters.map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        order: chapter.order,
        objective: chapter.objective,
        estimatedMinutes: chapter.estimatedMinutes,
      })),
    }
    setIsConfirmingRealBook(true)
    setRealBookConfirmError(null)
    void (async () => {
      try {
        await updateProposal(bookId, edits)
        const confirmed = await confirmBook(bookId)
        const firstChapterId = confirmed.activeChapterId
        window.history.pushState({ screen: 'interactive-book', bookId, chapterId: firstChapterId }, '', `#book/${bookId}/${firstChapterId}`)
        updateWithViewTransition(() => {
          setLearningBook(confirmed)
          setIsInteractiveBook(true)
          setActiveBookChapterId(firstChapterId)
          setActiveDestination('library')
          setAgentModeLabel(undefined)
        })
        realBookGeneration.start()
      } catch (error) {
        setRealBookConfirmError(realBookActionErrorMessage(error))
      } finally {
        setIsConfirmingRealBook(false)
      }
    })()
  }

  const openRealBook = (bookId: string) => {
    const book = realBooks.find((entry) => entry.id === bookId)
    const targetHash = book && book.status !== 'proposal'
      ? `#book/${bookId}/${book.activeChapterId}`
      : `#proposal/${bookId}`
    window.history.pushState({ screen: 'real-book', bookId }, '', targetHash)
    updateWithViewTransition(() => {
      setActiveDestination('library')
      setActiveDocumentId(null)
      setActiveRealBookId(bookId)
      setIsInteractiveBook(targetHash.startsWith('#book/'))
      if (book && book.status !== 'proposal') setActiveBookChapterId(book.activeChapterId)
      setAgentModeLabel(undefined)
      setActiveLearningId(null)
      setActiveLearningStage(null)
      setIsMapChangeFocus(false)
      setIsTodayOutcome(false)
    })
  }

  const closeRealBook = () => {
    window.history.replaceState({ destination: 'library' }, '', '#library')
    updateWithViewTransition(() => {
      setActiveRealBookId(null)
      setIsInteractiveBook(false)
      restoreMockBook()
      setActiveDestination('library')
    })
  }

  const openUploadBook = () => {
    setUploadError(null)
    setIsUploadSheetOpen(true)
  }

  const submitUploadBook = async ({ file, goal, learnerLevel }: UploadBookSubmission) => {
    setUploadError(null)
    try {
      const documentMeta = await uploadDocument(file)
      const created = await createBook({ documentId: documentMeta.id, goal, learnerLevel })
      setIsUploadSheetOpen(false)
      void listBooks().then(setRealBooks).catch(() => undefined)
      window.history.pushState({ screen: 'real-book', bookId: created.id }, '', `#proposal/${created.id}`)
      updateWithViewTransition(() => {
        setActiveDestination('library')
        setActiveDocumentId(null)
        setActiveRealBookId(created.id)
        setIsInteractiveBook(false)
        setAgentModeLabel(undefined)
      })
    } catch (error) {
      setUploadError(realBookActionErrorMessage(error))
    }
  }

  const changeBookChapter = (chapterId: string) => {
    window.history.replaceState({ ...window.history.state, screen: 'interactive-book', bookId: learningBook.id, chapterId }, '', `#book/${activeRealBookId ?? 'ml-chapter-03'}/${chapterId}`)
    setActiveBookChapterId(chapterId)
  }

  const askBookAgent = (focusBlockId?: string) => {
    const executionPlan = orchestrateAgentRequest({
      intent: 'ask_question',
      bookId: learningBook.id,
      chapterId: activeBookChapterId,
      contextScope: bookContextScope,
    })
    bookAgent.setFocusBlockId(focusBlockId)
    setAgentModeLabel(executionPlan.workflow === 'free_qa' ? '自由问答工作流 · 只读学习状态' : undefined)
    openAgent()
  }

  const openBookAgentSource = (source: BookAgentSource) => {
    const revealSource = () => {
      changeBookChapter(source.chapterId)
      setDrawerSnap('closed')
      const behavior: ScrollBehavior = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth'
      // 章节切换异步渲染，等元素出现再滚动，避免与提交竞争导致静默不滚动
      scrollToElementWhenReady(source.blockId, { behavior })
    }

    if (window.history.state?.overlay === 'agent') {
      window.addEventListener('popstate', revealSource, { once: true })
      window.history.go(drawerSnap === 'full' && window.history.state.agentSnap === 'full' ? -2 : -1)
      return
    }
    revealSource()
  }

  const closeInteractiveBook = () => {
    window.history.replaceState({ destination: 'library' }, '', '#library')
    updateWithViewTransition(() => {
      setIsInteractiveBook(false)
      setActiveRealBookId(null)
      restoreMockBook()
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
      className={`prototype-app--lighting-pilot prototype-app--third-batch-shell ${isPrimaryShell ? '' : 'prototype-app--third-batch-deep'} ${activeDocumentId || isInteractiveBook || activeRealBookId ? 'prototype-app--book' : ''} ${isThirdBatchToday ? 'prototype-app--third-batch-today' : ''}`}
      identity={<AppIdentityBar />}
      controls={
        activeDocumentId || isInteractiveBook || activeRealBookId || activeLearningId || isMapChangeFocus ? null : <>
          <BottomNavigation activeDestination={activeDestination} onSelect={selectDestination} />
          <AgentLauncher isOpen={drawerSnap !== 'closed'} onOpen={openAgent} />
        </>
      }
      overlay={
        <AgentDrawer
          snap={drawerSnap}
          activeDestination={activeDestination}
          contextLabel={isTodayOutcome ? '今日成果 · 下一次安排' : isMapChangeFocus ? '监督学习 · 地图变化' : activeLearningStage === 'completion' ? '监督学习 · 学习证据' : activeLearningStage === 'verification' ? '监督学习 · 验证阶段' : activeLearningId ? `深入学习 · ${activeLearningBlockId ?? '监督学习'}` : isInteractiveBook ? bookAgentContextLabel : isRealProposal && isRealBookLoaded ? `目录提案 · ${learningBook.proposal.title}` : activeDocumentId ? '目录提案 · 机器学习第三章' : undefined}
          modeLabel={agentModeLabel}
          contextEnabled={isInteractiveBook ? bookContextEnabled : undefined}
          draft={agentDraft}
          bookSession={isInteractiveBook ? bookAgent.session : undefined}
          onDraftChange={setAgentDraft}
          onSnapChange={changeDrawerSnap}
          onSubmitQuestion={isInteractiveBook ? bookAgent.submit : undefined}
          onStop={isInteractiveBook ? bookAgent.stop : undefined}
          onRetry={isInteractiveBook ? bookAgent.retry : undefined}
          onNewConversation={isInteractiveBook ? bookAgent.newConversation : undefined}
          onContextEnabledChange={isInteractiveBook ? setBookContextEnabled : undefined}
          onSourceOpen={isInteractiveBook ? openBookAgentSource : undefined}
        />
      }
    >
        <TodayPage
          isActive={!activeDocumentId && !isInteractiveBook && !activeRealBookId && !activeLearningId && activeDestination === 'today'}
          isOutcomeMode={isTodayOutcome}
          onContinue={continueTodayLearning}
          learningEvidenceCount={learningBook.evidence.length}
          learningBook={learningBook}
        />
        <LearningMapPage
          isActive={!activeDocumentId && !isInteractiveBook && !activeRealBookId && !activeLearningId && activeDestination === 'learning'}
          viewport={mapViewport}
          onViewportChange={setMapViewport}
          isChangeFocus={isMapChangeFocus}
          onScheduleNext={openTodayOutcome}
          learningEvidence={learningBook.evidence}
        />
        <KnowledgeLibraryPage
          isActive={!activeDocumentId && !isInteractiveBook && !activeRealBookId && !activeLearningId && activeDestination === 'library'}
          onOpenDocument={openDocument}
          bookStatusLabel={bookStatusLabel}
          realBooks={realBooks}
          onUploadBook={openUploadBook}
          onOpenRealBook={openRealBook}
        />
        {activeDocumentId === 'ml-chapter-03' && !activeRealBookId && (
          <BookProposalPage
            book={learningBook}
            onBookChange={setLearningBook}
            onConfirm={confirmBookProposal}
            onBack={closeDocument}
          />
        )}
        {isInteractiveBook && (
          activeRealBookId !== null && !isRealBookLoaded ? (
            <RealBookStatusPanel error={realBookLoadError} onBack={closeRealBook} />
          ) : (
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
              isRealBook={activeRealBookId !== null}
              chapterProgress={realBookGeneration.progress && realBookGeneration.progress.chapterId === activeBookChapterId ? { blocksReceived: realBookGeneration.progress.blocksReceived } : null}
              onRetryChapter={realBookGeneration.retryChapter}
            />
          )
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
        {isRealProposal && (
          isRealBookLoaded ? (
            <BookProposalPage
              book={learningBook}
              onBookChange={setLearningBook}
              onConfirm={confirmRealBookProposal}
              onBack={closeRealBook}
              isConfirming={isConfirmingRealBook}
              confirmError={realBookConfirmError}
            />
          ) : (
            <RealBookStatusPanel error={realBookLoadError} onBack={closeRealBook} />
          )
        )}
        {isUploadSheetOpen && (
          <UploadBookSheet
            errorMessage={uploadError}
            onSubmit={submitUploadBook}
            onClose={() => setIsUploadSheetOpen(false)}
          />
        )}
    </AppShell>
  )
}

export default App
