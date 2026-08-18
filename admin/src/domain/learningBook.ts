import type {
  AgentContext,
  AgentContextScope,
  BookChapter,
  LearningBook,
  QuizBlock,
} from '../types/learningBook'

function normalizeChapterOrder(chapters: BookChapter[]): BookChapter[] {
  return chapters.map((chapter, order) => ({ ...chapter, order }))
}

export function removeChapter(book: LearningBook, chapterId: string): LearningBook {
  if (book.chapters.length <= 3 || !book.chapters.some((chapter) => chapter.id === chapterId)) return book
  return { ...book, chapters: normalizeChapterOrder(book.chapters.filter((chapter) => chapter.id !== chapterId)) }
}

export function renameChapter(book: LearningBook, chapterId: string, title: string): LearningBook {
  const normalizedTitle = title.trim()
  if (!normalizedTitle || !book.chapters.some((chapter) => chapter.id === chapterId)) return book
  return {
    ...book,
    chapters: book.chapters.map((chapter) => chapter.id === chapterId ? { ...chapter, title: normalizedTitle } : chapter),
  }
}

export function moveChapter(book: LearningBook, chapterId: string, direction: 'up' | 'down'): LearningBook {
  const index = book.chapters.findIndex((chapter) => chapter.id === chapterId)
  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (index < 0 || targetIndex < 0 || targetIndex >= book.chapters.length) return book

  const chapters = [...book.chapters]
  const [chapter] = chapters.splice(index, 1)
  chapters.splice(targetIndex, 0, chapter)
  return { ...book, chapters: normalizeChapterOrder(chapters) }
}

export function mergeChapterWithNext(book: LearningBook, chapterId: string): LearningBook {
  if (book.chapters.length <= 3) return book
  const index = book.chapters.findIndex((chapter) => chapter.id === chapterId)
  const next = book.chapters[index + 1]
  if (index < 0 || !next) return book

  const current = book.chapters[index]
  const merged: BookChapter = {
    ...current,
    title: `${current.title}与${next.title}`,
    objective: `${current.objective} ${next.objective}`,
    estimatedMinutes: current.estimatedMinutes + next.estimatedMinutes,
    sourceAnchors: [...current.sourceAnchors, ...next.sourceAnchors],
    blocks: [...current.blocks, ...next.blocks],
  }
  const chapters = [...book.chapters.slice(0, index), merged, ...book.chapters.slice(index + 2)]
  return { ...book, chapters: normalizeChapterOrder(chapters) }
}

export function advanceGeneration(book: LearningBook): LearningBook {
  const generatingIndex = book.chapters.findIndex((chapter) => chapter.status === 'generating')
  if (generatingIndex < 0) return book

  const chapters = book.chapters.map((chapter, index) => {
    if (index === generatingIndex) return { ...chapter, status: 'ready' as const }
    if (index === generatingIndex + 1 && chapter.status === 'pending') return { ...chapter, status: 'generating' as const }
    return chapter
  })
  const isReady = chapters.every((chapter) => chapter.status === 'ready')
  return { ...book, status: isReady ? 'ready' : 'generating', chapters }
}

export function startBookGeneration(book: LearningBook): LearningBook {
  const firstChapter = book.chapters[0]
  if (!firstChapter) return book
  return {
    ...book,
    status: 'generating',
    activeChapterId: firstChapter.id,
    chapters: book.chapters.map((chapter, index) => ({
      ...chapter,
      status: index === 0 ? 'generating' : 'pending',
    })),
  }
}

export function retryChapterGeneration(book: LearningBook, chapterId: string): LearningBook {
  if (!book.chapters.some((chapter) => chapter.id === chapterId && chapter.status === 'error')) return book
  return {
    ...book,
    status: 'generating',
    chapters: book.chapters.map((chapter) => chapter.id === chapterId ? { ...chapter, status: 'generating' } : chapter),
  }
}

export function resolveAgentContext(book: LearningBook, chapterId: string, scope: AgentContextScope): AgentContext {
  if (scope === 'book') {
    return {
      scope,
      label: `整本学习书 · ${book.proposal.title}`,
      chapterIds: book.chapters.map((chapter) => chapter.id),
      sourceAnchors: book.chapters.flatMap((chapter) => chapter.sourceAnchors),
    }
  }

  const chapter = book.chapters.find((candidate) => candidate.id === chapterId) ?? book.chapters[0]
  return {
    scope,
    label: `第 ${chapter.order + 1} 章 · ${chapter.title}`,
    chapterIds: [chapter.id],
    sourceAnchors: chapter.sourceAnchors,
  }
}

function findQuiz(book: LearningBook, blockId: string): { chapter: BookChapter; block: QuizBlock } | null {
  for (const chapter of book.chapters) {
    const block = chapter.blocks.find((candidate) => candidate.id === blockId)
    if (block?.type === 'quiz') return { chapter, block }
  }
  return null
}

export function submitQuizAttempt(book: LearningBook, blockId: string, answerId: string): LearningBook {
  if (book.quizAttempts.some((attempt) => attempt.blockId === blockId)) return book
  const match = findQuiz(book, blockId)
  if (!match || !match.block.options.some((option) => option.id === answerId)) return book

  const isCorrect = match.block.correctAnswerId === answerId
  const submittedAt = '刚刚'
  return {
    ...book,
    quizAttempts: [
      ...book.quizAttempts,
      {
        id: `attempt-${blockId}`,
        chapterId: match.chapter.id,
        blockId,
        answerId,
        isCorrect,
        submittedAt,
      },
    ],
    evidence: [
      ...book.evidence,
      {
        id: `evidence-${blockId}`,
        chapterId: match.chapter.id,
        conceptId: match.block.conceptId,
        sourceBlockId: blockId,
        statement: isCorrect ? '能够根据目标标签判断监督学习。' : '已完成一次判断，仍需复习训练信号。',
        outcome: isCorrect ? 'mastered' : 'review',
        createdAt: submittedAt,
      },
    ],
  }
}

export function regenerateBlock(book: LearningBook, blockId: string): LearningBook {
  let changed = false
  const chapters = book.chapters.map((chapter) => ({
    ...chapter,
    blocks: chapter.blocks.map((block) => {
      if (block.id !== blockId || block.type === 'user_note' || block.type === 'citation') return block
      changed = true
      return { ...block, status: 'ready' as const, revision: block.revision + 1 }
    }),
  }))
  return changed ? { ...book, chapters } : book
}

export function updateUserNote(book: LearningBook, noteId: string, body: string): LearningBook {
  if (!book.userNotes.some((note) => note.id === noteId)) return book
  return {
    ...book,
    userNotes: book.userNotes.map((note) => note.id === noteId ? { ...note, body } : note),
  }
}

export function recordDeepLearningEvidence(book: LearningBook, blockId: string): LearningBook {
  if (book.evidence.some((item) => item.sourceBlockId === blockId)) return book
  const chapter = book.chapters.find((candidate) => candidate.blocks.some((block) => block.id === blockId))
  if (!chapter) return book
  return {
    ...book,
    evidence: [
      ...book.evidence,
      {
        id: `evidence-deep-${blockId}`,
        chapterId: chapter.id,
        conceptId: chapter.coreConceptId,
        sourceBlockId: blockId,
        statement: '已完成围绕该内容块的深入学习与验证。',
        outcome: 'mastered',
        createdAt: '刚刚',
      },
    ],
  }
}
