import type { ParsedPage } from '../documents/pdfParser.js'
import type {
  BookBlock,
  BookBlockType,
  CalloutBlock,
  ConceptItem,
  ConceptRelation,
  FigureBlock,
  FlashCard,
  QuizOption,
  SourceAnchor,
} from './bookTypes.js'

export type ChapterValidationCode = 'chapter_invalid'

export class ChapterValidationError extends Error {
  readonly code: ChapterValidationCode

  constructor(code: ChapterValidationCode) {
    super(code)
    this.name = 'ChapterValidationError'
    this.code = code
  }
}

export interface ChapterValidationContext {
  pages: ParsedPage[]
  pageStart: number
  pageEnd: number
  fileName: string
  remainingBookBudget: number
}

// 模型允许产出的块类型白名单（user_note 只能由本地产出，不在此列）
const GENERATABLE_TYPES = new Set<BookBlockType>([
  'explanation',
  'example',
  'formula',
  'citation',
  'concept',
  'quiz',
  'callout',
  'flash_cards',
  'figure',
])

const RELATION_TYPES = new Set<ConceptRelation['type']>(['前置', '包含', '相似', '对比', '应用'])

const DEFAULT_TITLES: Record<string, string> = {
  explanation: '讲解',
  example: '示例',
  formula: '公式',
  citation: '原文引用',
  concept: '核心概念',
  quiz: '随堂小测',
  callout: '学习提示',
  flash_cards: '记忆闪卡',
  figure: '图解',
}

const MAX_EXCERPT_ANCHOR_CHARS = 120

const CALLOUT_KINDS = new Set(['key_idea', 'pitfall', 'tip', 'insight'])
const FIGURE_KINDS = new Set(['flowchart', 'mindmap', 'timeline', 'sequence'])
const MAX_CALLOUT_BODY_CHARS = 400
const FLASH_CARDS_MIN = 3
const FLASH_CARDS_MAX = 8
const MAX_CARD_FRONT_CHARS = 120
const MAX_CARD_BACK_CHARS = 300
const MAX_CARD_HINT_CHARS = 120
const MAX_MERMAID_CHARS = 2_000
const MAX_FIGURE_CAPTION_CHARS = 120

// 截断时必须保住的必备块类型：每类至少留一个，优先裁其余类型
const ESSENTIAL_TYPES = new Set(['explanation', 'citation', 'quiz'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalid(): never {
  throw new ChapterValidationError('chapter_invalid')
}

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text ? text : null
}

function stripWhitespace(value: string): string {
  return value.replace(/\s+/gu, '')
}

/** 解析页码范围：单页 '4' 或范围 '3–6'（en dash / 连字符均可）。非法返回 null。 */
function parsePageRange(value: unknown): { start: number; end: number } | null {
  if (typeof value !== 'string') return null
  const match = /^\s*(\d+)\s*(?:[–-]\s*(\d+)\s*)?$/u.exec(value)
  if (!match) return null
  const start = Number(match[1])
  const end = match[2] === undefined ? start : Number(match[2])
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || start > end) {
    return null
  }
  return { start, end }
}

interface RawBase {
  type: BookBlockType
  title: string
}

function normalizeBase(
  raw: Record<string, unknown>,
  type: BookBlockType,
  counters: Map<string, number>,
): RawBase & { id: string } {
  const next = (counters.get(type) ?? 0) + 1
  counters.set(type, next)
  return {
    id: `blk-${type}-${next}`,
    type,
    title: optionalText(raw.title) ?? DEFAULT_TITLES[type] ?? '内容块',
  }
}

function withCommonFields(base: RawBase & { id: string }) {
  return {
    id: base.id,
    type: base.type,
    status: 'ready' as const,
    title: base.title,
    revision: 1,
    sourceAnchors: [] as SourceAnchor[],
  }
}

