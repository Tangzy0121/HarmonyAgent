import { useState } from 'react'
import { todayLearningOutcome, todaySnapshot } from '../data/prototype'
import { ChangeRail } from '../components/ChangeRail'
import { MobileTopBar } from '../components/MobileTopBar'
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
      <MobileTopBar title="今日" titleId="today-title" subtitle={todaySnapshot.dateLabel} />

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

        <ChangeRail
          changes={isOutcomeMode ? todayLearningOutcome.recentChanges : todaySnapshot.recentChanges}
          textOnly
        />
      </section>
    </section>
  )
}
