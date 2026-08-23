import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { ParsedDocument, ParsedPage } from './pdfParser.js'

export type DocumentFormat = 'PDF' | 'Markdown' | 'DOCX'

export interface StoredDocumentMeta {
  id: string
  fileName: string
  format: DocumentFormat
  sizeBytes: number
  pageCount: number
  createdAt: string
}

export type StoredDocument = StoredDocumentMeta & { pages: ParsedPage[] }

export interface DocumentStore {
  save(input: {
    fileName: string
    pdf: Buffer
    parsed: ParsedDocument
    /** 缺省 'PDF'（存量文档兼容） */
    format?: DocumentFormat
  }): Promise<StoredDocumentMeta>
  get(id: string): Promise<StoredDocument | null>
  list(): Promise<StoredDocumentMeta[]>
  remove(id: string): Promise<boolean>
}

const SAFE_ID_PATTERN = /^doc_[A-Za-z0-9-]+$/u

export function createDocumentStore(rootDir: string): DocumentStore {
  const jsonPath = (id: string) => path.join(rootDir, `${id}.json`)
  const pdfPath = (id: string) => path.join(rootDir, `${id}.pdf`)

  async function ensureDir(): Promise<void> {
    await mkdir(rootDir, { recursive: true })
  }

  async function writeAtomic(filePath: string, data: string | Buffer): Promise<void> {
    const tmpPath = `${filePath}.${randomUUID()}.tmp`
    await writeFile(tmpPath, data)
    await rename(tmpPath, filePath)
  }

  async function readDocument(id: string): Promise<StoredDocument | null> {
    if (!SAFE_ID_PATTERN.test(id)) return null
    let raw: string
    try {
      raw = await readFile(jsonPath(id), 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
    const document = JSON.parse(raw) as StoredDocument
    // 存量文档无 format 字段，视为 PDF
    document.format ??= 'PDF'
    return document
  }

  function toMeta(document: StoredDocument): StoredDocumentMeta {
    return {
      id: document.id,
      fileName: document.fileName,
      // 存量文档无 format 字段，视为 PDF
      format: document.format ?? 'PDF',
      sizeBytes: document.sizeBytes,
      pageCount: document.pageCount,
      createdAt: document.createdAt,
    }
  }

  return {
    async save({ fileName, pdf, parsed, format = 'PDF' }) {
      await ensureDir()
      const meta: StoredDocumentMeta = {
        id: `doc_${randomUUID()}`,
        fileName,
        format,
        sizeBytes: pdf.byteLength,
        pageCount: parsed.pageCount,
        createdAt: new Date().toISOString(),
      }
      const document: StoredDocument = { ...meta, pages: parsed.pages }
      await writeAtomic(jsonPath(meta.id), JSON.stringify(document, null, 2))
      await writeAtomic(pdfPath(meta.id), pdf)
      return meta
    },

    get: readDocument,

    async list() {
      await ensureDir()
      const files = await readdir(rootDir)
      const metas: StoredDocumentMeta[] = []
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        const id = file.slice(0, -'.json'.length)
        const document = await readDocument(id)
        if (document !== null) metas.push(toMeta(document))
      }
      metas.sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      )
      return metas
    },

    async remove(id) {
      if (!SAFE_ID_PATTERN.test(id)) return false
      if ((await readDocument(id)) === null) return false
      await rm(jsonPath(id), { force: true })
      await rm(pdfPath(id), { force: true })
      return true
    },
  }
}
