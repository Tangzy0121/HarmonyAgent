import { describe, expect, it } from 'vitest'
import { deriveTodayFocus, pickTodayRealBook } from './todayNextStep'
import type { BookChapter, LearningBook, LearningEvidence, ReviewScheduleEntry } from '../types/learningBook'
import type { StoredBook } from '../services/bookApi'

const NOW = new Date('2026-08-17T12:00:00.000Z')

function chapter(id: string, order: number, title: string): BookChapter {
  return {
    id,
    title,
    order,
    objective: `${title}的目标`,
    coreConceptId: `core-${id}`,
    estimatedMinutes: 6,
    sourceAnchors: [],
    status: 'ready',
    blocks: [],
  } as unknown as BookChapter
}

function evidence(chapterId: string, outcome: LearningEvidence['outcome'], createdAt: string): LearningEvidence {
  return {
    id: `ev-${chapterId}-${createdAt}`,
    chapterId,
    conceptId: 'c-1',
    sourceBlockId: 'blk-1',
    statement: '证据陈述',
    outcome,
    createdAt,
  }
}

interface BookOverrides {
  status?: LearningBook['status']
  chapters?: BookChapter[]
  evidence?: LearningEvidence[]
  reviewSchedule?: Record<string, ReviewScheduleEntry>
  updatedAt?: string
}

function book(id: string, overrides: BookOverrides = {}): StoredBook {
  return {
    id,
    status: 'ready',
    chapters: [chapter('ch-1', 0, '第一章'), chapter('ch-2', 1, '第二章')],
    evidence: [],
    proposal: { title: `《${id}》` },
    ...overrides,
  } as unknown as StoredBook
}

describe('pickTodayRealBook', () => {
  it('returns null for no books', () => {
    expect(pickTodayRealBook([], NOW)).toBeNull()
  })

  it('returns null when every book is ready without evidence or due review', () => {
    expect(pickTodayRealBook([book('b-1')], NOW)).toBeNull()
  })

  it('prefers a book with due review over in-progress and evidence books', () => {
    const due = book('b-due', {
      reviewSchedule: { 'blk-1': { kind: 'quiz', stage: 1, lapses: 0, dueAt: '2026-08-17T08:00:00.000Z', updatedAt: '2026-08-16T08:00:00.000Z' } },
    })
    const inProgress = book('b-gen', { status: 'generating', updatedAt: '2026-08-17T11:00:00.000Z' })
    const withEvidence = book('b-ev', { evidence: [evidence('ch-1', 'mastered', '2026-08-17T10:00:00.000Z')] })

    expect(pickTodayRealBook([withEvidence, inProgress, due], NOW)?.id).toBe('b-due')
  })

  it('ignores review schedule entries not yet due', () => {
    const future = book('b-future', {
      reviewSchedule: { 'blk-1': { kind: 'quiz', stage: 1, lapses: 0, dueAt: '2026-08-18T08:00:00.000Z', updatedAt: '2026-08-16T08:00:00.000Z' } },
    })
    expect(pickTodayRealBook([future], NOW)).toBeNull()
  })

  it('prefers in-progress (proposal/generating/partial) books over evidence-based suggestions', () => {
    const proposal = book('b-proposal', { status: 'proposal', updatedAt: '2026-08-16T09:00:00.000Z' })
    const withEvidence = book('b-ev', { evidence: [evidence('ch-1', 'review', '2026-08-17T10:00:00.000Z')] })

    expect(pickTodayRealBook([withEvidence, proposal], NOW)?.id).toBe('b-proposal')
  })

  it('picks the book with the latest evidence when nothing is due or in progress', () => {
    const older = book('b-old', { evidence: [evidence('ch-1', 'mastered', '2026-08-15T10:00:00.000Z')] })
    const newer = book('b-new', { evidence: [evidence('ch-1', 'review', '2026-08-16T10:00:00.000Z')] })

    expect(pickTodayRealBook([older, newer], NOW)?.id).toBe('b-new')
  })
})

describe('deriveTodayFocus', () => {
  it('returns null without a book', () => {
    expect(deriveTodayFocus(undefined, NOW)).toBeNull()
  })

  it('returns null for a ready book with no evidence and nothing due', () => {
    expect(deriveTodayFocus(book('b-1'), NOW)).toBeNull()
  })

  it('surfaces due review with highest priority', () => {
    const due = book('b-due', {
      evidence: [evidence('ch-1', 'mastered', '2026-08-16T10:00:00.000Z')],
      reviewSchedule: { 'blk-1': { kind: 'quiz', stage: 2, lapses: 0, dueAt: '2026-08-17T06:00:00.000Z', updatedAt: '2026-08-16T06:00:00.000Z' } },
    })

    const focus = deriveTodayFocus(due, NOW)

    expect(focus?.label).toBe('今日复习')
    expect(focus?.actionLabel).toBe('去复习')
    expect(focus?.source).toBe('《b-due》')
  })

  it('suggests re-studying the chapter when the latest evidence outcome is review', () => {
    const theBook = book('b-1', { evidence: [evidence('ch-1', 'review', '2026-08-16T10:00:00.000Z')] })

    const focus = deriveTodayFocus(theBook, NOW)

    expect(focus?.title).toBe('再看一次：第一章')
    expect(focus?.actionLabel).toBe('去复习')
  })

  it('suggests the next chapter when the latest evidence is mastered', () => {
    const theBook = book('b-1', { evidence: [evidence('ch-1', 'mastered', '2026-08-16T10:00:00.000Z')] })

    const focus = deriveTodayFocus(theBook, NOW)

    expect(focus?.title).toBe('第二章')
    expect(focus?.actionLabel).toBe('继续学习')
  })

  it('suggests continuing generation for in-progress books', () => {
    const focus = deriveTodayFocus(book('b-gen', { status: 'generating' }), NOW)

    expect(focus?.label).toBe('继续生成')
    expect(focus?.actionLabel).toBe('继续阅读')
  })

  it('suggests confirming the proposal for proposal-stage books', () => {
    const focus = deriveTodayFocus(book('b-prop', { status: 'proposal' }), NOW)

    expect(focus?.actionLabel).toBe('去确认')
  })
})
