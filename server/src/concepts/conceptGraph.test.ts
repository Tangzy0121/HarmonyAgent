import { describe, expect, it } from 'vitest'

import type { ConceptBlock, ConceptRelationCorrection, StoredBook } from '../books/bookTypes.js'
import {
  aggregateConcepts,
  aggregateRelations,
  applyCorrection,
  findRelation,
  matchCorrection,
} from './conceptGraph.js'

const ANCHOR = { sourceId: 'S1', fileName: 'a.pdf', pageRange: '1', excerpt: 'x' }

function conceptBlock(overrides: Partial<ConceptBlock> = {}): ConceptBlock {
  return {
    id: 'blk_c1',
    type: 'concept',
    status: 'ready',
    title: '概念',
    revision: 1,
    sourceAnchors: [],
    concepts: [
      { id: 'c_1', label: '梯度', description: '方向导数最大方向', learningState: '暂无学习记录' },
      { id: 'c_2', label: '学习率', description: '步长', learningState: '暂无学习记录' },
    ],
    relations: [
      { id: 'rel_1', sourceId: 'c_1', targetId: 'c_2', type: '应用', confidence: 0.8, status: '候选', sourceAnchor: ANCHOR },
    ],
    ...overrides,
  }
}

function seedBook(overrides: Partial<StoredBook> = {}): StoredBook {
  return {
    id: 'book_cg',
    source: { id: 'doc_1', fileName: 'a.pdf', format: 'PDF', pageCount: 4, sizeLabel: '', updatedLabel: '' },
    goal: '课程学习',
    learnerLevel: '了解',
    proposal: { title: 't', description: '', rationale: '', estimatedMinutes: 30 },
    status: 'ready',
    chapters: [
      { id: 'ch-1', title: '第一章', order: 1, objective: '', coreConceptId: '', estimatedMinutes: 10, sourceAnchors: [], status: 'ready', blocks: [conceptBlock()] },
    ],
    activeChapterId: 'ch-1',
    userNotes: [],
    quizAttempts: [],
    evidence: [],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    generationJobs: [],
    ...overrides,
  }
}

function correction(overrides: Partial<ConceptRelationCorrection> = {}): ConceptRelationCorrection {
  return {
    id: 'crc_1',
    relationId: 'rel_1',
    relationSourceId: 'c_1',
    relationTargetId: 'c_2',
    action: 'confirm',
    operator: { userId: 'local-user', workspaceId: 'local-workspace' },
    createdAt: '2026-08-10T00:00:00.000Z',
    ...overrides,
  }
}

describe('aggregateConcepts', () => {
  it('聚合概念并带章节/块定位；无投影时 mastery 为 null', () => {
    const concepts = aggregateConcepts(seedBook())
    expect(concepts).toHaveLength(2)
    expect(concepts[0]).toMatchObject({ id: 'c_1', chapterId: 'ch-1', blockId: 'blk_c1', mastery: null })
  })

  it('有投影时 mastery 取该概念最大值', () => {
    const book = seedBook({
      masteryProjectionReadModel: {
        e1: { evidenceId: 'e1', chapterId: 'ch-1', conceptId: 'c_1', sourceBlockId: 'b', mastery: { chapter: 0.5, concept: 0.6 }, status: 'projected', projectedAt: '2026-08-10T00:00:00.000Z' },
        e2: { evidenceId: 'e2', chapterId: 'ch-1', conceptId: 'c_1', sourceBlockId: 'b', mastery: { chapter: 0.9, concept: 0.85 }, status: 'projected', projectedAt: '2026-08-11T00:00:00.000Z' },
      },
    })
    const concept = aggregateConcepts(book).find((item) => item.id === 'c_1')
    expect(concept?.mastery).toBe(0.85)
  })
})

describe('aggregateRelations + 纠正覆盖层', () => {
  it('无纠正时原样聚合并带定位', () => {
    const relations = aggregateRelations(seedBook())
    expect(relations).toHaveLength(1)
    expect(relations[0]).toMatchObject({ id: 'rel_1', status: '候选', correctedBy: null, chapterId: 'ch-1' })
  })

  it('confirm 纠正把候选提升为已确认，原始关系不落改', () => {
    const book = seedBook({ relationCorrections: [correction()] })
    const relations = aggregateRelations(book)
    expect(relations[0].status).toBe('已确认')
    expect(relations[0].correctedBy).toBe('crc_1')
    // 原始存储不变
    const block = book.chapters[0].blocks[0] as ConceptBlock
    expect(block.relations[0].status).toBe('候选')
  })

  it('retype 纠正改类型并确认', () => {
    const book = seedBook({ relationCorrections: [correction({ action: 'retype', suggestedType: '对比' })] })
    const relations = aggregateRelations(book)
    expect(relations[0]).toMatchObject({ type: '对比', status: '已确认' })
  })

  it('reject 纠正标记已拒绝', () => {
    const book = seedBook({ relationCorrections: [correction({ action: 'reject' })] })
    expect(aggregateRelations(book)[0].status).toBe('已拒绝')
  })

  it('再生成改 relationId 后按 (sourceId,targetId) 回退匹配——纠正不被覆盖', () => {
    // 模拟再生成：同端点、新 ID 的关系
    const regenerated = conceptBlock({
      relations: [{ id: 'rel_NEW', sourceId: 'c_1', targetId: 'c_2', type: '应用', confidence: 0.7, status: '候选', sourceAnchor: ANCHOR }],
    })
    const book = seedBook({ relationCorrections: [correction({ action: 'reject' })] })
    book.chapters[0].blocks[0] = regenerated
    const relations = aggregateRelations(book)
    expect(relations[0].id).toBe('rel_NEW')
    expect(relations[0].status).toBe('已拒绝')
    expect(relations[0].correctedBy).toBe('crc_1')
  })
})

describe('matchCorrection / applyCorrection / findRelation', () => {
  it('relationId 优先于端点对', () => {
    const relation = { id: 'rel_1', sourceId: 'x', targetId: 'y', type: '前置' as const, confidence: 1, status: '候选' as const, sourceAnchor: ANCHOR }
    const byId = correction({ relationSourceId: 'a', relationTargetId: 'b' })
    expect(matchCorrection(relation, [byId])?.id).toBe('crc_1')
  })

  it('applyCorrection 不改原对象', () => {
    const relation = { id: 'r', sourceId: 'a', targetId: 'b', type: '前置' as const, confidence: 1, status: '候选' as const, sourceAnchor: ANCHOR }
    applyCorrection(relation, correction({ action: 'confirm' }))
    expect(relation.status).toBe('候选')
  })

  it('findRelation 命中与未命中', () => {
    const book = seedBook()
    expect(findRelation(book, 'rel_1')?.id).toBe('rel_1')
    expect(findRelation(book, 'rel_missing')).toBeNull()
  })
})
