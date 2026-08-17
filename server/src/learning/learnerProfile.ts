import { computeMastery } from '../books/mastery.js'
import { REVIEW_INTERVALS_DAYS } from '../books/schedule.js'
import type { QuizAttempt, StoredBook } from '../books/bookTypes.js'

export interface ConceptSource {
  bookId: string
  chapterId: string
  conceptId: string
}

export interface ConceptMastery {
  /** 归一化后的合并 key */
  label: string
  /** 最近一次出现（作答/证据）时的原始写法 */
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
  /** 今天（本地日）是否已有学习事件 */
  studiedToday: boolean
}

export interface LearnerProfile {
  concepts: ConceptMastery[]
  rhythm: LearningRhythm
  derivedAt: string
}

/** 悬崖阈值：最近一次答对距今超过当前档位间隔的该倍数且无后续作答 */
const CLIFF_FACTOR = 1.5
const DAY_MS = 24 * 60 * 60 * 1000

/** 归一化概念名：trim + 小写 + 全角折半角（LLM 零参与的实体合并，规格 §5） */
export function normalizeConceptLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ')
    .replace(/\s+/g, ' ')
}

interface ConceptBucket {
  displayLabel: string
  displayLabelAt: string
  attempts: Array<Pick<QuizAttempt, 'isCorrect' | 'submittedAt'>>
  sources: ConceptSource[]
  /** 该概念 quiz 块的复习档位间隔（天）；无调度 → null（不产生悬崖） */
  stageIntervalDays: number | null
}

function collectConceptBuckets(books: StoredBook[]): Map<string, ConceptBucket> {
  const buckets = new Map<string, ConceptBucket>()

  for (const book of books) {
    // conceptId → 原始 label（concept 块提供；缺失时回退 conceptId 本身）
    const labelByConceptId = new Map<string, string>()
    for (const chapter of book.chapters) {
      for (const block of chapter.blocks) {
        if (block.type !== 'concept') continue
        for (const concept of block.concepts) {
          labelByConceptId.set(concept.id, concept.label)
        }
      }
    }

    // 概念注册（含无作答概念）
    const quizBlockConcept = new Map<string, string>()
    for (const chapter of book.chapters) {
      for (const block of chapter.blocks) {
        if (block.type === 'quiz') quizBlockConcept.set(block.id, block.conceptId)
        if (block.type !== 'concept') continue
        for (const concept of block.concepts) {
          const key = normalizeConceptLabel(concept.label)
          const bucket = buckets.get(key) ?? { displayLabel: concept.label, displayLabelAt: '', attempts: [], sources: [], stageIntervalDays: null }
          if (!bucket.sources.some((source) => source.bookId === book.id && source.conceptId === concept.id)) {
            bucket.sources.push({ bookId: book.id, chapterId: chapter.id, conceptId: concept.id })
          }
          buckets.set(key, bucket)
        }
      }
    }

    // 作答并入归一化桶
    for (const attempt of book.quizAttempts) {
      const conceptId = quizBlockConcept.get(attempt.blockId)
      if (!conceptId) continue
      const rawLabel = labelByConceptId.get(conceptId) ?? conceptId
      const key = normalizeConceptLabel(rawLabel)
      const bucket = buckets.get(key) ?? { displayLabel: rawLabel, displayLabelAt: '', attempts: [], sources: [], stageIntervalDays: null }
      bucket.attempts.push({ isCorrect: attempt.isCorrect, submittedAt: attempt.submittedAt })
      if (attempt.submittedAt >= bucket.displayLabelAt) {
        bucket.displayLabel = rawLabel
        bucket.displayLabelAt = attempt.submittedAt
      }
      buckets.set(key, bucket)
    }

    // 调度信息：取该概念（本书内）quiz 块的档位间隔
    const schedule = book.reviewSchedule ?? {}
    for (const [blockId, entry] of Object.entries(schedule)) {
      const conceptId = quizBlockConcept.get(blockId)
      if (!conceptId) continue
      const rawLabel = labelByConceptId.get(conceptId) ?? conceptId
      const key = normalizeConceptLabel(rawLabel)
      const bucket = buckets.get(key)
      if (!bucket) continue
      const intervals = REVIEW_INTERVALS_DAYS[entry.kind]
      const intervalDays = intervals[Math.max(0, Math.min(entry.stage - 1, intervals.length - 1))]
      bucket.stageIntervalDays = bucket.stageIntervalDays === null ? intervalDays : Math.max(bucket.stageIntervalDays, intervalDays)
    }
  }

  return buckets
}

