import { describe, expect, it } from 'vitest'
import { normalizeConceptLabel, projectBooksToMap } from './bookMapProjection'
import type { BookChapter, ConceptBlock, LearningBook, LearningEvidence, SourceAnchor } from '../types/learningBook'

const anchor: SourceAnchor = { sourceId: 'src-1', fileName: 'demo.pdf', pageRange: '1-2', excerpt: '' }

function conceptBlock(chapterId: string, overrides: Partial<ConceptBlock>): ConceptBlock {
  return {
    id: `blk-concept-${chapterId}`,
    type: 'concept',
    title: '概念',
    concepts: [],
    relations: [],
    ...overrides,
  } as ConceptBlock
}

function chapter(id: string, order: number, coreConceptId: string, blocks: ConceptBlock[]): BookChapter {
  return {
    id,
    title: `第${order}章`,
    order,
    objective: '',
    coreConceptId,
    estimatedMinutes: 6,
    sourceAnchors: [],
    status: 'ready',
    blocks,
  } as BookChapter
}

function evidence(conceptId: string, outcome: LearningEvidence['outcome'], createdAt: string): LearningEvidence {
  return {
    id: `ev-${conceptId}-${createdAt}`,
    chapterId: 'ch-1',
    conceptId,
    sourceBlockId: 'blk-quiz-1',
    statement: '',
    outcome,
    createdAt,
  }
}

interface BookSeed {
  id: string
  chapters: BookChapter[]
  evidence?: LearningEvidence[]
}

function book(seed: BookSeed): LearningBook {
  return {
    id: seed.id,
    chapters: seed.chapters,
    evidence: seed.evidence ?? [],
    quizAttempts: [],
  } as unknown as LearningBook
}

describe('normalizeConceptLabel', () => {
  it('trims, lowercases and folds fullwidth to halfwidth', () => {
    expect(normalizeConceptLabel('  Supervised Learning ')).toBe('supervised learning')
    expect(normalizeConceptLabel('Ｓｕｐｅｒｖｉｓｅｄ　Ｌｅａｒｎｉｎｇ')).toBe('supervised learning')
  })
})

