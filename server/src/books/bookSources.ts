// 多文件合书（multi-source book）解析辅助：
// StoredBook.sources 为可选字段（单源书缺省），所有下游消费统一走 bookSources 回退。

import { createHash } from 'node:crypto'

import type { SourceDocument, StoredBook } from './bookTypes.js'

/** 书的全部来源：多源书返回 sources，单源/存量书回退 [source]（source 恒等于 sources[0]） */
export function bookSources(book: StoredBook): SourceDocument[] {
  return book.sources !== undefined && book.sources.length > 0 ? book.sources : [book.source]
}

/** 来源文档全文的 sha256（hex），用于 sourceFingerprints 落盘与 book health 比对 */
export function fingerprintOf(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}
