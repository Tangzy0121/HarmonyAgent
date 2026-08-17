import type { LearningBook, LearningEvidence, ReviewScheduleEntry } from '../types/learningBook'
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
 * 从真实书中挑出「今日下一步」的承载书，优先级（规格 §5.7/§10：只突出一个有依据的下一步）：
 * 到期复习 > 进行中的书（目录待确认/生成中/部分可读）> 最近有学习证据的书；都没有 → null（回退 mock 演示内容）。
 */
export function pickTodayRealBook(books: StoredBook[], now: Date = new Date()): StoredBook | null {
  const withDue = books.filter((book) => hasDueReview(book, now))
  if (withDue.length > 0) {
    return withDue.sort((a, b) => dueEntries(a, now)[0][1].dueAt.localeCompare(dueEntries(b, now)[0][1].dueAt))[0]
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

/**
 * 由一本书的状态/证据/复习调度派生今日主焦点；派生不出有效行动时返回 null，
 * 由调用方回退到静态演示内容（mock 原型行为保持不变）。
 */
export function deriveTodayFocus(book: LearningBook | undefined, now: Date = new Date()): TodayFocus | null {
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

  return null
}
