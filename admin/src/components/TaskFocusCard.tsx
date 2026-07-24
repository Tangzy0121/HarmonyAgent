import { Icon } from './Icon'

interface TaskFocusCardProps {
  task: {
    title: string
    duration: string
    reason: string
    topic: string
    actionLabel: string
  }
}

export function TaskFocusCard({ task }: TaskFocusCardProps) {
  return (
    <article className="primary-action task-focus-card" aria-labelledby="primary-action-title">
      <div className="task-focus-card__flower" aria-hidden="true">
        <span className="task-flower__petal task-flower__petal--one" />
        <span className="task-flower__petal task-flower__petal--two" />
        <span className="task-flower__petal task-flower__petal--three" />
        <span className="task-flower__petal task-flower__petal--four" />
        <span className="task-flower__petal task-flower__petal--five" />
        <span className="task-flower__center" />
      </div>
      <div className="primary-action__lead">
        <p className="section-label">今日重点</p>
        <span>{task.duration}</span>
      </div>
      <div className="task-focus-card__content">
        <p className="primary-action__topic">{task.topic}</p>
        <h2 id="primary-action-title">{task.title}</h2>
        <p className="primary-action__reason">{task.reason}</p>
      </div>
      <button className="solid-button" type="button">
        <span>{task.actionLabel}</span><Icon name="arrow" size={18} />
      </button>
    </article>
  )
}
