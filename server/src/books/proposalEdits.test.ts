import { describe, expect, it } from 'vitest'

import type { StoredBook } from './bookTypes.js'
import { applyProposalEdits, ProposalEditError, type ProposalEdits } from './proposalEdits.js'

function makeBook(chapterCount = 3, status: StoredBook['status'] = 'proposal'): StoredBook {
  const now = '2026-08-10T00:00:00.000Z'
  const chapters = Array.from({ length: chapterCount }, (_, i) => ({
    id: `ch-${i + 1}`,
    title: `第${i + 1}章`,
    order: i + 1,
    objective: `目标${i + 1}`,
    coreConceptId: `concept-ch-${i + 1}`,
    estimatedMinutes: 15,
    sourceAnchors: [{
      sourceId: 'S1',
      fileName: 'lecture.pdf',
      pageRange: `${i * 2 + 1}–${i * 2 + 2}`,
      excerpt: `摘录${i + 1}`,
    }],
    status: 'pending' as const,
    blocks: [],
  }))
  return {
    id: 'book_test-1',
    source: {
      id: 'doc_test-1',
      fileName: 'lecture.pdf',
      format: 'PDF',
      pageCount: 6,
      sizeLabel: '1 KB',
      updatedLabel: '2026-08-10',
    },
    goal: '理解概念',
    learnerLevel: '入门',
    proposal: {
      title: '机器学习入门',
      description: '原描述',
      rationale: '章节按讲义顺序组织',
      estimatedMinutes: 45,
    },
    status,
    chapters,
    activeChapterId: 'ch-1',
    userNotes: [],
    quizAttempts: [],
    evidence: [],
    createdAt: now,
    updatedAt: now,
    generationJobs: chapters.map((chapter) => ({
      chapterId: chapter.id,
      status: 'pending' as const,
      attempts: 0,
      lastError: null,
      updatedAt: now,
    })),
  }
}

function editsFor(book: StoredBook, overrides: Partial<ProposalEdits> = {}): ProposalEdits {
  return {
    title: '改名后的书',
    description: '改名后的描述',
    chapters: book.chapters.map((chapter) => ({
      id: chapter.id,
      title: `新${chapter.title}`,
      order: chapter.order,
      objective: `新${chapter.objective}`,
      estimatedMinutes: 20,
    })),
    ...overrides,
  }
}

