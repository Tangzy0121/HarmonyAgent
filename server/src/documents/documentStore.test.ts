import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDocumentStore } from './documentStore.js'
import type { ParsedDocument } from './pdfParser.js'

const parsed: ParsedDocument = {
  pageCount: 2,
  pages: [
    { page: 1, text: 'hello page one' },
    { page: 2, text: 'hello page two' },
  ],
}

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'docstore-'))
})

afterEach(async () => {
  vi.useRealTimers()
  await rm(dir, { recursive: true, force: true })
})

describe('documentStore', () => {
  it('save→get roundtrip persists pages and writes the pdf file to disk', async () => {
    const store = createDocumentStore(dir)
    const pdf = Buffer.from('%PDF-fake-bytes')

    const meta = await store.save({ fileName: 'a.pdf', pdf, parsed })
    expect(meta.id).toMatch(/^doc_/u)
    expect(meta.fileName).toBe('a.pdf')
    expect(meta.sizeBytes).toBe(pdf.byteLength)
    expect(meta.pageCount).toBe(2)
    expect(typeof meta.createdAt).toBe('string')

    const saved = await store.get(meta.id)
    expect(saved).not.toBeNull()
    expect(saved?.pages).toEqual(parsed.pages)
    expect(saved?.fileName).toBe('a.pdf')

    const pdfOnDisk = await readFile(path.join(dir, `${meta.id}.pdf`))
    expect(pdfOnDisk.equals(pdf)).toBe(true)
  })

  it('get returns null for an unknown id', async () => {
    const store = createDocumentStore(dir)
    await expect(store.get('doc_does-not-exist')).resolves.toBeNull()
  })

  it('list returns metas without pages, sorted by createdAt', async () => {
    vi.useFakeTimers()
    const store = createDocumentStore(dir)
    const pdf = Buffer.from('%PDF-fake-bytes')

    vi.setSystemTime('2026-08-10T00:00:00.000Z')
    const newer = await store.save({ fileName: 'newer.pdf', pdf, parsed })
    vi.setSystemTime('2026-08-09T00:00:00.000Z')
    const older = await store.save({ fileName: 'older.pdf', pdf, parsed })

    const list = await store.list()
    expect(list.map((entry) => entry.id)).toEqual([older.id, newer.id])
    for (const entry of list) {
      expect(entry).not.toHaveProperty('pages')
    }
  })

  it('remove deletes json and pdf, returns true; returns false when missing', async () => {
    const store = createDocumentStore(dir)
    const pdf = Buffer.from('%PDF-fake-bytes')
    const meta = await store.save({ fileName: 'a.pdf', pdf, parsed })

    await expect(store.remove(meta.id)).resolves.toBe(true)
    await expect(store.get(meta.id)).resolves.toBeNull()
    const remaining = await readdir(dir)
    expect(remaining.filter((file) => file.startsWith(meta.id))).toEqual([])

    await expect(store.remove(meta.id)).resolves.toBe(false)
  })

  it('concurrent saves leave no tmp files or half-written documents', async () => {
    const store = createDocumentStore(dir)
    const pdf = Buffer.from('%PDF-fake-bytes')

    const metas = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        store.save({ fileName: `doc-${i}.pdf`, pdf, parsed }),
      ),
    )
    expect(new Set(metas.map((meta) => meta.id)).size).toBe(10)

    const files = await readdir(dir)
    expect(files.filter((file) => file.endsWith('.tmp'))).toEqual([])
    expect(files).toHaveLength(20)

    const list = await store.list()
    expect(list).toHaveLength(10)
    for (const meta of metas) {
      await expect(store.get(meta.id)).resolves.toMatchObject({ id: meta.id })
    }
  })
})
