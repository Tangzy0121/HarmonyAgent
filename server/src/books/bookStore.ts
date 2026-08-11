import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { StoredBook } from './bookTypes.js'

export interface BookStore {
  save(book: StoredBook): Promise<void>
  get(id: string): Promise<StoredBook | null>
  list(): Promise<StoredBook[]>
  remove(id: string): Promise<boolean>
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

  async function ensureDir(): Promise<void> {
    await mkdir(rootDir, { recursive: true })
  }

  async function writeAtomic(filePath: string, data: string): Promise<void> {
    const tmpPath = `${filePath}.${randomUUID()}.tmp`
    await writeFile(tmpPath, data)
    await rename(tmpPath, filePath)
  }

  async function readBook(id: string): Promise<StoredBook | null> {
    if (!SAFE_ID_PATTERN.test(id)) return null
    let raw: string
    try {
      raw = await readFile(jsonPath(id), 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
    const book = JSON.parse(raw) as StoredBook
    migrateDuplicateBlockIds(book)
    return book
  }

  return {
    async save(book) {
      await ensureDir()
      await writeAtomic(jsonPath(book.id), JSON.stringify(book, null, 2))
    },

    get: readBook,

    async list() {
      await ensureDir()
      const files = await readdir(rootDir)
      const books: StoredBook[] = []
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        const id = file.slice(0, -'.json'.length)
        const book = await readBook(id)
        if (book !== null) books.push(book)
      }
      books.sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      )
      return books
    },

    async remove(id) {
      if (!SAFE_ID_PATTERN.test(id)) return false
      if ((await readBook(id)) === null) return false
      await rm(jsonPath(id), { force: true })
      return true
    },
  }
}
