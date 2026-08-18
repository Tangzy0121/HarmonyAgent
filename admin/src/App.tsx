import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { PretestSheet } from './components/book/PretestSheet'
import { ReviewQueueSheet } from './components/book/ReviewQueueSheet'
import { MasteryBoardSheet } from './components/book/MasteryBoardSheet'
import { buildMasteryBoard } from './domain/masteryBoard'
import { projectBooksToMap } from './domain/bookMapProjection'
import { pickTodayRealBook } from './domain/todayNextStep'
import { BookApiError, addCard, addNote, confirmBook, createBook, deleteNote, getBank, getBook, getCompletion, getLearnerProfile, getReviewDue, listBooks, postAdaptiveQuiz, postReadingProgress, submitAttempt, submitFlashReview, updateProposal, uploadDocument, type DueItem, type ProposalEdits, type StoredBook } from './services/bookApi'
import { KnowledgeLibraryPage } from './pages/KnowledgeLibraryPage'
import { BookProposalPage } from './pages/BookProposalPage'
import { InteractiveBookPage } from './pages/InteractiveBookPage'
import { LearningExplanationPage } from './pages/LearningExplanationPage'
import { LearningVerificationPage } from './pages/LearningVerificationPage'
import { LearningCompletionPage } from './pages/LearningCompletionPage'
import { LearningMapPage } from './pages/LearningMapPage'
import { LearningDataPage } from './pages/LearningDataPage'
import { TodayPage } from './pages/TodayPage'
import type { AgentContextScope, BankItem, BookCompletion, LearningBook, ReviewScheduleEntry } from './types/learningBook'
import type { LearnerProfile } from './types/learnerProfile'
import type { BookAgentSource } from './types/bookAgent'
import type { Destination, DrawerSnap, MapViewport } from './types/prototype'

