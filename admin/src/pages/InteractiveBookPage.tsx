import { Icon } from '../components/Icon'
import { BookBlockRenderer } from '../components/book/BookBlockRenderer'
import { BookContextBar } from '../components/book/BookContextBar'
import { BookGenerationRail } from '../components/book/BookGenerationRail'
import { advanceGeneration, regenerateBlock, retryChapterGeneration, submitQuizAttempt, updateUserNote } from '../domain/learningBook'
import { chapterMastery, deriveConceptLearningState, latestAttemptForBlock, latestEvidenceForBlock } from '../domain/learningProjection'
import type { AgentContextScope, LearningBook } from '../types/learningBook'

interface InteractiveBookPageProps {
  book: LearningBook
  activeChapterId: string
  contextScope: AgentContextScope
  onBookChange: (book: LearningBook) => void
  onChapterChange: (chapterId: string) => void
  onContextScopeChange: (scope: AgentContextScope) => void
  onAskAgent: (focusBlockId?: string) => void
  onBack: () => void
  onStartDeepLearning: (blockId: string) => void
  /** 真实书：生成中视图显示流式进度、隐藏 mock 的“完成本章生成”，块级重生成不渲染 */
  isRealBook?: boolean
  /** 当前章的流式进度（仅真实书生成中传入） */
  chapterProgress?: { blocksReceived: number } | null
  /** 真实书失败章重试：重新发起该章的流式生成 */
  onRetryChapter?: (chapterId: string) => void
  /** 真实书：答题提交走服务端持久化（异步）；缺省时走本地 mock 逻辑 */
  onSubmitQuizAttempt?: (blockId: string, answerId: string) => Promise<void>
  /** 真实书错题复习：全书/本章待复习错题数（>0 且提供 onOpenReview 时渲染对应入口） */
  reviewCount?: number
  chapterReviewCount?: number
  onOpenReview?: () => void
}

