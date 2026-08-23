import { describe, expect, it } from 'vitest'
import { applyProgressEvent, deriveCompletion } from './readingProgress.js'
import type { BookChapter, QuizAttempt, StoredBook } from './bookTypes.js'

function chapter(id: string, order: number, blocks: BookChapter['blocks'] = []): BookChapter {
  return {
    id,
    title: `第${order}章`,
    order,
    objective: '',
    coreConceptId: '',
    estimatedMinutes: 10,
    sourceAnchors: [],
    status: 'ready',
    blocks,
  }
}

function conceptBlock(id: string, conceptIds: string[]): BookChapter['blocks'][number] {
  return {
    id,
    type: 'concept',
    status: 'ready',
    title: '概念',
    revision: 1,
    sourceAnchors: [],
    concepts: conceptIds.map((conceptId) => ({ id: conceptId, label: `概念${conceptId}`, description: '', learningState: '暂无学习记录' as const })),
    relations: [],
  }
}

function quizBlock(id: string, conceptId: string): BookChapter['blocks'][number] {
  return {
    id,
    type: 'quiz',
    status: 'ready',
    title: '练习',
    revision: 1,
    sourceAnchors: [],
    conceptId,
    question: 'q',
    options: [{ id: 'a', marker: 'A', text: 'x' }],
    correctAnswerId: 'a',
    feedback: '',
  }
}

function attempt(blockId: string, chapterId: string, isCorrect: boolean, submittedAt: string): QuizAttempt {
  return { id: `att_${blockId}_${submittedAt}`, chapterId, blockId, answerId: 'a', isCorrect, submittedAt }
}

function book(overrides: Partial<StoredBook> = {}): StoredBook {
  return {
    id: 'book_test',
    source: { id: 'doc_1', fileName: 'a.pdf', format: 'PDF', pageCount: 10, sizeLabel: '', updatedLabel: '' },
    goal: '课程学习',
    learnerLevel: '了解',
    proposal: { title: 't', description: '', rationale: '', estimatedMinutes: 30 },
    status: 'ready',
    chapters: [],
    activeChapterId: 'ch1',
    userNotes: [],
    quizAttempts: [],
    evidence: [],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    generationJobs: [],
    ...overrides,
  }
}

describe('applyProgressEvent', () => {
  it('visit 幂等加入 visited 并刷新 lastReadAt', () => {
    const target = book()
    applyProgressEvent(target, { chapterId: 'ch1', action: 'visit' }, '2026-08-17T08:00:00.000Z')
    applyProgressEvent(target, { chapterId: 'ch2', action: 'visit' }, '2026-08-17T09:00:00.000Z')
    applyProgressEvent(target, { chapterId: 'ch1', action: 'visit' }, '2026-08-17T10:00:00.000Z')
    expect(target.readingProgress?.visitedChapterIds).toEqual(['ch1', 'ch2'])
    expect(target.readingProgress?.lastReadAt.ch1).toBe('2026-08-17T10:00:00.000Z')
    expect(target.readingProgress?.lastReadAt.ch2).toBe('2026-08-17T09:00:00.000Z')
  })

  it('bookmark/unbookmark 幂等增删', () => {
    const target = book()
    applyProgressEvent(target, { chapterId: 'ch1', action: 'bookmark' }, '2026-08-17T08:00:00.000Z')
    applyProgressEvent(target, { chapterId: 'ch1', action: 'bookmark' }, '2026-08-17T08:01:00.000Z')
    expect(target.readingProgress?.bookmarkedChapterIds).toEqual(['ch1'])
    applyProgressEvent(target, { chapterId: 'ch1', action: 'unbookmark' }, '2026-08-17T08:02:00.000Z')
    applyProgressEvent(target, { chapterId: 'ch1', action: 'unbookmark' }, '2026-08-17T08:03:00.000Z')
    expect(target.readingProgress?.bookmarkedChapterIds).toEqual([])
  })

  it('存量书无 readingProgress 字段时自动初始化', () => {
    const target = book()
    delete target.readingProgress
    applyProgressEvent(target, { chapterId: 'ch1', action: 'visit' }, '2026-08-17T08:00:00.000Z')
    expect(target.readingProgress).toBeDefined()
    expect(target.readingProgress?.visitedChapterIds).toEqual(['ch1'])
  })
})