function expectEditError(book: StoredBook, edits: ProposalEdits, code: string): void {
  try {
    applyProposalEdits(book, edits)
    expect.unreachable(`expected ProposalEditError ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(ProposalEditError)
    expect((error as ProposalEditError).code).toBe(code)
  }
}

describe('applyProposalEdits', () => {
  it('applies a valid rename and reorder, normalizing order to 1..N', () => {
    const book = makeBook()
    const edits = editsFor(book, {
      chapters: [
        { id: 'ch-3', title: '新第三章', order: 10, objective: '新目标三', estimatedMinutes: 30 },
        { id: 'ch-1', title: '新第一章', order: 20, objective: '新目标一', estimatedMinutes: 25 },
        { id: 'ch-2', title: '新第二章', order: 30, objective: '新目标二', estimatedMinutes: 20 },
      ],
    })

    const updated = applyProposalEdits(book, edits)

    expect(updated.proposal.title).toBe('改名后的书')
    expect(updated.proposal.description).toBe('改名后的描述')
    // rationale / estimatedMinutes 等未编辑字段保持不变
    expect(updated.proposal.rationale).toBe('章节按讲义顺序组织')
    expect(updated.proposal.estimatedMinutes).toBe(45)

    expect(updated.chapters.map((chapter) => chapter.id)).toEqual(['ch-3', 'ch-1', 'ch-2'])
    expect(updated.chapters.map((chapter) => chapter.order)).toEqual([1, 2, 3])
    expect(updated.chapters[0]).toMatchObject({
      id: 'ch-3',
      title: '新第三章',
      objective: '新目标三',
      estimatedMinutes: 30,
      // 壳字段保留
      coreConceptId: 'concept-ch-3',
      status: 'pending',
    })
    expect(updated.chapters[0].sourceAnchors).toEqual(book.chapters[2].sourceAnchors)
    expect(updated.chapters[0].blocks).toEqual([])

    // 输入不被原地修改
    expect(book.chapters.map((chapter) => chapter.order)).toEqual([1, 2, 3])
    expect(book.proposal.title).toBe('机器学习入门')
  })

  it('accepts deleting a chapter (edited ids are a subset of the shell ids)', () => {
    const book = makeBook(5)
    const edits = editsFor(book, {
      chapters: book.chapters.slice(0, 4).map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        order: chapter.order,
        objective: chapter.objective,
        estimatedMinutes: chapter.estimatedMinutes,
      })),
    })

    const updated = applyProposalEdits(book, edits)

    expect(updated.chapters.map((chapter) => chapter.id)).toEqual(['ch-1', 'ch-2', 'ch-3', 'ch-4'])
    expect(updated.chapters.map((chapter) => chapter.order)).toEqual([1, 2, 3, 4])
    // 壳字段保留
    expect(updated.chapters[3].coreConceptId).toBe('concept-ch-4')
    expect(updated.chapters[3].sourceAnchors).toEqual(book.chapters[3].sourceAnchors)
  })

  it('accepts merging adjacent chapters (subset ids with concatenated title)', () => {
    const book = makeBook(5)
    const [first, second, ...rest] = book.chapters
    const edits = editsFor(book, {
      chapters: [
        {
          id: first.id,
          title: `${first.title}与${second.title}`,
          order: 1,
          objective: `${first.objective} ${second.objective}`,
          estimatedMinutes: first.estimatedMinutes + second.estimatedMinutes,
        },
        ...rest.map((chapter) => ({
          id: chapter.id,
          title: chapter.title,
          order: chapter.order,
          objective: chapter.objective,
          estimatedMinutes: chapter.estimatedMinutes,
        })),
      ],
    })

    const updated = applyProposalEdits(book, edits)

    expect(updated.chapters).toHaveLength(4)
    expect(updated.chapters.map((chapter) => chapter.id)).toEqual(['ch-1', 'ch-3', 'ch-4', 'ch-5'])
    expect(updated.chapters.map((chapter) => chapter.order)).toEqual([1, 2, 3, 4])
    expect(updated.chapters[0].title).toBe('第1章与第2章')
  })

  it('rejects edits that shrink below the 3-chapter minimum via deletion', () => {
    const book = makeBook(3)
    const edits = editsFor(book, {
      chapters: book.chapters.slice(0, 2).map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        order: chapter.order,
        objective: chapter.objective,
        estimatedMinutes: chapter.estimatedMinutes,
      })),
    })
    expectEditError(book, edits, 'invalid_proposal_edit')
  })

  it('rejects chapter ids that are not part of the original shell (new ids)', () => {
    const book = makeBook()
    const edits = editsFor(book)
    edits.chapters[0] = { ...edits.chapters[0], id: 'ch-99' }
    expectEditError(book, edits, 'invalid_proposal_edit')
  })

  it('rejects duplicated chapter ids', () => {
    const book = makeBook()
    const edits = editsFor(book)
    edits.chapters[1] = { ...edits.chapters[1], id: 'ch-1' }
    expectEditError(book, edits, 'invalid_proposal_edit')
  })

  it('rejects fewer than 3 chapters', () => {
    const book = makeBook(2)
    expectEditError(book, editsFor(book), 'invalid_proposal_edit')
  })

  it('rejects more than 6 chapters', () => {
    const book = makeBook(7)
    expectEditError(book, editsFor(book), 'invalid_proposal_edit')
  })

  it('rejects empty or over-40-char titles', () => {
    const book = makeBook()

    const emptyBookTitle = editsFor(book, { title: '   ' })
    expectEditError(book, emptyBookTitle, 'invalid_proposal_edit')

    const longChapterTitle = editsFor(book)
    longChapterTitle.chapters[0] = { ...longChapterTitle.chapters[0], title: '长'.repeat(41) }
    expectEditError(book, longChapterTitle, 'invalid_proposal_edit')

    const emptyChapterTitle = editsFor(book)
    emptyChapterTitle.chapters[0] = { ...emptyChapterTitle.chapters[0], title: '' }
    expectEditError(book, emptyChapterTitle, 'invalid_proposal_edit')
  })

  it('rejects malformed chapter fields', () => {
    const book = makeBook()

    const badMinutes = editsFor(book)
    badMinutes.chapters[0] = { ...badMinutes.chapters[0], estimatedMinutes: 0 }
    expectEditError(book, badMinutes, 'invalid_proposal_edit')

    const badObjective = editsFor(book)
    badObjective.chapters[0] = { ...badObjective.chapters[0], objective: '' }
    expectEditError(book, badObjective, 'invalid_proposal_edit')
  })

  it('rejects edits when the book is not in proposal status', () => {
    const book = makeBook(3, 'generating')
    expectEditError(book, editsFor(book), 'book_not_editable')
  })
})
