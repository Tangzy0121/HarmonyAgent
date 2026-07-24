import { Icon } from './Icon'
import { todayLearningOutcome } from '../data/prototype'

type OutcomeOptionId = typeof todayLearningOutcome.options[number]['id']

interface TodayOutcomeCardProps {
  selection: OutcomeOptionId
  isConfirmed: boolean
  onSelectionChange: (selection: OutcomeOptionId) => void
  onConfirm: () => void
  onAdjust: () => void
}

export function TodayOutcomeCard({
  selection,
  isConfirmed,
  onSelectionChange,
  onConfirm,
  onAdjust,
}: TodayOutcomeCardProps) {
  const outcome = todayLearningOutcome
  const selectedOption = outcome.options.find((option) => option.id === selection) ?? outcome.options[0]

  return (
    <article className={isConfirmed ? 'today-outcome-card today-outcome-card--confirmed' : 'today-outcome-card'} aria-labelledby="today-outcome-title">
      <div className="task-focus-card__flower today-outcome-card__flower" aria-hidden="true">
        <span className="task-flower__petal task-flower__petal--one" />
        <span className="task-flower__petal task-flower__petal--two" />
        <span className="task-flower__petal task-flower__petal--three" />
        <span className="task-flower__petal task-flower__petal--four" />
        <span className="task-flower__petal task-flower__petal--five" />
        <span className="task-flower__center" />
      </div>

      <header className="today-outcome-card__lead">
        <span>今日成果</span>
        <strong><i aria-hidden="true" />{outcome.status}</strong>
      </header>

      <section className="today-outcome-card__result">
        <p>学习闭环 01</p>
        <h2 id="today-outcome-title">{outcome.title}</h2>
        <p>{outcome.summary}</p>
        <span>{outcome.source}</span>
      </section>

      <ul className="today-outcome-card__changes" aria-label="本次成果">
        {outcome.changes.map((change) => (
          <li key={change}><Icon name="check" size={14} />{change}</li>
        ))}
      </ul>

      {isConfirmed ? (
        <section className="today-outcome-confirmation" role="status" aria-live="polite">
          <span>下一次</span>
          <h3>{selectedOption.confirmedTitle}</h3>
          <p>{selectedOption.confirmedDetail}</p>
          <button type="button" onClick={onAdjust}>调整安排</button>
        </section>
      ) : (
        <section className="today-outcome-arrangement" aria-labelledby="today-arrangement-title">
          <div>
            <span>{outcome.recommendation.label}</span>
            <h3 id="today-arrangement-title">{outcome.recommendation.title}</h3>
            <p>{outcome.recommendation.reason}</p>
          </div>

          <div className="today-outcome-options" role="radiogroup" aria-label="选择下一次学习时间">
            {outcome.options.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selection === option.id}
                className={selection === option.id ? 'today-outcome-option today-outcome-option--selected' : 'today-outcome-option'}
                onClick={() => onSelectionChange(option.id)}
              >
                <strong>{option.label}</strong>
                <span>{option.detail}</span>
              </button>
            ))}
          </div>

          <button className="today-outcome-card__primary" type="button" onClick={onConfirm}>
            <span>{selectedOption.actionLabel}</span>
            <i aria-hidden="true"><Icon name="arrow" size={18} /></i>
          </button>
        </section>
      )}
    </article>
  )
}
