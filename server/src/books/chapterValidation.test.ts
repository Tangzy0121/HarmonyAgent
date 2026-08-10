import { describe, expect, it } from 'vitest'

import type { ParsedPage } from '../documents/pdfParser.js'
import {
  ChapterValidationError,
  normalizeChapterBlocks,
} from './chapterValidation.js'

const pages: ParsedPage[] = [
  { page: 1, text: '封面与机器学习导言。' },
  { page: 2, text: '机器学习发展历程简述。' },
  { page: 3, text: '监督学习从标注数据中学习映射函数。' },
  { page: 4, text: '损失函数衡量预测与真实标签的差距。' },
  { page: 5, text: '梯度下降迭代更新模型参数。' },
  { page: 6, text: '模型评估使用测试集准确率。' },
]

const baseCtx = {
  pages,
  pageStart: 3,
  pageEnd: 4,
  fileName: 'lecture.pdf',
  remainingBookBudget: 30,
}

function explanationBlock(overrides: Record<string, unknown> = {}) {
  return {
    type: 'explanation',
    title: '什么是监督学习',
    body: '监督学习利用标注样本拟合映射函数。',
    keyPoint: '从标注数据学习映射',
    ...overrides,
  }
}

function exampleBlock() {
  return {
    type: 'example',
    title: '房价预测',
    scenario: '根据面积与地段预测房价。',
    takeaway: '回归是典型的监督学习任务。',
  }
}

function citationBlock(overrides: Record<string, unknown> = {}) {
  return {
    type: 'citation',
    title: '损失函数原文',
    excerpt: '损失函数衡量预测与真实标签的差距',
    pageRange: '4',
    ...overrides,
  }
}

function conceptBlock(relationOverrides: Record<string, unknown> = {}) {
  return {
    type: 'concept',
    title: '核心概念',
    concepts: [
      { id: 'c1', label: '监督学习', description: '从标注数据学习。' },
      { id: 'c2', label: '损失函数', description: '衡量预测误差。' },
    ],
    relations: [
      { sourceId: 'c1', targetId: 'c2', type: '包含', confidence: 0.8, ...relationOverrides },
    ],
  }
}

function quizBlock(overrides: Record<string, unknown> = {}) {
  return {
    type: 'quiz',
    title: '随堂小测',
    conceptId: 'c1',
    question: '监督学习需要什么样的数据？',
    options: [
      { id: 'o1', text: '带标注的数据' },
      { id: 'o2', text: '完全无标注的数据' },
    ],
    correctAnswerId: 'o1',
    feedback: '监督学习依赖标注样本。',
    ...overrides,
  }
}

function formulaBlock() {
  return {
    type: 'formula',
    title: '均方误差',
    formula: 'MSE = (1/n) Σ (y - ŷ)²',
    explanation: '衡量预测值与真实值的平均平方差。',
  }
}

function validBlocks() {
  return [explanationBlock(), exampleBlock(), citationBlock(), conceptBlock(), quizBlock(), formulaBlock()]
}

