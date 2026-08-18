import { describe, expect, it } from 'vitest'
import { learningBookFixture } from '../data/learningBook'
import {
  advanceGeneration,
  mergeChapterWithNext,
  moveChapter,
  regenerateBlock,
  recordDeepLearningEvidence,
  removeChapter,
  renameChapter,
  retryChapterGeneration,
  resolveAgentContext,
  startBookGeneration,
  submitQuizAttempt,
  updateUserNote,
} from './learningBook'

describe('learning book proposal edits', () => {
  it('rejects removing a chapter when only three remain', () => {
    const threeChapters = removeChapter(learningBookFixture, 'ch-4')

    expect(removeChapter(threeChapters, 'ch-3')).toBe(threeChapters)
  })

  it('merges adjacent chapters and retains both source ranges', () => {
    const merged = mergeChapterWithNext(learningBookFixture, 'ch-1')

    expect(merged.chapters).toHaveLength(3)
    expect(merged.chapters[0].sourceAnchors.map((anchor) => anchor.pageRange)).toEqual(['3–6', '7–11'])
  })

  it('rejects merging when only three chapters remain', () => {
    const threeChapters = removeChapter(learningBookFixture, 'ch-4')

    expect(mergeChapterWithNext(threeChapters, 'ch-1')).toBe(threeChapters)
  })

  it('moves a chapter without changing its identity', () => {
    const moved = moveChapter(learningBookFixture, 'ch-2', 'up')

    expect(moved.chapters.map((chapter) => chapter.id)).toEqual(['ch-2', 'ch-1', 'ch-3', 'ch-4'])
  })

  it('rejects a blank chapter name', () => {
    expect(renameChapter(learningBookFixture, 'ch-1', '   ')).toBe(learningBookFixture)
  })
})

describe('learning book generation and context', () => {
  it('starts generation from the first chapter after proposal edits', () => {
    const reordered = moveChapter(learningBookFixture, 'ch-2', 'up')
    const result = startBookGeneration(reordered)

    expect(result.activeChapterId).toBe('ch-2')
    expect(result.chapters.map((chapter) => chapter.status)).toEqual(['generating', 'pending', 'pending', 'pending'])
  })

  it('makes the first chapter readable before the whole book is ready', () => {
    const next = advanceGeneration(learningBookFixture)

    expect(next.chapters[0].status).toBe('ready')
    expect(next.chapters[1].status).toBe('generating')
    expect(next.status).toBe('generating')
  })

  it('retries a failed chapter without changing other chapter states', () => {
    const failed = {
      ...learningBookFixture,
      chapters: learningBookFixture.chapters.map((chapter, index) => index === 0 ? { ...chapter, status: 'error' as const } : chapter),
    }
    const result = retryChapterGeneration(failed, 'ch-1')

    expect(result.chapters[0].status).toBe('generating')
    expect(result.chapters[1].status).toBe('pending')
  })

  it('defaults Agent context to the requested chapter', () => {
    const context = resolveAgentContext(learningBookFixture, 'ch-1', 'chapter')

    expect(context.label).toBe('第 1 章 · 监督学习的判断起点')
    expect(context.chapterIds).toEqual(['ch-1'])
  })

  it('expands Agent context only when whole-book scope is explicit', () => {
    const context = resolveAgentContext(learningBookFixture, 'ch-1', 'book')

    expect(context.label).toBe('整本学习书 · 从训练信号理解机器学习')
    expect(context.chapterIds).toEqual(['ch-1', 'ch-2', 'ch-3', 'ch-4'])
  })
})

describe('learning evidence and regeneration', () => {
  it('creates evidence only after a quiz answer is submitted', () => {
    expect(learningBookFixture.evidence).toHaveLength(0)

    const result = submitQuizAttempt(learningBookFixture, 'blk-quiz-1', 'answer-b')

    expect(result.quizAttempts).toHaveLength(1)
    expect(result.evidence).toHaveLength(1)
    expect(result.evidence[0].conceptId).toBe('supervised-learning')
  })

  it('does not create duplicate evidence for a submitted quiz', () => {
    const submitted = submitQuizAttempt(learningBookFixture, 'blk-quiz-1', 'answer-b')

    expect(submitQuizAttempt(submitted, 'blk-quiz-1', 'answer-a')).toBe(submitted)
  })

  it('preserves user notes and submitted attempts during regeneration', () => {
    const submitted = submitQuizAttempt(learningBookFixture, 'blk-quiz-1', 'answer-b')
    const result = regenerateBlock(submitted, 'blk-explanation-1')

    expect(result.userNotes).toEqual(submitted.userNotes)
    expect(result.quizAttempts).toEqual(submitted.quizAttempts)
    expect(result.chapters[0].blocks[0].revision).toBe(2)
  })

  it('updates a user note without turning it into learning evidence', () => {
    const result = updateUserNote(learningBookFixture, 'note-1', '我自己的判断口诀')

    expect(result.userNotes[0].body).toBe('我自己的判断口诀')
    expect(result.evidence).toHaveLength(0)
  })

  it('records evidence when a deep-learning validation is completed for a source block', () => {
    const result = recordDeepLearningEvidence(learningBookFixture, 'blk-explanation-1')

    expect(result.evidence[0]).toMatchObject({
      chapterId: 'ch-1',
      conceptId: 'supervised-learning',
      sourceBlockId: 'blk-explanation-1',
      outcome: 'mastered',
    })
  })
})
