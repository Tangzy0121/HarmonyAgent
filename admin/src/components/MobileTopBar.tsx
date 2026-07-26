import { ProfileControl } from './ProfileControl'

interface MobileTopBarProps {
  title: string
  titleId?: string
  subtitle?: string
  showProfile?: boolean
}

export function MobileTopBar({ title, titleId, subtitle, showProfile = true }: MobileTopBarProps) {
  return (
    <header className="mobile-top-bar">
      <div>
        <h1 id={titleId}>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {showProfile && <ProfileControl />}
    </header>
  )
}
