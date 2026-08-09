import { useState } from 'react'
import { todayLearningOutcome } from '../data/prototype'
import { todayPageContent } from '../data/todayPage'
import { MobileTopBar } from '../components/MobileTopBar'
import { TodayOutcomeCard } from '../components/TodayOutcomeCard'
import { TodayActionList } from '../components/today/TodayActionList'
import { TodayLearningPanel } from '../components/today/TodayLearningPanel'
import type { LearningBook } from '../types/learningBook'

interface PageProps {
  isActive: boolean
  isOutcomeMode?: boolean
  onContinue: () => void
  learningEvidenceCount?: number
  learningBook?: LearningBook
}

type OutcomeOptionId = typeof todayLearningOutcome.options[number]['id']

export function TodayPage({ isActive, isOutcomeMode = false, onContinue, learningEvidenceCount = 0, learningBook }: PageProps) {
  const [outcomeSelection, setOutcomeSelection] = useState<OutcomeOptionId>('tomorrow')
  const [isOutcomeConfirmed, setIsOutcomeConfirmed] = useState(false)
  const latestEvidence = learningBook?.evidence[learningBook.evidence.length - 1]
  const evidenceChapter = latestEvidence ? learningBook?.chapters.find((chapter) => chapter.id === latestEvidence.chapterId) : undefined
  const nextChapter = evidenceChapter ? learningBook?.chapters[evidenceChapter.order + 1] : undefined
  const projectedFocus = latestEvidence && evidenceChapter ? {
    label: latestEvidence.outcome === 'review' ? '今日复习' : '下一步学习',
    status: latestEvidence.outcome === 'review' ? '需要巩固' : '已有证据',
    title: latestEvidence.outcome === 'review' ? `再看一次：${evidenceChapter.title}` : nextChapter ? nextChapter.title : `巩固：${evidenceChapter.title}`,
    summary: latestEvidence.outcome === 'review' ? latestEvidence.statement : nextChapter?.objective ?? '用新的例子复述本章判断框架，确认知识可以迁移。',
    tags: [latestEvidence.outcome === 'review' ? '针对性复习' : '测验证据', `约 ${nextChapter?.estimatedMinutes ?? 5} 分钟`],
    source: learningBook?.proposal.title ?? todayPageContent.focus.source,
    position: evidenceChapter.title,
    actionLabel: latestEvidence.outcome === 'review' ? '去复习' : '继续学习',
  } : todayPageContent.focus

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

        <TodayLearningPanel focus={projectedFocus} onContinue={onContinue} />

        {learningEvidenceCount > 0 && <p className="today-learning-evidence" role="status">互动学习书已记录 {learningEvidenceCount} 条可验证学习证据</p>}

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
