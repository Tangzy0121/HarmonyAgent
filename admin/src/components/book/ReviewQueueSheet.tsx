import { Icon } from '../Icon'
import { BookBlockRenderer } from './BookBlockRenderer'
import { FlashCards } from './FlashCards'
import { latestAttemptForBlock, latestEvidenceForBlock } from '../../domain/learningProjection'
import type { DueItem } from '../../services/bookApi'
import type { LearningBook } from '../../types/learningBook'

interface ReviewQueueSheetProps {
  book: LearningBook
  /** 服务端到期复习项（quiz + 闪卡），由父级在加载/作答/自评后经 getReviewDue 刷新 */
  dueItems: DueItem[]
  /** 复习答题回调：与章节内答题同一条链路（真实书走服务端多次作答；false 表示失败，由答题组件提示） */
  onSubmitQuiz: (blockId: string, answerId: string) => void | Promise<boolean | void>
  /** 闪卡自评回调：提交服务端调度并刷新到期列表 */
  onFlashGrade: (blockId: string, result: 'remembered' | 'forgotten') => Promise<boolean | void>
  onClose: () => void
}

/**
 * 今日复习视图：按服务端到期列表渲染——quiz 块复用 BookBlockRenderer 的答题链路，
 * 闪卡块复用 FlashCards 翻卡并附「没记住 / 记住了」自评；到期项清空时进入完成态。
 */
export function ReviewQueueSheet({ book, dueItems, onSubmitQuiz, onFlashGrade, onClose }: ReviewQueueSheetProps) {
  return (
    <>
      <button
        type="button"
        className="pretest-sheet__scrim"
        aria-label="关闭复习"
        tabIndex={-1}
        onClick={onClose}
      />
      <aside className="pretest-sheet review-sheet" role="dialog" aria-modal="true" aria-labelledby="review-sheet-title">
        <div className="pretest-sheet__grip" aria-hidden="true" />
        <header className="pretest-sheet__heading">
          <div>
            <p>今日复习</p>
            <h2 id="review-sheet-title">{dueItems.length > 0 ? `待复习 ${dueItems.length} 项` : '复习完成'}</h2>
          </div>
          <button type="button" className="pretest-sheet__close" aria-label="关闭" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </header>

        {dueItems.length === 0 ? (
          <p className="pretest-sheet__status">今天的复习都完成了。</p>
        ) : (
          <div className="review-sheet__blocks">
            {dueItems.map((item) => {
              const chapter = book.chapters.find((candidate) => candidate.id === item.chapterId)
              const block = chapter?.blocks.find((candidate) => candidate.id === item.blockId)
              if (!chapter || !block) return null
              return (
                <section key={item.blockId} className="review-sheet__item">
                  <p className="review-sheet__chapter">第 {chapter.order + 1} 章 · {chapter.title}</p>
                  {item.kind === 'quiz' && block.type === 'quiz' && (
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
                    />
                  )}
                  {item.kind === 'flash_cards' && block.type === 'flash_cards' && (
                    <div className="review-sheet__flash">
                      <h3 className="review-sheet__flash-title">{block.title}</h3>
                      <FlashCards block={block} />
                      <div className="review-sheet__grade">
                        <button type="button" className="review-sheet__grade-button" onClick={() => void onFlashGrade(item.blockId, 'forgotten')}>没记住</button>
                        <button type="button" className="review-sheet__grade-button is-remembered" onClick={() => void onFlashGrade(item.blockId, 'remembered')}>记住了</button>
                      </div>
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </aside>
    </>
  )
}
