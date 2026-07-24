import { ProfileControl } from './ProfileControl'

interface MobileTopBarProps {
  title: string
  titleId?: string
  subtitle?: string
}

export function MobileTopBar({ title, titleId, subtitle }: MobileTopBarProps) {
  return (
    <header className="mobile-top-bar">
      <div>
        <h1 id={titleId}>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <ProfileControl />
    </header>
  )
}
