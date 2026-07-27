import { Icon, type IconName } from '../Icon'

interface TodayActionListProps {
  actions: ReadonlyArray<{
    readonly id: string
    readonly label: string
    readonly title: string
    readonly meta: string
    readonly icon: string
  }>
}

export function TodayActionList({ actions }: TodayActionListProps) {
  return (
    <div className="today-action-list">
      {actions.map((action) => (
        <button className="today-action-row" type="button" key={action.id}>
          <span className="today-action-row__icon" aria-hidden="true">
            <Icon name={action.icon as IconName} size={18} />
          </span>
          <span className="today-action-row__copy">
            <small>{action.label}</small>
            <strong>{action.title}</strong>
          </span>
          <span className="today-action-row__meta">{action.meta}</span>
          <Icon name="arrow" size={17} />
        </button>
      ))}
    </div>
  )
}
