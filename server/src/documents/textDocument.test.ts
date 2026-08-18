import { describe, expect, it } from 'vitest'

import { parseTextDocument, TextDocumentError } from './textDocument.js'

describe('parseTextDocument', () => {
  it('strips YAML frontmatter before paging', () => {
    const text = `---\ntitle: 讲义\nauthor: 某人\n---\n\n${'正文'.repeat(150)}`
    const doc = parseTextDocument(text)
    expect(doc.pages[0].text.startsWith('正文')).toBe(true)
    expect(JSON.stringify(doc)).not.toContain('frontmatter')
  })

  it('rejects documents with fewer than 200 non-whitespace characters', () => {
    expect(() => parseTextDocument('太短了')).toThrowError(expect.objectContaining({ name: 'TextDocumentError', code: 'doc_no_text' }))
  })

  it('rejects documents beyond the character limit', () => {
    const text = '字'.repeat(45_001)
    expect(() => parseTextDocument(text)).toThrowError(expect.objectContaining({ name: 'TextDocumentError', code: 'doc_too_long' }))
  })

  it('pages a normal document into virtual pages of roughly the page size', () => {
    const para = '机器学习段落。'.repeat(200) // 1400 字
    const text = Array.from({ length: 10 }, () => para).join('\n\n') // 14,000 字
    const doc = parseTextDocument(text)
    expect(doc.pageCount).toBe(10)
    expect(doc.pages).toHaveLength(10)
    expect(doc.pageCount).toBeLessThanOrEqual(30)
  })

  it('is a TextDocumentError subclass of Error', () => {
    expect(new TextDocumentError('doc_no_text')).toBeInstanceOf(Error)
  })
})
