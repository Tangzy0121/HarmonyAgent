import type { LearningBook, LearningEvidence, ReviewScheduleEntry } from '../types/learningBook'
import type { ConceptMastery, LearnerProfile, LearningRhythm } from '../types/learnerProfile'
import type { StoredBook } from '../services/bookApi'

export interface TodayFocus {
  label: string
  status: string
  title: string
  summary: string
  tags: string[]
  source: string
  position: string
  actionLabel: string
}

function latestEvidence(book: LearningBook): LearningEvidence | undefined {
  return book.evidence[book.evidence.length - 1]
}

function dueEntries(book: LearningBook, now: Date): Array<[string, ReviewScheduleEntry]> {
  const schedule = book.reviewSchedule ?? {}
  return Object.entries(schedule)
    .filter(([, entry]) => entry.dueAt <= now.toISOString())
    .sort((a, b) => a[1].dueAt.localeCompare(b[1].dueAt))
}

function hasDueReview(book: LearningBook, now: Date): boolean {
  return dueEntries(book, now).length > 0
}

function isInProgress(book: LearningBook): boolean {
  return book.status === 'proposal' || book.status === 'generating' || book.status === 'partial'
}

/**
 * 从真实书中挑出「今日下一步」的承载书，优先级（规格 §5.7/§10 + 学习者模型规格 §5）：
 * 到期复习 > 遗忘悬崖 > 进行中的书（目录待确认/生成中/部分可读）> 最近有学习证据的书；
 * 都没有 → null（回退 mock 演示内容）。
 */
export function pickTodayRealBook(books: StoredBook[], now: Date = new Date(), profile?: LearnerProfile | null): StoredBook | null {
  const withDue = books.filter((book) => hasDueReview(book, now))
  if (withDue.length > 0) {
    return withDue.sort((a, b) => dueEntries(a, now)[0][1].dueAt.localeCompare(dueEntries(b, now)[0][1].dueAt))[0]
  }
  const cliff = pickCliffConcept(profile, books)
  if (cliff) {
    const cliffBook = books.find((book) => book.id === cliff.sources[0].bookId)
    if (cliffBook) return cliffBook
  }
  const inProgress = books.filter(isInProgress)
  if (inProgress.length > 0) {
    return inProgress.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))[0]
  }
  const withEvidence = books.filter((book) => book.evidence.length > 0)
  if (withEvidence.length > 0) {
    return withEvidence.sort((a, b) => {
      const aAt = latestEvidence(a)?.createdAt ?? ''
      const bAt = latestEvidence(b)?.createdAt ?? ''
      return bAt.localeCompare(aAt)
    })[0]
  }
  return null
}

/** 掌握度最高且来源书仍在库中的悬崖概念 */
function pickCliffConcept(profile: LearnerProfile | null | undefined, books: StoredBook[]): ConceptMastery | null {
  if (!profile) return null
  const bookIds = new Set(books.map((book) => book.id))
  return profile.concepts
    .filter((concept) => concept.forgettingCliff && concept.sources.some((source) => bookIds.has(source.bookId)))
    .sort((a, b) => b.mastery - a.mastery)[0] ?? null
}

function periodOf(date: Date): keyof LearningRhythm['periodDistribution'] {
  const hour = date.getHours()
  if (hour >= 6 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 18) return 'afternoon'
  if (hour >= 18 && hour < 23) return 'evening'
  return 'night'
}

/**
 * 由一本书的状态/证据/复习调度派生今日主焦点；派生不出有效行动时返回 null，
 * 由调用方回退到静态演示内容（mock 原型行为保持不变）。
 */
