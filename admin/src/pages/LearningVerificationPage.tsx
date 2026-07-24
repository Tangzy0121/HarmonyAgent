import { useState } from 'react'
import { Icon } from '../components/Icon'
import { learningVerification } from '../data/prototype'

interface LearningVerificationPageProps {
  isActive: boolean
  onAskAgent: () => void
  onBack: () => void
  onCompleteLearning: () => void
}

type FeedbackKind = 'correct' | 'partial' | 'review'

export function LearningVerificationPage({ isActive, onAskAgent, onBack, onCompleteLearning }: LearningVerificationPageProps) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null)
  const [feedbackKind, setFeedbackKind] = useState<FeedbackKind | null>(null)
  const task = learningVerification
  const selectedOption = task.options.find((option) => option.id === selectedOptionId)

  const submitAnswer = () => {
    if (!selectedOption) return
    setFeedbackKind(selectedOption.feedback)
  }

  const resetAnswer = () => {
    setSelectedOptionId(null)
    setFeedbackKind(null)
  }

  const handlePrimaryAction = () => {
    if (!feedbackKind) {
      submitAnswer()
      return
    }
    if (feedbackKind === 'correct') {
      onCompleteLearning()
      return
    }
    resetAnswer()
  }

  const primaryLabel = !feedbackKind
    ? '提交判断'
    : feedbackKind === 'correct'
      ? '继续完成学习'
      : '重新选择'

  const primaryContext = !feedbackKind
    ? selectedOption ? '提交后查看判断依据' : '先选择一个判断'
    : feedbackKind === 'correct'
      ? '生成本次学习证据'
      : '保留问题，重新判断训练信号'

  return (
    <section className="learning-validation-page" hidden={!isActive} aria-labelledby="learning-validation-title">
      <header className="learning-reader__navigation">
        <button type="button" className="document-detail__back" onClick={onBack} aria-label="返回解释阶段">
          <Icon name="back" size={22} />
          <span>解释</span>
        </button>
        <div className="learning-reader__stage" aria-label={`阶段 ${task.stageIndex}，${task.stage}`}>
          <span>{task.stageIndex}</span>
          <strong>{task.stage}</strong>
        </div>
      </header>

      <main className="learning-validation__content">
        <header className="learning-reader__hero learning-validation__hero">
          <p>验证理解</p>
          <h1 id="learning-validation-title">{task.title}</h1>
          <div className="learning-reader__progress learning-reader__progress--complete" aria-label="验证阶段，当前为第二阶段，共两阶段">
            <span className="learning-reader__progress-current" />
            <span className="learning-reader__progress-current" />
          </div>
        </header>

        <section className="learning-validation__question" aria-labelledby="learning-validation-question">
          <div className="learning-validation__question-index">
            <span>01</span>
            <strong>{task.promptLabel}</strong>
          </div>
          <h2 id="learning-validation-question">{task.question}</h2>
          <p>{task.scenario}</p>
        </section>

        <div className={feedbackKind ? 'learning-validation__answers learning-validation__answers--submitted' : 'learning-validation__answers'} role="radiogroup" aria-labelledby="learning-validation-question">
          {task.options.map((option) => {
            const isSelected = option.id === selectedOptionId
            if (feedbackKind && !isSelected) return null
            return (
              <button
                type="button"
                className={isSelected ? 'learning-validation__answer learning-validation__answer--selected' : 'learning-validation__answer'}
                key={option.id}
                role="radio"
                aria-checked={isSelected}
                disabled={Boolean(feedbackKind)}
                onClick={() => setSelectedOptionId(option.id)}
              >
                <span>{option.marker}</span>
                <strong>{option.text}</strong>
                {isSelected && !feedbackKind && <Icon name="check" size={19} />}
              </button>
            )
          })}
        </div>

        {feedbackKind && selectedOption && (
          <section className={`learning-feedback learning-feedback--${feedbackKind}`} role="status" aria-live="polite" aria-labelledby="learning-feedback-title">
            <header>
              <span className="learning-feedback__mark">
                <Icon name={feedbackKind === 'correct' ? 'check' : feedbackKind === 'partial' ? 'more' : 'document'} size={20} />
              </span>
              <div>
                <small>{selectedOption.feedbackLabel}</small>
                <h2 id="learning-feedback-title">{selectedOption.feedbackTitle}</h2>
              </div>
            </header>
            <p>{selectedOption.feedbackBody}</p>
            <div className="learning-feedback__evidence">
              <span>判断依据</span>
              <p>{selectedOption.evidence}</p>
            </div>
          </section>
        )}

        <section className="learning-validation__source" aria-labelledby="learning-validation-source-title">
          <div>
            <span><Icon name="link" size={18} /></span>
            <p>对应原文 · {task.source.location}</p>
          </div>
          <h2 id="learning-validation-source-title">{task.source.title}</h2>
          <blockquote>{task.source.excerpt}</blockquote>
        </section>

        <button type="button" className="learning-validation__agent-action" onClick={onAskAgent}>
          <Icon name="agent" size={18} />向 Agent 解释我的判断
        </button>
      </main>

      <footer className="document-primary-action learning-validation__primary-action">
        <div>
          <span>{feedbackKind ? '下一步' : '当前操作'}</span>
          <strong>{primaryContext}</strong>
        </div>
        <button
          type="button"
          className="document-primary-action__button"
          disabled={!selectedOption}
          onClick={handlePrimaryAction}
        >
          {primaryLabel}
          {!feedbackKind && <Icon name="arrow" size={19} />}
        </button>
      </footer>
    </section>
  )
}
