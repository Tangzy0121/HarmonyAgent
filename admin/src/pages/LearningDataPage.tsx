import { useMemo } from 'react'
import { MobileTopBar } from '../components/MobileTopBar'
import { buildLearningDashboard } from '../domain/learningDashboard'
import type { LearnerProfile } from '../types/learnerProfile'

interface LearningDataPageProps {
  isActive: boolean
  learnerProfile: LearnerProfile | null
  onOpenBook: (bookId: string) => void
}

const periodLabels = [
  { key: 'morning', label: '早晨' },
  { key: 'afternoon', label: '下午' },
  { key: 'evening', label: '晚上' },
  { key: 'night', label: '夜间' },
] as const

const bucketLabels = [
  { key: 'mastered', label: '已掌握' },
  { key: 'learning', label: '学习中' },
  { key: 'needsReview', label: '待复习' },
  { key: 'noRecord', label: '暂无记录' },
] as const

export function LearningDataPage({ isActive, learnerProfile, onOpenBook }: LearningDataPageProps) {
  const view = useMemo(
    () => (learnerProfile ? buildLearningDashboard(learnerProfile, new Date()) : null),
    [learnerProfile],
  )
  const hasData = Boolean(view && (view.activeDays30 > 0 || learnerProfile!.concepts.length > 0))
  const periodTotal = view
    ? periodLabels.reduce((sum, { key }) => sum + view.periodDistribution[key], 0)
    : 0

  return (
    <section className="destination-page learning-data-page" hidden={!isActive} aria-labelledby="learning-data-title">
      <MobileTopBar title="学习数据" titleId="learning-data-title" showProfile={false} />

      {!hasData ? (
        <div className="learning-data-empty" role="status">
          <p>还没有学习数据</p>
          <p>从「今日」开始一次学习，或打开一本互动学习书，坚持、掌握度与学习节律会在这里逐渐成形。</p>
        </div>
      ) : view && <>
        <section className="learning-data-section" aria-labelledby="learning-data-streak-title">
          <h2 id="learning-data-streak-title">坚持</h2>
          <p className="learning-data-streak">
            连续学习 <strong>{view.streakDays}</strong> 天
            <span>{view.studiedToday ? ' · 今天已学习' : ' · 今天还没学习'}</span>
          </p>
          <div className="learning-data-heatmap" role="img" aria-label={`近 30 天活跃 ${view.activeDays30} 天`}>
            {view.heatmap.map((cell) => (
              <i
                key={cell.dayKey}
                className={cell.active ? (cell.isToday ? 'is-active is-today' : 'is-active') : (cell.isToday ? 'is-today' : '')}
                title={`${cell.dayKey}${cell.active ? ' · 已学习' : ''}`}
              />
            ))}
          </div>
          <p className="learning-data-note">近 30 天活跃 {view.activeDays30} 天</p>
        </section>

        <section className="learning-data-section" aria-labelledby="learning-data-mastery-title">
          <h2 id="learning-data-mastery-title">掌握</h2>
          <ul className="learning-data-buckets">
            {bucketLabels.map(({ key, label }) => (
              <li key={key}><strong>{view.buckets[key]}</strong><span>{label}</span></li>
            ))}
          </ul>
          {view.weakConcepts.length > 0 && <>
            <h3 className="learning-data-subtitle">薄弱概念 Top {view.weakConcepts.length}</h3>
            <ul className="learning-data-concepts">
              {view.weakConcepts.map((concept) => (
                <li key={concept.label}>
                  <span>{concept.label}</span>
                  <em>{Math.round(concept.mastery * 100)}%</em>
                </li>
              ))}
            </ul>
          </>}
          {view.cliffConcepts.length > 0 && <>
            <h3 className="learning-data-subtitle">遗忘悬崖</h3>
            <ul className="learning-data-concepts learning-data-concepts--cliff">
              {view.cliffConcepts.map((concept) => (
                <li key={concept.label}>
                  <span>{concept.label}</span>
                  <em>{Math.round(concept.mastery * 100)}%</em>
                  <button
                    type="button"
                    disabled={!concept.bookId}
                    onClick={() => concept.bookId && onOpenBook(concept.bookId)}
                  >去复习</button>
                </li>
              ))}
            </ul>
          </>}
        </section>

        <section className="learning-data-section" aria-labelledby="learning-data-rhythm-title">
          <h2 id="learning-data-rhythm-title">节律</h2>
          <ul className="learning-data-periods">
            {periodLabels.map(({ key, label }) => {
              const count = view.periodDistribution[key]
              const width = periodTotal > 0 ? Math.round((count / periodTotal) * 100) : 0
              return (
                <li key={key}>
                  <span>{label}</span>
                  <div className="learning-data-period-bar"><i style={{ width: `${width}%` }} /></div>
                  <em>{count}</em>
                </li>
              )
            })}
          </ul>
          <p className="learning-data-note">日均学习事件 {view.dailyAverageEvents.toFixed(1)} 次</p>
        </section>
      </>}
    </section>
  )
}
