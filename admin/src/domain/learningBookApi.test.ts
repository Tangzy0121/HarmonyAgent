import { describe, expect, it } from 'vitest'

import { learningBookFixture } from '../data/learningBook'
import type { BookBlock } from '../types/learningBook'
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

  it('normalizes server 1-based chapter order to the 0-based indexing the reading UI expects', () => {
    // 服务端 proposalEdits 把章节 order 归一化为 1..N；前端阅读页/导航把 order 当 0 基数组下标用
    const oneBased = {
      ...storedPayload,
      chapters: storedPayload.chapters.map((chapter, index) => ({ ...chapter, order: index + 1 })),
    }

    const parsed = parseLearningBook(oneBased)

    expect(parsed.chapters.map((chapter) => chapter.order)).toEqual(storedPayload.chapters.map((_, index) => index))
    expect(parsed.chapters.map((chapter) => chapter.id)).toEqual(storedPayload.chapters.map((chapter) => chapter.id))
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

describe('parseLearningBook · 新内容块守卫', () => {
  const [chapter] = storedPayload.chapters
  const newBlocks: BookBlock[] = [
    {
      id: 'blk-callout-1',
      type: 'callout',
      status: 'ready',
      title: '易混提醒',
      revision: 1,
      sourceAnchors: [],
      kind: 'pitfall',
      body: '别混淆训练信号与数据量。',
    },
    {
      id: 'blk-flash-1',
      type: 'flash_cards',
      status: 'ready',
      title: '术语速记',
      revision: 1,
      sourceAnchors: [],
      cards: [
        { front: '监督学习', back: '训练样本带目标标签。', hint: '看标签' },
        { front: '无监督学习', back: '训练样本不带目标标签。' },
      ],
    },
    {
      id: 'blk-figure-1',
      type: 'figure',
      status: 'ready',
      title: '训练流程',
      revision: 1,
      sourceAnchors: [],
      kind: 'flowchart',
      mermaid: 'flowchart LR\n  A-->B',
      caption: '训练流程示意',
    },
  ]
  const withNewBlocks = {
    ...storedPayload,
    chapters: [{ ...chapter, blocks: [...chapter.blocks, ...newBlocks] }],
  }
  const withBlocks = (blocks: unknown[]) => ({
    ...storedPayload,
    chapters: [{ ...chapter, blocks }],
  })

  it('accepts valid callout / flash_cards / figure blocks', () => {
    expect(parseLearningBook(withNewBlocks).chapters[0].blocks).toHaveLength(chapter.blocks.length + 3)
  })

  it('rejects an unknown callout kind', () => {
    expect(() => parseLearningBook(withBlocks([{ ...newBlocks[0], kind: 'warning' }])))
      .toThrowError(expect.objectContaining(INVALID))
  })

  it('rejects a figure block missing mermaid source or with an unknown kind', () => {
    const missingMermaid = { ...newBlocks[2] } as Record<string, unknown>
    delete missingMermaid.mermaid

    expect(() => parseLearningBook(withBlocks([missingMermaid]))).toThrowError(expect.objectContaining(INVALID))
    expect(() => parseLearningBook(withBlocks([{ ...newBlocks[2], kind: 'pie' }])))
      .toThrowError(expect.objectContaining(INVALID))
  })

  it('rejects flash_cards with malformed cards', () => {
    const missingBack = { ...newBlocks[1], cards: [{ front: '监督学习' }] }
    const badHint = { ...newBlocks[1], cards: [{ front: '监督学习', back: '有标签。', hint: 42 }] }
    const notArray = { ...newBlocks[1], cards: '两张卡' }

    expect(() => parseLearningBook(withBlocks([missingBack]))).toThrowError(expect.objectContaining(INVALID))
    expect(() => parseLearningBook(withBlocks([badHint]))).toThrowError(expect.objectContaining(INVALID))
    expect(() => parseLearningBook(withBlocks([notArray]))).toThrowError(expect.objectContaining(INVALID))
  })
})
