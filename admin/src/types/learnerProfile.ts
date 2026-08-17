// 长期学习者模型（与 server/src/learning/learnerProfile.ts 镜像，只读派生）

export interface ConceptSource {
  bookId: string
  chapterId: string
  conceptId: string
}

export interface ConceptMastery {
  label: string
  displayLabel: string
  mastery: number
  attempts: number
  lastOutcome: 'mastered' | 'review' | null
  lastAttemptAt: string | null
  sources: ConceptSource[]
  forgettingCliff: boolean
}

export interface LearningRhythm {
  activeDays30: number
  streakDays: number
  periodDistribution: { morning: number; afternoon: number; evening: number; night: number }
  dailyAverageEvents: number
  studiedToday: boolean
}

export interface LearnerProfile {
  concepts: ConceptMastery[]
  rhythm: LearningRhythm
  derivedAt: string
}
