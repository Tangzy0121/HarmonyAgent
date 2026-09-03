import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { bookSources, fingerprintOf } from './bookSources.js'
import type { SourceDocument, StoredBook } from './bookTypes.js'

function source(overrides: Partial<SourceDocument> = {}): SourceDocument {
  return {
    id: 'doc_a',
    fileName: 'a.pdf',
    format: 'PDF',
    pageCount: 3,
    sizeLabel: '1 KB',
    updatedLabel: '2026-08-17',
    ...overrides,
  }
}

function bookWith(partial: Partial<StoredBook>): StoredBook {
  return {
    id: 'book_1',
    source: source(),
    goal: '理解概念',
    learnerLevel: '入门',
    proposal: { title: '测试书', description: '', rationale: '', estimatedMinutes: 30 },
    status: 'proposal',
    chapters: [],
    activeChapterId: '',
    userNotes: [],
    quizAttempts: [],
    evidence: [],
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
    generationJobs: [],
    ...partial,
  }
}

describe('bookSources', () => {
  it('falls back to [book.source] when sources is missing', () => {
    const book = bookWith({})
    expect(bookSources(book)).toEqual([book.source])
  })

  it('falls back to [book.source] when sources is an empty array', () => {
    const book = bookWith({ sources: [] })
    expect(bookSources(book)).toEqual([book.source])
  })

  it('returns the full sources list for a multi-source book', () => {
    const second = source({ id: 'doc_b', fileName: 'b.md', format: 'Markdown', pageCount: 2 })
    const book = bookWith({ sources: [source(), second] })
    expect(bookSources(book)).toHaveLength(2)
    expect(bookSources(book)[1]).toEqual(second)
    expect(bookSources(book)[0]).toEqual(book.source)
  })
})

describe('fingerprintOf', () => {
  it('returns the sha256 hex digest of the text', () => {
    const text = '笔记第1页：贝叶斯公式。'
    expect(fingerprintOf(text)).toBe(createHash('sha256').update(text).digest('hex'))
  })

  it('is deterministic and 64 hex chars', () => {
    const digest = fingerprintOf('abc')
    expect(digest).toBe(fingerprintOf('abc'))
    expect(digest).toMatch(/^[0-9a-f]{64}$/u)
    expect(digest).not.toBe(fingerprintOf('abd'))
  })
})
