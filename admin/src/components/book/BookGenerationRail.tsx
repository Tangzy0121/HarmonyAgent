import { Icon } from '../Icon'
import type { BookChapter, PretestResult } from '../../types/learningBook'

interface BookGenerationRailProps {
  chapters: BookChapter[]
  activeChapterId: string
  onChapterChange: (chapterId: string) => void
  /** 各章掌握度（0..1，仅真实书在有 attempts 时传入；缺省不展示） */
  masteryByChapterId?: Partial<Record<string, number>>
  /** 摸底结论（仅真实书有 result 时传入）：标注可跳过章与建议起点 */
  pretestResult?: PretestResult | null
  /** 全书待复习错题数（仅真实书传入；>0 且提供 onOpenReview 时显示书级复习入口） */
  reviewCount?: number
  onOpenReview?: () => void
}

const statusLabel = {
  pending: '等待生成',
  generating: '生成中',
  ready: '可阅读',
  partial: '部分可读',
  error: '生成失败',
} as const

export function BookGenerationRail({ chapters, activeChapterId, onChapterChange, masteryByChapterId, pretestResult, reviewCount = 0, onOpenReview }: BookGenerationRailProps) {
  return (
    <aside className="book-generation-rail" aria-label="互动学习书目录">
      <header>
        <span>学习路径</span>
        <strong>{chapters.filter((chapter) => chapter.status === 'ready').length}/{chapters.length}</strong>
      </header>
      <ol>
        {chapters.map((chapter, index) => (
          <li key={chapter.id} data-status={chapter.status}>
            <button
              type="button"
              className={chapter.id === activeChapterId ? 'is-active' : ''}
              onClick={() => onChapterChange(chapter.id)}
              aria-current={chapter.id === activeChapterId ? 'step' : undefined}
            >
              <span className="book-generation-rail__number">
                {chapter.status === 'ready' ? <Icon name="check" size={15} /> : index + 1}
              </span>
              <span className="book-generation-rail__copy">
                <strong>{chapter.title}</strong>
                <small>
                  {statusLabel[chapter.status]} · {chapter.estimatedMinutes} 分钟
                  {masteryByChapterId?.[chapter.id] !== undefined && ` · 掌握度 ${Math.round(masteryByChapterId[chapter.id]! * 100)}%`}
                </small>
                {pretestResult && (pretestResult.skippableChapterIds.includes(chapter.id) || pretestResult.suggestedStartChapterId === chapter.id) && (
                  <span className="book-generation-rail__pretest">
                    {pretestResult.skippableChapterIds.includes(chapter.id) && (
                      <em className="book-generation-rail__pretest-skip">可跳过</em>
                    )}
                    {pretestResult.suggestedStartChapterId === chapter.id && (
                      <em className="book-generation-rail__pretest-start">建议从这里开始</em>
                    )}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ol>
      {reviewCount > 0 && onOpenReview && (
        <footer className="book-generation-rail__review">
          <button type="button" onClick={onOpenReview}>复习错题（{reviewCount}）</button>
        </footer>
      )}
    </aside>
  )
}
