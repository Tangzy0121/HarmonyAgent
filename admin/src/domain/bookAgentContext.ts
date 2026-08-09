import type { BookBlock, LearningBook, SourceAnchor } from '../types/learningBook'
import type {
  BookAgentBlock,
  BookAgentChapter,
  BookAgentContext,
  BookAgentSource,
} from '../types/bookAgent'

const BLOCK_CHARACTER_BUDGET = 2_000
const CHAPTER_CHARACTER_BUDGET = 8_000
const CONTEXT_CHARACTER_BUDGET = 24_000
const TRUNCATION_SUFFIX = '…已截断'

export interface BuildBookAgentContextOptions {
  chapterId: string
  scope: 'chapter' | 'book'
  focusBlockId?: string
}

function blockText(block: BookBlock, noteBody: string): string {
  switch (block.type) {
    case 'explanation':
      return `${block.body}\n要点：${block.keyPoint}`
    case 'example':
      return `${block.scenario}\n结论：${block.takeaway}`
    case 'formula':
      return `${block.formula}\n${block.explanation}`
    case 'citation':
      return block.excerpt
    case 'concept':
      return block.concepts.map((item) => `${item.label}：${item.description}`).join('\n')
    case 'quiz':
      return `${block.question}\n${block.options.map((item) => `${item.marker}. ${item.text}`).join('\n')}`
    case 'user_note':
      return `用户笔记（非原文）：${noteBody}`
  }
}

function clipText(text: string, maximum: number): string {
  if (text.length <= maximum) return text
  if (maximum <= TRUNCATION_SUFFIX.length) return TRUNCATION_SUFFIX.slice(0, maximum)
  return `${text.slice(0, maximum - TRUNCATION_SUFFIX.length)}${TRUNCATION_SUFFIX}`
}

function noteBody(book: LearningBook, block: BookBlock): string {
  if (block.type !== 'user_note') return ''
  return book.userNotes.find((note) => note.id === block.noteId)?.body ?? ''
}

function orderedBlocks(blocks: BookBlock[], focusBlockId?: string): BookBlock[] {
  if (!focusBlockId) return blocks
  const focused = blocks.filter((block) => block.id === focusBlockId)
  return focused.length === 0 ? blocks : [...focused, ...blocks.filter((block) => block.id !== focusBlockId)]
}

function serializeChapter(book: LearningBook, chapter: LearningBook['chapters'][number], focusBlockId: string | undefined, warnings: string[]): BookAgentChapter {
  let remaining = CHAPTER_CHARACTER_BUDGET
  const blocks: BookAgentBlock[] = []
  const readyBlocks = orderedBlocks(chapter.blocks.filter((block) => block.status === 'ready'), focusBlockId)

  for (const block of readyBlocks) {
    const rawText = blockText(block, noteBody(book, block))
    let content = clipText(rawText, BLOCK_CHARACTER_BUDGET)
    if (content !== rawText) warnings.push(`Block ${block.id} exceeded ${BLOCK_CHARACTER_BUDGET} characters and was truncated.`)

    if (content.length > remaining) {
      if (remaining <= TRUNCATION_SUFFIX.length) {
        warnings.push(`Chapter ${chapter.id} exceeded ${CHAPTER_CHARACTER_BUDGET} characters; block ${block.id} was omitted.`)
        break
      }
      content = clipText(content, remaining)
      warnings.push(`Chapter ${chapter.id} exceeded ${CHAPTER_CHARACTER_BUDGET} characters and was truncated.`)
    }

    blocks.push({
      id: block.id,
      type: block.type,
      title: block.title,
      content,
      sourceIds: [],
      userAuthored: block.type === 'user_note',
    })
    remaining -= content.length
  }

  return { id: chapter.id, title: chapter.title, objective: chapter.objective, blocks }
}

function anchorKey(anchor: SourceAnchor): string {
  return `${anchor.sourceId}\u0000${anchor.pageRange}\u0000${anchor.excerpt}`
}

