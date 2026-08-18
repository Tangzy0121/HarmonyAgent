import type { ConceptMastery, LearnerProfile } from '../types/learnerProfile'

export interface MasteryBuckets {
  /** mastery >= 0.8 */
  mastered: number
  /** 0.3 <= mastery < 0.8 */
  learning: number
  /** mastery < 0.3（有答题记录） */
  needsReview: number
  /** attempts === 0 */
  noRecord: number
}

export interface DashboardConcept {
  label: string
  mastery: number
  /** 来源书（取首个来源，无来源为 null），供「去复习」跳转 */
  bookId: string | null
  /** 来源概念（取首个来源，无来源为 null），供「出题练习」调用 */
  conceptId: string | null
  /** 来源章（取首个来源，无来源为 null） */
  chapterId: string | null
}

export interface HeatmapCell {
  dayKey: string
  active: boolean
  isToday: boolean
}

export interface LearningDashboardView {
  streakDays: number
  studiedToday: boolean
  activeDays30: number
  /** 近 30 天逐日，最旧在前、末格为今日 */
  heatmap: HeatmapCell[]
  buckets: MasteryBuckets
  /** 薄弱 Top5：mastery 升序，仅含 attempts > 0 */
  weakConcepts: DashboardConcept[]
  /** 遗忘悬崖：forgettingCliff=true，mastery 升序 */
  cliffConcepts: DashboardConcept[]
  periodDistribution: { morning: number; afternoon: number; evening: number; night: number }
  dailyAverageEvents: number
}

function localDayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function toDashboardConcept(concept: ConceptMastery): DashboardConcept {
  return {
    label: concept.displayLabel,
    mastery: concept.mastery,
    bookId: concept.sources[0]?.bookId ?? null,
    conceptId: concept.sources[0]?.conceptId ?? null,
    chapterId: concept.sources[0]?.chapterId ?? null,
  }
}

const byMasteryAsc = (a: DashboardConcept, b: DashboardConcept): number => a.mastery - b.mastery

/** 学习仪表盘视图模型：从 LearnerProfile 纯派生，不发起请求 */
export function buildLearningDashboard(profile: LearnerProfile, now: Date): LearningDashboardView {
  const buckets: MasteryBuckets = { mastered: 0, learning: 0, needsReview: 0, noRecord: 0 }
  for (const concept of profile.concepts) {
    if (concept.attempts === 0) buckets.noRecord += 1
    else if (concept.mastery >= 0.8) buckets.mastered += 1
    else if (concept.mastery >= 0.3) buckets.learning += 1
    else buckets.needsReview += 1
  }

  const attempted = profile.concepts.filter((concept) => concept.attempts > 0)
  const weakConcepts = attempted.map(toDashboardConcept).sort(byMasteryAsc).slice(0, 5)
  const cliffConcepts = attempted
    .filter((concept) => concept.forgettingCliff)
    .map(toDashboardConcept)
    .sort(byMasteryAsc)

  const activeSet = new Set(profile.rhythm.activeDayKeys)
  const todayKey = localDayKey(now)
  const heatmap: HeatmapCell[] = []
  for (let offset = 29; offset >= 0; offset -= 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
    const dayKey = localDayKey(day)
    heatmap.push({ dayKey, active: activeSet.has(dayKey), isToday: dayKey === todayKey })
  }

  return {
    streakDays: profile.rhythm.streakDays,
    studiedToday: profile.rhythm.studiedToday,
    activeDays30: profile.rhythm.activeDays30,
    heatmap,
    buckets,
    weakConcepts,
    cliffConcepts,
    periodDistribution: profile.rhythm.periodDistribution,
    dailyAverageEvents: profile.rhythm.dailyAverageEvents,
  }
}