describe('normalizeChapterBlocks', () => {
  it('accepts the six valid block types and assigns per-type sequential ids', () => {
    const { blocks, warnings } = normalizeChapterBlocks({ blocks: validBlocks() }, baseCtx)

    expect(warnings).toEqual([])
    expect(blocks.map((block) => block.id)).toEqual([
      'blk-explanation-1',
      'blk-example-1',
      'blk-citation-1',
      'blk-concept-1',
      'blk-quiz-1',
      'blk-formula-1',
    ])
    expect(blocks.map((block) => block.type)).toEqual([
      'explanation',
      'example',
      'citation',
      'concept',
      'quiz',
      'formula',
    ])
    for (const block of blocks) {
      expect(block.status).toBe('ready')
      expect(block.revision).toBe(1)
    }
    const explanation = blocks[0]
    expect(explanation.type === 'explanation' && explanation.body).toBe('监督学习利用标注样本拟合映射函数。')
    expect(explanation.type === 'explanation' && explanation.keyPoint).toBe('从标注数据学习映射')
    expect(explanation.sourceAnchors).toEqual([])

    // 同类型第二块序号递增
    const again = normalizeChapterBlocks(
      { blocks: [explanationBlock(), explanationBlock({ title: '第二段讲解' }), citationBlock(), quizBlock()] },
      baseCtx,
    )
    expect(again.blocks.map((block) => block.id)).toEqual([
      'blk-explanation-1',
      'blk-explanation-2',
      'blk-citation-1',
      'blk-quiz-1',
    ])
  })

  it('keeps a citation whose excerpt is a substring of page 4 and builds sourceAnchors', () => {
    const { blocks, warnings } = normalizeChapterBlocks(
      { blocks: [explanationBlock(), citationBlock(), quizBlock()] },
      baseCtx,
    )

    expect(warnings).toEqual([])
    const citation = blocks.find((block) => block.type === 'citation')
    expect(citation).toBeDefined()
    expect(citation?.type === 'citation' && citation.location).toBe('第4页')
    expect(citation?.sourceAnchors).toEqual([{
      sourceId: 'S1',
      fileName: 'lecture.pdf',
      pageRange: '4',
      excerpt: '损失函数衡量预测与真实标签的差距',
    }])
  })

  it('matches excerpts ignoring whitespace differences and accepts a range pageRange', () => {
    const ranged = normalizeChapterBlocks(
      {
        blocks: [
          explanationBlock(),
          citationBlock({ excerpt: '梯度下降 迭代更新\n模型参数', pageRange: '3–6' }),
          quizBlock(),
        ],
      },
      { ...baseCtx, pageStart: 3, pageEnd: 6 },
    )

    expect(ranged.warnings).toEqual([])
    const citation = ranged.blocks.find((block) => block.type === 'citation')
    expect(citation?.sourceAnchors[0]?.pageRange).toBe('3–6')
  })

  it('drops a citation whose excerpt appears on no page in range, with a warning', () => {
    const { blocks, warnings } = normalizeChapterBlocks(
      {
        blocks: [
          explanationBlock(),
          citationBlock({ excerpt: '原文里根本不存在的一句话' }),
          citationBlock({ title: '有效引文' }),
          quizBlock(),
        ],
      },
      baseCtx,
    )

    const citations = blocks.filter((block) => block.type === 'citation')
    expect(citations).toHaveLength(1)
    expect(citations[0].title).toBe('有效引文')
    expect(warnings.some((warning) => warning.includes('citation'))).toBe(true)
  })

  it('drops a citation whose pageRange is out of bounds, with a warning', () => {
    const { blocks, warnings } = normalizeChapterBlocks(
      {
        blocks: [
          explanationBlock(),
          citationBlock({ pageRange: '99' }),
          citationBlock({ title: '有效引文' }),
          quizBlock(),
        ],
      },
      baseCtx,
    )

    const citations = blocks.filter((block) => block.type === 'citation')
    expect(citations).toHaveLength(1)
    expect(citations[0].title).toBe('有效引文')
    expect(warnings.some((warning) => warning.includes('99'))).toBe(true)
  })

  it('throws chapter_invalid when an explanation block is missing', () => {
    expect(() => normalizeChapterBlocks(
      { blocks: [citationBlock(), quizBlock()] },
      baseCtx,
    )).toThrowError(ChapterValidationError)
    expect(() => normalizeChapterBlocks(
      { blocks: [citationBlock(), quizBlock()] },
      baseCtx,
    )).toThrowError(expect.objectContaining({ code: 'chapter_invalid' }))
  })

  it('throws chapter_invalid when no citation survives validation', () => {
    expect(() => normalizeChapterBlocks(
      { blocks: [explanationBlock(), citationBlock({ excerpt: '不存在的引文' }), quizBlock()] },
      baseCtx,
    )).toThrowError(expect.objectContaining({ code: 'chapter_invalid' }))
  })

  it('throws chapter_invalid when a quiz block is missing', () => {
    expect(() => normalizeChapterBlocks(
      { blocks: [explanationBlock(), citationBlock()] },
      baseCtx,
    )).toThrowError(expect.objectContaining({ code: 'chapter_invalid' }))
  })

  it('throws chapter_invalid for a quiz with 1 or 5 options, or a dangling correctAnswerId', () => {
    const oneOption = quizBlock({ options: [{ id: 'o1', text: '唯一选项' }] })
    expect(() => normalizeChapterBlocks(
      { blocks: [explanationBlock(), citationBlock(), oneOption] },
      baseCtx,
    )).toThrowError(expect.objectContaining({ code: 'chapter_invalid' }))

    const fiveOptions = quizBlock({
      options: [
        { id: 'o1', text: '甲' },
        { id: 'o2', text: '乙' },
        { id: 'o3', text: '丙' },
        { id: 'o4', text: '丁' },
        { id: 'o5', text: '戊' },
      ],
    })
    expect(() => normalizeChapterBlocks(
      { blocks: [explanationBlock(), citationBlock(), fiveOptions] },
      baseCtx,
    )).toThrowError(expect.objectContaining({ code: 'chapter_invalid' }))

    const danglingAnswer = quizBlock({ correctAnswerId: 'o9' })
    expect(() => normalizeChapterBlocks(
      { blocks: [explanationBlock(), citationBlock(), danglingAnswer] },
      baseCtx,
    )).toThrowError(expect.objectContaining({ code: 'chapter_invalid' }))
  })

  it('drops blocks of an unknown type with a warning', () => {
    const { blocks, warnings } = normalizeChapterBlocks(
      { blocks: [explanationBlock(), { type: 'animation', title: '动画' }, citationBlock(), quizBlock()] },
      baseCtx,
    )

    expect(blocks.map((block) => block.type)).toEqual(['explanation', 'citation', 'quiz'])
    expect(warnings.some((warning) => warning.includes('animation'))).toBe(true)
  })

  it('keeps only the first remainingBookBudget blocks in input order, with a warning', () => {
    const { blocks, warnings } = normalizeChapterBlocks(
      { blocks: [explanationBlock(), citationBlock(), quizBlock(), exampleBlock(), formulaBlock()] },
      { ...baseCtx, remainingBookBudget: 2 },
    )

    expect(blocks.map((block) => block.type)).toEqual(['explanation', 'citation'])
    expect(warnings.some((warning) => warning.includes('预算'))).toBe(true)
  })

  it('drops a concept relation whose type is outside the whitelist, with a warning', () => {
    const { blocks, warnings } = normalizeChapterBlocks(
      { blocks: [explanationBlock(), citationBlock(), quizBlock(), conceptBlock({ type: '因果' })] },
      baseCtx,
    )

    const concept = blocks.find((block) => block.type === 'concept')
    expect(concept?.type === 'concept' && concept.relations).toEqual([])
    expect(warnings.some((warning) => warning.includes('因果'))).toBe(true)
  })

  it('normalizes kept concept relations and items to the stored shape', () => {
    const { blocks } = normalizeChapterBlocks(
      { blocks: [explanationBlock(), citationBlock(), quizBlock(), conceptBlock()] },
      baseCtx,
    )

    const concept = blocks.find((block) => block.type === 'concept')
    if (concept?.type !== 'concept') throw new Error('concept block missing')
    expect(concept.concepts).toEqual([
      { id: 'c1', label: '监督学习', description: '从标注数据学习。', learningState: '暂无学习记录' },
      { id: 'c2', label: '损失函数', description: '衡量预测误差。', learningState: '暂无学习记录' },
    ])
    expect(concept.relations).toHaveLength(1)
    expect(concept.relations[0]).toMatchObject({
      sourceId: 'c1',
      targetId: 'c2',
      type: '包含',
      confidence: 0.8,
      status: '候选',
    })
    expect(concept.relations[0].id).toBe('rel-1')
    expect(concept.relations[0].sourceAnchor).toMatchObject({
      sourceId: 'S1',
      fileName: 'lecture.pdf',
    })
  })

  it('normalizes quiz options with markers and preserves the answer id', () => {
    const { blocks } = normalizeChapterBlocks(
      { blocks: [explanationBlock(), citationBlock(), quizBlock()] },
      baseCtx,
    )

    const quiz = blocks.find((block) => block.type === 'quiz')
    if (quiz?.type !== 'quiz') throw new Error('quiz block missing')
    expect(quiz.options).toEqual([
      { id: 'o1', marker: 'A', text: '带标注的数据' },
      { id: 'o2', marker: 'B', text: '完全无标注的数据' },
    ])
    expect(quiz.correctAnswerId).toBe('o1')
    expect(quiz.conceptId).toBe('c1')
  })

  it('accepts a bare array as { blocks } and rejects non-object input', () => {
    const { blocks } = normalizeChapterBlocks(validBlocks(), baseCtx)
    expect(blocks).toHaveLength(6)

    expect(() => normalizeChapterBlocks('not-json-shape', baseCtx))
      .toThrowError(expect.objectContaining({ code: 'chapter_invalid' }))
    expect(() => normalizeChapterBlocks({ blocks: 'oops' }, baseCtx))
      .toThrowError(expect.objectContaining({ code: 'chapter_invalid' }))
  })
})
