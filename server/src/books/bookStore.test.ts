import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createBookStore } from './bookStore.js'
import type { StoredBook } from './bookTypes.js'

function makeBook(id: string, overrides: Partial<StoredBook> = {}): StoredBook {
  return {
    id,
    source: {
      id: 'doc_source-1',
      fileName: 'chapter1.pdf',
      format: 'PDF',
      pageCount: 6,
      sizeLabel: '4.8 MB',
      updatedLabel: '2026-08-10',
    },
    goal: '理解概念',
    learnerLevel: '入门',
    proposal: {
      title: '机器学习入门',
      description: '根据讲义生成的学习书',
      rationale: '章节按讲义顺序组织',
      estimatedMinutes: 45,
    },
    status: 'proposal',
    chapters: [
      {
        id: 'ch-1',
        title: '监督学习',
        order: 1,
        objective: '理解标签',
        coreConceptId: 'concept-ch-1',
        estimatedMinutes: 15,
        sourceAnchors: [{
          sourceId: 'S1',
          fileName: 'chapter1.pdf',
          pageRange: '1–3',
          excerpt: '第一页开头片段',
        }],
        status: 'pending',
        blocks: [],
      },
    ],
    activeChapterId: 'ch-1',
    userNotes: [],
    quizAttempts: [],
    evidence: [],
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
    generationJobs: [{
      chapterId: 'ch-1',
      status: 'pending',
      attempts: 0,
      lastError: null,
      updatedAt: '2026-08-10T00:00:00.000Z',
    }],
    ...overrides,
  }
}

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'bookstore-'))
})

afterEach(async () => {
  vi.useRealTimers()
  await rm(dir, { recursive: true, force: true })
})

