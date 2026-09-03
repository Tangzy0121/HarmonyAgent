export type ProposalValidationCode = 'proposal_invalid'

export class ProposalValidationError extends Error {
  readonly code: ProposalValidationCode

  constructor(code: ProposalValidationCode) {
    super(code)
    this.name = 'ProposalValidationError'
    this.code = code
  }
}

export interface NormalizedProposalChapter {
  title: string
  objective: string
  coreConcept: string
  estimatedMinutes: number
  pageStart: number
  pageEnd: number
  /** 多文件合书：本章依据的资料序号（1 基）；仅在传入 documents 页数表时产出 */
  sourceDoc?: number
}

export interface NormalizedProposal {
  title: string
  description: string
  rationale: string
  estimatedMinutes: number
  chapters: NormalizedProposalChapter[]
}

const MIN_CHAPTERS = 3
const MAX_CHAPTERS = 6
const MAX_TITLE_CHARACTERS = 40

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalid(): never {
  throw new ProposalValidationError('proposal_invalid')
}

/**
 * 从模型输出文本中定位并解析 JSON 对象。
 * 优先整体解析；失败时从末尾的 `}` 向前做花括号配平，定位最后一个完整 JSON
 * 对象的起点（跳过思考前序），再解析该片段。
 */
export function extractJsonObject(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    // fall through to tail-located parsing
  }

  const lastClose = text.lastIndexOf('}')
  if (lastClose < 0) invalid()

  let depth = 0
  for (let index = lastClose; index >= 0; index -= 1) {
    const char = text[index]
    if (char === '}') {
      depth += 1
    } else if (char === '{') {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(index, lastClose + 1))
        } catch {
          break
        }
      }
    }
  }
  return invalid()
}

function normalizeChapterTitle(value: unknown): string {
  if (typeof value !== 'string') invalid()
  const title = value.trim()
  if (!title || title.length > MAX_TITLE_CHARACTERS) invalid()
  return title
}

function requiredText(value: unknown): string {
  if (typeof value !== 'string') invalid()
  const text = value.trim()
  if (!text) invalid()
  return text
}

function requiredMinutes(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) invalid()
  return value
}

function requiredPage(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) invalid()
  return value
}

function optionalText(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') invalid()
  return value.trim()
}

export function normalizeProposal(value: unknown, pageCount: number, documentPageCounts?: number[]): NormalizedProposal {
  // 形状归一：模型返回裸数组时按 { chapters: [...] } 处理
  const record = Array.isArray(value) ? { chapters: value } : value
  if (!isRecord(record)) invalid()
  if (!Array.isArray(record.chapters)) invalid()
  if (record.chapters.length < MIN_CHAPTERS) invalid()

  const chapters = record.chapters.slice(0, MAX_CHAPTERS).map((chapterValue): NormalizedProposalChapter => {
    if (!isRecord(chapterValue)) invalid()
    const pageStart = requiredPage(chapterValue.pageStart)
    const pageEnd = requiredPage(chapterValue.pageEnd)
    if (pageStart < 1 || pageEnd > pageCount || pageStart > pageEnd) invalid()
    let sourceDoc: number | undefined
    if (documentPageCounts !== undefined) {
      // 多资料：sourceDoc 缺省 1；越界（伪造序号）或页码超出所属资料页数一律拒绝
      sourceDoc = chapterValue.sourceDoc === undefined || chapterValue.sourceDoc === null
        ? 1
        : requiredPage(chapterValue.sourceDoc)
      if (sourceDoc < 1 || sourceDoc > documentPageCounts.length) invalid()
      if (pageEnd > documentPageCounts[sourceDoc - 1]) invalid()
    }
    return {
      title: normalizeChapterTitle(chapterValue.title),
      objective: requiredText(chapterValue.objective),
      coreConcept: requiredText(chapterValue.coreConcept),
      estimatedMinutes: requiredMinutes(chapterValue.estimatedMinutes),
      pageStart,
      pageEnd,
      ...(sourceDoc !== undefined ? { sourceDoc } : {}),
    }
  })

  const bookTitle = optionalText(record.title)
  if (bookTitle.length > MAX_TITLE_CHARACTERS) invalid()

  const bookMinutes = record.estimatedMinutes === undefined || record.estimatedMinutes === null
    ? chapters.reduce((sum, chapter) => sum + chapter.estimatedMinutes, 0)
    : requiredMinutes(record.estimatedMinutes)

  return {
    title: bookTitle,
    description: optionalText(record.description),
    rationale: optionalText(record.rationale),
    estimatedMinutes: bookMinutes,
    chapters,
  }
}
