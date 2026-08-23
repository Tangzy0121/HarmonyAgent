import { describe, expect, it, vi } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { parsePdf, PdfParseError } from './pdfParser.js'

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('pdfjs-dist/legacy/build/pdf.mjs')>()
  return { ...actual, getDocument: vi.fn(actual.getDocument) }
})

async function makePdf(pageTexts: string[]): Buffer {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const text of pageTexts) {
    const page = doc.addPage([612, 792])
    page.drawText(text, { x: 40, y: 700, size: 12, font })
  }
  return Buffer.from(await doc.save())
}

describe('parsePdf', () => {
  it('extracts per-page text with 1-based page numbers', async () => {
    const buf = await makePdf(['hello page one', 'hello page two'])
    const parsed = await parsePdf(buf)
    expect(parsed.pageCount).toBe(2)
    expect(parsed.pages[0].page).toBe(1)
    expect(parsed.pages[0].text).toContain('hello page one')
    expect(parsed.pages[1].text).toContain('hello page two')
  })

  it('rejects documents over the page limit', async () => {
    const buf = await makePdf(Array.from({ length: 31 }, (_, i) => `page ${i}`))
    await expect(parsePdf(buf)).rejects.toMatchObject({ code: 'pdf_too_many_pages' })
  })

  it('rejects textless documents', async () => {
    const buf = await makePdf(['', ''])
    await expect(parsePdf(buf)).rejects.toMatchObject({ code: 'pdf_no_text' })
  })

  it('maps password errors to pdf_encrypted and other failures to pdf_unreadable', async () => {
    await expect(parsePdf(Buffer.from('not a pdf'))).rejects.toMatchObject({
      code: 'pdf_unreadable',
    })

    // encrypted：pdf-lib 不能生成加密 PDF，用假的 getDocument 覆盖 PasswordException 映射
    vi.mocked(getDocument).mockImplementationOnce(() => {
      throw Object.assign(new Error('No password given'), { name: 'PasswordException' })
    })
    await expect(parsePdf(Buffer.from('fake encrypted pdf'))).rejects.toMatchObject({
      code: 'pdf_encrypted',
    })
  })

  it('throws PdfParseError instances', async () => {
    await expect(parsePdf(Buffer.from('not a pdf'))).rejects.toBeInstanceOf(PdfParseError)
  })
})