function deriveConcepts(books: StoredBook[], now: Date): ConceptMastery[] {
  const buckets = collectConceptBuckets(books)
  const concepts: ConceptMastery[] = []

  for (const [label, bucket] of buckets) {
    const mastery = computeMastery(bucket.attempts)
    const latest = bucket.attempts.length === 0
      ? null
      : bucket.attempts.reduce((a, b) => (b.submittedAt >= a.submittedAt ? b : a))
    let forgettingCliff = false
    if (latest?.isCorrect && bucket.stageIntervalDays !== null) {
      const idleDays = (now.getTime() - new Date(latest.submittedAt).getTime()) / DAY_MS
      forgettingCliff = idleDays > CLIFF_FACTOR * bucket.stageIntervalDays
    }
    concepts.push({
      label,
      displayLabel: bucket.displayLabel,
      mastery,
      attempts: bucket.attempts.length,
      lastOutcome: latest === null ? null : latest.isCorrect ? 'mastered' : 'review',
      lastAttemptAt: latest?.submittedAt ?? null,
      sources: bucket.sources,
      forgettingCliff,
    })
  }

  // 稳定排序：悬崖优先，其次掌握度升序（越薄弱越靠前），再按 label
  return concepts.sort((a, b) =>
    Number(b.forgettingCliff) - Number(a.forgettingCliff)
    || a.mastery - b.mastery
    || a.label.localeCompare(b.label))
}

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function deriveRhythm(books: StoredBook[], now: Date): LearningRhythm {
  const eventDates: Date[] = []
  for (const book of books) {
    for (const attempt of book.quizAttempts) eventDates.push(new Date(attempt.submittedAt))
    for (const item of book.evidence) eventDates.push(new Date(item.createdAt))
  }

  if (eventDates.length === 0) {
    return {
      activeDays30: 0,
      streakDays: 0,
      periodDistribution: { morning: 0, afternoon: 0, evening: 0, night: 0 },
      dailyAverageEvents: 0,
      studiedToday: false,
    }
  }

  // 近 30 天活跃天（含今天）
  const windowStart = now.getTime() - 29 * DAY_MS
  const activeDays = new Set(
    eventDates
      .filter((date) => date.getTime() >= new Date(windowStart).setHours(0, 0, 0, 0))
      .map(localDayKey),
  )

  // streak：今天有事件从今天数，否则从昨天数；逐日回溯
  const allDays = new Set(eventDates.map(localDayKey))
  const cursor = new Date(now)
  if (!allDays.has(localDayKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  let streakDays = 0
  while (allDays.has(localDayKey(cursor))) {
    streakDays += 1
    cursor.setDate(cursor.getDate() - 1)
  }

  // 时段桶（本地时区）：06–12 上午、12–18 下午、18–23 晚上、23–06 深夜
  const buckets = { morning: 0, afternoon: 0, evening: 0, night: 0 }
  for (const date of eventDates) {
    const hour = date.getHours()
    if (hour >= 6 && hour < 12) buckets.morning += 1
    else if (hour >= 12 && hour < 18) buckets.afternoon += 1
    else if (hour >= 18 && hour < 23) buckets.evening += 1
    else buckets.night += 1
  }
  const total = eventDates.length

  return {
    activeDays30: activeDays.size,
    streakDays,
    periodDistribution: {
      morning: buckets.morning / total,
      afternoon: buckets.afternoon / total,
      evening: buckets.evening / total,
      night: buckets.night / total,
    },
    dailyAverageEvents: Math.round((total / 30) * 1e5) / 1e5,
    studiedToday: allDays.has(localDayKey(now)),
  }
}

/**
 * 从全部学习书实时派生长学习者模型（规格 §4：纯派生读模型，不落事实表；
 * 规则引擎写数值，LLM 零参与；删书后数据自然消失）。
 */
export function deriveLearnerProfile(books: StoredBook[], now: Date = new Date()): LearnerProfile {
  return {
    concepts: deriveConcepts(books, now),
    rhythm: deriveRhythm(books, now),
    derivedAt: now.toISOString(),
  }
}