const documentHash = '#library/ml-chapter-03'
const learningExplanationHash = '#learn/supervised-learning/explanation'
const learningVerificationHash = '#learn/supervised-learning/verification'
const learningCompletionHash = '#learn/supervised-learning/completion'
const learningMapChangeHash = '#learning/supervised-learning/change'
const todayOutcomeHash = '#today/learning-result'
const learningDataHash = '#learning-data'

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
  doc_no_text: '这份文档没有可提取的文字内容，暂不支持。',
  doc_too_long: '这份文档超过 45,000 字上限，请拆分后再上传。',
  docx_unreadable: '这份 DOCX 无法读取，请检查文件是否损坏或加密。',
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
  const [learnerProfile, setLearnerProfile] = useState<LearnerProfile | null>(null)
  const [isUploadSheetOpen, setIsUploadSheetOpen] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isPretestSheetOpen, setIsPretestSheetOpen] = useState(false)
  const [isReviewSheetOpen, setIsReviewSheetOpen] = useState(false)
  const [isMasteryBoardOpen, setIsMasteryBoardOpen] = useState(false)
  // 摸底入口按书记忆“已选择”：直接开始生成/从建议章节开始后不再出现，换书重置
  const [pretestEntryDismissedFor, setPretestEntryDismissedFor] = useState<string | null>(null)
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
  const [isLearningDataOpen, setIsLearningDataOpen] = useState(() => window.location.hash === learningDataHash)
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
  // 学习地图数据源：真实书有概念时投影真实书（章=主题簇），否则回退 mock 演示图
  const bookMap = useMemo(() => projectBooksToMap(realBooks), [realBooks])
  // 今日页主焦点：优先真实书（到期复习/遗忘悬崖/进行中/最新证据），否则回退 mock 演示书
  const todayRealBook = useMemo(() => pickTodayRealBook(realBooks, new Date(), learnerProfile), [realBooks, learnerProfile])
  const todayBook = todayRealBook ?? learningBook
  // 今日复习到期项：仅真实书经 getReviewDue 拉取（mock 原型页恒为空，不渲染入口）
  const [reviewDue, setReviewDue] = useState<DueItem[]>([])
  // 到期项刷新：失败静默保持旧值
  const refreshReviewDue = useCallback((bookId: string) => {
    getReviewDue(bookId).then(setReviewDue).catch(() => undefined)
  }, [])
  // 阅读进度上报：真实书开书/切章防抖 800ms POST visit，失败静默（不阻断阅读）
  useEffect(() => {
    if (activeRealBookId === null || !isRealBookLoaded) return
    const bookId = activeRealBookId
    const chapterId = activeBookChapterId
    const timer = window.setTimeout(() => {
      postReadingProgress(bookId, chapterId, 'visit')
        .then(({ progress }) => {
          setLearningBook((current) => current.id === bookId ? { ...current, readingProgress: progress } : current)
          setRealBooks((current) => current.map((entry) => entry.id === bookId ? { ...entry, readingProgress: progress } : entry))
        })
        .catch(() => undefined)
    }, 800)
    return () => window.clearTimeout(timer)
  }, [activeRealBookId, activeBookChapterId, isRealBookLoaded])
  // 最近阅读书的完成度：供学习数据页「完成度」区与今日页「继续读」
  const [recentCompletion, setRecentCompletion] = useState<{ bookId: string; bookTitle: string; chapterTitle: string; completion: BookCompletion } | null>(null)
  useEffect(() => {
    const recent = realBooks
      .filter((book) => book.readingProgress && Object.keys(book.readingProgress.lastReadAt).length > 0)
      .map((book) => {
        const [chapterId, at] = Object.entries(book.readingProgress!.lastReadAt).sort((a, b) => b[1].localeCompare(a[1]))[0]
        return { book, chapterId, at }
      })
      .sort((a, b) => b.at.localeCompare(a.at))[0]
    if (!recent) {
      setRecentCompletion(null)
      return
    }
    let cancelled = false
    getCompletion(recent.book.id)
      .then((completion) => {
        if (cancelled) return
        setRecentCompletion({
          bookId: recent.book.id,
          bookTitle: recent.book.proposal.title,
          chapterTitle: recent.book.chapters.find((chapter) => chapter.id === recent.chapterId)?.title ?? '',
          completion,
        })
      })
      .catch(() => { if (!cancelled) setRecentCompletion(null) })
    return () => { cancelled = true }
  }, [realBooks])
  // 书签切换：乐观更新，失败回滚
  const toggleBookmark = (chapterId: string) => {
    if (activeRealBookId === null) return
    const bookId = activeRealBookId
    const bookmarked = learningBook.readingProgress?.bookmarkedChapterIds.includes(chapterId) ?? false
    const action = bookmarked ? 'unbookmark' : 'bookmark'
    const applyLocal = (ids: string[]) => {
      setLearningBook((current) => current.id === bookId
        ? { ...current, readingProgress: { visitedChapterIds: [], lastReadAt: {}, ...current.readingProgress, bookmarkedChapterIds: ids } }
        : current)
    }
    applyLocal(bookmarked
      ? (learningBook.readingProgress?.bookmarkedChapterIds ?? []).filter((id) => id !== chapterId)
      : [...(learningBook.readingProgress?.bookmarkedChapterIds ?? []), chapterId])
    postReadingProgress(bookId, chapterId, action)
      .then(({ progress }) => {
        setLearningBook((current) => current.id === bookId ? { ...current, readingProgress: progress } : current)
        setRealBooks((current) => current.map((entry) => entry.id === bookId ? { ...entry, readingProgress: progress } : entry))
      })
      .catch(() => applyLocal(learningBook.readingProgress?.bookmarkedChapterIds ?? []))
  }
  // 作答/自评返回的调度并入书状态：null 表示该块不再调度（删 key）
  const mergeReviewSchedule = (current: LearningBook, blockId: string, schedule: ReviewScheduleEntry | null): LearningBook => {
    const reviewSchedule = { ...(current.reviewSchedule ?? {}) }
    if (schedule) reviewSchedule[blockId] = schedule
    else delete reviewSchedule[blockId]
    return { ...current, reviewSchedule }
  }
  const isRealProposal = activeRealBookId !== null && !isInteractiveBook
  // 摸底入口：真实书全部章节待生成且尚未开始生成时出现；换书/已选择后不再出现
  const showPretestEntry = isInteractiveBook
    && activeRealBookId !== null
    && isRealBookLoaded
    && pretestEntryDismissedFor !== activeRealBookId
    && realBookGeneration.progress === null
    && learningBook.chapters.length > 0
    && learningBook.chapters.every((chapter) => chapter.status === 'pending')

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
        setIsLearningDataOpen(window.location.hash === learningDataHash)
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
    // 随书状态不跨书残留：切换/退出真实书时关掉复习 Sheet 与掌握度看板，
    // 否则新书空到期列表会以遗留的「复习完成」弹层出现
    setIsReviewSheetOpen(false)
    setIsMasteryBoardOpen(false)
    if (!activeRealBookId) {
      setRealBookLoadError(null)
      setReviewDue([])
      return
    }
    let cancelled = false
    setRealBookLoadError(null)
    getBook(activeRealBookId)
      .then((book) => {
        if (cancelled) return
        setLearningBook(book)
        refreshReviewDue(book.id)
      })
      .catch(() => { if (!cancelled) setRealBookLoadError('学习书加载失败，请返回知识库重试。') })
    return () => { cancelled = true }
  }, [activeRealBookId, refreshReviewDue])

  // 知识库真实书列表：挂载时拉取一次，失败静默为空列表
  useEffect(() => {
    let cancelled = false
    listBooks()
      .then((books) => { if (!cancelled) setRealBooks(books) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  // 长期学习者模型：真实书变化后重新派生（今日页悬崖/节律候选的数据源）；失败静默保持旧值
  useEffect(() => {
    let cancelled = false
    getLearnerProfile()
      .then((profile) => { if (!cancelled) setLearnerProfile(profile) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [realBooks])

  // 题库：看板打开时拉取该书题库（派生读模型）；作答/自评改变书状态后自动刷新
  const [bankItems, setBankItems] = useState<BankItem[]>([])
  useEffect(() => {
    if (!isMasteryBoardOpen || activeRealBookId === null) return
    let cancelled = false
    getBank(activeRealBookId)
      .then((items) => { if (!cancelled) setBankItems(items) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [isMasteryBoardOpen, activeRealBookId, learningBook])

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
        // 不自动开始生成：确认后先给“先摸底（5 题）/直接开始生成”可选入口
      } catch (error) {
        setRealBookConfirmError(realBookActionErrorMessage(error))
      } finally {
        setIsConfirmingRealBook(false)
      }
    })()
  }

  // 真实书答题：走服务端持久化，返回的 attempt/evidence/schedule 合并进当前书状态并刷新到期复习项；
  // 失败返回 false（不破坏当前书状态），由答题组件显示可重试的错误提示
  const submitRealQuizAttempt = (blockId: string, answerId: string): Promise<boolean> => {
    const bookId = activeRealBookIdRef.current
    if (!bookId) return Promise.resolve(false)
    return submitAttempt(bookId, blockId, answerId)
      .then((result) => {
        setLearningBook((current) => {
          if (current.id !== bookId) return current
          const merged = mergeReviewSchedule(current, blockId, result.schedule)
          return {
            ...merged,
            quizAttempts: [...merged.quizAttempts, result.attempt],
            evidence: [...merged.evidence, result.evidence],
          }
        })
        refreshReviewDue(bookId)
        return true
      })
      .catch(() => false)
  }

  // 闪卡自评：提交服务端调度结果，合并进书状态并刷新到期复习项；失败返回 false（与 onSubmitQuiz 一致），
  // 容错上不刷新 reviewDue、保持现状，由组件显示可重试的失败提示
  const submitFlashReviewGrade = async (blockId: string, result: 'remembered' | 'forgotten'): Promise<boolean> => {
    const bookId = activeRealBookIdRef.current
    if (!bookId) return false
    try {
      const schedule = await submitFlashReview(bookId, blockId, result)
      setLearningBook((current) => current.id === bookId ? mergeReviewSchedule(current, blockId, schedule) : current)
      refreshReviewDue(bookId)
      return true
    } catch {
      return false
    }
  }

  // 用户笔记：服务端持久化后并入书状态；失败返回 false，由组件显示可重试提示。
  // 笔记是用户数据，写书级 userNotes，不参与任何重新生成流程
  const addRealBookNote = async (chapterId: string, blockId: string, body: string): Promise<boolean> => {
    const bookId = activeRealBookIdRef.current
    if (!bookId) return false
    try {
      const note = await addNote(bookId, chapterId, blockId, body)
      setLearningBook((current) => current.id === bookId ? { ...current, userNotes: [...current.userNotes, note] } : current)
      return true
    } catch {
      return false
    }
  }

  const deleteRealBookNote = async (noteId: string): Promise<boolean> => {
    const bookId = activeRealBookIdRef.current
    if (!bookId) return false
    try {
      await deleteNote(bookId, noteId)
      setLearningBook((current) => current.id === bookId ? { ...current, userNotes: current.userNotes.filter((note) => note.id !== noteId) } : current)
      return true
    } catch {
      return false
    }
  }

  // 对话沉淀：Agent 回答 → 存为当前章笔记（挂章首块）/ 存入题库问答卡（规格 D，规则拼装零 LLM）
  const captureAgentNote = async ({ answer }: { question: string; answer: string }): Promise<boolean> => {
    const chapter = learningBook.chapters.find((entry) => entry.id === activeBookChapterId)
    const blockId = chapter?.blocks[0]?.id
    if (!blockId) return false
    return addRealBookNote(activeBookChapterId, blockId, answer)
  }

  const captureAgentCard = async ({ question, answer, firstSourcePage }: { question: string; answer: string; firstSourcePage?: string }): Promise<boolean> => {
    const bookId = activeRealBookIdRef.current
    if (!bookId) return false
    try {
      await addCard(bookId, {
        chapterId: activeBookChapterId,
        front: question.trim() || '未命名问题',
        back: answer.replace(/\s+/g, ' ').trim().slice(0, 200),
        hint: firstSourcePage,
      })
      return true
    } catch {
      return false
    }
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
      setIsLearningDataOpen(false)
    })
  }

  const openLearningData = () => {
    window.history.pushState({ screen: 'learning-data' }, '', learningDataHash)
    updateWithViewTransition(() => {
      setIsLearningDataOpen(true)
    })
  }

  // 薄弱概念智能出题：成功即跳入来源书（新题落在概念所在章末）；
  // 失败原样抛出 BookApiError，由 LearningDataPage 按 code 行内提示
  const generateAdaptiveQuiz = async (bookId: string, conceptId: string): Promise<boolean> => {
    await postAdaptiveQuiz(bookId, conceptId)
    openRealBook(bookId)
    return true
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

  // 摸底入口收口：直接开始生成，或提交摸底后从建议章节开始；两种情况都开始逐章生成
  const dismissPretestEntryAndStart = (chapterId?: string) => {
    setPretestEntryDismissedFor(activeRealBookId)
    setIsPretestSheetOpen(false)
    if (chapterId) changeBookChapter(chapterId)
    realBookGeneration.start()
  }

  const askBookAgent = (focusBlockId?: string, draft?: string) => {
    const executionPlan = orchestrateAgentRequest({
      intent: 'ask_question',
      bookId: learningBook.id,
      chapterId: activeBookChapterId,
      contextScope: bookContextScope,
    })
    bookAgent.setFocusBlockId(focusBlockId)
    if (draft) setAgentDraft(draft)
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

  // 掌握度看板行跳转：切章 + 关 Sheet + 等块渲染后滚动（复用来源跳转的滚动机制）
  const openMasteryBoardConcept = (chapterId: string, blockId: string) => {
    changeBookChapter(chapterId)
    setIsMasteryBoardOpen(false)
    const behavior: ScrollBehavior = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth'
    // 滚动推迟到下一帧：与来源跳转「先关抽屉、popstate 后再滚动」的已验证时序对齐——
    // 同一拍内同步启动的平滑滚动会被随后 Sheet 卸载的布局/绘制变化打断，导致停在章首
    window.requestAnimationFrame(() => scrollToElementWhenReady(blockId, { behavior }))
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
      setIsLearningDataOpen(false)
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

  // 今日主行动：有真实书下一步时直接打开该书（提案→目录页，其余→阅读页），否则走 mock 演示流程
  const continueToday = () => {
    if (todayRealBook) {
      openRealBook(todayRealBook.id)
      return
    }
    continueTodayLearning()
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
          onCaptureNote={isRealBookLoaded ? captureAgentNote : undefined}
          onCaptureCard={isRealBookLoaded ? captureAgentCard : undefined}
        />
      }
    >
        <TodayPage
          isActive={!isLearningDataOpen && !activeDocumentId && !isInteractiveBook && !activeRealBookId && !activeLearningId && activeDestination === 'today'}
          isOutcomeMode={isTodayOutcome}
          onContinue={continueToday}
          learningEvidenceCount={todayBook.evidence.length}
          learningBook={todayBook}
          learnerProfile={learnerProfile}
          continueReadingLabel={recentCompletion ? `继续读《${recentCompletion.bookTitle}》${recentCompletion.chapterTitle}` : undefined}
          onOpenLearningData={openLearningData}
        />
        <LearningMapPage
          isActive={!isLearningDataOpen && !activeDocumentId && !isInteractiveBook && !activeRealBookId && !activeLearningId && activeDestination === 'learning'}
          viewport={mapViewport}
          onViewportChange={setMapViewport}
          isChangeFocus={isMapChangeFocus}
          onScheduleNext={openTodayOutcome}
          learningEvidence={learningBook.evidence}
          mapNodes={bookMap.nodes.length > 0 ? bookMap.nodes : undefined}
          mapRelationships={bookMap.nodes.length > 0 ? bookMap.relationships : undefined}
        />
        <KnowledgeLibraryPage
          isActive={!isLearningDataOpen && !activeDocumentId && !isInteractiveBook && !activeRealBookId && !activeLearningId && activeDestination === 'library'}
          onOpenDocument={openDocument}
          bookStatusLabel={bookStatusLabel}
          realBooks={realBooks}
          onUploadBook={openUploadBook}
          onOpenRealBook={openRealBook}
        />
        <LearningDataPage
          isActive={isLearningDataOpen}
          learnerProfile={learnerProfile}
          recentCompletion={recentCompletion}
          onOpenBook={openRealBook}
          onGenerateQuiz={generateAdaptiveQuiz}
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
              onSubmitQuizAttempt={submitRealQuizAttempt}
              reviewCount={reviewDue.length}
              chapterReviewCount={reviewDue.filter((item) => item.chapterId === activeBookChapterId).length}
              onOpenReview={reviewDue.length > 0 ? () => setIsReviewSheetOpen(true) : undefined}
              onOpenMasteryBoard={() => setIsMasteryBoardOpen(true)}
              onToggleBookmark={toggleBookmark}
              onFlashGrade={submitFlashReviewGrade}
              onAddNote={activeRealBookId !== null ? addRealBookNote : undefined}
              onDeleteNote={activeRealBookId !== null ? deleteRealBookNote : undefined}
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
        {showPretestEntry && (
          <section className="pretest-entry" aria-label="摸底诊断入口">
            <div className="pretest-entry__copy">
              <strong>先摸底，再开始</strong>
              <span>5 道小题判断你的起点，已掌握的章节可以跳过；也可以直接开始生成。</span>
            </div>
            <div className="pretest-entry__actions">
              <button type="button" className="pretest-entry__primary" onClick={() => setIsPretestSheetOpen(true)}>先摸底（5 题）</button>
              <button type="button" className="pretest-entry__ghost" onClick={() => dismissPretestEntryAndStart()}>直接开始生成</button>
            </div>
          </section>
        )}
        {isPretestSheetOpen && isInteractiveBook && activeRealBookId !== null && isRealBookLoaded && (
          <PretestSheet
            key={activeRealBookId}
            bookId={activeRealBookId}
            chapters={learningBook.chapters}
            pretest={learningBook.pretest}
            onResolved={(book) => setLearningBook(book)}
            onStartFromChapter={(chapterId) => dismissPretestEntryAndStart(chapterId)}
            onClose={() => setIsPretestSheetOpen(false)}
          />
        )}
        {isReviewSheetOpen && isInteractiveBook && activeRealBookId !== null && isRealBookLoaded && (
          <ReviewQueueSheet
            key={activeRealBookId}
            book={learningBook}
            dueItems={reviewDue}
            onSubmitQuiz={submitRealQuizAttempt}
            onFlashGrade={submitFlashReviewGrade}
            onClose={() => setIsReviewSheetOpen(false)}
          />
        )}
        {isMasteryBoardOpen && isInteractiveBook && activeRealBookId !== null && isRealBookLoaded && (
          <MasteryBoardSheet
            key={activeRealBookId}
            rows={buildMasteryBoard(learningBook, new Date())}
            book={learningBook}
            bankItems={bankItems}
            onSubmitQuizAttempt={submitRealQuizAttempt}
            onFlashGrade={submitFlashReviewGrade}
            onOpenConcept={openMasteryBoardConcept}
            onClose={() => setIsMasteryBoardOpen(false)}
          />
        )}
    </AppShell>
  )
}

export default App