function assignSources(context: BookAgentContext, chapters: LearningBook['chapters']): void {
  const sourceByKey = new Map<string, BookAgentSource>()
  const outputBlockById = new Map(context.chapters.flatMap((chapter) => chapter.blocks.map((block) => [block.id, block] as const)))
  const sourceChapters = new Map(chapters.map((chapter) => [chapter.id, chapter]))

  for (const contextChapter of context.chapters) {
    const sourceChapter = sourceChapters.get(contextChapter.id)
    if (!sourceChapter) continue

    for (const contextBlock of contextChapter.blocks) {
      const sourceBlock = sourceChapter.blocks.find((block) => block.id === contextBlock.id)
      if (!sourceBlock || sourceBlock.type === 'user_note') continue

      for (const anchor of sourceBlock.sourceAnchors) {
        const key = anchorKey(anchor)
        let source = sourceByKey.get(key)
        if (!source) {
          source = {
            id: `S${sourceByKey.size + 1}`,
            sourceId: anchor.sourceId,
            fileName: anchor.fileName,
            pageRange: anchor.pageRange,
            excerpt: anchor.excerpt,
            chapterId: contextChapter.id,
            blockId: contextBlock.id,
          }
          sourceByKey.set(key, source)
          context.sources.push(source)
        }
        const outputBlock = outputBlockById.get(contextBlock.id)
        if (outputBlock && !outputBlock.sourceIds.includes(source.id)) outputBlock.sourceIds.push(source.id)
      }
    }
  }
}

function contextLabel(book: LearningBook, chapterId: string, scope: BuildBookAgentContextOptions['scope']): string {
  if (scope === 'book') return `整本学习书 · ${book.proposal.title}`
  const chapter = book.chapters.find((candidate) => candidate.id === chapterId)
  return chapter ? `第${chapter.order + 1} 章 · ${chapter.title}` : `章节 · ${chapterId}`
}

function fitWithinContextBudget(context: BookAgentContext): void {
  while (JSON.stringify(context).length > CONTEXT_CHARACTER_BUDGET) {
    const chapter = [...context.chapters].reverse().find((candidate) => candidate.blocks.length > 0)
    if (!chapter) break
    const [removed] = chapter.blocks.splice(-1, 1)
    const retainedSourceIds = new Set(context.chapters.flatMap((candidate) => candidate.blocks.flatMap((block) => block.sourceIds)))
    context.sources = context.sources.filter((source) => retainedSourceIds.has(source.id))
    context.warnings.push(`Context exceeded ${CONTEXT_CHARACTER_BUDGET} characters; block ${removed.id} was omitted.`)
  }
}

export function buildBookAgentContext(book: LearningBook, options: BuildBookAgentContextOptions): BookAgentContext {
  const warnings: string[] = []
  const requestedChapter = book.chapters.find((chapter) => chapter.id === options.chapterId)
  if (!requestedChapter) warnings.push(`Requested chapter ${options.chapterId} is missing.`)

  const candidates = (options.scope === 'book' ? book.chapters : requestedChapter ? [requestedChapter] : [])
    .filter((chapter) => chapter.status === 'ready' || chapter.status === 'partial')
  if (options.scope === 'chapter' && requestedChapter && !candidates.length) {
    warnings.push(`Requested chapter ${options.chapterId} is not readable yet.`)
  }

  const context: BookAgentContext = {
    bookId: book.id,
    title: book.proposal.title,
    scope: options.scope,
    label: contextLabel(book, options.chapterId, options.scope),
    ...(options.focusBlockId ? { focusBlockId: options.focusBlockId } : {}),
    chapters: candidates.map((chapter) => serializeChapter(book, chapter, options.focusBlockId, warnings)),
    sources: [],
    warnings,
  }
  assignSources(context, candidates)
  fitWithinContextBudget(context)
  return context
}
