import type { StoredBook } from '../books/bookTypes.js'
import { deriveCompletion } from '../books/readingProgress.js'

export interface ProjectOwner {
  userId: string
  workspaceId: string
}

/**
 * 学习项目聚合 DTO（合同见 docs/server/functions-and-roadmap.md PR-A，2026-09-03 冻结）。
 * 首版一书一项目：projectId === bookId；读取时由 Book + 学习状态组合，不迁移单表。
 */
export interface LearningProjectDto {
  version: '1'
  projectId: string
  owner: ProjectOwner
  title: string
  goal: StoredBook['goal']
  learnerLevel: StoredBook['learnerLevel']
  documentIds: string[]
  bookId: string
  status: StoredBook['status']
  createdAt: string
  updatedAt: string
  /** 最近学习行为时间（答题/证据/阅读/复习），无则 null */
  lastLearnedAt: string | null
  progress: {
    chaptersReady: number
    chaptersTotal: number
    /** 复用 deriveCompletion；无章节（提案阶段）为 null */
    completion: number | null
  }
  actions: {
    canRead: boolean
    hasPendingGeneration: boolean
    dueReviewCount: number
  }
  /** PR-D 落地前恒 0 */
  notices: { unreadCount: number }
}

function maxIso(values: Array<string | undefined>): string | null {
  let best: string | null = null
  for (const value of values) {
    if (value === undefined) continue
    const time = Date.parse(value)
    if (Number.isNaN(time)) continue
    if (best === null || time > Date.parse(best)) best = value
  }
  return best
}

export function buildProjectDto(
  book: StoredBook,
  owner: ProjectOwner,
  now: Date = new Date(),
): LearningProjectDto {
  const chaptersTotal = book.chapters.length
  const chaptersReady = book.chapters.filter((chapter) => chapter.status === 'ready').length
  const nowMs = now.getTime()
  const dueReviewCount = Object.values(book.reviewSchedule ?? {})
    .filter((entry) => Date.parse(entry.dueAt) <= nowMs).length
  const lastLearnedAt = maxIso([
    ...book.quizAttempts.map((attempt) => attempt.submittedAt),
    ...book.evidence.map((item) => item.createdAt),
    ...Object.values(book.readingProgress?.lastReadAt ?? {}),
    ...Object.values(book.reviewSchedule ?? {}).map((entry) => entry.updatedAt),
  ])
  return {
    version: '1',
    projectId: book.id,
    owner: { ...owner },
    title: book.proposal.title,
    goal: book.goal,
    learnerLevel: book.learnerLevel,
    documentIds: (book.sources ?? [book.source]).map((source) => source.id),
    bookId: book.id,
    status: book.status,
    createdAt: book.createdAt,
    updatedAt: book.updatedAt,
    lastLearnedAt,
    progress: {
      chaptersReady,
      chaptersTotal,
      completion: chaptersTotal === 0 ? null : deriveCompletion(book).completionScore,
    },
    actions: {
      canRead: chaptersReady > 0,
      hasPendingGeneration: book.chapters.some((chapter) =>
        chapter.status === 'pending' || chapter.status === 'generating'),
      dueReviewCount,
    },
    notices: { unreadCount: 0 },
  }
}

/** 确定性排序：lastLearnedAt 降序（空则 createdAt，再空按 projectId 字典序） */
export function sortProjects(projects: LearningProjectDto[]): LearningProjectDto[] {
  return [...projects].sort((left, right) => {
    const leftKey = left.lastLearnedAt ?? left.createdAt
    const rightKey = right.lastLearnedAt ?? right.createdAt
    if (leftKey !== rightKey) return Date.parse(rightKey) - Date.parse(leftKey)
    return left.projectId.localeCompare(right.projectId)
  })
}
