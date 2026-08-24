import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

export interface ParsedPage {
  page: number
  text: string
}

export interface ParsedDocument {
  pageCount: number
  pages: ParsedPage[]
}

export type PdfParseErrorCode =
  | 'pdf_too_many_pages'
  | 'pdf_encrypted'
  | 'pdf_no_text'
  | 'pdf_unreadable'

export class PdfParseError extends Error {
  readonly code: PdfParseErrorCode

  constructor(code: PdfParseErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'PdfParseError'
    this.code = code
  }
}

const DEFAULT_MAX_PAGES = 30

export async function parsePdf(
  buffer: Buffer,
  limits?: { maxPages?: number },
): Promise<ParsedDocument> {
  const maxPages = limits?.maxPages ?? DEFAULT_MAX_PAGES

  let task: ReturnType<typeof getDocument>
  try {
    task = getDocument({ data: new Uint8Array(buffer) })
  } catch (error) {
    throw mapLoadError(error)
  }

  try {
    const pdf = await task.promise
    if (pdf.numPages > maxPages) {
      throw new PdfParseError(
        'pdf_too_many_pages',
        `pdf has ${pdf.numPages} pages (max ${maxPages})`,
      )
    }

    const pages: ParsedPage[] = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join('\n')
        .trim()
      pages.push({ page: pageNumber, text })
    }

    const totalChars = pages.reduce(
      (sum, current) => sum + current.text.replace(/\s/gu, '').length,
      0,
    )
    if (totalChars === 0) {
      throw new PdfParseError('pdf_no_text', 'pdf has no extractable text')
    }

    return { pageCount: pdf.numPages, pages }
  } catch (error) {
    if (error instanceof PdfParseError) throw error
    throw mapLoadError(error)
  } finally {
    try {
      await task.destroy()
    } catch {
      // Cleanup failures are not observable to callers.
    }
  }
}

function mapLoadError(error: unknown): PdfParseError {
  if (error instanceof Error && error.name === 'PasswordException') {
    return new PdfParseError('pdf_encrypted', 'pdf is password protected')
  }
  return new PdfParseError('pdf_unreadable', 'failed to parse pdf')
}
