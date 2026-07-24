interface ChangeRailProps {
  changes: ReadonlyArray<{ type: string; time: string; title: string; detail: string }>
  textOnly?: boolean
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
          <p>{change.title}</p>
          <span>{change.detail}</span>
        </article>
      ))}
    </div>
  )
}
