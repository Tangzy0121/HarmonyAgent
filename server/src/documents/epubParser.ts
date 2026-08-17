import JSZip from 'jszip'

import type { ParsedDocument } from './pdfParser.js'
import { parseTextDocument, TextDocumentError } from './textDocument.js'

export type EpubParseErrorCode = 'epub_unreadable' | 'doc_no_text' | 'doc_too_long'

export class EpubParseError extends Error {
  readonly code: EpubParseErrorCode

  constructor(code: EpubParseErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'EpubParseError'
    this.code = code
  }
}

/** 从 XML 标签字符串中提取属性值（双/单引号均可） */
function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'u'))
  return match?.[1] ?? null
}

/** xhtml → 纯文本：script/style 整块剔除、标签→空格、实体解码、空白折叠 */
function xhtmlToText(xhtml: string): string {
  return xhtml
    .replace(/<!--[\s\S]*?-->/gu, ' ')
    .replace(/<script\b[\s\S]*?<\/script\s*>/giu, ' ')
    .replace(/<style\b[\s\S]*?<\/style\s*>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/&amp;/gu, '&')
    .replace(/\s+/gu, ' ')
    .trim()
}

/** EPUB(zip) → 纯文本：container.xml 定位 OPF，按 spine 顺序拼接 xhtml */
async function extractEpubText(buffer: Buffer): Promise<string> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    throw new EpubParseError('epub_unreadable', 'failed to parse epub: not a zip archive')
  }

  // 1) 定位 OPF：优先 META-INF/container.xml 的 rootfile，找不到则扫描所有 .opf
  let opfPath: string | null = null
  const container = zip.file('META-INF/container.xml')
  if (container !== null) {
    const xml = await container.async('text').catch(() => '')
    const rootfile = xml.match(/<rootfile\b[^>]*>/u)?.[0]
    opfPath = rootfile ? attr(rootfile, 'full-path') : null
  }
  opfPath ??= Object.keys(zip.files).find((name) => name.toLowerCase().endsWith('.opf')) ?? null
  if (opfPath === null) {
    throw new EpubParseError('epub_unreadable', 'failed to parse epub: no OPF package document')
  }
  const opfFile = zip.file(opfPath)
  if (opfFile === null) {
    throw new EpubParseError('epub_unreadable', 'failed to parse epub: OPF file missing')
  }
  const opf = await opfFile.async('text')

  // 2) manifest：id → 相对 OPF 的 xhtml 路径
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''
  const manifest = new Map<string, string>()
  for (const match of opf.matchAll(/<item\b[^>]*>/gu)) {
    const tag = match[0]
    const id = attr(tag, 'id')
    const href = attr(tag, 'href')
    if (id === null || href === null) continue
    const mediaType = attr(tag, 'media-type') ?? ''
    if (!mediaType.includes('xhtml') && !/\.x?html?$/iu.test(href)) continue
    manifest.set(id, `${opfDir}${href}`)
  }

  // 3) spine itemref 顺序 → 拼接章节文本；spine 缺失时退回 manifest 顺序
  const spineIds = [...opf.matchAll(/<itemref\b[^>]*>/gu)]
    .map((match) => attr(match[0], 'idref'))
    .filter((idref): idref is string => idref !== null)
  const orderedPaths = spineIds.length > 0
    ? spineIds.map((idref) => manifest.get(idref)).filter((p): p is string => p !== undefined)
    : [...manifest.values()]

  const chunks: string[] = []
  for (const path of orderedPaths) {
    let file = zip.file(path)
    if (file === null) {
      // href 可能百分号编码；非法编码按缺失处理，不炸
      try {
        file = zip.file(decodeURIComponent(path))
      } catch {
        file = null
      }
    }
    if (file === null) continue
    chunks.push(xhtmlToText(await file.async('text')))
  }
  const text = chunks.filter((chunk) => chunk.length > 0).join('\n\n')
  if (text.length === 0) {
    throw new EpubParseError('epub_unreadable', 'failed to parse epub: no xhtml content')
  }
  return text
}

/**
 * epub → ParsedDocument：jszip 解包抽纯文本（规格 §3.2）+ 虚拟分页。
 * 解析失败 → epub_unreadable；文本校验沿用 textDocument 的稳定错误码。
 */
export async function parseEpub(buffer: Buffer): Promise<ParsedDocument> {
  const text = await extractEpubText(buffer)

  try {
    return parseTextDocument(text)
  } catch (error) {
    if (error instanceof TextDocumentError) {
      throw new EpubParseError(error.code, error.message)
    }
    throw error
  }
}
