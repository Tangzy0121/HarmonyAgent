import { Icon } from './Icon'
import { ProfileControl } from './ProfileControl'

export function AppIdentityBar() {
  return (
    <header className="app-identity-bar" aria-label="loci 与用户状态">
      <div className="app-identity-bar__brand">
        <Icon name="blossom" size={21} />
        <span>loci</span>
      </div>
      <div className="app-identity-bar__user">
        <span>Profile</span>
        <ProfileControl />
      </div>
    </header>
  )
}