function normalizeCitation(
  raw: Record<string, unknown>,
  ctx: ChapterValidationContext,
  warnings: string[],
): { excerpt: string; location: string; sourceAnchors: SourceAnchor[] } | null {
  const excerpt = optionalText(raw.excerpt)
  const title = optionalText(raw.title) ?? DEFAULT_TITLES.citation
  if (excerpt === null) {
    warnings.push(`citation 块「${title}」缺少引文，已丢弃`)
    return null
  }
  const range = parsePageRange(raw.pageRange)
  if (
    range === null ||
    range.start < ctx.pageStart ||
    range.end > ctx.pageEnd
  ) {
    warnings.push(`citation 块「${title}」的页码范围 ${String(raw.pageRange)} 越界或非法，已丢弃`)
    return null
  }
  const strippedExcerpt = stripWhitespace(excerpt)
  const hit = ctx.pages.some(
    (page) =>
      page.page >= range.start &&
      page.page <= range.end &&
      stripWhitespace(page.text).includes(strippedExcerpt),
  )
  if (!hit) {
    warnings.push(`citation 块「${title}」的引文未在原文第 ${String(raw.pageRange)} 页找到，已丢弃`)
    return null
  }
  const pageRange = typeof raw.pageRange === 'string' ? raw.pageRange.trim() : String(raw.pageRange)
  return {
    excerpt,
    location: `第${pageRange}页`,
    sourceAnchors: [{
      sourceId: 'S1',
      fileName: ctx.fileName,
      pageRange,
      excerpt: excerpt.slice(0, MAX_EXCERPT_ANCHOR_CHARS),
    }],
  }
}

function normalizeConceptItems(value: unknown): ConceptItem[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const items: ConceptItem[] = []
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) return null
    const label = optionalText(entry.label)
    if (label === null) return null
    items.push({
      id: optionalText(entry.id) ?? `cpt-${index + 1}`,
      label,
      description: typeof entry.description === 'string' ? entry.description.trim() : '',
      learningState: '暂无学习记录',
    })
  }
  return items
}

function normalizeRelations(
  value: unknown,
  concepts: ConceptItem[],
  ctx: ChapterValidationContext,
  warnings: string[],
): ConceptRelation[] {
  if (!Array.isArray(value)) return []
  const conceptIds = new Set(concepts.map((concept) => concept.id))
  const chapterRange = `${ctx.pageStart}–${ctx.pageEnd}`
  const relations: ConceptRelation[] = []
  for (const entry of value) {
    if (!isRecord(entry)) {
      warnings.push('已丢弃非法的概念关系')
      continue
    }
    const type = entry.type
    if (typeof type !== 'string' || !RELATION_TYPES.has(type as ConceptRelation['type'])) {
      warnings.push(`已丢弃非法概念关系类型：${String(type)}`)
      continue
    }
    const sourceId = optionalText(entry.sourceId)
    const targetId = optionalText(entry.targetId)
    if (sourceId === null || targetId === null || !conceptIds.has(sourceId) || !conceptIds.has(targetId)) {
      warnings.push('已丢弃端点不存在的概念关系')
      continue
    }
    const confidence =
      typeof entry.confidence === 'number' && Number.isFinite(entry.confidence)
        ? entry.confidence
        : 0.5
    relations.push({
      id: `rel-${relations.length + 1}`,
      sourceId,
      targetId,
      type: type as ConceptRelation['type'],
      confidence,
      status: '候选',
      sourceAnchor: { sourceId: 'S1', fileName: ctx.fileName, pageRange: chapterRange, excerpt: '' },
    })
  }
  return relations
}

function normalizeQuiz(raw: Record<string, unknown>): {
  conceptId: string
  question: string
  options: QuizOption[]
  correctAnswerId: string
  feedback: string
} {
  // quiz 是测评关键块：字段非法直接判整章无效，而不是悄悄丢弃
  const question = optionalText(raw.question)
  if (question === null) invalid()
  if (!Array.isArray(raw.options) || raw.options.length < 2 || raw.options.length > 4) invalid()
  const options: QuizOption[] = raw.options.map((entry, index): QuizOption => {
    if (!isRecord(entry)) invalid()
    const text = optionalText(entry.text)
    if (text === null) invalid()
    return {
      id: optionalText(entry.id) ?? `o${index + 1}`,
      marker: String.fromCharCode(65 + index),
      text,
    }
  })
  const correctAnswerId = optionalText(raw.correctAnswerId)
  if (correctAnswerId === null || !options.some((option) => option.id === correctAnswerId)) {
    invalid()
  }
  return {
    conceptId: typeof raw.conceptId === 'string' ? raw.conceptId.trim() : '',
    question,
    options,
    correctAnswerId,
    feedback: typeof raw.feedback === 'string' ? raw.feedback.trim() : '',
  }
}

