import { describe, expect, it } from 'vitest'

import type { StoredBook } from '../books/bookTypes.js'
import { buildProjectDto, sortProjects, type ProjectOwner } from './projectMapper.js'

const OWNER: ProjectOwner = { userId: 'local-user', workspaceId: 'local-workspace' }

function seedBook(overrides: Partial<StoredBook> = {}): StoredBook {
  return {
    id: 'book_seed',
    source: { id: 'doc_1', fileName: 'a.pdf', format: 'PDF', pageCount: 4, sizeLabel: '', updatedLabel: '' },
    goal: '课程学习',
    learnerLevel: '了解',
    proposal: { title: '种子书', description: '', rationale: '', estimatedMinutes: 30 },
    status: 'ready',
    chapters: [
      { id: 'ch-1', title: '第一章', order: 1, objective: '', coreConceptId: '', estimatedMinutes: 10, sourceAnchors: [], status: 'ready', blocks: [] },
      { id: 'ch-2', title: '第二章', order: 2, objective: '', coreConceptId: '', estimatedMinutes: 10, sourceAnchors: [], status: 'pending', blocks: [] },
    ],
    activeChapterId: 'ch-1',
    userNotes: [],
    quizAttempts: [],
    evidence: [],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
    generationJobs: [],
    ...overrides,
  }
}

describe('buildProjectDto', () => {
  it('提案阶段（无章节）：completion 为 null、不可读、无最近学习', () => {
    const dto = buildProjectDto(seedBook({ status: 'proposal', chapters: [] }), OWNER)
    expect(dto.version).toBe('1')
    expect(dto.projectId).toBe('book_seed')
    expect(dto.owner).toEqual(OWNER)
    expect(dto.progress).toEqual({ chaptersReady: 0, chaptersTotal: 0, completion: null })
    expect(dto.actions).toEqual({ canRead: false, hasPendingGeneration: false, dueReviewCount: 0 })
    expect(dto.lastLearnedAt).toBeNull()
    expect(dto.notices).toEqual({ unreadCount: 0 })
  })

  it('聚合学习书基本字段与章节进度', () => {
    const dto = buildProjectDto(seedBook(), OWNER)
    expect(dto.title).toBe('种子书')
    expect(dto.goal).toBe('课程学习')
    expect(dto.learnerLevel).toBe('了解')
    expect(dto.documentIds).toEqual(['doc_1'])
    expect(dto.bookId).toBe('book_seed')
    expect(dto.status).toBe('ready')
    expect(dto.progress.chaptersReady).toBe(1)
    expect(dto.progress.chaptersTotal).toBe(2)
    expect(dto.progress.completion).toBe(0) // 未阅读、无掌握证据
    expect(dto.actions.canRead).toBe(true)
    expect(dto.actions.hasPendingGeneration).toBe(true) // ch-2 pending
  })

  it('多源书 documentIds 取 sources 顺序', () => {
    const dto = buildProjectDto(seedBook({
      sources: [
        { id: 'doc_a', fileName: 'a.pdf', format: 'PDF', pageCount: 1, sizeLabel: '', updatedLabel: '' },
        { id: 'doc_b', fileName: 'b.md', format: 'Markdown', pageCount: 2, sizeLabel: '', updatedLabel: '' },
      ],
    }), OWNER)
    expect(dto.documentIds).toEqual(['doc_a', 'doc_b'])
  })

  it('lastLearnedAt 取答题/证据/阅读/复习中的最新时间', () => {
    const dto = buildProjectDto(seedBook({
      quizAttempts: [{ id: 'a1', chapterId: 'ch-1', blockId: 'b1', answerId: 'A', isCorrect: true, submittedAt: '2026-08-10T08:00:00.000Z' }],
      evidence: [{ id: 'e1', chapterId: 'ch-1', conceptId: 'c1', sourceBlockId: 'b1', statement: 's', outcome: 'mastered', createdAt: '2026-08-12T08:00:00.000Z' }],
      readingProgress: { visitedChapterIds: ['ch-1'], bookmarkedChapterIds: [], lastReadAt: { 'ch-1': '2026-08-11T08:00:00.000Z' } },
      reviewSchedule: { b1: { kind: 'quiz', stage: 1, lapses: 0, dueAt: '2026-08-20T00:00:00.000Z', updatedAt: '2026-08-13T08:00:00.000Z' } },
    }), OWNER)
    expect(dto.lastLearnedAt).toBe('2026-08-13T08:00:00.000Z')
  })

  it('dueReviewCount 只统计已到期的复习项', () => {
    const now = new Date('2026-08-15T00:00:00.000Z')
    const dto = buildProjectDto(seedBook({
      reviewSchedule: {
        b1: { kind: 'quiz', stage: 1, lapses: 0, dueAt: '2026-08-14T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z' },
        b2: { kind: 'flash_cards', stage: 1, lapses: 0, dueAt: '2026-08-16T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z' },
      },
    }), OWNER, now)
    expect(dto.actions.dueReviewCount).toBe(1)
  })
})

describe('sortProjects', () => {
  it('按 lastLearnedAt 降序，空则 createdAt，再空按 projectId 字典序', () => {
    const stale = buildProjectDto(seedBook({ id: 'book_stale' }), OWNER)
    const fresh = buildProjectDto(seedBook({
      id: 'book_fresh',
      quizAttempts: [{ id: 'a1', chapterId: 'ch-1', blockId: 'b1', answerId: 'A', isCorrect: true, submittedAt: '2026-08-20T00:00:00.000Z' }],
    }), OWNER)
    const tieA = buildProjectDto(seedBook({ id: 'book_a' }), OWNER)
    const tieB = buildProjectDto(seedBook({ id: 'book_b' }), OWNER)
    const sorted = sortProjects([stale, tieB, fresh, tieA])
    expect(sorted.map((project) => project.projectId)).toEqual([
      'book_fresh', 'book_a', 'book_b', 'book_stale',
    ])
  })
})
