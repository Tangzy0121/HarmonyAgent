import { describe, expect, it } from 'vitest'

import { buildBankItems } from './bank.js'
import type { BookChapter, StoredBook } from './bookTypes.js'

function quizBlock(id: string, conceptId: string) {
  return {
    id, type: 'quiz', status: 'ready', title: `题${id}`, revision: 1, sourceAnchors: [],
    conceptId, question: `问题${id}`, options: [], correctAnswerId: 'o1', feedback: '',
  }
}

function flashBlock(id: string) {
  return {
    id, type: 'flash_cards', status: 'ready', title: `闪卡${id}`, revision: 1, sourceAnchors: [],
    cards: [{ front: '正面', back: '背面' }],
  }
}

function conceptBlock(concepts: Array<{ id: string; label: string }>) {
  return {
    id: 'blk-concept', type: 'concept', status: 'ready', title: '节点', revision: 1, sourceAnchors: [],
    concepts: concepts.map((c) => ({ ...c, description: '', learningState: '暂无学习记录' })),
    relations: [],
  }
}

function makeBook(overrides: Partial<StoredBook>): StoredBook {
  return {
    id: 'book_1',
    chapters: [],
    quizAttempts: [],
    evidence: [],
    userNotes: [],
    userCards: [],
    ...overrides,
  } as unknown as StoredBook
}

function chapterWith(blocks: unknown[]): BookChapter {
  return {
    id: 'ch-1', title: '第一章', order: 0, objective: '', coreConceptId: 'c-1', estimatedMinutes: 6,
    sourceAnchors: [], status: 'ready', blocks,
  } as unknown as BookChapter
}

describe('buildBankItems', () => {
  it('returns an empty list for a book without quiz or flash content', () => {
    expect(buildBankItems(makeBook({}))).toEqual([])
  })

  it('reports attempts, last outcome and mastery per quiz block', () => {
    const book = makeBook({
      chapters: [chapterWith([quizBlock('blk-q1', 'c-1')])],
      quizAttempts: [
        { id: 'a1', chapterId: 'ch-1', blockId: 'blk-q1', answerId: 'o1', isCorrect: true, submittedAt: '2026-08-10T01:00:00.000Z' },
        { id: 'a2', chapterId: 'ch-1', blockId: 'blk-q1', answerId: 'o2', isCorrect: false, submittedAt: '2026-08-11T01:00:00.000Z' },
      ],
    })

    const items = buildBankItems(book)

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      blockId: 'blk-q1', chapterId: 'ch-1', kind: 'quiz',
      attempts: 2, lastCorrect: false, wrong: true,
    })
    expect(items[0].mastery).toBe(0.487179) // 新错旧对 → 0.95/1.95（mastery.ts 同公式）
  })

  it('sorts wrong answers first, then by mastery ascending', () => {
    const book = makeBook({
      chapters: [chapterWith([quizBlock('blk-q1', 'c-1'), quizBlock('blk-q2', 'c-1'), quizBlock('blk-q3', 'c-1')])],
      quizAttempts: [
        { id: 'a1', chapterId: 'ch-1', blockId: 'blk-q1', answerId: 'o1', isCorrect: true, submittedAt: '2026-08-10T01:00:00.000Z' },
        { id: 'a2', chapterId: 'ch-1', blockId: 'blk-q2', answerId: 'o2', isCorrect: false, submittedAt: '2026-08-10T02:00:00.000Z' },
      ],
    })

    const items = buildBankItems(book)

    expect(items[0].blockId).toBe('blk-q2') // 错题最前
    expect(items[0].wrong).toBe(true)
    expect(items[1].wrong).toBe(false)
  })

  it('includes flash card blocks with their review schedule', () => {
    const book = makeBook({
      chapters: [chapterWith([flashBlock('blk-f1')])],
      reviewSchedule: {
        'blk-f1': { kind: 'flash_cards', stage: 2, lapses: 0, dueAt: '2026-08-20T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z' },
      },
    })

    const items = buildBankItems(book)

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      blockId: 'blk-f1', kind: 'flash_cards', attempts: 0, lastCorrect: null, wrong: false,
      schedule: { stage: 2, dueAt: '2026-08-20T00:00:00.000Z' },
    })
  })

  it('includes user cards as flash card items', () => {
    const book = makeBook({
      chapters: [chapterWith([])],
      userCards: [{ id: 'card_1', chapterId: 'ch-1', front: '什么是监督学习？', back: '带标签的学习', createdAt: '2026-08-16T01:00:00.000Z' }],
    })

    const items = buildBankItems(book)

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ blockId: 'card_1', kind: 'flash_cards', chapterId: 'ch-1', attempts: 0 })
    expect(items[0].title).toContain('监督学习')
  })

  it('resolves concept labels from concept blocks', () => {
    const book = makeBook({
      chapters: [chapterWith([conceptBlock([{ id: 'c-1', label: '监督学习' }]), quizBlock('blk-q1', 'c-1')])],
    })

    expect(buildBankItems(book)[0].conceptLabel).toBe('监督学习')
  })
})
