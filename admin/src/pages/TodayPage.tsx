import { todaySnapshot } from '../data/prototype'
import { ChangeRail } from '../components/ChangeRail'
import { TaskFocusCard } from '../components/TaskFocusCard'

interface PageProps {
  isActive: boolean
}

export function TodayPage({ isActive }: PageProps) {
  return (
    <section className="destination-page today-page" hidden={!isActive} aria-labelledby="today-title">
      <header className="today-page__header">
        <div>
          <p className="eyebrow">{todaySnapshot.dateLabel}</p>
          <h1 id="today-title">今天</h1>
        </div>
        <button className="profile-control" type="button" aria-label="打开个人中心">
          <span aria-hidden="true">知</span>
        </button>
      </header>

      <TaskFocusCard task={todaySnapshot.primaryAction} />

      <section className="today-status" aria-labelledby="today-status-title">
        <div className="section-heading">
          <p className="section-label" id="today-status-title">
            继续你的进度
          </p>
          <button className="inline-text-button" type="button">查看全部</button>
        </div>

        <ChangeRail changes={todaySnapshot.recentChanges} />
      </section>
    </section>
  )
}
