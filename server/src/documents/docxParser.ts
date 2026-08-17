import mammoth from 'mammoth'

import type { ParsedDocument } from './pdfParser.js'
import { parseTextDocument, TextDocumentError } from './textDocument.js'

export type DocxParseErrorCode = 'docx_unreadable' | 'doc_no_text' | 'doc_too_long'

export class DocxParseError extends Error {
  readonly code: DocxParseErrorCode

  constructor(code: DocxParseErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'DocxParseError'
    this.code = code
  }
}

/**
 * docx → ParsedDocument：mammoth 纯文本抽取（图片/样式不保留，规格 §3.2）+ 虚拟分页。
 * 解析失败 → docx_unreadable；文本校验沿用 textDocument 的稳定错误码。
 */
export async function parseDocx(buffer: Buffer): Promise<ParsedDocument> {
  let text: string
  try {
    const result = await mammoth.extractRawText({ buffer })
    text = result.value
  } catch {
    throw new DocxParseError('docx_unreadable', 'failed to parse docx')
  }

  try {
    return parseTextDocument(text)
  } catch (error) {
    if (error instanceof TextDocumentError) {
      throw new DocxParseError(error.code, error.message)
    }
    throw error
  }
}
