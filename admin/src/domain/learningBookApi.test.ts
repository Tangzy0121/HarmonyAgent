import { describe, expect, it } from 'vitest'

import { learningBookFixture } from '../data/learningBook'
import { BookApiError, parseLearningBook } from './learningBookApi'

const INVALID = { name: 'BookApiError', code: 'invalid_book_payload' }

// 服务端 StoredBook 比前端 LearningBook 多落盘字段，守卫须原样透传而不报错
const storedPayload = {
  ...learningBookFixture,
  createdAt: '2026-08-10T02:00:00.000Z',
  updatedAt: '2026-08-10T02:30:00.000Z',
  generationJobs: [{ chapterId: 'ch-1', status: 'pending', attempts: 0, lastError: null, updatedAt: '2026-08-10T02:00:00.000Z' }],
}

describe('parseLearningBook', () => {
  it('accepts a valid payload and passes through server-only fields untouched', () => {
    const parsed = parseLearningBook(storedPayload)

    expect(parsed).toBe(storedPayload)
    expect(parsed.id).toBe(learningBookFixture.id)
    expect((parsed as unknown as Record<string, unknown>).createdAt).toBe('2026-08-10T02:00:00.000Z')
    expect((parsed as unknown as Record<string, unknown>).generationJobs).toEqual(storedPayload.generationJobs)
  })

  it('rejects non-object payloads', () => {
    for (const value of [null, undefined, 42, 'book', [], true]) {
      expect(() => parseLearningBook(value)).toThrowError(expect.objectContaining(INVALID))
    }
  })

  it('rejects a payload without chapters or with non-array chapters', () => {
    const withoutChapters = { ...storedPayload } as Record<string, unknown>
    delete withoutChapters.chapters

    expect(() => parseLearningBook(withoutChapters)).toThrowError(expect.objectContaining(INVALID))
    expect(() => parseLearningBook({ ...storedPayload, chapters: 'ch-1' })).toThrowError(expect.objectContaining(INVALID))
    expect(() => parseLearningBook({ ...storedPayload, chapters: [null] })).toThrowError(expect.objectContaining(INVALID))
  })

  it('rejects unknown block types and malformed block fields', () => {
    const [chapter] = storedPayload.chapters
    const unknownType = {
      ...storedPayload,
      chapters: [{ ...chapter, blocks: [{ ...chapter.blocks[0], type: 'video' }] }],
    }
    const missingBody = {
      ...storedPayload,
      chapters: [{
        ...chapter,
        blocks: chapter.blocks.map((block) => {
          if (block.type !== 'explanation') return block
          const clone = { ...block } as Record<string, unknown>
          delete clone.body
          return clone
        }),
      }],
    }

    expect(() => parseLearningBook(unknownType)).toThrowError(expect.objectContaining(INVALID))
    expect(() => parseLearningBook(missingBody)).toThrowError(expect.objectContaining(INVALID))
  })

  it('rejects a chapter missing status or with an unknown status', () => {
    const [chapter] = storedPayload.chapters
    const missingStatus = { ...chapter } as Record<string, unknown>
    delete missingStatus.status

    expect(() => parseLearningBook({ ...storedPayload, chapters: [missingStatus] })).toThrowError(expect.objectContaining(INVALID))
    expect(() => parseLearningBook({ ...storedPayload, chapters: [{ ...chapter, status: 'archived' }] })).toThrowError(expect.objectContaining(INVALID))
  })

  it('rejects unknown book status, goal, or learner level', () => {
    expect(() => parseLearningBook({ ...storedPayload, status: 'draft' })).toThrowError(expect.objectContaining(INVALID))
    expect(() => parseLearningBook({ ...storedPayload, goal: '随便看看' })).toThrowError(expect.objectContaining(INVALID))
    expect(() => parseLearningBook({ ...storedPayload, learnerLevel: '专家' })).toThrowError(expect.objectContaining(INVALID))
  })

  it('rejects malformed nested collections', () => {
    const [chapter] = storedPayload.chapters

    expect(() => parseLearningBook({ ...storedPayload, userNotes: [{ id: 1 }] })).toThrowError(expect.objectContaining(INVALID))
    expect(() => parseLearningBook({ ...storedPayload, quizAttempts: [{ ...storedPayload.quizAttempts[0], isCorrect: 'yes' }] })).toThrowError(expect.objectContaining(INVALID))
    expect(() => parseLearningBook({ ...storedPayload, evidence: [{ outcome: 'maybe' }] })).toThrowError(expect.objectContaining(INVALID))
    expect(() => parseLearningBook({
      ...storedPayload,
      chapters: [{ ...chapter, sourceAnchors: [{ sourceId: 'S1' }] }],
    })).toThrowError(expect.objectContaining(INVALID))
  })
})

describe('BookApiError', () => {
  it('exposes a stable name, code, and message', () => {
    expect(new BookApiError('pdf_too_large', '文件过大')).toMatchObject({
      name: 'BookApiError',
      code: 'pdf_too_large',
      message: '文件过大',
    })
    expect(new BookApiError('pdf_too_large', '文件过大')).toBeInstanceOf(Error)
  })
})
