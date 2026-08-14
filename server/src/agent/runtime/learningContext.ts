import type { BookStore } from '../../books/bookStore.js'
import type {
  BookBlock,
  BookChapter,
  MasteryProjectionReadModelEntry,
  SourceAnchor,
  StoredBook,
} from '../../books/bookTypes.js'
import type {
  AgentObjectRefs,
  AgentSurface,
  CapabilityId,
  RuntimeActor,
  StartTurnRequestV1,
} from './agentRuntimeTypes.js'
import type { ToolId } from './toolRegistry.js'

export type LearningContextErrorCode =
  | 'book_not_found'
  | 'chapter_not_found'
  | 'block_not_found'
  | 'invalid_ref_ownership'

export class LearningContextError extends Error {
  readonly code: LearningContextErrorCode

  constructor(code: LearningContextErrorCode) {
    super(code)
    this.name = 'LearningContextError'
    this.code = code
  }
}

export interface LearningStateSummary {
  quizAttemptCount: number
  evidenceCount: number
  dueReviewCount: number
  masteryProjections?: MasteryProjectionReadModelEntry[]
}

export interface LearningReadScope {
  bookId?: string
  chapterIds: string[]
  blockIds: string[]
  sourceIds: string[]
}

export interface LearningContext {
  actor: RuntimeActor
  surface: AgentSurface
  capabilityId: CapabilityId
  refs: AgentObjectRefs
  authority: {
    book?: StoredBook
    chapter?: BookChapter
    block?: BookBlock
  }
  readScope: LearningReadScope
  learningStateSummary: LearningStateSummary
  sources: SourceAnchor[]
  toolAllowlist: ToolId[]
  availableBookIds: string[]
}

interface LearningContextBuilderDependencies {
  bookAccess: ActorBookAccess
  now?: () => Date
}

export interface ActorBookAccess {
  get(actor: RuntimeActor, bookId: string): Promise<StoredBook | null>
  list(actor: RuntimeActor): Promise<StoredBook[]>
}

function sameActor(left: RuntimeActor, right: RuntimeActor): boolean {
  return left.userId === right.userId && left.workspaceId === right.workspaceId
}

export function createSingleUserBookAccess(
  bookStore: BookStore,
  owner: RuntimeActor,
): ActorBookAccess {
  return {
    async get(actor, bookId) {
      return sameActor(actor, owner) ? bookStore.get(bookId) : null
    },
    async list(actor) {
      return sameActor(actor, owner) ? bookStore.list() : []
    },
  }
}

const CAPABILITY_TOOLS: Record<CapabilityId, ToolId[]> = {
  free_chat: ['read_source', 'read_learning_state'],
  guided_learning: [
    'read_source',
    'read_learning_state',
    'grade_quiz',
    'evaluate_feynman',
    'append_evidence',
    'schedule_review',
    'ask_user',
  ],
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function sourcesFor(chapters: BookChapter[], block: BookBlock | undefined): SourceAnchor[] {
  if (block) return block.sourceAnchors
  return chapters.flatMap((chapter) => [
    ...chapter.sourceAnchors,
    ...chapter.blocks.flatMap((candidate) => candidate.sourceAnchors),
  ])
}

function hasConcept(book: StoredBook, conceptId: string): boolean {
  return book.chapters.some((chapter) =>
    chapter.coreConceptId === conceptId || chapter.blocks.some((block) => {
      if (block.type === 'quiz') return block.conceptId === conceptId
      if (block.type === 'concept') {
        return block.concepts.some((concept) => concept.id === conceptId)
      }
      return false
    }))
}

export class LearningContextBuilder {
  private readonly bookAccess: ActorBookAccess
  private readonly now: () => Date

  constructor(dependencies: LearningContextBuilderDependencies) {
    this.bookAccess = dependencies.bookAccess
    this.now = dependencies.now ?? (() => new Date())
  }

  async build(
    request: StartTurnRequestV1,
    actor: RuntimeActor,
    capabilityId: CapabilityId = request.capabilityHint ?? 'free_chat',
  ): Promise<LearningContext> {
    const availableBooks = await this.bookAccess.list(actor)
    const book = request.refs.bookId === undefined
      ? undefined
      : await this.bookAccess.get(actor, request.refs.bookId) ?? undefined
    if (request.refs.bookId !== undefined && book === undefined) {
      throw new LearningContextError('book_not_found')
    }

    let chapter: BookChapter | undefined
    if (request.refs.chapterId !== undefined) {
      chapter = book?.chapters.find((candidate) => candidate.id === request.refs.chapterId)
      if (!chapter) throw new LearningContextError('chapter_not_found')
    }

    let block: BookBlock | undefined
    if (request.refs.blockId !== undefined) {
      block = chapter?.blocks.find((candidate) => candidate.id === request.refs.blockId)
      if (!block) {
        const owner = availableBooks.find((candidateBook) =>
          candidateBook.chapters.some((candidateChapter) =>
            candidateChapter.blocks.some((candidateBlock) => candidateBlock.id === request.refs.blockId)))
        throw new LearningContextError(owner ? 'invalid_ref_ownership' : 'block_not_found')
      }
    }
    if (request.refs.documentId !== undefined && book?.source.id !== request.refs.documentId) {
      throw new LearningContextError('invalid_ref_ownership')
    }
    if (request.refs.conceptId !== undefined && (!book || !hasConcept(book, request.refs.conceptId))) {
      throw new LearningContextError('invalid_ref_ownership')
    }

    const chapters = chapter ? [chapter] : book?.chapters ?? []
    const blocks = block ? [block] : chapters.flatMap((candidate) => candidate.blocks)
    const sources = sourcesFor(chapters, block)
    const now = this.now().getTime()
    const dueReviewCount = book === undefined
      ? 0
      : Object.values(book.reviewSchedule ?? {}).filter((entry) => Date.parse(entry.dueAt) <= now).length
    const masteryProjections = Object.values(book?.masteryProjectionReadModel ?? {}).filter((entry) =>
      chapters.some((candidate) => candidate.id === entry.chapterId) &&
      (block === undefined || entry.sourceBlockId === block.id))
    const refs: AgentObjectRefs = {
      ...(book ? { bookId: book.id, documentId: book.source.id } : {}),
      ...(chapter ? { chapterId: chapter.id } : {}),
      ...(block ? { blockId: block.id } : {}),
      ...(request.refs.conceptId ? { conceptId: request.refs.conceptId } : {}),
    }

    return {
      actor: { ...actor },
      surface: request.surface,
      capabilityId,
      refs,
      authority: { book, chapter, block },
      readScope: {
        ...(book ? { bookId: book.id } : {}),
        chapterIds: chapters.map((candidate) => candidate.id),
        blockIds: blocks.map((candidate) => candidate.id),
        sourceIds: unique(sources.map((source) => source.sourceId)),
      },
      learningStateSummary: {
        quizAttemptCount: book?.quizAttempts.length ?? 0,
        evidenceCount: book?.evidence.length ?? 0,
        dueReviewCount,
        ...(masteryProjections.length === 0 ? {} : { masteryProjections }),
      },
      sources,
      toolAllowlist: [...CAPABILITY_TOOLS[capabilityId]],
      availableBookIds: availableBooks.map((candidate) => candidate.id),
    }
  }
}
