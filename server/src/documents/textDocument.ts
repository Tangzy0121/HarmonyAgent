import type { ParsedDocument } from './pdfParser.js'
import { splitIntoVirtualPages } from './virtualPages.js'

export type TextDocumentErrorCode = 'doc_no_text' | 'doc_too_long'

export class TextDocumentError extends Error {
  readonly code: TextDocumentErrorCode

  constructor(code: TextDocumentErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'TextDocumentError'
    this.code = code
  }
}

const DEFAULT_MAX_CHARS = 45_000
const MIN_NON_WHITESPACE_CHARS = 200

/** 去掉文件开头的 YAML frontmatter（--- ... ---） */
function stripFrontmatter(text: string): string {
  const match = text.match(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  return match ? text.slice(match[0].length) : text
}

/**
 * md/纯文本 → ParsedDocument：frontmatter 剥离 + 上限/下限校验 + 虚拟分页。
 * 页码语义与 PDF 链路一致，citation 子串硬校验零改动（规格 §4）。
 */
export function parseTextDocument(
  rawText: string,
  limits?: { maxChars?: number; pageSize?: number },
): ParsedDocument {
  const maxChars = limits?.maxChars ?? DEFAULT_MAX_CHARS
  const text = stripFrontmatter(rawText).trim()

  const nonWhitespace = text.replace(/\s/gu, '').length
  if (nonWhitespace < MIN_NON_WHITESPACE_CHARS) {
    throw new TextDocumentError('doc_no_text', `document has ${nonWhitespace} non-whitespace characters (min ${MIN_NON_WHITESPACE_CHARS})`)
  }
  if (text.length > maxChars) {
    throw new TextDocumentError('doc_too_long', `document has ${text.length} characters (max ${maxChars})`)
  }

  const pages = splitIntoVirtualPages(text, { pageSize: limits?.pageSize })
  return { pageCount: pages.length, pages }
}
