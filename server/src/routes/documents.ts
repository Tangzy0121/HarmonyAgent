import { raw, Router, type ErrorRequestHandler } from 'express'

import type { DocumentStore } from '../documents/documentStore.js'
import { parsePdf, PdfParseError } from '../documents/pdfParser.js'

export interface DocumentsLogEvent {
  category: 'document_saved' | 'document_save_failed' | 'document_removed'
  documentId?: string
  errorCode?: string
}

export type DocumentsLogger = (event: DocumentsLogEvent) => void

interface DocumentsRouterDependencies {
  store: DocumentStore
  logger?: DocumentsLogger
}

const MAX_FILE_NAME_LENGTH = 120
const DELETE_NOTE = '原始文件与解析结果已删除'

export function sanitizeFileName(value: unknown): string {
  if (typeof value !== 'string') return '未命名.pdf'
  // 客户端经 HTTP 头传输时须百分号编码（头值仅 latin-1），落盘前先解码；
  // 非法百分号序列保留原值，不炸。
  let decoded = value
  try {
    decoded = decodeURIComponent(value)
  } catch {
    // Keep the raw value when it is not a valid percent-encoded string.
  }
  // eslint-disable-next-line no-control-regex
  const cleaned = decoded.replace(/[\u0000-\u001f\u007f]/gu, '').trim()
  if (cleaned.length === 0) return '未命名.pdf'
  return cleaned.slice(0, MAX_FILE_NAME_LENGTH)
}

function emitLog(logger: DocumentsLogger, event: DocumentsLogEvent): void {
  try {
    logger(event)
  } catch {
    // Observability must never alter the request or response lifecycle.
  }
}

export function createDocumentsRouter(dependencies: DocumentsRouterDependencies): Router {
  const router = Router()
  const { store } = dependencies
  const logger =
    dependencies.logger ??
    ((event: DocumentsLogEvent) => {
      console.warn(`[documents] ${JSON.stringify(event)}`)
    })

  router.use(raw({ type: 'application/pdf', limit: '20mb' }))

  router.post('/', async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.byteLength === 0) {
      res.status(400).json({ error: 'invalid_content_type' })
      return
    }

    try {
      const parsed = await parsePdf(req.body)
      const meta = await store.save({
        fileName: sanitizeFileName(req.headers['x-file-name']),
        pdf: req.body,
        parsed,
      })
      emitLog(logger, { category: 'document_saved', documentId: meta.id })
      res.status(200).json(meta)
    } catch (error) {
      const code = error instanceof PdfParseError ? error.code : 'pdf_unreadable'
      emitLog(logger, { category: 'document_save_failed', errorCode: code })
      res.status(422).json({ error: code })
    }
  })

  router.get('/', async (_req, res, next) => {
    try {
      res.status(200).json(await store.list())
    } catch (error) {
      next(error)
    }
  })

  router.delete('/:id', async (req, res, next) => {
    try {
      const removed = await store.remove(req.params.id)
      if (!removed) {
        res.status(404).json({ error: 'document_not_found' })
        return
      }
      emitLog(logger, { category: 'document_removed', documentId: req.params.id })
      res.status(200).json({ deleted: true, note: DELETE_NOTE })
    } catch (error) {
      next(error)
    }
  })

  const rawErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
    const candidate = error as { status?: unknown; type?: unknown }
    if (candidate.status === 413 && candidate.type === 'entity.too.large') {
      res.status(413).json({ error: 'pdf_too_large' })
      return
    }
    next(error)
  }
  router.use(rawErrorHandler)

  return router
}
