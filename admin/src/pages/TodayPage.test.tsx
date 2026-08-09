import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { learningBookFixture } from '../data/learningBook'
import { submitQuizAttempt } from '../domain/learningBook'
import { TodayPage } from './TodayPage'

describe('TodayPage learning evidence projection', () => {
  it('recommends the next chapter after correct evidence', () => {
    const book = submitQuizAttempt(learningBookFixture, 'blk-quiz-1', 'answer-b')
    const html = renderToStaticMarkup(<TodayPage isActive learningBook={book} learningEvidenceCount={1} onContinue={() => undefined} />)

    expect(html).toContain('从误差到参数更新')
    expect(html).toContain('已有证据')
  })

  it('recommends review after incorrect evidence', () => {
    const book = submitQuizAttempt(learningBookFixture, 'blk-quiz-1', 'answer-a')
    const html = renderToStaticMarkup(<TodayPage isActive learningBook={book} learningEvidenceCount={1} onContinue={() => undefined} />)

    expect(html).toContain('再看一次：监督学习的判断起点')
    expect(html).toContain('需要巩固')
  })
})
