import { usePrototype } from '../../app/PrototypeContext'
import type { ProjectNotice as Notice } from '../../types/product'
import { Icon } from '../ui/Icon'

export function ProjectNotice({ notice, onAction }: { notice: Notice; onAction: () => void }) {
  const { dispatch } = usePrototype()
  return (
    <section className={`project-notice project-notice--${notice.tone}`} aria-label="项目通知">
      <span className="project-notice__icon"><Icon name={notice.tone === 'danger' ? 'warning' : notice.tone === 'warning' ? 'clock' : 'check'} size={18} /></span>
      <div><strong>{notice.title}</strong><p>{notice.detail}</p></div>
      <button type="button" onClick={onAction}>{notice.actionLabel}<Icon name="arrow" size={16} /></button>
      <button type="button" className="project-notice__close" aria-label="关闭通知" onClick={() => dispatch({ type: 'dismiss_notice', noticeId: notice.id })}><Icon name="close" size={16} /></button>
    </section>
  )
}