// callout/flash_cards/figure 非法时返回 null，由调用处逐块丢弃并记 warning（不判整章无效）
function normalizeCallout(raw: Record<string, unknown>): { kind: CalloutBlock['kind']; body: string } | null {
  const kind = optionalText(raw.kind)
  const body = optionalText(raw.body)
  if (kind === null || !CALLOUT_KINDS.has(kind)) return null
  if (body === null || body.length > MAX_CALLOUT_BODY_CHARS) return null
  return { kind: kind as CalloutBlock['kind'], body }
}

function normalizeFlashCards(raw: Record<string, unknown>): { cards: FlashCard[] } | null {
  if (!Array.isArray(raw.cards) || raw.cards.length < FLASH_CARDS_MIN || raw.cards.length > FLASH_CARDS_MAX) return null
  const cards: FlashCard[] = []
  for (const entry of raw.cards) {
    if (!isRecord(entry)) return null
    const front = optionalText(entry.front)
    const back = optionalText(entry.back)
    if (front === null || front.length > MAX_CARD_FRONT_CHARS) return null
    if (back === null || back.length > MAX_CARD_BACK_CHARS) return null
    const hint = optionalText(entry.hint)
    if (hint !== null && hint.length > MAX_CARD_HINT_CHARS) return null
    cards.push(hint === null ? { front, back } : { front, back, hint })
  }
  return { cards }
}

function normalizeFigure(raw: Record<string, unknown>): { kind: FigureBlock['kind']; mermaid: string; caption: string } | null {
  const kind = optionalText(raw.kind)
  const mermaid = optionalText(raw.mermaid)
  const caption = optionalText(raw.caption) ?? ''
  if (kind === null || !FIGURE_KINDS.has(kind)) return null
  if (mermaid === null || mermaid.length > MAX_MERMAID_CHARS) return null
  // mermaid 会进前端渲染，拦截脚本注入
  if (/<script/iu.test(mermaid)) return null
  if (caption.length > MAX_FIGURE_CAPTION_CHARS) return null
  return { kind: kind as FigureBlock['kind'], mermaid, caption }
}

/** 从末尾向预算内截断：跳过每类必备类型的最后一个块，优先裁非必备类型。 */
function trimToBudget(blocks: BookBlock[], budget: number): { blocks: BookBlock[]; trimmed: number } {
  const result = [...blocks]
  let index = result.length - 1
  while (result.length > budget && index >= 0) {
    const type = result[index].type
    const isLastEssential = ESSENTIAL_TYPES.has(type) && !result.some((b, j) => j !== index && b.type === type)
    if (isLastEssential) { index -= 1; continue }
    result.splice(index, 1)
    index -= 1
  }
  return { blocks: result, trimmed: blocks.length - result.length }
}

/**
 * 归一化并校验上游产出的一章内容块。
 * 可修复的问题（未知类型、引文未命中、页码越界、非法关系、非法 callout/flash_cards/figure）
 * 逐块丢弃并记 warning；quiz 结构非法直接判整章无效。
 * 章级硬要求（≥1 explanation、≥1 有效 citation、≥1 quiz、≥4 种块类型）在预算截断之后复检，
 * 不满足时抛 ChapterValidationError('chapter_invalid')；截断会保护必备类型的最后一个块。
 */