describe('projectBooksToMap', () => {
  it('returns an empty projection for no books', () => {
    expect(projectBooksToMap([])).toEqual({ nodes: [], relationships: [] })
  })

  it('skips chapters without concept blocks and books without concepts', () => {
    const empty = book({ id: 'book-empty', chapters: [chapter('ch-1', 1, 'c-1', [])] })
    expect(projectBooksToMap([empty])).toEqual({ nodes: [], relationships: [] })
  })

  it('projects concepts as label-scoped nodes with the core concept at the cluster center', () => {
    const block = conceptBlock('ch-1', {
      concepts: [
        { id: 'c-core', label: '核心概念', description: '核心描述', learningState: '暂无学习记录' },
        { id: 'c-aux', label: '辅助概念', description: '辅助描述', learningState: '暂无学习记录' },
      ],
    })
    const theBook = book({ id: 'book-1', chapters: [chapter('ch-1', 1, 'c-core', [block])] })

    const { nodes } = projectBooksToMap([theBook])

    expect(nodes.map((node) => node.id).sort()).toEqual(['label:核心概念', 'label:辅助概念'])
    const core = nodes.find((node) => node.id === 'label:核心概念')!
    const aux = nodes.find((node) => node.id === 'label:辅助概念')!
    expect(core.size).toBe('medium')
    expect(aux.size).toBe('small')
    expect(core.label).toBe('核心概念')
    expect(core.summary).toBe('核心描述')
    // 单簇时核心概念落在地图中心
    expect([core.x, core.y]).toEqual([560, 470])
    expect(Math.hypot(aux.x - core.x, aux.y - core.y)).toBeGreaterThan(50)
  })

  it('merges same-label concepts across books into one node with the latest aggregated outcome', () => {
    const blockA = conceptBlock('ch-a', {
      concepts: [{ id: 'c-1', label: ' 监督学习 ', description: '甲书的写法', learningState: '暂无学习记录' }],
    })
    const blockB = conceptBlock('ch-b', {
      concepts: [{ id: 'c-9', label: '监督学习', description: '乙书的写法', learningState: '暂无学习记录' }],
    })
    const bookA = book({
      id: 'book-1',
      chapters: [chapter('ch-a', 1, 'c-1', [blockA])],
      evidence: [evidence('c-1', 'mastered', '2026-08-10T01:00:00.000Z')],
    })
    const bookB = book({
      id: 'book-2',
      chapters: [chapter('ch-b', 1, 'c-9', [blockB])],
      evidence: [evidence('c-9', 'review', '2026-08-11T01:00:00.000Z')],
    })

    const { nodes } = projectBooksToMap([bookA, bookB])

    expect(nodes).toHaveLength(1)
    expect(nodes[0].id).toBe('label:监督学习')
    expect(nodes[0].learningState).toBe('待复习') // 聚合后最新 outcome（乙书更近，review）
  })

  it('keeps candidate and confirmed relations, drops rejected ones, and scopes endpoints to merged nodes', () => {
    const block = conceptBlock('ch-1', {
      concepts: [
        { id: 'c-1', label: '甲', description: '', learningState: '暂无学习记录' },
        { id: 'c-2', label: '乙', description: '', learningState: '暂无学习记录' },
        { id: 'c-3', label: '丙', description: '', learningState: '暂无学习记录' },
      ],
      relations: [
        { id: 'r-1', sourceId: 'c-1', targetId: 'c-2', type: '前置', confidence: 0.8, status: '候选', sourceAnchor: anchor },
        { id: 'r-2', sourceId: 'c-2', targetId: 'c-3', type: '相似', confidence: 0.6, status: '已确认', sourceAnchor: anchor },
        { id: 'r-3', sourceId: 'c-1', targetId: 'c-3', type: '对比', confidence: 0.4, status: '已拒绝', sourceAnchor: anchor },
      ],
    })
    const theBook = book({ id: 'book-1', chapters: [chapter('ch-1', 1, 'c-1', [block])] })

    const { relationships } = projectBooksToMap([theBook])

    expect(relationships).toEqual([
      { from: 'label:甲', to: 'label:乙' },
      { from: 'label:乙', to: 'label:丙' },
    ])
  })

  it('derives node learning state from aggregated evidence: mastered → 已掌握, review → 待复习, none → 暂无学习记录', () => {
    const block = conceptBlock('ch-1', {
      concepts: [
        { id: 'c-1', label: '甲', description: '', learningState: '暂无学习记录' },
        { id: 'c-2', label: '乙', description: '', learningState: '暂无学习记录' },
        { id: 'c-3', label: '丙', description: '', learningState: '暂无学习记录' },
      ],
    })
    const theBook = book({
      id: 'book-1',
      chapters: [chapter('ch-1', 1, 'c-1', [block])],
      evidence: [
        evidence('c-1', 'mastered', '2026-08-10T01:00:00.000Z'),
        evidence('c-2', 'mastered', '2026-08-10T01:00:00.000Z'),
        evidence('c-2', 'review', '2026-08-11T01:00:00.000Z'),
      ],
    })

    const { nodes } = projectBooksToMap([theBook])

    expect(nodes.find((node) => node.id === 'label:甲')?.learningState).toBe('已掌握')
    expect(nodes.find((node) => node.id === 'label:乙')?.learningState).toBe('待复习')
    expect(nodes.find((node) => node.id === 'label:丙')?.learningState).toBe('暂无学习记录')
  })

  it('spreads multiple clusters deterministically without overlap', () => {
    const blockA = conceptBlock('ch-a', { concepts: [{ id: 'c-a', label: 'A', description: '', learningState: '暂无学习记录' }] })
    const blockB = conceptBlock('ch-b', { concepts: [{ id: 'c-b', label: 'B', description: '', learningState: '暂无学习记录' }] })
    const blockC = conceptBlock('ch-c', { concepts: [{ id: 'c-c', label: 'C', description: '', learningState: '暂无学习记录' }] })
    const bookOne = book({ id: 'book-1', chapters: [chapter('ch-a', 1, 'c-a', [blockA]), chapter('ch-b', 2, 'c-b', [blockB])] })
    const bookTwo = book({ id: 'book-2', chapters: [chapter('ch-c', 1, 'c-c', [blockC])] })

    const first = projectBooksToMap([bookOne, bookTwo])
    const second = projectBooksToMap([bookOne, bookTwo])

    expect(first).toEqual(second)
    const centers = ['label:a', 'label:b', 'label:c']
      .map((id) => first.nodes.find((node) => node.id === id)!)
    for (let i = 0; i < centers.length; i += 1) {
      for (let j = i + 1; j < centers.length; j += 1) {
        expect(Math.hypot(centers[i].x - centers[j].x, centers[i].y - centers[j].y)).toBeGreaterThan(200)
      }
    }
  })
})
