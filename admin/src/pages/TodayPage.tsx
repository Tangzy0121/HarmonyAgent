import { useState } from 'react'
import { todayLearningOutcome } from '../data/prototype'
import { todayPageContent } from '../data/todayPage'
import { MobileTopBar } from '../components/MobileTopBar'
import { TodayOutcomeCard } from '../components/TodayOutcomeCard'
import { TodayActionList } from '../components/today/TodayActionList'
import { TodayLearningPanel } from '../components/today/TodayLearningPanel'

interface PageProps {
  isActive: boolean
  isOutcomeMode?: boolean
  onContinue: () => void
}

type OutcomeOptionId = typeof todayLearningOutcome.options[number]['id']

export function TodayPage({ isActive, isOutcomeMode = false, onContinue }: PageProps) {
  const [outcomeSelection, setOutcomeSelection] = useState<OutcomeOptionId>('tomorrow')
  const [isOutcomeConfirmed, setIsOutcomeConfirmed] = useState(false)

  return (
    <section className={isOutcomeMode ? 'destination-page today-page today-page--outcome' : 'destination-page today-page'} hidden={!isActive} aria-labelledby="today-title">
      {isOutcomeMode ? <>
        <MobileTopBar title="今日" titleId="today-title" showProfile={false} />
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
      </> : <>
        <header className="today-page-heading">
          <h1 id="today-title">{todayPageContent.title}</h1>
          <time dateTime="2026-07-26">{todayPageContent.dateLabel}</time>
        </header>

        <TodayLearningPanel focus={todayPageContent.focus} onContinue={onContinue} />

        <section className="today-secondary-actions" aria-labelledby="today-actions-title">
          <header>
            <h2 id="today-actions-title">其他可做</h2>
            <span>{todayPageContent.secondaryActions.length} 项</span>
          </header>
          <TodayActionList actions={todayPageContent.secondaryActions} />
        </section>
      </>}
    </section>
  )
}
