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

function calloutBlock(overrides: Record<string, unknown> = {}) {
  return {
    type: 'callout',
    title: '常见坑',
    kind: 'pitfall',
    body: '别把监督学习和无监督学习混淆。',
    ...overrides,
  }
}

function flashCardsBlock(overrides: Record<string, unknown> = {}) {
  return {
    type: 'flash_cards',
    title: '术语卡',
    cards: [
      { front: '监督学习', back: '有标签', hint: '看标签' },
      { front: '无监督学习', back: '无标签' },
      { front: '强化学习', back: '奖励信号' },
    ],
    ...overrides,
  }
}

function figureBlock(overrides: Record<string, unknown> = {}) {
  return {
    type: 'figure',
    title: '流程',
    kind: 'flowchart',
    mermaid: 'flowchart LR\n  A-->B',
    caption: '训练流程',
    ...overrides,
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
      { blocks: [explanationBlock(), explanationBlock({ title: '第二段讲解' }), citationBlock(), quizBlock(), exampleBlock()] },
      baseCtx,
    )
    expect(again.blocks.map((block) => block.id)).toEqual([
      'blk-explanation-1',
      'blk-explanation-2',
      'blk-citation-1',
      'blk-quiz-1',
      'blk-example-1',
    ])
  })

  it('keeps a citation whose excerpt is a substring of page 4 and builds sourceAnchors', () => {
    const { blocks, warnings } = normalizeChapterBlocks(
      { blocks: [explanationBlock(), citationBlock(), quizBlock(), exampleBlock()] },
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
          exampleBlock(),
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
          exampleBlock(),
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
          exampleBlock(),
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
      { blocks: [citationBlock(), quizBlock(), exampleBlock(), formulaBlock()] },
      baseCtx,
    )).toThrowError(ChapterValidationError)
    expect(() => normalizeChapterBlocks(
      { blocks: [citationBlock(), quizBlock(), exampleBlock(), formulaBlock()] },
      baseCtx,
    )).toThrowError(expect.objectContaining({ code: 'chapter_invalid' }))
  })

  it('throws chapter_invalid when no citation survives validation', () => {
    expect(() => normalizeChapterBlocks(
      { blocks: [explanationBlock(), citationBlock({ excerpt: '不存在的引文' }), quizBlock(), exampleBlock(), formulaBlock()] },
      baseCtx,
    )).toThrowError(expect.objectContaining({ code: 'chapter_invalid' }))
  })

  it('throws chapter_invalid when a quiz block is missing', () => {
    expect(() => normalizeChapterBlocks(
      { blocks: [explanationBlock(), citationBlock(), exampleBlock(), formulaBlock()] },
      baseCtx,
    )).toThrowError(expect.objectContaining({ code: 'chapter_invalid' }))
  })

  it('trims quiz blocks beyond the 2-per-chapter cap, with a warning', () => {
    const { blocks, warnings } = normalizeChapterBlocks(
      {
        blocks: [
          explanationBlock(),
          citationBlock(),
          exampleBlock(),
          quizBlock(),
          quizBlock({ title: '第二题', question: '问题二？' }),
          quizBlock({ title: '第三题', question: '问题三？' }),
        ],
      },
      baseCtx,
    )

    const quizzes = blocks.filter((block) => block.type === 'quiz')
    expect(quizzes).toHaveLength(2)
    expect(quizzes.map((block) => block.title)).toEqual(['随堂小测', '第二题'])
    expect(quizzes.map((block) => block.id)).toEqual(['blk-quiz-1', 'blk-quiz-2'])
    expect(warnings.some((warning) => warning.includes('quiz'))).toBe(true)
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
      { blocks: [explanationBlock(), { type: 'animation', title: '动画' }, citationBlock(), quizBlock(), exampleBlock()] },
      baseCtx,
    )

    expect(blocks.map((block) => block.type)).toEqual(['explanation', 'citation', 'quiz', 'example'])
    expect(warnings.some((warning) => warning.includes('animation'))).toBe(true)
  })

  it('trims to remainingBookBudget while protecting essential types, with a warning', () => {
    const { blocks, warnings } = normalizeChapterBlocks(
      { blocks: [explanationBlock(), citationBlock(), quizBlock(), exampleBlock(), formulaBlock()] },
      { ...baseCtx, remainingBookBudget: 4 },
    )

    expect(blocks.map((block) => block.type)).toEqual(['explanation', 'citation', 'quiz', 'example'])
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
      { blocks: [explanationBlock(), citationBlock(), quizBlock(), exampleBlock()] },
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

describe('normalizeChapterBlocks 新块类型（callout/flash_cards/figure）', () => {
  it('keeps valid callout/flash_cards/figure blocks and assigns id/status/revision/sourceAnchors', () => {
    const valid = {
      blocks: [
        explanationBlock(),
        citationBlock(),
        quizBlock(),
        calloutBlock(),
        flashCardsBlock(),
        figureBlock(),
      ],
    }
    const { blocks, warnings } = normalizeChapterBlocks(valid, baseCtx)

    expect(warnings).toEqual([])
    expect(blocks.map((block) => block.type)).toEqual([
      'explanation',
      'citation',
      'quiz',
      'callout',
      'flash_cards',
      'figure',
    ])
    expect(blocks.map((block) => block.id)).toEqual([
      'blk-explanation-1',
      'blk-citation-1',
      'blk-quiz-1',
      'blk-callout-1',
      'blk-flash_cards-1',
      'blk-figure-1',
    ])
    for (const block of blocks) {
      expect(block.status).toBe('ready')
      expect(block.revision).toBe(1)
    }

    const callout = blocks[3]
    if (callout.type !== 'callout') throw new Error('callout block missing')
    expect(callout.kind).toBe('pitfall')
    expect(callout.body).toBe('别把监督学习和无监督学习混淆。')
    expect(callout.sourceAnchors).toEqual([])

    const flashCards = blocks[4]
    if (flashCards.type !== 'flash_cards') throw new Error('flash_cards block missing')
    // hint 可选：缺省不补
    expect(flashCards.cards).toEqual([
      { front: '监督学习', back: '有标签', hint: '看标签' },
      { front: '无监督学习', back: '无标签' },
      { front: '强化学习', back: '奖励信号' },
    ])

    const figure = blocks[5]
    if (figure.type !== 'figure') throw new Error('figure block missing')
    expect(figure.kind).toBe('flowchart')
    expect(figure.mermaid).toBe('flowchart LR\n  A-->B')
    expect(figure.caption).toBe('训练流程')
  })

  it('falls back to default titles for the new block types', () => {
    const { blocks } = normalizeChapterBlocks(
      {
        blocks: [
          explanationBlock(),
          citationBlock(),
          quizBlock(),
          calloutBlock({ title: '' }),
          flashCardsBlock({ title: '' }),
          figureBlock({ title: '' }),
        ],
      },
      baseCtx,
    )

    expect(blocks.find((block) => block.type === 'callout')?.title).toBe('学习提示')
    expect(blocks.find((block) => block.type === 'flash_cards')?.title).toBe('记忆闪卡')
    expect(blocks.find((block) => block.type === 'figure')?.title).toBe('图解')
  })

  it('drops a callout with a non-whitelisted kind or an overlong body, with a warning', () => {
    const base = [explanationBlock(), citationBlock(), quizBlock(), exampleBlock()]

    const badKind = normalizeChapterBlocks(
      { blocks: [...base, calloutBlock({ kind: 'warning' })] },
      baseCtx,
    )
    expect(badKind.blocks.some((block) => block.type === 'callout')).toBe(false)
    expect(badKind.warnings.length).toBeGreaterThan(0)

    const longBody = normalizeChapterBlocks(
      { blocks: [...base, calloutBlock({ body: '长'.repeat(401) })] },
      baseCtx,
    )
    expect(longBody.blocks.some((block) => block.type === 'callout')).toBe(false)
    expect(longBody.warnings.length).toBeGreaterThan(0)

    // 边界：body 恰好 400 字、kind 为枚举值时保留
    const kept = normalizeChapterBlocks(
      { blocks: [...base, calloutBlock({ kind: 'key_idea', body: '长'.repeat(400) })] },
      baseCtx,
    )
    expect(kept.blocks.some((block) => block.type === 'callout')).toBe(true)
  })

  it('drops flash_cards with too few/many cards or an empty front, with a warning', () => {
    const base = [explanationBlock(), citationBlock(), quizBlock(), exampleBlock()]

    const twoCards = normalizeChapterBlocks(
      { blocks: [...base, flashCardsBlock({ cards: [
        { front: '监督学习', back: '有标签' },
        { front: '无监督学习', back: '无标签' },
      ] })] },
      baseCtx,
    )
    expect(twoCards.blocks.some((block) => block.type === 'flash_cards')).toBe(false)
    expect(twoCards.warnings.length).toBeGreaterThan(0)

    const nineCards = normalizeChapterBlocks(
      { blocks: [...base, flashCardsBlock({ cards: Array.from({ length: 9 }, (_, index) => ({
        front: `术语${index + 1}`,
        back: `释义${index + 1}`,
      })) })] },
      baseCtx,
    )
    expect(nineCards.blocks.some((block) => block.type === 'flash_cards')).toBe(false)
    expect(nineCards.warnings.length).toBeGreaterThan(0)

    const emptyFront = normalizeChapterBlocks(
      { blocks: [...base, flashCardsBlock({ cards: [
        { front: '  ', back: '有标签' },
        { front: '无监督学习', back: '无标签' },
        { front: '强化学习', back: '奖励信号' },
      ] })] },
      baseCtx,
    )
    expect(emptyFront.blocks.some((block) => block.type === 'flash_cards')).toBe(false)
    expect(emptyFront.warnings.length).toBeGreaterThan(0)

    // 边界：恰好 8 张卡时保留
    const eightCards = normalizeChapterBlocks(
      { blocks: [...base, flashCardsBlock({ cards: Array.from({ length: 8 }, (_, index) => ({
        front: `术语${index + 1}`,
        back: `释义${index + 1}`,
      })) })] },
      baseCtx,
    )
    expect(eightCards.blocks.some((block) => block.type === 'flash_cards')).toBe(true)
  })

  it('drops flash_cards when front/back/hint exceed their char limits, with a warning', () => {
    const base = [explanationBlock(), citationBlock(), quizBlock(), exampleBlock()]
    const card = (overrides: Record<string, unknown>) => [
      { front: '监督学习', back: '有标签', ...overrides },
      { front: '无监督学习', back: '无标签' },
      { front: '强化学习', back: '奖励信号' },
    ]

    // front 121 字（上限 120）→ 丢弃
    const longFront = normalizeChapterBlocks(
      { blocks: [...base, flashCardsBlock({ cards: card({ front: '问'.repeat(121) }) })] },
      baseCtx,
    )
    expect(longFront.blocks.some((block) => block.type === 'flash_cards')).toBe(false)
    expect(longFront.warnings.length).toBeGreaterThan(0)

    // back 301 字（上限 300）→ 丢弃
    const longBack = normalizeChapterBlocks(
      { blocks: [...base, flashCardsBlock({ cards: card({ back: '答'.repeat(301) }) })] },
      baseCtx,
    )
    expect(longBack.blocks.some((block) => block.type === 'flash_cards')).toBe(false)
    expect(longBack.warnings.length).toBeGreaterThan(0)

    // hint 121 字（上限 120）→ 丢弃
    const longHint = normalizeChapterBlocks(
      { blocks: [...base, flashCardsBlock({ cards: card({ hint: '提示'.repeat(61) }) })] },
      baseCtx,
    )
    expect(longHint.blocks.some((block) => block.type === 'flash_cards')).toBe(false)
    expect(longHint.warnings.length).toBeGreaterThan(0)

    // 正向边界：front 120 / back 300 / hint 120 恰达上限 → 保留且字段原样
    const atLimit = normalizeChapterBlocks(
      { blocks: [...base, flashCardsBlock({ cards: card({
        front: '问'.repeat(120),
        back: '答'.repeat(300),
        hint: '提'.repeat(120),
      }) })] },
      baseCtx,
    )
    const kept = atLimit.blocks.find((block) => block.type === 'flash_cards')
    if (kept?.type !== 'flash_cards') throw new Error('flash_cards block missing')
    expect(kept.cards[0]).toEqual({
      front: '问'.repeat(120),
      back: '答'.repeat(300),
      hint: '提'.repeat(120),
    })
  })

  it('drops a figure with empty/overlong mermaid, script injection, or overlong caption, with a warning', () => {
    const base = [explanationBlock(), citationBlock(), quizBlock(), exampleBlock()]

    const emptyMermaid = normalizeChapterBlocks(
      { blocks: [...base, figureBlock({ mermaid: '' })] },
      baseCtx,
    )
    expect(emptyMermaid.blocks.some((block) => block.type === 'figure')).toBe(false)
    expect(emptyMermaid.warnings.length).toBeGreaterThan(0)

    const longMermaid = normalizeChapterBlocks(
      { blocks: [...base, figureBlock({ mermaid: `flowchart LR\n  ${'A-->B\n  '.repeat(400)}` })] },
      baseCtx,
    )
    expect(longMermaid.blocks.some((block) => block.type === 'figure')).toBe(false)
    expect(longMermaid.warnings.length).toBeGreaterThan(0)

    const scriptMermaid = normalizeChapterBlocks(
      { blocks: [...base, figureBlock({ mermaid: 'flowchart LR\n  A--><SCRIPT>alert(1)</SCRIPT>' })] },
      baseCtx,
    )
    expect(scriptMermaid.blocks.some((block) => block.type === 'figure')).toBe(false)
    expect(scriptMermaid.warnings.length).toBeGreaterThan(0)

    const longCaption = normalizeChapterBlocks(
      { blocks: [...base, figureBlock({ caption: '注'.repeat(121) })] },
      baseCtx,
    )
    expect(longCaption.blocks.some((block) => block.type === 'figure')).toBe(false)
    expect(longCaption.warnings.length).toBeGreaterThan(0)
  })
})

describe('normalizeChapterBlocks 章级 ≥4 类型硬要求与截断保护', () => {
  it('throws chapter_invalid when the chapter has only three block types', () => {
    expect(() => normalizeChapterBlocks(
      { blocks: [explanationBlock(), citationBlock(), quizBlock()] },
      baseCtx,
    )).toThrowError(ChapterValidationError)
    expect(() => normalizeChapterBlocks(
      { blocks: [explanationBlock(), citationBlock(), quizBlock()] },
      baseCtx,
    )).toThrowError(expect.objectContaining({ code: 'chapter_invalid' }))
  })

  it('keeps the only quiz/citation/explanation when trimming to a tight budget', () => {
    const longChapterEndingWithOnlyQuiz = {
      blocks: [
        explanationBlock(),
        citationBlock(),
        exampleBlock(),
        formulaBlock(),
        calloutBlock(),
        quizBlock(),
      ],
    }
    const tightCtx = { ...baseCtx, remainingBookBudget: 4 }
    const trimmed = normalizeChapterBlocks(longChapterEndingWithOnlyQuiz, tightCtx)

    expect(trimmed.blocks.some((block) => block.type === 'quiz')).toBe(true)
    expect(trimmed.blocks.length).toBeLessThanOrEqual(tightCtx.remainingBookBudget)
    // 优先从末尾裁掉非必备类型（callout、formula），保留 example 凑足 4 种类型
    expect(trimmed.blocks.map((block) => block.type)).toEqual([
      'explanation',
      'citation',
      'example',
      'quiz',
    ])
    expect(trimmed.warnings.some((warning) => warning.includes('预算'))).toBe(true)
  })

  it('throws chapter_invalid when the chapter still lacks four types after trimming', () => {
    // 预算 3 只能保住三种必备类型，复检时不足 4 种 → 整章无效
    expect(() => normalizeChapterBlocks(
      {
        blocks: [
          explanationBlock(),
          citationBlock(),
          exampleBlock(),
          formulaBlock(),
          calloutBlock(),
          quizBlock(),
        ],
      },
      { ...baseCtx, remainingBookBudget: 3 },
    )).toThrowError(expect.objectContaining({ code: 'chapter_invalid' }))
  })
})