export function InteractiveBookPage(props: InteractiveBookPageProps) {
  const { book, activeChapterId, contextScope, onBookChange, onChapterChange, onContextScopeChange, onAskAgent, onBack, onStartDeepLearning, isRealBook = false, chapterProgress = null, onRetryChapter, onSubmitQuizAttempt, reviewCount = 0, chapterReviewCount = 0, onOpenReview } = props
  const activeChapter = book.chapters.find((chapter) => chapter.id === activeChapterId) ?? book.chapters[0]
  const nextChapter = book.chapters[activeChapter.order + 1]
  const chapterOrdinal = ['一', '二', '三', '四', '五', '六'][activeChapter.order] ?? String(activeChapter.order + 1)
  // 掌握度与概念学习状态仅对真实书从 attempts 派生（mock 原型页行为不变）
  const activeChapterMastery = isRealBook ? chapterMastery(book, activeChapter.id) : null
  const masteryByChapterId = isRealBook
    ? Object.fromEntries(
        book.chapters
          .map((chapter) => [chapter.id, chapterMastery(book, chapter.id)] as const)
          .filter((entry): entry is readonly [string, number] => entry[1] !== null),
      )
    : undefined

  return (
    <section className="interactive-book-page" aria-labelledby="interactive-book-title">
      <header className="interactive-book-navigation">
        <button type="button" onClick={onBack} aria-label="返回知识库"><Icon name="back" size={21} />知识库</button>
        <div><span>互动学习书</span><strong>{book.proposal.title}</strong></div>
        <span className="interactive-book-navigation__source"><Icon name="document" size={16} />{book.source.fileName}</span>
      </header>

      <BookGenerationRail chapters={book.chapters} activeChapterId={activeChapter.id} onChapterChange={onChapterChange} masteryByChapterId={masteryByChapterId} pretestResult={isRealBook ? book.pretest?.result ?? null : null} reviewCount={isRealBook ? reviewCount : 0} onOpenReview={isRealBook ? onOpenReview : undefined} />

      <main className="interactive-book-reader">
        <BookContextBar contextScope={contextScope} onContextScopeChange={onContextScopeChange} onAskAgent={onAskAgent} />

        {activeChapter.status === 'generating' ? (
          <section className="book-generating-state" aria-live="polite">
            <span className="book-generating-state__orb"><Icon name="spark" size={34} /></span>
            <p>第 {activeChapter.order + 1} 章 · 正在理解原文</p>
            <h1 id="interactive-book-title">正在生成第{chapterOrdinal}章</h1>
            <span>Agent 正在依据第 {activeChapter.sourceAnchors.map((anchor) => anchor.pageRange).join('、')} 页组织讲解、例子和验证题。本章完成后即可开始阅读，后续章节会继续生成。</span>
            <div className="book-generating-state__steps"><i className="is-done" /><i className="is-active" /><i /><i /></div>
            {isRealBook && <span>已生成 {chapterProgress?.blocksReceived ?? 0} 块</span>}
            {!isRealBook && <button type="button" onClick={() => onBookChange(advanceGeneration(book))}>完成本章生成 <Icon name="arrow" size={17} /></button>}
          </section>
        ) : activeChapter.status === 'error' ? (
          <section className="book-pending-state" role="alert">
            <Icon name="refresh" size={28} />
            <h1 id="interactive-book-title">这一章生成失败了</h1>
            <p>已有章节和学习记录不会受到影响，可以单独重试当前章节。</p>
            <button type="button" className="book-block__primary" onClick={() => {
              if (isRealBook) onRetryChapter?.(activeChapter.id)
              else onBookChange(retryChapterGeneration(book, activeChapter.id))
            }}>重新生成本章</button>
          </section>
        ) : activeChapter.status === 'ready' || activeChapter.status === 'partial' ? (
          <article className="interactive-book-chapter">
            <header className="interactive-book-chapter__hero">
              <p>
                第 {activeChapter.order + 1} 章 · {activeChapter.estimatedMinutes} 分钟
                {activeChapterMastery !== null && ` · 掌握度 ${Math.round(activeChapterMastery * 100)}%`}
              </p>
              <h1 id="interactive-book-title">{book.proposal.title}</h1>
              <h2>{activeChapter.title}</h2>
              <span>{activeChapter.objective}</span>
              <small>依据原文第 {activeChapter.sourceAnchors.map((anchor) => anchor.pageRange).join('、')} 页生成</small>
            </header>
            <div className="interactive-book-blocks">
              {activeChapter.blocks.map((block) => {
                // 概念学习状态由客户端从 attempts 派生（真实书），不改服务端块数据
                const displayBlock = isRealBook && block.type === 'concept'
                  ? { ...block, concepts: block.concepts.map((concept) => ({ ...concept, learningState: deriveConceptLearningState(book, concept.id) })) }
                  : block
                return (
                  <BookBlockRenderer
                    key={block.id}
                    block={displayBlock}
                    note={block.type === 'user_note' ? book.userNotes.find((note) => note.id === block.noteId) : undefined}
                    attempt={latestAttemptForBlock(book.quizAttempts, block.id)}
                    evidence={block.type === 'quiz' ? latestEvidenceForBlock(book.evidence, block.id) : undefined}
                    allowBlockRegenerate={!isRealBook}
                    allowQuizRetry={isRealBook}
                    onRegenerate={(blockId) => onBookChange(regenerateBlock(book, blockId))}
                    onSubmitQuiz={isRealBook && onSubmitQuizAttempt
                      ? (blockId, answerId) => onSubmitQuizAttempt(blockId, answerId)
                      : (blockId, answerId) => onBookChange(submitQuizAttempt(book, blockId, answerId))}
                    onUpdateNote={(noteId, body) => onBookChange(updateUserNote(book, noteId, body))}
                    onStartDeepLearning={onStartDeepLearning}
                    onAskAgent={onAskAgent}
                  />
                )
              })}
            </div>
            {isRealBook && chapterReviewCount > 0 && onOpenReview && (
              <footer className="interactive-book-chapter__review">
                <div><span>错题复习</span><strong>本章还有 {chapterReviewCount} 道错题待复习</strong></div>
                <button type="button" onClick={onOpenReview}>复习本章错题 <Icon name="arrow" size={17} /></button>
              </footer>
            )}
            {nextChapter && (
              <footer className="interactive-book-chapter__next">
                <div><span>接下来</span><strong>{nextChapter.title}</strong></div>
                <button type="button" onClick={() => onChapterChange(nextChapter.id)}>继续生成下一章 <Icon name="arrow" size={17} /></button>
              </footer>
            )}
          </article>
        ) : (
          <section className="book-pending-state">
            <Icon name="clock" size={28} /><h1 id="interactive-book-title">这一章正在排队</h1><p>先完成前面的章节，系统会按目录顺序继续生成。</p>
          </section>
        )}
      </main>
    </section>
  )
}
