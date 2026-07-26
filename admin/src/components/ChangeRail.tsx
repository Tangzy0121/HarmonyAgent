import { Icon, type IconName } from './Icon'

interface ChangeRailProps {
  changes: ReadonlyArray<{ type: string; time: string; title: string; detail: string }>
  textOnly?: boolean
}

function getChangeIcon(type: string): IconName {
  if (type === '资料') return 'scan'
  if (type === '关系') return 'network'
  if (type === '证据') return 'target'
  return 'note'
}

export function ChangeRail({ changes, textOnly = false }: ChangeRailProps) {
  return (
    <div className={textOnly ? 'change-rail change-rail--text' : 'change-rail'}>
      {changes.map((change, index) => (
        <article className={textOnly ? 'change-card change-card--text' : 'change-card'} key={change.title}>
          {!textOnly && <div className={`change-card__visual change-card__visual--${index + 1}`} aria-hidden="true">
            <span />
            <span />
          </div>}
          <div className="change-card__meta">
            <span>{change.type}</span>
            <time>{change.time}</time>
          </div>
          {textOnly && <span className="change-card__icon" aria-hidden="true">
            <Icon name={getChangeIcon(change.type)} size={20} />
          </span>}
          <p>{change.title}</p>
          <span>{change.detail}</span>
        </article>
      ))}
    </div>
  )
}
