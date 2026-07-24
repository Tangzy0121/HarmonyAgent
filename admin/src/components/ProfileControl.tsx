import { Icon } from './Icon'

export function ProfileControl() {
  return (
    <button className="profile-control" type="button" aria-label="打开个人中心">
      <Icon name="user" size={22} />
    </button>
  )
}
