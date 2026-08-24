import type {
  NormalizedBookAgentBlock,
  NormalizedBookAgentChapter,
  NormalizedBookAgentContext,
  NormalizedBookAgentRequest,
  NormalizedBookAgentSource,
} from '../../bookAgentContract.js'
import type { BookBlock, BookChapter, SourceAnchor } from '../../../books/bookTypes.js'
import type { BookAgentRunner, BookAgentRunResult } from '../bookAgentRunner.js'
import type { LearningContext } from '../learningContext.js'

export interface CapabilityRunCallbacks {
  onDelta(text: string): void | Promise<void>
}

function blockContent(block: BookBlock): string {
  switch (block.type) {
    case 'explanation': return `${block.body}\n${block.keyPoint}`
    case 'example': return `${block.scenario}\n${block.takeaway}`
    case 'formula': return `${block.formula}\n${block.explanation}`
    case 'citation': return `${block.excerpt}\n${block.location}`
    case 'concept': return block.concepts.map((concept) =>
      `${concept.label}：${concept.description}`).join('\n')
    case 'quiz': return `${block.question}\n${block.options.map((option) =>
      `${option.marker}. ${option.text}`).join('\n')}`
    case 'callout': return block.body
    case 'flash_cards': return block.cards.map((card) =>
      `${card.front}：${card.back}`).join('\n')
    case 'figure': return `${block.caption}\n${block.mermaid}`
    case 'user_note': return '用户笔记'
  }
}

function sourceKey(source: SourceAnchor): string {
  return [source.sourceId, source.fileName, source.pageRange, source.excerpt].join('\u0000')
}

export function buildBookAgentRequest(
  context: LearningContext,
  message: string,
): NormalizedBookAgentRequest {
  const book = context.authority.book
  if (!book) return { question: message, history: [], context: null }
  const selectedChapters = book.chapters.filter((chapter) =>
    context.readScope.chapterIds.includes(chapter.id))
  const sourceIds = new Map<string, string>()
  const sources: NormalizedBookAgentSource[] = []

  function registerSource(source: SourceAnchor, chapterId: string, blockId: string): string {
    const key = sourceKey(source)
    const existing = sourceIds.get(key)
    if (existing) return existing
    const id = `S${sourceIds.size + 1}`
    sourceIds.set(key, id)
    sources.push({
      id,
      sourceId: source.sourceId,
      fileName: source.fileName,
      pageRange: source.pageRange,
      excerpt: source.excerpt,
      chapterId,
      blockId,
    })
    return id
  }

  function normalizeBlock(chapter: BookChapter, block: BookBlock): NormalizedBookAgentBlock {
    return {
      id: block.id,
      type: block.type,
      title: block.title,
      content: blockContent(block),
      sourceIds: block.type === 'user_note'
        ? []
        : block.sourceAnchors.map((source) => registerSource(source, chapter.id, block.id)),
      userAuthored: block.type === 'user_note',
    }
  }

  const chapters: NormalizedBookAgentChapter[] = selectedChapters.map((chapter) => {
    const selectedBlocks = chapter.blocks.filter((block) =>
      context.readScope.blockIds.includes(block.id))
    const blocks = selectedBlocks.map((block) => normalizeBlock(chapter, block))
    if (sources.length === 0 && chapter.sourceAnchors.length > 0 && blocks.length > 0) {
      blocks[0].sourceIds.push(...chapter.sourceAnchors.map((source) =>
        registerSource(source, chapter.id, blocks[0].id)))
    }
    return { id: chapter.id, title: chapter.title, objective: chapter.objective, blocks }
  })
  const normalizedContext: NormalizedBookAgentContext = {
    bookId: book.id,
    title: book.proposal.title,
    scope: context.authority.chapter ? 'chapter' : 'book',
    label: context.authority.chapter?.title ?? book.proposal.title,
    ...(context.authority.block ? { focusBlockId: context.authority.block.id } : {}),
    chapters,
    sources,
    warnings: [],
  }
  return { question: message, history: [], context: normalizedContext }
}

export class FreeChatCapability {
  constructor(protected readonly runner: BookAgentRunner) {}

  run(
    context: LearningContext,
    message: string,
    callbacks: CapabilityRunCallbacks,
    signal?: AbortSignal,
  ): Promise<BookAgentRunResult> {
    return this.runner.run(buildBookAgentRequest(context, message), callbacks, { signal })
  }
}
