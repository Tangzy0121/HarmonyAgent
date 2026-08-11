import { describe, expect, it } from 'vitest'
import { applyReviewGrade, listDueItems, REVIEW_INTERVALS_DAYS } from './schedule.js'
import type { StoredBook } from './bookTypes.js'

const now = new Date('2026-08-11T08:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000
const plusDays = (days: number) => new Date(now.getTime() + days * DAY_MS).toISOString()

describe('applyReviewGrade', () => {
  it('quiz 答错：未入调度则入队 stage 0、lapses 1、当天到期', () => {
    const entry = applyReviewGrade(undefined, 'quiz', false, now)
    expect(entry).toEqual({ kind: 'quiz', stage: 0, lapses: 1, dueAt: now.toISOString(), updatedAt: now.toISOString() })
  })

  it('quiz 答错：已入调度则重置 stage 并累加 lapses', () => {
    const existing = { kind: 'quiz' as const, stage: 2, lapses: 1, dueAt: plusDays(4), updatedAt: plusDays(-1) }
    const entry = applyReviewGrade(existing, 'quiz', false, now)
    expect(entry?.stage).toBe(0)
    expect(entry?.lapses).toBe(2)
    expect(entry?.dueAt).toBe(now.toISOString())
  })

  it('quiz 答对：按当前档推进 dueAt = now + intervals[stage]，stage+1', () => {
    const existing = { kind: 'quiz' as const, stage: 0, lapses: 1, dueAt: now.toISOString(), updatedAt: now.toISOString() }
    const entry = applyReviewGrade(existing, 'quiz', true, now)
    expect(entry?.stage).toBe(1)
    expect(entry?.dueAt).toBe(plusDays(REVIEW_INTERVALS_DAYS.quiz[0]))
  })

  it('quiz 走完整个序列后毕业（返回 null）', () => {
    const last = { kind: 'quiz' as const, stage: REVIEW_INTERVALS_DAYS.quiz.length, lapses: 0, dueAt: now.toISOString(), updatedAt: now.toISOString() }
    expect(applyReviewGrade(last, 'quiz', true, now)).toBeNull()
  })

  it('quiz 从未答错时答对：不入调度（返回 null）', () => {
    expect(applyReviewGrade(undefined, 'quiz', true, now)).toBeNull()
  })

  it('flash 首次自评记住了：入调度，dueAt = now + intervals[0]', () => {
    const entry = applyReviewGrade(undefined, 'flash_cards', true, now)
    expect(entry?.stage).toBe(1)
    expect(entry?.dueAt).toBe(plusDays(REVIEW_INTERVALS_DAYS.flash_cards[0]))
  })

  it('flash 没记住：stage 重置 0、当天到期', () => {
    const existing = { kind: 'flash_cards' as const, stage: 3, lapses: 0, dueAt: plusDays(7), updatedAt: plusDays(-1) }
    const entry = applyReviewGrade(existing, 'flash_cards', false, now)
    expect(entry?.stage).toBe(0)
    expect(entry?.dueAt).toBe(now.toISOString())
    expect(entry?.lapses).toBe(1)
  })
})

function bookWith(schedule: StoredBook['reviewSchedule']): StoredBook {
  // 最小 StoredBook：两章，ch-1 含 quiz blk-q1（标题'题一'）与 flash blk-f1（标题'卡一'），ch-2 无块
  return {
    id: 'book_t1', source: { id: 'doc1', fileName: 'a.pdf', format: 'PDF', pageCount: 3, sizeLabel: '1KB', updatedLabel: '今天' },
    goal: '理解概念', learnerLevel: '入门',
    proposal: { title: 't', description: '', rationale: '', estimatedMinutes: 5 },
    status: 'ready', activeChapterId: 'ch-1',
    chapters: [
      { id: 'ch-1', title: '第一章', order: 1, objective: '', coreConceptId: '', estimatedMinutes: 5, sourceAnchors: [], status: 'ready', blocks: [
        { id: 'blk-q1', type: 'quiz', status: 'ready', title: '题一', revision: 1, sourceAnchors: [], conceptId: 'c1', question: '问？', options: [{ id: 'o1', marker: 'A', text: '甲' }], correctAnswerId: 'o1', feedback: '' },
        { id: 'blk-f1', type: 'flash_cards', status: 'ready', title: '卡一', revision: 1, sourceAnchors: [], cards: [{ front: '正', back: '反' }] },
      ] },
      { id: 'ch-2', title: '第二章', order: 2, objective: '', coreConceptId: '', estimatedMinutes: 5, sourceAnchors: [], status: 'ready', blocks: [] },
    ],
    userNotes: [], quizAttempts: [], evidence: [],
    createdAt: now.toISOString(), updatedAt: now.toISOString(), generationJobs: [],
    reviewSchedule: schedule,
  }
}

describe('listDueItems', () => {
  it('只含 dueAt <= now 且块仍存在的项，按 dueAt 升序；旧书无字段按空处理', () => {
    const book = bookWith({
      'blk-q1': { kind: 'quiz', stage: 1, lapses: 1, dueAt: plusDays(-1), updatedAt: plusDays(-2) },   // 昨天到期
      'blk-f1': { kind: 'flash_cards', stage: 1, lapses: 0, dueAt: now.toISOString(), updatedAt: now.toISOString() }, // 此刻到期
      'blk-gone': { kind: 'quiz', stage: 0, lapses: 1, dueAt: plusDays(-3), updatedAt: plusDays(-3) }, // 块已删
    })
    const items = listDueItems(book, now)
    expect(items.map((item) => item.blockId)).toEqual(['blk-q1', 'blk-f1'])
    expect(items[0]).toMatchObject({ chapterId: 'ch-1', kind: 'quiz', title: '题一', lapses: 1 })
    // 未到期不出现
    const future = bookWith({ 'blk-q1': { kind: 'quiz', stage: 1, lapses: 0, dueAt: plusDays(1), updatedAt: now.toISOString() } })
    expect(listDueItems(future, now)).toEqual([])
    // 旧书无 reviewSchedule 字段
    const legacy = bookWith(undefined)
    expect(listDueItems(legacy, now)).toEqual([])
  })
})
