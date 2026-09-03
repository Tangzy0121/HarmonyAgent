import { describe, expect, it } from 'vitest'

import {
  extractJsonObject,
  normalizeProposal,
  ProposalValidationError,
} from './proposalValidation.js'

const PAGE_COUNT = 6

function validChapter(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: '监督学习基础',
    objective: '理解标签的作用',
    coreConcept: '监督学习',
    estimatedMinutes: 15,
    pageStart: 1,
    pageEnd: 3,
    ...overrides,
  }
}

function validProposal(chapters: unknown[] = [
  validChapter({ pageStart: 1, pageEnd: 2 }),
  validChapter({ title: '第二章', pageStart: 2, pageEnd: 3 }),
  validChapter({ title: '第三章', pageStart: 4, pageEnd: 5 }),
  validChapter({ title: '第四章', pageStart: 5, pageEnd: 6 }),
]): Record<string, unknown> {
  return {
    title: '机器学习入门',
    description: '根据讲义生成的学习书',
    rationale: '章节按讲义顺序组织',
    estimatedMinutes: 60,
    chapters,
  }
}

describe('normalizeProposal', () => {
  it('accepts a valid 4-chapter proposal and preserves titles and page ranges', () => {
    const input = validProposal()
    const normalized = normalizeProposal(input, PAGE_COUNT)

    expect(normalized.title).toBe('机器学习入门')
    expect(normalized.description).toBe('根据讲义生成的学习书')
    expect(normalized.rationale).toBe('章节按讲义顺序组织')
    expect(normalized.estimatedMinutes).toBe(60)
    expect(normalized.chapters).toHaveLength(4)
    expect(normalized.chapters[0]).toEqual({
      title: '监督学习基础',
      objective: '理解标签的作用',
      coreConcept: '监督学习',
      estimatedMinutes: 15,
      pageStart: 1,
      pageEnd: 2,
    })
    expect(normalized.chapters[3].pageStart).toBe(5)
    expect(normalized.chapters[3].pageEnd).toBe(6)
  })

  it('truncates 7 chapters down to 6', () => {
    const chapters = Array.from({ length: 7 }, (_, i) =>
      validChapter({ title: `第${i + 1}章`, pageStart: 1, pageEnd: 6 }))
    const normalized = normalizeProposal(validProposal(chapters), PAGE_COUNT)

    expect(normalized.chapters).toHaveLength(6)
    expect(normalized.chapters[5].title).toBe('第6章')
  })

  it('throws proposal_invalid for only 2 chapters', () => {
    const chapters = [validChapter(), validChapter({ title: '第二章' })]
    expect(() => normalizeProposal(validProposal(chapters), PAGE_COUNT))
      .toThrowError(ProposalValidationError)
    try {
      normalizeProposal(validProposal(chapters), PAGE_COUNT)
    } catch (error) {
      expect((error as ProposalValidationError).code).toBe('proposal_invalid')
    }
  })

  it('throws proposal_invalid when pageEnd exceeds pageCount or pageStart < 1', () => {
    const overEnd = validProposal([validChapter(), validChapter(), validChapter({ pageStart: 5, pageEnd: 7 })])
    expect(() => normalizeProposal(overEnd, PAGE_COUNT)).toThrowError(ProposalValidationError)

    const underStart = validProposal([validChapter(), validChapter(), validChapter({ pageStart: 0, pageEnd: 2 })])
    expect(() => normalizeProposal(underStart, PAGE_COUNT)).toThrowError(ProposalValidationError)

    const inverted = validProposal([validChapter(), validChapter(), validChapter({ pageStart: 4, pageEnd: 2 })])
    expect(() => normalizeProposal(inverted, PAGE_COUNT)).toThrowError(ProposalValidationError)
  })

  it('rejects empty and 41-char titles but accepts exactly 40 chars', () => {
    const empty = validProposal([validChapter(), validChapter(), validChapter({ title: '   ' })])
    expect(() => normalizeProposal(empty, PAGE_COUNT)).toThrowError(ProposalValidationError)

    const tooLong = validProposal([validChapter(), validChapter(), validChapter({ title: '标'.repeat(41) })])
    expect(() => normalizeProposal(tooLong, PAGE_COUNT)).toThrowError(ProposalValidationError)

    const exact = validProposal([validChapter(), validChapter(), validChapter({ title: '标'.repeat(40) })])
    const normalized = normalizeProposal(exact, PAGE_COUNT)
    expect(normalized.chapters[2].title).toBe('标'.repeat(40))

    const longBookTitle = { ...validProposal(), title: '书'.repeat(41) }
    expect(() => normalizeProposal(longBookTitle, PAGE_COUNT)).toThrowError(ProposalValidationError)

    const exactBookTitle = { ...validProposal(), title: '书'.repeat(40) }
    expect(normalizeProposal(exactBookTitle, PAGE_COUNT).title).toBe('书'.repeat(40))
  })

  it('defaults missing book-level fields so a bare chapters array still validates', () => {
    const minimal = {
      chapters: [validChapter(), validChapter(), validChapter()],
    }
    const normalized = normalizeProposal(minimal, PAGE_COUNT)

    expect(normalized.title).toBe('')
    expect(normalized.description).toBe('')
    expect(normalized.rationale).toBe('')
    expect(normalized.estimatedMinutes).toBe(45)
  })

  it('throws proposal_invalid when a chapter lacks objective/coreConcept/estimatedMinutes', () => {
    for (const key of ['objective', 'coreConcept', 'estimatedMinutes'] as const) {
      const chapter = validChapter()
      delete chapter[key]
      const input = validProposal([validChapter(), validChapter(), chapter])
      expect(() => normalizeProposal(input, PAGE_COUNT), key).toThrowError(ProposalValidationError)
    }
  })

  it('normalizes a bare chapters array into { chapters: [...] } before validating', () => {
    const chapters = [validChapter(), validChapter(), validChapter()]
    const normalized = normalizeProposal(chapters, PAGE_COUNT)

    expect(normalized.chapters).toHaveLength(3)
    expect(normalized.title).toBe('')
  })

  it('rejects non-object and non-array payloads', () => {
    expect(() => normalizeProposal('not json', PAGE_COUNT)).toThrowError(ProposalValidationError)
    expect(() => normalizeProposal(42, PAGE_COUNT)).toThrowError(ProposalValidationError)
    expect(() => normalizeProposal(null, PAGE_COUNT)).toThrowError(ProposalValidationError)
  })

  describe('sourceDoc（多资料）', () => {
    const DOC_PAGES = [3, 2]
    const TOTAL_PAGES = 5

    function multiChapters(): unknown[] {
      return [
        validChapter({ pageStart: 1, pageEnd: 2, sourceDoc: 1 }),
        validChapter({ title: '第二章', pageStart: 1, pageEnd: 2, sourceDoc: 2 }),
        validChapter({ title: '第三章', pageStart: 2, pageEnd: 3, sourceDoc: 1 }),
      ]
    }

    it('accepts chapters whose sourceDoc and page range fit the matching document', () => {
      const normalized = normalizeProposal(validProposal(multiChapters()), TOTAL_PAGES, DOC_PAGES)

      expect(normalized.chapters.map((chapter) => chapter.sourceDoc)).toEqual([1, 2, 1])
    })

    it('defaults a missing sourceDoc to the first document', () => {
      const chapters = [validChapter(), validChapter({ title: '第二章' }), validChapter({ title: '第三章' })]
      const normalized = normalizeProposal(validProposal(chapters), TOTAL_PAGES, DOC_PAGES)

      expect(normalized.chapters.every((chapter) => chapter.sourceDoc === 1)).toBe(true)
    })

    it('throws proposal_invalid for an out-of-range or non-integer sourceDoc', () => {
      for (const sourceDoc of [0, 3, 1.5, '2', -1]) {
        const chapters = multiChapters().map((chapter, index) => (
          index === 0 ? { ...(chapter as Record<string, unknown>), sourceDoc } : chapter
        ))
        expect(() => normalizeProposal(validProposal(chapters), TOTAL_PAGES, DOC_PAGES), String(sourceDoc))
          .toThrowError(ProposalValidationError)
      }
    })

    it('throws proposal_invalid when the page range exceeds its own document even within the total', () => {
      // 资料 2 只有 2 页；pageEnd 3 不超合计 5 页，但越过所属资料页数
      const chapters = [
        validChapter({ pageStart: 1, pageEnd: 2, sourceDoc: 1 }),
        validChapter({ title: '第二章', pageStart: 1, pageEnd: 3, sourceDoc: 2 }),
        validChapter({ title: '第三章', pageStart: 2, pageEnd: 3, sourceDoc: 1 }),
      ]
      expect(() => normalizeProposal(validProposal(chapters), TOTAL_PAGES, DOC_PAGES))
        .toThrowError(ProposalValidationError)
    })

    it('omits sourceDoc when no documents table is given（单源兼容）', () => {
      const normalized = normalizeProposal(validProposal(), PAGE_COUNT)

      expect('sourceDoc' in normalized.chapters[0]).toBe(false)
    })
  })
})

describe('extractJsonObject', () => {
  it('parses a plain JSON object', () => {
    expect(extractJsonObject('{"title":"x","chapters":[]}')).toEqual({ title: 'x', chapters: [] })
  })

  it('parses from the last JSON object when the text has a thinking preamble', () => {
    const json = JSON.stringify(validProposal())
    const text = `让我先思考一下这份文档的结构……{这是一个不完整的思考片段\n好的，给出目录：\n${json}`
    expect(extractJsonObject(text)).toEqual(validProposal())
  })

  it('parses when the preamble contains a balanced brace fragment', () => {
    const text = `思考：可能分成 {3, 4} 章。\n输出：\n{"title":"x","chapters":[1,2,3]}`
    expect(extractJsonObject(text)).toEqual({ title: 'x', chapters: [1, 2, 3] })
  })

  it('throws proposal_invalid when no JSON object is present', () => {
    expect(() => extractJsonObject('没有任何 JSON')).toThrowError(ProposalValidationError)
    expect(() => extractJsonObject('{"unclosed": ')).toThrowError(ProposalValidationError)
  })
})
