import { useState } from 'react'

import { submitFeynman, type FeynmanResult } from '../../services/bookApi'
import { Icon } from '../Icon'

interface FeynmanCardProps {
  bookId: string
  chapterId: string
  /** 未通过时「回看本章内容」：父层负责滚动回章首块列表 */
  onReviewBlocks?: () => void
}

const MAX_EXPLANATION_LENGTH = 2000
const SUBMIT_ERROR_MESSAGE = '评判失败，请检查网络后重试。'

export function FeynmanCard({ bookId, chapterId, onReviewBlocks }: FeynmanCardProps) {
  const [explanation, setExplanation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [result, setResult] = useState<FeynmanResult | null>(null)

  const canSubmit = explanation.trim().length > 0 && !submitting

  const handleSubmit = () => {
    if (!canSubmit) return
    setSubmitting(true)
    setSubmitError(null)
    submitFeynman(bookId, chapterId, explanation.trim())
      .then(setResult)
      .catch(() => setSubmitError(SUBMIT_ERROR_MESSAGE))
      .finally(() => setSubmitting(false))
  }

  return (
    <section className="feynman-card" aria-labelledby="feynman-card-title">
      <header className="feynman-card__heading">
        <p>章末检验</p>
        <h2 id="feynman-card-title">用自己的话讲讲本章</h2>
        <span>能讲明白，才算真学会。讲不清楚的地方，正是需要回看的地方。</span>
      </header>

      {result === null ? (
        <>
          <textarea
            className="feynman-card__input"
            value={explanation}
            maxLength={MAX_EXPLANATION_LENGTH}
            rows={4}
            placeholder="合上书本，试着把这一章的核心讲给别人听…"
            onChange={(event) => setExplanation(event.target.value)}
          />
          <div className="feynman-card__meta">
            <span>{explanation.length}/{MAX_EXPLANATION_LENGTH}</span>
          </div>
          {submitError && (
            <p className="feynman-card__error" role="alert">{submitError}</p>
          )}
          <button
            type="button"
            className="feynman-card__submit"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {submitting ? '评判中…' : '提交复述'}
          </button>
        </>
      ) : result.passed ? (
        <div className="feynman-card__result">
          <p className="feynman-card__verdict"><Icon name="check" size={16} />讲明白了！</p>
          <p>{result.feedback}</p>
        </div>
      ) : (
        <div className="feynman-card__result">
          <p className="feynman-card__verdict">还差一点</p>
          <p>{result.feedback}</p>
          <p className="feynman-card__gap">{result.gap}</p>
          <button type="button" className="feynman-card__review" onClick={() => onReviewBlocks?.()}>
            回看本章内容 <Icon name="arrow" size={17} />
          </button>
        </div>
      )}
    </section>
  )
}
