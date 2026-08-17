import { describe, expect, it } from 'vitest'
import { deriveEstimate, TOKENS_PER_PAGE, CHAPTER_OUTPUT_BUDGET } from './estimate.js'
import type { BookChapter, StoredBook } from './bookTypes.js'

function chapter(id: string, order: number, pageRange: string): BookChapter {
  return {
    id,
    title: `第${order}章`,
    order,
    objective: '',
    coreConceptId: '',
    estimatedMinutes: 10,
    sourceAnchors: [{ sourceId: 'doc_1', fileName: 'a.pdf', pageRange, excerpt: '' }],
    status: 'pending',
    blocks: [],
  }
}

function book(chapters: BookChapter[], pageCount = 12): StoredBook {
  return {
    id: 'book_est',
    source: { id: 'doc_1', fileName: 'a.pdf', format: 'PDF', pageCount, sizeLabel: '', updatedLabel: '' },
    goal: '课程学习',
    learnerLevel: '了解',
    proposal: { title: 't', description: '', rationale: '', estimatedMinutes: 30 },
    status: 'proposal',
    chapters,
    activeChapterId: chapters[0]?.id ?? '',
    userNotes: [],
    quizAttempts: [],
    evidence: [],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    generationJobs: [],
  }
}

describe('deriveEstimate', () => {
  it('逐章估算 = 章页数×页均 tokens + 生成预算；合计为各章之和', () => {
    const result = deriveEstimate(book([
      chapter('ch-1', 1, '1-4'),
      chapter('ch-2', 2, '5-8'),
      chapter('ch-3', 3, '9-12'),
    ]))
    expect(result.chapters).toHaveLength(3)
    expect(result.chapters[0]).toEqual({
      chapterId: 'ch-1',
      title: '第1章',
      estimatedTokens: 4 * TOKENS_PER_PAGE + CHAPTER_OUTPUT_BUDGET,
    })
    expect(result.totalTokens).toBe(12 * TOKENS_PER_PAGE + 3 * CHAPTER_OUTPUT_BUDGET)
    expect(result.totalTokens).toBe(result.chapters.reduce((sum, entry) => sum + entry.estimatedTokens, 0))
  })

  it('单页 pageRange 按 1 页计；缺 pageRange 时按总页数均摊', () => {
    const single = deriveEstimate(book([chapter('ch-1', 1, '7')], 10))
    expect(single.chapters[0].estimatedTokens).toBe(TOKENS_PER_PAGE + CHAPTER_OUTPUT_BUDGET)

    const noAnchor = book([chapter('ch-1', 1, ''), chapter('ch-2', 2, '')], 10)
    noAnchor.chapters[0].sourceAnchors = []
    const spread = deriveEstimate(noAnchor)
    // 无章节的锚点 → 10 页两章均摊，各 5 页
    expect(spread.chapters[0].estimatedTokens).toBe(5 * TOKENS_PER_PAGE + CHAPTER_OUTPUT_BUDGET)
  })

  it('零章节时合计为 0', () => {
    expect(deriveEstimate(book([])).totalTokens).toBe(0)
  })
})
