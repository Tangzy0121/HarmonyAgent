interface ChangeRailProps {
  changes: ReadonlyArray<{ type: string; time: string; title: string; detail: string }>
}

export function ChangeRail({ changes }: ChangeRailProps) {
  return (
    <div className="change-rail">
      {changes.map((change, index) => (
        <article className="change-card" key={change.title}>
          <div className={`change-card__visual change-card__visual--${index + 1}`} aria-hidden="true">
            <span />
            <span />
          </div>
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