describe('deriveCompletion', () => {
  it('完成度 = 0.4×已读占比 + 0.6×有记录概念掌握均值', () => {
    const target = book({
      chapters: [
        chapter('ch1', 1, [conceptBlock('cb1', ['c1']), quizBlock('q1', 'c1')]),
        chapter('ch2', 2, [conceptBlock('cb2', ['c2']), quizBlock('q2', 'c2')]),
      ],
      // c1 三次全对 → mastery 1；c2 无记录 → 不参与均值
      quizAttempts: [
        attempt('q1', 'ch1', true, '2026-08-15T08:00:00.000Z'),
        attempt('q1', 'ch1', true, '2026-08-15T09:00:00.000Z'),
        attempt('q1', 'ch1', true, '2026-08-15T10:00:00.000Z'),
      ],
      readingProgress: { visitedChapterIds: ['ch1'], bookmarkedChapterIds: [], lastReadAt: { ch1: '2026-08-17T08:00:00.000Z' } },
    })
    const result = deriveCompletion(target)
    // 0.4×(1/2) + 0.6×1 = 0.8
    expect(result.completionScore).toBeCloseTo(0.8, 6)
    expect(result.visitedCount).toBe(1)
    expect(result.totalChapters).toBe(2)
  })

  it('已读 id 不在章列表中不计入；零章节完成度为 0', () => {
    const stray = book({
      chapters: [chapter('ch1', 1)],
      readingProgress: { visitedChapterIds: ['ghost'], bookmarkedChapterIds: [], lastReadAt: {} },
    })
    expect(deriveCompletion(stray).visitedCount).toBe(0)
    expect(deriveCompletion(book()).completionScore).toBe(0)
  })

  it('薄弱章节：章内有记录概念均值 <0.5，升序取前 3', () => {
    const target = book({
      chapters: [
        chapter('ch1', 1, [conceptBlock('cb1', ['c1']), quizBlock('q1', 'c1')]),
        chapter('ch2', 2, [conceptBlock('cb2', ['c2']), quizBlock('q2', 'c2')]),
        chapter('ch3', 3, [conceptBlock('cb3', ['c3']), quizBlock('q3', 'c3')]),
      ],
      quizAttempts: [
        // c1: 一次答错 → mastery 0（封顶 0.5 内）
        attempt('q1', 'ch1', false, '2026-08-15T08:00:00.000Z'),
        // c2: 两次一对一错（新近对）→ 加权 1/(1+0.95)≈0.513 → 不薄弱；调整为先对后错 → 0.95/1.95≈0.487 薄弱
        attempt('q2', 'ch2', true, '2026-08-15T08:00:00.000Z'),
        attempt('q2', 'ch2', false, '2026-08-15T09:00:00.000Z'),
        // c3: 三次全对 → 1 不薄弱
        attempt('q3', 'ch3', true, '2026-08-15T08:00:00.000Z'),
        attempt('q3', 'ch3', true, '2026-08-15T09:00:00.000Z'),
        attempt('q3', 'ch3', true, '2026-08-15T10:00:00.000Z'),
      ],
    })
    const result = deriveCompletion(target)
    expect(result.weakChapters.map((entry) => entry.chapterId)).toEqual(['ch1', 'ch2'])
    expect(result.weakChapters[0].mastery).toBeLessThan(result.weakChapters[1].mastery)
    expect(result.weakChapters[1].mastery).toBeCloseTo(0.95 / 1.95, 5)
  })

  it('无阅读进度/无作答时返回零完成度与空薄弱', () => {
    const result = deriveCompletion(book({ chapters: [chapter('ch1', 1)] }))
    expect(result.completionScore).toBe(0)
    expect(result.weakChapters).toEqual([])
  })
})
