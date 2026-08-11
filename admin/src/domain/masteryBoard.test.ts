import { describe, expect, it } from 'vitest'
import { learningBookFixture } from '../data/learningBook'
import type { BookChapter, ConceptBlock, LearningBook, QuizAttempt, QuizBlock } from '../types/learningBook'
import { buildMasteryBoard } from './masteryBoard'

const now = new Date('2026-08-11T08:00:00.000Z')

// 看板造书：ch-1 含 concept 块 blk-concept-1（c1 概念甲、c2 概念乙）+ quiz blk-q1(c1) + quiz blk-q2(c2)
function conceptBlock(concepts: ConceptBlock['concepts'], id = 'blk-concept-1'): ConceptBlock {
  return {
    id,
    type: 'concept',
    status: 'ready',
    title: '本章知识',
    revision: 1,
    sourceAnchors: [],
    concepts,
    relations: [],
  }
}

function quizBlock(id: string, conceptId: string): QuizBlock {
  return {
    id,
    type: 'quiz',
    status: 'ready',
    title: '快速验证',
    revision: 1,
    sourceAnchors: [],
    conceptId,
    question: '这是哪一类学习？',
    options: [
      { id: `${id}-a`, marker: 'A', text: '选项甲' },
      { id: `${id}-b`, marker: 'B', text: '选项乙' },
    ],
    correctAnswerId: `${id}-b`,
    feedback: '反馈',
  }
}

const boardConcepts: ConceptBlock['concepts'] = [
  { id: 'c1', label: '概念甲', description: '甲', learningState: '暂无学习记录' },
  { id: 'c2', label: '概念乙', description: '乙', learningState: '暂无学习记录' },
]

const boardChapter: BookChapter = {
  id: 'ch-1',
  title: '第一章 监督学习',
  order: 0,
  objective: '目标',
  coreConceptId: 'c1',
  estimatedMinutes: 6,
  sourceAnchors: [],
  status: 'ready',
  blocks: [conceptBlock(boardConcepts), quizBlock('blk-q1', 'c1'), quizBlock('blk-q2', 'c2')],
}

function makeBook(overrides: Partial<LearningBook> = {}): LearningBook {
  return { ...learningBookFixture, chapters: [boardChapter], quizAttempts: [], ...overrides }
}

let attemptSeq = 0
function attemptAt(blockId: string, isCorrect: boolean, submittedAt: string): QuizAttempt {
  attemptSeq += 1
  return {
    id: `attempt-${attemptSeq}`,
    chapterId: 'ch-1',
    blockId,
    answerId: isCorrect ? `${blockId}-b` : `${blockId}-a`,
    isCorrect,
    submittedAt,
  }
}

describe('buildMasteryBoard', () => {
  it('无作答的概念为未学；1 次答对封顶 0.5', () => {
    const book = makeBook({ quizAttempts: [attemptAt('blk-q1', true, '2026-08-11T01:00:00.000Z')] })
    const rows = buildMasteryBoard(book, now)

    expect(rows).toHaveLength(2)
    const c1 = rows.find((row) => row.conceptId === 'c1')
    const c2 = rows.find((row) => row.conceptId === 'c2')
    expect(c2).toMatchObject({ state: '未学', mastery: 0, blockId: 'blk-concept-1' })
    expect(c1?.mastery).toBe(0.5)
    // 需求书实现为逐字精确值：mastery >= 0.5 → 掌握中，故 1 次答对（封顶 0.5）落在掌握中
    expect(c1?.state).toBe('掌握中')
    expect(c1).toMatchObject({ chapterId: 'ch-1', chapterTitle: '第一章 监督学习', label: '概念甲' })
  })

  it('待复习优先于已掌握：关联 quiz 块有到期调度项时为待复习', () => {
    const attempts = [
      attemptAt('blk-q1', true, '2026-08-11T01:00:00.000Z'),
      attemptAt('blk-q1', true, '2026-08-11T02:00:00.000Z'),
      attemptAt('blk-q1', true, '2026-08-11T03:00:00.000Z'),
    ]
    const dueBook = makeBook({
      quizAttempts: attempts,
      reviewSchedule: {
        'blk-q1': { kind: 'quiz', stage: 1, lapses: 0, dueAt: '2026-08-11T07:00:00.000Z', updatedAt: '2026-08-11T03:00:00.000Z' },
      },
    })
    const dueRows = buildMasteryBoard(dueBook, now)
    // 掌握度 1（>=0.8），但 blk-q1 的 dueAt <= now → 待复习
    expect(dueRows.find((row) => row.conceptId === 'c1')).toMatchObject({ state: '待复习', mastery: 1 })
    expect(dueRows.find((row) => row.conceptId === 'c2')?.state).toBe('未学')

    const futureBook = makeBook({
      quizAttempts: attempts,
      reviewSchedule: {
        'blk-q1': { kind: 'quiz', stage: 1, lapses: 0, dueAt: '2026-08-12T07:00:00.000Z', updatedAt: '2026-08-11T03:00:00.000Z' },
      },
    })
    expect(buildMasteryBoard(futureBook, now).find((row) => row.conceptId === 'c1')?.state).toBe('已掌握')
  })

  it('掌握度区间：>=0.8 已掌握；0.5–0.8 掌握中；<0.5 起步', () => {
    const mastered = makeBook({
      quizAttempts: [
        attemptAt('blk-q1', true, '2026-08-11T01:00:00.000Z'),
        attemptAt('blk-q1', true, '2026-08-11T02:00:00.000Z'),
        attemptAt('blk-q1', true, '2026-08-11T03:00:00.000Z'),
      ],
    })
    expect(buildMasteryBoard(mastered, now).find((row) => row.conceptId === 'c1')).toMatchObject({ state: '已掌握', mastery: 1 })

    // 最近答错 + 两次答对：(0.95 + 0.85) / 2.8 ≈ 0.642857 → 掌握中
    const learning = makeBook({
      quizAttempts: [
        attemptAt('blk-q1', true, '2026-08-11T01:00:00.000Z'),
        attemptAt('blk-q1', true, '2026-08-11T02:00:00.000Z'),
        attemptAt('blk-q1', false, '2026-08-11T03:00:00.000Z'),
      ],
    })
    expect(buildMasteryBoard(learning, now).find((row) => row.conceptId === 'c1')).toMatchObject({ state: '掌握中', mastery: 0.642857 })

    // 两次作答、最近答错：0.95 / 1.95 ≈ 0.487179 → 起步
    const started = makeBook({
      quizAttempts: [
        attemptAt('blk-q1', true, '2026-08-11T01:00:00.000Z'),
        attemptAt('blk-q1', false, '2026-08-11T02:00:00.000Z'),
      ],
    })
    expect(buildMasteryBoard(started, now).find((row) => row.conceptId === 'c1')).toMatchObject({ state: '起步', mastery: 0.487179 })
  })

  it('conceptId 为空串的 quiz 只计入自身块', () => {
    const chapter: BookChapter = {
      ...boardChapter,
      blocks: [
        conceptBlock([{ id: '', label: '无名概念', description: '空', learningState: '暂无学习记录' }], 'blk-concept-9'),
        quizBlock('blk-q9', ''),
      ],
    }
    const book = makeBook({
      chapters: [chapter],
      quizAttempts: [attemptAt('blk-q9', true, '2026-08-11T01:00:00.000Z')],
    })
    const rows = buildMasteryBoard(book, now)

    // blk-q9 的 conceptId 为空串，不计入该概念；空串概念只统计自身概念块的作答 → 未学
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ conceptId: '', state: '未学', mastery: 0, blockId: 'blk-concept-9' })
  })
})
