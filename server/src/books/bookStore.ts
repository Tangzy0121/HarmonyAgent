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
    return JSON.parse(raw) as StoredBook
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
