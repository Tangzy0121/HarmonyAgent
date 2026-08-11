import { Icon } from '../Icon'
import { BookBlockRenderer } from './BookBlockRenderer'
import { latestAttemptForBlock, latestEvidenceForBlock } from '../../domain/learningProjection'
import { buildReviewQueue } from '../../domain/reviewQueue'
import type { LearningBook } from '../../types/learningBook'

interface ReviewQueueSheetProps {
  book: LearningBook
  /** 复习答题回调：与章节内答题同一条链路（真实书走服务端多次作答） */
  onSubmitQuiz: (blockId: string, answerId: string) => void | Promise<void>
  onClose: () => void
}

/**
 * 错题复习视图：展示复习队列中的 quiz 块，复用 BookBlockRenderer 的 quiz 渲染与答题回调；
 * 答对后该项出队（最近一次为对），队列清空时进入完成态。
 */
export function ReviewQueueSheet({ book, onSubmitQuiz, onClose }: ReviewQueueSheetProps) {
  const queue = buildReviewQueue(book)

  return (
    <>
      <button
        type="button"
        className="pretest-sheet__scrim"
        aria-label="关闭错题复习"
        tabIndex={-1}
        onClick={onClose}
      />
      <aside className="pretest-sheet review-sheet" role="dialog" aria-modal="true" aria-labelledby="review-sheet-title">
        <div className="pretest-sheet__grip" aria-hidden="true" />
        <header className="pretest-sheet__heading">
          <div>
            <p>错题复习</p>
            <h2 id="review-sheet-title">{queue.length > 0 ? `待复习 ${queue.length} 题` : '复习完成'}</h2>
          </div>
          <button type="button" className="pretest-sheet__close" aria-label="关闭" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </header>

        {queue.length === 0 ? (
          <p className="pretest-sheet__status">错题都已答对，复习完成。</p>
        ) : (
          <div className="review-sheet__blocks">
            {queue.map((item) => {
              const chapter = book.chapters.find((candidate) => candidate.id === item.chapterId)
              const block = chapter?.blocks.find((candidate) => candidate.id === item.blockId)
              if (!chapter || !block || block.type !== 'quiz') return null
              return (
                <section key={item.blockId} className="review-sheet__item">
                  <p className="review-sheet__chapter">第 {chapter.order + 1} 章 · {chapter.title}</p>
                  <BookBlockRenderer
                    block={block}
                    attempt={latestAttemptForBlock(book.quizAttempts, block.id)}
                    evidence={latestEvidenceForBlock(book.evidence, block.id)}
                    allowBlockRegenerate={false}
                    allowQuizRetry
                    onRegenerate={() => undefined}
                    onSubmitQuiz={onSubmitQuiz}
                    onUpdateNote={() => undefined}
                    onStartDeepLearning={() => undefined}
                    onAskAgent={() => undefined}
                  />
                </section>
              )
            })}
          </div>
        )}
      </aside>
    </>
  )
}
