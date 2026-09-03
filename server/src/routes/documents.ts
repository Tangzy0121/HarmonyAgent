import { raw, Router, type ErrorRequestHandler } from 'express'

import type { DocumentFormat, DocumentStore } from '../documents/documentStore.js'
import { parsePdf, PdfParseError, type ParsedDocument } from '../documents/pdfParser.js'
import { parseTextDocument, TextDocumentError } from '../documents/textDocument.js'
import { parseDocx, DocxParseError } from '../documents/docxParser.js'
import { parseEpub, EpubParseError } from '../documents/epubParser.js'
import type { NoticeService } from '../notices/noticeService.js'

export interface DocumentsLogEvent {
  category: 'document_saved' | 'document_save_failed' | 'document_removed'
  documentId?: string
  errorCode?: string
}

export type DocumentsLogger = (event: DocumentsLogEvent) => void

interface DocumentsRouterDependencies {
  store: DocumentStore
  logger?: DocumentsLogger
  /** 项目通知（PR-D）：解析失败挂钩；缺省不记录 */
  notices?: NoticeService
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

const ACCEPTED_CONTENT_TYPES = new Set([
  'application/pdf',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/epub+zip',
  // 部分浏览器对 .md/.docx/.epub 不给出具体 MIME，退回 octet-stream 时按扩展名分发
  'application/octet-stream',
])

const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const EPUB_CONTENT_TYPE = 'application/epub+zip'

/** 按扩展名优先、Content-Type 兜底判定输入格式；判不出 → null（400） */
function detectFormat(contentType: string, fileName: string): DocumentFormat | null {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.pdf')) return 'PDF'
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'Markdown'
  if (lower.endsWith('.docx')) return 'DOCX'
  if (lower.endsWith('.epub')) return 'EPUB'
  if (contentType === 'application/pdf') return 'PDF'
  if (contentType === 'text/markdown') return 'Markdown'
  if (contentType === DOCX_CONTENT_TYPE) return 'DOCX'
  if (contentType === EPUB_CONTENT_TYPE) return 'EPUB'
  return null
}

export function createDocumentsRouter(dependencies: DocumentsRouterDependencies): Router {
  const router = Router()
  const { store } = dependencies
  const logger =
    dependencies.logger ??
    ((event: DocumentsLogEvent) => {
      console.warn(`[documents] ${JSON.stringify(event)}`)
    })

  router.use(raw({
    type: (req) => ACCEPTED_CONTENT_TYPES.has(String(req.headers['content-type'] ?? '').split(';')[0].trim()),
    limit: '20mb',
  }))

  router.post('/', async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.byteLength === 0) {
      res.status(400).json({ error: 'invalid_content_type' })
      return
    }

    const fileName = sanitizeFileName(req.headers['x-file-name'])
    const contentType = String(req.headers['content-type'] ?? '').split(';')[0].trim()
    const format = detectFormat(contentType, fileName)
    if (format === null) {
      res.status(400).json({ error: 'invalid_content_type' })
      return
    }

    try {
      let parsed: ParsedDocument
      if (format === 'PDF') parsed = await parsePdf(req.body)
      else if (format === 'Markdown') parsed = parseTextDocument(req.body.toString('utf8'))
      else if (format === 'DOCX') parsed = await parseDocx(req.body)
      else parsed = await parseEpub(req.body)

      const meta = await store.save({
        fileName,
        pdf: req.body,
        parsed,
        format,
      })
      emitLog(logger, { category: 'document_saved', documentId: meta.id })
      res.status(200).json(meta)
    } catch (error) {
      const code = error instanceof PdfParseError || error instanceof TextDocumentError || error instanceof DocxParseError || error instanceof EpubParseError ? error.code : 'pdf_unreadable'
      emitLog(logger, { category: 'document_save_failed', errorCode: code })
      try {
        await dependencies.notices?.append({
          kind: 'parse_failed',
          severity: 'error',
          message: `资料「${fileName}」解析失败（${code}），可以重新上传。`,
          target: { fileName },
          dedupeKey: `parse_failed:${fileName}:${code}`,
        })
      } catch {
        // 通知存储故障不影响主错误路径
      }
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
