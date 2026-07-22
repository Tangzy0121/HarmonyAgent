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
      <div className="task-focus-card__art" aria-hidden="true">
        <span className="task-orbit task-orbit--outer" />
        <span className="task-orbit task-orbit--inner" />
        <span className="task-orbit__node task-orbit__node--one" />
        <span className="task-orbit__node task-orbit__node--two" />
        <span className="task-orbit__core"><Icon name="spark" size={25} /></span>
      </div>
      <div className="primary-action__lead">
        <p className="section-label">今日重点</p>
        <span>{task.duration}</span>
      </div>
      <h2 id="primary-action-title">{task.title}</h2>
      <p className="primary-action__reason">{task.reason}</p>
      <p className="primary-action__topic">{task.topic}</p>
      <button className="solid-button" type="button">
        <span>{task.actionLabel}</span><Icon name="arrow" size={18} />
      </button>
    </article>
  )
}
import { Icon } from './Icon'
