import type { ReactNode } from 'react'

interface MobileTopBarProps {
  title: string
  titleId?: string
  subtitle?: string
  actions?: ReactNode
}

export function MobileTopBar({ title, titleId, subtitle, actions }: MobileTopBarProps) {
  return (
    <header className="mobile-top-bar">
      <div>
        <h1 id={titleId}>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="mobile-top-bar__actions">{actions}</div>}
    </header>
  )
}
