import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { StoredBook } from './bookTypes.js'
import { migrateLegacyLearningEvidence } from '../learning/learningEvidenceService.js'

export interface BookStore {
  save(book: StoredBook): Promise<void>
  get(id: string): Promise<StoredBook | null>
  list(): Promise<StoredBook[]>
  listIds?(): Promise<string[]>
  remove(id: string): Promise<boolean>
  update<T>(
    id: string,
    mutator: (book: StoredBook) => T | Promise<T>,
  ): Promise<{ book: StoredBook; result: T }>
}

export class BookStoreError extends Error {
  readonly code = 'book_not_found' as const

  constructor() {
    super('book_not_found')
    this.name = 'BookStoreError'
  }
}

const SAFE_ID_PATTERN = /^book_[A-Za-z0-9-]+$/u

// 早期版本逐章从 1 编号块 id（blk-quiz-1 等），跨章重复；读后迁移为章节命名空间格式，
// 并按 chapterId 重映射 quizAttempts/userNotes/evidence 里的块引用
function migrateDuplicateBlockIds(book: StoredBook): void {
  const ids = book.chapters.flatMap((chapter) => chapter.blocks.map((block) => block.id))
  if (new Set(ids).size === ids.length) return
  for (const chapter of book.chapters) {
    const prefix = `blk-${chapter.id}-`
    const remap = new Map<string, string>()
    for (const block of chapter.blocks) {
      if (block.id.startsWith(prefix)) continue
      const next = `${prefix}${block.id.replace(/^blk-/u, '')}`
      remap.set(block.id, next)
      block.id = next
    }
    if (remap.size === 0) continue
    for (const attempt of book.quizAttempts) {
      if (attempt.chapterId === chapter.id) attempt.blockId = remap.get(attempt.blockId) ?? attempt.blockId
    }
    for (const note of book.userNotes) {
      if (note.chapterId === chapter.id) note.blockId = remap.get(note.blockId) ?? note.blockId
    }
    for (const entry of book.evidence) {
      if (entry.chapterId === chapter.id) entry.sourceBlockId = remap.get(entry.sourceBlockId) ?? entry.sourceBlockId
    }
  }
}

export function createBookStore(rootDir: string): BookStore {
  const jsonPath = (id: string) => path.join(rootDir, `${id}.json`)
  const queues = new Map<string, Promise<void>>()

  async function withBookLock<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const previous = queues.get(id) ?? Promise.resolve()
    const running = previous.catch(() => undefined).then(operation)
    const tail = running.then(() => undefined, () => undefined)
    queues.set(id, tail)
    try {
      return await running
    } finally {
      if (queues.get(id) === tail) queues.delete(id)
    }
  }

  async function ensureDir(): Promise<void> {
    await mkdir(rootDir, { recursive: true })
  }

  async function writeAtomic(filePath: string, data: string): Promise<void> {
    const tmpPath = `${filePath}.${randomUUID()}.tmp`
    await writeFile(tmpPath, data)
    await rename(tmpPath, filePath)
  }

  async function readBookUnlocked(id: string): Promise<StoredBook | null> {
    if (!SAFE_ID_PATTERN.test(id)) return null
    let raw: string
    try {
      raw = await readFile(jsonPath(id), 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
    const book = JSON.parse(raw) as StoredBook
    book.evidence ??= []
    migrateDuplicateBlockIds(book)
    migrateLegacyLearningEvidence(book)
    return book
  }

  function mergeAppendOnlyById<T extends { id: string }>(latest: T[], incoming: T[]): T[] {
    const merged = latest.map((item) => structuredClone(item))
    const ids = new Set(merged.map((item) => item.id))
    for (const item of incoming) {
      if (!ids.has(item.id)) {
        merged.push(structuredClone(item))
        ids.add(item.id)
      }
    }
    return merged
  }

  function preserveConcurrentLearningState(latest: StoredBook, incoming: StoredBook): StoredBook {
    const schedule = { ...(latest.reviewSchedule ?? {}) }
    for (const [blockId, candidate] of Object.entries(incoming.reviewSchedule ?? {})) {
      const existing = schedule[blockId]
      if (!existing || candidate.updatedAt >= existing.updatedAt) schedule[blockId] = candidate
    }
    return {
      ...incoming,
      quizAttempts: mergeAppendOnlyById(latest.quizAttempts, incoming.quizAttempts),
      evidence: mergeAppendOnlyById(latest.evidence, incoming.evidence),
      reviewSchedule: schedule,
      projectionOutbox: structuredClone(latest.projectionOutbox ?? incoming.projectionOutbox ?? {}),
      masteryProjectionReadModel: {
        ...(incoming.masteryProjectionReadModel ?? {}),
        ...(latest.masteryProjectionReadModel ?? {}),
      },
    }
  }

  return {
    async save(book) {
      await withBookLock(book.id, async () => {
        await ensureDir()
        const latest = await readBookUnlocked(book.id)
        const safeBook = latest === null ? book : preserveConcurrentLearningState(latest, book)
        await writeAtomic(jsonPath(book.id), JSON.stringify(safeBook, null, 2))
      })
    },

    async get(id) {
      return withBookLock(id, () => readBookUnlocked(id))
    },

    async list() {
      await ensureDir()
      const files = await readdir(rootDir)
      const books: StoredBook[] = []
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        const id = file.slice(0, -'.json'.length)
        const book = await withBookLock(id, () => readBookUnlocked(id))
        if (book !== null) books.push(book)
      }
      books.sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      )
      return books
    },

    async listIds() {
      await ensureDir()
      return (await readdir(rootDir))
        .filter((file) => file.endsWith('.json'))
        .map((file) => file.slice(0, -'.json'.length))
        .filter((id) => SAFE_ID_PATTERN.test(id))
        .sort((left, right) => left.localeCompare(right))
    },

    async remove(id) {
      if (!SAFE_ID_PATTERN.test(id)) return false
      return withBookLock(id, async () => {
        if ((await readBookUnlocked(id)) === null) return false
        await rm(jsonPath(id), { force: true })
        return true
      })
    },

    async update(id, mutator) {
      if (!SAFE_ID_PATTERN.test(id)) throw new BookStoreError()
      return withBookLock(id, async () => {
        const book = await readBookUnlocked(id)
        if (book === null) throw new BookStoreError()
        const result = await mutator(book)
        await writeAtomic(jsonPath(id), JSON.stringify(book, null, 2))
        return { book: structuredClone(book), result }
      })
    },
  }
}
