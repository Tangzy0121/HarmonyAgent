import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { learningBookFixture } from '../../data/learningBook'
import type { QuizAttempt } from '../../types/learningBook'
import { ReviewQueueSheet } from './ReviewQueueSheet'

const wrongAttempt: QuizAttempt = {
  id: 'attempt_wrong',
  chapterId: 'ch-1',
  blockId: 'blk-quiz-1',
  answerId: 'answer-a',
  isCorrect: false,
  submittedAt: '2026-08-11T01:00:00.000Z',
}

describe('ReviewQueueSheet', () => {
  it('renders queued quiz blocks with their chapter and question', () => {
    const book = { ...learningBookFixture, quizAttempts: [wrongAttempt] }
    const html = renderToStaticMarkup(
      <ReviewQueueSheet book={book} onSubmitQuiz={() => undefined} onClose={() => undefined} />,
    )

    expect(html).toContain('错题复习')
    expect(html).toContain('待复习 1 题')
    expect(html).toContain('第 1 章 · 监督学习的判断起点')
    expect(html).toContain('没有标签的邮件被模型自动分组，这属于监督学习吗？')
    expect(html).toContain('这次还没有答对。')
  })

  it('shows a completion state once every wrong block has been answered correctly', () => {
    const book = {
      ...learningBookFixture,
      quizAttempts: [
        wrongAttempt,
        { ...wrongAttempt, id: 'attempt_correct', answerId: 'answer-b', isCorrect: true, submittedAt: '2026-08-11T02:00:00.000Z' },
      ],
    }
    const html = renderToStaticMarkup(
      <ReviewQueueSheet book={book} onSubmitQuiz={() => undefined} onClose={() => undefined} />,
    )

    expect(html).toContain('错题都已答对，复习完成')
    expect(html).not.toContain('快速验证')
  })
})