export function normalizeChapterBlocks(
  value: unknown,
  ctx: ChapterValidationContext,
): { blocks: BookBlock[]; warnings: string[] } {
  const record = Array.isArray(value) ? { blocks: value } : value
  if (!isRecord(record) || !Array.isArray(record.blocks)) invalid()

  const warnings: string[] = []
  let blocks: BookBlock[] = []
  const counters = new Map<string, number>()

  for (const entry of record.blocks) {
    if (!isRecord(entry)) {
      warnings.push('已丢弃结构非法的内容块')
      continue
    }
    const type = entry.type
    if (typeof type !== 'string' || !GENERATABLE_TYPES.has(type as BookBlockType)) {
      warnings.push(`已丢弃未知类型块：${String(type)}`)
      continue
    }
    const blockType = type as BookBlockType

    switch (blockType) {
      case 'explanation': {
        const body = optionalText(entry.body)
        const keyPoint = optionalText(entry.keyPoint)
        if (body === null || keyPoint === null) {
          warnings.push(`已丢弃字段缺失的 explanation 块「${optionalText(entry.title) ?? ''}」`)
          continue
        }
        const base = normalizeBase(entry, blockType, counters)
        blocks.push({ ...withCommonFields(base), type: 'explanation', body, keyPoint })
        break
      }
      case 'example': {
        const scenario = optionalText(entry.scenario)
        const takeaway = optionalText(entry.takeaway)
        if (scenario === null || takeaway === null) {
          warnings.push(`已丢弃字段缺失的 example 块「${optionalText(entry.title) ?? ''}」`)
          continue
        }
        const base = normalizeBase(entry, blockType, counters)
        blocks.push({ ...withCommonFields(base), type: 'example', scenario, takeaway })
        break
      }
      case 'formula': {
        const formula = optionalText(entry.formula)
        const explanation = optionalText(entry.explanation)
        if (formula === null || explanation === null) {
          warnings.push(`已丢弃字段缺失的 formula 块「${optionalText(entry.title) ?? ''}」`)
          continue
        }
        const base = normalizeBase(entry, blockType, counters)
        blocks.push({ ...withCommonFields(base), type: 'formula', formula, explanation })
        break
      }
      case 'citation': {
        const citation = normalizeCitation(entry, ctx, warnings)
        if (citation === null) continue
        const base = normalizeBase(entry, blockType, counters)
        blocks.push({
          ...withCommonFields(base),
          type: 'citation',
          excerpt: citation.excerpt,
          location: citation.location,
          sourceAnchors: citation.sourceAnchors,
        })
        break
      }
      case 'concept': {
        const concepts = normalizeConceptItems(entry.concepts)
        if (concepts === null) {
          warnings.push(`已丢弃字段缺失的 concept 块「${optionalText(entry.title) ?? ''}」`)
          continue
        }
        const relations = normalizeRelations(entry.relations, concepts, ctx, warnings)
        const base = normalizeBase(entry, blockType, counters)
        blocks.push({ ...withCommonFields(base), type: 'concept', concepts, relations })
        break
      }
      case 'quiz': {
        const quiz = normalizeQuiz(entry)
        const base = normalizeBase(entry, blockType, counters)
        blocks.push({ ...withCommonFields(base), type: 'quiz', ...quiz })
        break
      }
      case 'callout': {
        const callout = normalizeCallout(entry)
        if (callout === null) {
          warnings.push(`已丢弃字段非法的 callout 块「${optionalText(entry.title) ?? ''}」`)
          continue
        }
        const base = normalizeBase(entry, blockType, counters)
        blocks.push({ ...withCommonFields(base), type: 'callout', ...callout })
        break
      }
      case 'flash_cards': {
        const flashCards = normalizeFlashCards(entry)
        if (flashCards === null) {
          warnings.push(`已丢弃字段非法的 flash_cards 块「${optionalText(entry.title) ?? ''}」`)
          continue
        }
        const base = normalizeBase(entry, blockType, counters)
        blocks.push({ ...withCommonFields(base), type: 'flash_cards', ...flashCards })
        break
      }
      case 'figure': {
        const figure = normalizeFigure(entry)
        if (figure === null) {
          warnings.push(`已丢弃字段非法的 figure 块「${optionalText(entry.title) ?? ''}」`)
          continue
        }
        const base = normalizeBase(entry, blockType, counters)
        blocks.push({ ...withCommonFields(base), type: 'figure', ...figure })
        break
      }
      default:
        continue
    }
  }

  // quiz 每章 1–2 道：超出按输入顺序裁到前 2 个并记 warning（与预算截断同风格）
  const quizCount = blocks.filter((block) => block.type === 'quiz').length
  if (quizCount > 2) {
    let seen = 0
    const trimmed = blocks.filter((block) => {
      if (block.type !== 'quiz') return true
      seen += 1
      return seen <= 2
    })
    warnings.push(`quiz 块超出每章 2 道上限，已按顺序裁剪 ${quizCount - 2} 个`)
    blocks = trimmed
  }

  // 先做必备类型保护的预算截断，再复检章级硬要求（截断可能裁掉第 4 种类型）
  const budget = Math.max(0, ctx.remainingBookBudget)
  if (blocks.length > budget) {
    const { blocks: kept, trimmed } = trimToBudget(blocks, budget)
    warnings.push(`超出全书内容块预算，已按必备类型保护截断 ${trimmed} 个块`)
    blocks = kept
  }

  // 章级硬要求：三种必备类型各 ≥1，且全章块类型 ≥4 种
  if (!blocks.some((block) => block.type === 'explanation')) invalid()
  if (!blocks.some((block) => block.type === 'citation')) invalid()
  if (!blocks.some((block) => block.type === 'quiz')) invalid()
  if (new Set(blocks.map((block) => block.type)).size < 4) invalid()
  return { blocks, warnings }
}
