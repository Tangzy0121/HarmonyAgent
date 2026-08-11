import { useState } from 'react'
import { todayLearningOutcome, todaySnapshot } from '../data/prototype'
import { ChangeRail } from '../components/ChangeRail'
import { MobileTopBar } from '../components/MobileTopBar'
import { LearningDashboard } from '../components/LearningDashboard'
import { TodayOutcomeCard } from '../components/TodayOutcomeCard'

interface PageProps {
  isActive: boolean
  isOutcomeMode?: boolean
  onStartLearning: () => void
}

type OutcomeOptionId = typeof todayLearningOutcome.options[number]['id']

export function TodayPage({ isActive, isOutcomeMode = false, onStartLearning }: PageProps) {
  const [outcomeSelection, setOutcomeSelection] = useState<OutcomeOptionId>('tomorrow')
  const [isOutcomeConfirmed, setIsOutcomeConfirmed] = useState(false)

  return (
    <section
      className={isOutcomeMode ? 'destination-page today-page today-page--outcome' : 'destination-page today-page'}
      hidden={!isActive}
      aria-labelledby={isOutcomeMode ? 'today-title' : 'dashboard-title'}
    >
      {isOutcomeMode ? (
        <>
          <MobileTopBar title="今日" titleId="today-title" subtitle={todaySnapshot.dateLabel} />
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
          <section className="today-status" aria-labelledby="today-status-title">
            <div className="section-heading">
              <p className="section-label" id="today-status-title">今天的成果</p>
              <button className="inline-text-button" type="button">查看全部</button>
            </div>
            <ChangeRail changes={todayLearningOutcome.recentChanges} textOnly />
          </section>
        </>
      ) : (
        <LearningDashboard onStartLearning={onStartLearning} />
      )}
    </section>
  )
}
