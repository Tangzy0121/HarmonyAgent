import { describe, expect, it } from 'vitest'

import { renderBookMarkdown } from './bookMarkdown.js'
import type { BookBlock, BookChapter, StoredBook } from './bookTypes.js'

const EXPORTED_AT = '2026-08-17T08:00:00.000Z'

function block(partial: Record<string, unknown>): BookBlock {
  return {
    id: `blk-${partial.type}`,
    status: 'ready',
    title: '块标题',
    revision: 1,
    sourceAnchors: [],
    ...partial,
  } as unknown as BookBlock
}

function chapter(id: string, order: number, title: string, status: BookChapter['status'], blocks: BookBlock[]): BookChapter {
  return {
    id,
    title,
    order,
    objective: `${title}的目标`,
    coreConceptId: 'c-1',
    estimatedMinutes: 6,
    sourceAnchors: [],
    status,
    blocks,
  }
}

function fixtureBook(): StoredBook {
  return {
    id: 'book_1',
    source: { id: 'doc_1', fileName: 'ml.pdf', format: 'PDF', pageCount: 20, sizeLabel: '1 MB', updatedLabel: '今天' },
    goal: '理解概念',
    learnerLevel: '入门',
    proposal: { title: '机器学习入门', description: 'd', rationale: 'r', estimatedMinutes: 30 },
    status: 'partial',
    chapters: [
      chapter('ch-1', 0, '监督学习', 'ready', [
        block({ type: 'explanation', body: '监督学习用带标签的数据训练。', keyPoint: '标签是关键' }),
        block({ type: 'citation', title: '原文依据', excerpt: 'labeled examples map inputs to outputs', location: '第 3 页' }),
        block({
          type: 'quiz', title: '小测', conceptId: 'c-1', question: '监督学习需要什么？',
          options: [
            { id: 'o1', marker: 'A', text: '带标签数据' },
            { id: 'o2', marker: 'B', text: '无标签数据' },
          ],
          correctAnswerId: 'o1', feedback: '标签提供学习目标。',
        }),
        block({ type: 'example', title: '例子', scenario: '垃圾邮件分类。', takeaway: '标签=是否为垃圾邮件' }),
        block({ type: 'formula', title: '公式', formula: 'y = wx + b', explanation: '线性模型' }),
        block({
          type: 'concept', title: '知识节点',
          concepts: [
            { id: 'c-1', label: '监督学习', description: '带标签学习', learningState: '暂无学习记录' },
            { id: 'c-2', label: '回归', description: '连续输出', learningState: '暂无学习记录' },
          ],
          relations: [
            { id: 'r-1', sourceId: 'c-1', targetId: 'c-2', type: '包含', confidence: 0.8, status: '候选', sourceAnchor: { sourceId: 'S1', fileName: 'ml.pdf', pageRange: '3', excerpt: '' } },
          ],
        }),
        block({ type: 'callout', title: '提示', kind: 'pitfall', body: '别把相关当因果。' }),
        block({ type: 'flash_cards', title: '闪卡', cards: [{ front: '什么是监督学习？', back: '带标签的学习', hint: '想标签' }] }),
        block({ type: 'figure', title: '图解', kind: 'flowchart', mermaid: 'graph TD; A-->B', caption: '流程' }),
      ]),
      chapter('ch-2', 1, '无监督学习', 'generating', [
        block({ type: 'explanation', body: '无监督学习发现结构。', keyPoint: '没有标签' }),
      ]),
    ],
    activeChapterId: 'ch-1',
    userNotes: [
      { id: 'note_1', chapterId: 'ch-1', blockId: 'blk-explanation', body: '类比：老师批改作业。', createdAt: '2026-08-16T01:00:00.000Z' },
      { id: 'note_2', chapterId: 'ch-1', blockId: 'blk-quiz', body: '这题容易混。', createdAt: '2026-08-16T02:00:00.000Z' },
    ],
    quizAttempts: [
      { id: 'att_1', chapterId: 'ch-1', blockId: 'blk-quiz', answerId: 'o1', isCorrect: true, submittedAt: '2026-08-16T03:00:00.000Z' },
    ],
    evidence: [
      { version: '1', id: 'ev_1', chapterId: 'ch-1', conceptId: 'c-1', sourceBlockId: 'blk-quiz', statement: '答对小测', outcome: 'mastered', createdAt: '2026-08-16T03:00:00.000Z', actor: 'user', receipt: 'sig' },
    ],
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-16T03:00:00.000Z',
    generationJobs: [],
  } as unknown as StoredBook
}

describe('renderBookMarkdown', () => {
  const md = renderBookMarkdown(fixtureBook(), EXPORTED_AT)

  it('renders the book header with source meta and AI disclaimer', () => {
    expect(md).toContain('# 《机器学习入门》')
    expect(md).toContain('来源：ml.pdf（20 页） · 学习目标：理解概念 · 当前基础：入门')
    expect(md).toContain(`导出于 ${EXPORTED_AT}`)
    expect(md).toContain('AI 生成内容请以原文为准')
  })

  it('renders chapters in order with objectives', () => {
    const ch1 = md.indexOf('## 第 1 章 监督学习')
    const ch2 = md.indexOf('## 第 2 章 无监督学习')
    expect(ch1).toBeGreaterThan(-1)
    expect(ch2).toBeGreaterThan(ch1)
    expect(md).toContain('监督学习的目标')
  })

  it('marks incomplete chapters with a warning', () => {
    const ch2Index = md.indexOf('## 第 2 章 无监督学习')
    const warningIndex = md.indexOf('> ⚠️ 本章生成中，内容可能不完整')
    expect(warningIndex).toBeGreaterThan(ch2Index)
  })

  it('renders explanation with key point callout', () => {
    expect(md).toContain('监督学习用带标签的数据训练。')
    expect(md).toContain('> 💡 标签是关键')
  })

  it('renders citations as quotes with page location', () => {
    expect(md).toContain('> “labeled examples map inputs to outputs”')
    expect(md).toContain('> —— 原文：第 3 页')
  })

  it('renders quiz with options, answer and feedback', () => {
    expect(md).toContain('监督学习需要什么？')
    expect(md).toContain('- A. 带标签数据')
    expect(md).toContain('- B. 无标签数据')
    expect(md).toContain('**答案：A** — 标签提供学习目标。')
  })

  it('renders formula in $$ fence, figure in mermaid fence, concept relations, flash cards', () => {
    expect(md).toContain('$$\ny = wx + b\n$$')
    expect(md).toContain('```mermaid\ngraph TD; A-->B\n```')
    expect(md).toContain('监督学习 →包含→ 回归（置信度 0.8，候选）')
    expect(md).toContain('什么是监督学习？')
    expect(md).toContain('带标签的学习')
  })

  it('attaches user notes to their block, clearly marked as user content', () => {
    expect(md).toContain('#### 我的笔记')
    expect(md).toContain('> 类比：老师批改作业。')
    expect(md).toContain('用户笔记')
  })

  it('appends a learning-record summary with counts', () => {
    expect(md).toContain('## 学习记录摘要')
    expect(md).toContain('答题 1 次')
    expect(md).toContain('学习证据 1 条')
  })
})