export function deriveTodayFocus(book: LearningBook | undefined, now: Date = new Date(), profile?: LearnerProfile | null): TodayFocus | null {
  if (!book) return null
  const source = book.proposal.title

  const due = dueEntries(book, now)
  if (due.length > 0) {
    const [blockId] = due[0]
    const chapter = book.chapters.find((entry) => entry.blocks.some((block) => block.id === blockId))
    const block = chapter?.blocks.find((entry) => entry.id === blockId)
    return {
      label: '今日复习',
      status: '到期复习',
      title: `复习到期：${block?.title ?? chapter?.title ?? source}`,
      summary: '间隔重复已到期的内容，先复习再学新内容。',
      tags: ['间隔重复', `共 ${due.length} 项到期`],
      source,
      position: chapter?.title ?? '',
      actionLabel: '去复习',
    }
  }

  // 遗忘悬崖：最近一次答对已闲置超阈值的概念（学习者模型规格 §5）
  const cliff = profile?.concepts
    .filter((concept) => concept.forgettingCliff && concept.sources.some((entry) => entry.bookId === book.id))
    .sort((a, b) => b.mastery - a.mastery)[0]
  if (cliff) {
    return {
      label: '今日复习',
      status: '遗忘悬崖',
      title: `巩固：${cliff.displayLabel}`,
      summary: '这个概念你之前答对过，但已经很久没碰了，趁还记得先复习。',
      tags: ['遗忘悬崖', `掌握度 ${Math.round(cliff.mastery * 100)}%`],
      source,
      position: '',
      actionLabel: '去复习',
    }
  }

  const latest = latestEvidence(book)
  if (latest) {
    const evidenceChapter = book.chapters.find((chapter) => chapter.id === latest.chapterId)
    if (evidenceChapter) {
      const nextChapter = book.chapters[evidenceChapter.order + 1]
      return {
        label: latest.outcome === 'review' ? '今日复习' : '下一步学习',
        status: latest.outcome === 'review' ? '需要巩固' : '已有证据',
        title: latest.outcome === 'review' ? `再看一次：${evidenceChapter.title}` : nextChapter ? nextChapter.title : `巩固：${evidenceChapter.title}`,
        summary: latest.outcome === 'review' ? latest.statement : nextChapter?.objective ?? '用新的例子复述本章判断框架，确认知识可以迁移。',
        tags: [latest.outcome === 'review' ? '针对性复习' : '测验证据', `约 ${nextChapter?.estimatedMinutes ?? 5} 分钟`],
        source,
        position: evidenceChapter.title,
        actionLabel: latest.outcome === 'review' ? '去复习' : '继续学习',
      }
    }
  }

  if (book.status === 'generating' || book.status === 'partial') {
    const readyCount = book.chapters.filter((chapter) => chapter.status === 'ready').length
    return {
      label: '继续生成',
      status: '生成中',
      title: `继续生成《${source}》`,
      summary: '已生成的章节可以先读，其余章节在后台继续生成。',
      tags: ['渐进生成', `${readyCount}/${book.chapters.length} 章可阅读`],
      source,
      position: '',
      actionLabel: '继续阅读',
    }
  }

  if (book.status === 'proposal') {
    return {
      label: '目录待确认',
      status: '待确认',
      title: `确认《${source}》的目录`,
      summary: '确认或修改目录后，第一章会优先生成。',
      tags: ['学习书提案'],
      source,
      position: '',
      actionLabel: '去确认',
    }
  }

  // 学习节律：今日尚无学习事件，且当前正处于用户最活跃时段 → 建议回到这本书（学习者模型规格 §5）
  if (profile && !profile.rhythm.studiedToday) {
    const dist = profile.rhythm.periodDistribution
    const topPeriod = (Object.keys(dist) as Array<keyof typeof dist>)
      .reduce((a, b) => (dist[b] > dist[a] ? b : a))
    if (dist[topPeriod] > 0 && periodOf(now) === topPeriod) {
      return {
        label: '学习节律',
        status: '保持节奏',
        title: `回到《${source}》`,
        summary: `你通常在这个时段学习（已连续 ${profile.rhythm.streakDays} 天），今天还没开始。`,
        tags: ['学习节律', `近 30 天活跃 ${profile.rhythm.activeDays30} 天`],
        source,
        position: '',
        actionLabel: '继续学习',
      }
    }
  }

  return null
}