describe('bookStore', () => {
  it('save→get roundtrip persists the full book record', async () => {
    const store = createBookStore(dir)
    const book = makeBook('book_roundtrip-1')

    await store.save(book)
    const saved = await store.get(book.id)
    expect(saved).toEqual(book)
  })

  it('get migrates legacy cross-chapter duplicate block ids and remaps same-chapter references', async () => {
    const store = createBookStore(dir)
    const chapter = (chapterId: string): StoredBook['chapters'][number] => ({
      id: chapterId,
      title: `章节 ${chapterId}`,
      order: 1,
      objective: '目标',
      coreConceptId: `concept-${chapterId}`,
      estimatedMinutes: 10,
      sourceAnchors: [],
      status: 'ready',
      blocks: [{
        id: 'blk-quiz-1',
        type: 'quiz',
        status: 'ready',
        title: '随堂小测',
        revision: 1,
        sourceAnchors: [],
        conceptId: 'c1',
        question: '问题？',
        options: [
          { id: 'o1', marker: 'A', text: '甲' },
          { id: 'o2', marker: 'B', text: '乙' },
        ],
        correctAnswerId: 'o1',
        feedback: '反馈',
      }],
    })
    const book = makeBook('book_legacy-dup-ids', {
      chapters: [chapter('ch-1'), chapter('ch-2')],
      quizAttempts: [
        { id: 'qa-1', chapterId: 'ch-1', blockId: 'blk-quiz-1', answerId: 'o1', isCorrect: true, submittedAt: '2026-08-10T01:00:00.000Z' },
        { id: 'qa-2', chapterId: 'ch-2', blockId: 'blk-quiz-1', answerId: 'o2', isCorrect: false, submittedAt: '2026-08-10T02:00:00.000Z' },
      ],
      userNotes: [{ id: 'note-1', chapterId: 'ch-2', blockId: 'blk-quiz-1', body: '笔记', createdAt: '2026-08-10T03:00:00.000Z' }],
      evidence: [{ id: 'ev-1', chapterId: 'ch-2', conceptId: 'c1', sourceBlockId: 'blk-quiz-1', statement: '证据', outcome: 'mastered', createdAt: '2026-08-10T04:00:00.000Z' }],
    })

    await store.save(book)
    const saved = (await store.get(book.id))!

    const ids = saved.chapters.flatMap((entry) => entry.blocks.map((block) => block.id))
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(['blk-ch-1-quiz-1', 'blk-ch-2-quiz-1'])
    expect(saved.quizAttempts.map((entry) => entry.blockId)).toEqual(['blk-ch-1-quiz-1', 'blk-ch-2-quiz-1'])
    expect(saved.userNotes[0]?.blockId).toBe('blk-ch-2-quiz-1')
    expect(saved.evidence[0]?.sourceBlockId).toBe('blk-ch-2-quiz-1')
  })

  it('get leaves books with already-unique block ids untouched', async () => {
    const store = createBookStore(dir)
    const chapter = (chapterId: string): StoredBook['chapters'][number] => ({
      id: chapterId,
      title: `章节 ${chapterId}`,
      order: 1,
      objective: '目标',
      coreConceptId: `concept-${chapterId}`,
      estimatedMinutes: 10,
      sourceAnchors: [],
      status: 'ready',
      blocks: [{
        id: `blk-${chapterId}-quiz-1`,
        type: 'quiz',
        status: 'ready',
        title: '随堂小测',
        revision: 1,
        sourceAnchors: [],
        conceptId: 'c1',
        question: '问题？',
        options: [
          { id: 'o1', marker: 'A', text: '甲' },
          { id: 'o2', marker: 'B', text: '乙' },
        ],
        correctAnswerId: 'o1',
        feedback: '反馈',
      }],
    })
    const book = makeBook('book_unique-ids', { chapters: [chapter('ch-1'), chapter('ch-2')] })

    await store.save(book)
    const saved = await store.get(book.id)
    expect(saved).toEqual(book)
  })

  it('get returns null for an unknown id and rejects unsafe ids', async () => {
    const store = createBookStore(dir)
    await expect(store.get('book_does-not-exist')).resolves.toBeNull()
    await expect(store.get('../escape')).resolves.toBeNull()
    await expect(store.get('doc_wrong-prefix')).resolves.toBeNull()
  })

  it('list returns all books sorted by createdAt', async () => {
    vi.useFakeTimers()
    const store = createBookStore(dir)

    vi.setSystemTime('2026-08-10T00:00:00.000Z')
    const newer = makeBook('book_newer-1', {
      createdAt: '2026-08-10T00:00:00.000Z',
      updatedAt: '2026-08-10T00:00:00.000Z',
    })
    await store.save(newer)
    vi.setSystemTime('2026-08-09T00:00:00.000Z')
    const older = makeBook('book_older-1', {
      createdAt: '2026-08-09T00:00:00.000Z',
      updatedAt: '2026-08-09T00:00:00.000Z',
    })
    await store.save(older)

    const list = await store.list()
    expect(list.map((entry) => entry.id)).toEqual([older.id, newer.id])
    expect(list[0]).toEqual(older)
  })

  it('remove deletes the record, returns true; returns false when missing', async () => {
    const store = createBookStore(dir)
    const book = makeBook('book_remove-1')
    await store.save(book)

    await expect(store.remove(book.id)).resolves.toBe(true)
    await expect(store.get(book.id)).resolves.toBeNull()
    const remaining = await readdir(dir)
    expect(remaining.filter((file) => file.startsWith(book.id))).toEqual([])

    await expect(store.remove(book.id)).resolves.toBe(false)
    await expect(store.remove('../escape')).resolves.toBe(false)
  })

  it('concurrent saves leave no tmp files or half-written records', async () => {
    const store = createBookStore(dir)

    const books = Array.from({ length: 10 }, (_, i) => makeBook(`book_concurrent-${i}`))
    await Promise.all(books.map((book) => store.save(book)))

    const files = await readdir(dir)
    expect(files.filter((file) => file.endsWith('.tmp'))).toEqual([])
    expect(files).toHaveLength(10)

    const list = await store.list()
    expect(list).toHaveLength(10)
    for (const book of books) {
      await expect(store.get(book.id)).resolves.toMatchObject({ id: book.id })
    }
  })

  it('bootstraps the directory when it does not exist yet', async () => {
    const nested = path.join(dir, 'not-yet-created')
    const store = createBookStore(nested)
    const book = makeBook('book_bootstrap-1')

    await store.save(book)
    await expect(store.get(book.id)).resolves.toEqual(book)
    await expect(store.list()).resolves.toHaveLength(1)
  })
})
