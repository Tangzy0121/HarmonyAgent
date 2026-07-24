import { useState } from 'react'
import { todayLearningOutcome, todaySnapshot } from '../data/prototype'
import { ChangeRail } from '../components/ChangeRail'
import { TaskFocusCard } from '../components/TaskFocusCard'
import { TodayOutcomeCard } from '../components/TodayOutcomeCard'

interface PageProps {
  isActive: boolean
  isOutcomeMode?: boolean
}

type OutcomeOptionId = typeof todayLearningOutcome.options[number]['id']

export function TodayPage({ isActive, isOutcomeMode = false }: PageProps) {
  const [outcomeSelection, setOutcomeSelection] = useState<OutcomeOptionId>('tomorrow')
  const [isOutcomeConfirmed, setIsOutcomeConfirmed] = useState(false)

  return (
    <section className={isOutcomeMode ? 'destination-page today-page today-page--outcome' : 'destination-page today-page'} hidden={!isActive} aria-labelledby="today-title">
      <header className="today-page__header">
        <div>
          <p className="eyebrow">{todaySnapshot.dateLabel}</p>
          <h1 id="today-title">今天</h1>
        </div>
        <button className="profile-control" type="button" aria-label="打开个人中心">
          <span aria-hidden="true">知</span>
        </button>
      </header>

      {isOutcomeMode ? (
        <TodayOutcomeCard
          selection={outcomeSelection}
          isConfirmed={isOutcomeConfirmed}
          onSelectionChange={(selection) => {
            setOutcomeSelection(selection)
            setIsOutcomeConfirmed(false)
          }}
          onConfirm={() => setIsOutcomeConfirmed(true)}
          onAdjust={() => setIsOutcomeConfirmed(false)}
        />
      ) : <TaskFocusCard task={todaySnapshot.primaryAction} />}

      <section className="today-status" aria-labelledby="today-status-title">
        <div className="section-heading">
          <p className="section-label" id="today-status-title">
            {isOutcomeMode ? '今天的成果' : '继续你的进度'}
          </p>
          <button className="inline-text-button" type="button">查看全部</button>
        </div>

        <ChangeRail changes={isOutcomeMode ? todayLearningOutcome.recentChanges : todaySnapshot.recentChanges} />
      </section>
    </section>
  )
}
