import type {
  ConceptBlock,
  ConceptItem,
  ConceptRelation,
  ConceptRelationCorrection,
  StoredBook,
} from '../books/bookTypes.js'

/** 聚合后的概念（附所在章节/块与投影掌握度） */
export interface AggregatedConcept extends ConceptItem {
  chapterId: string
  blockId: string
  /** 掌握投影读模型的 concept 掌握度；无投影为 null */
  mastery: number | null
}

/** 聚合后的关系（附所在章节/块与纠正标记） */
export interface AggregatedRelation extends ConceptRelation {
  chapterId: string
  blockId: string
  /** 命中的纠正 ID；无纠正为 null */
  correctedBy: string | null
}

function conceptBlocks(book: StoredBook): Array<{ chapterId: string; block: ConceptBlock }> {
  return book.chapters.flatMap((chapter) =>
    chapter.blocks
      .filter((block): block is ConceptBlock => block.type === 'concept')
      .map((block) => ({ chapterId: chapter.id, block })))
}

export function aggregateConcepts(book: StoredBook): AggregatedConcept[] {
  const projection = book.masteryProjectionReadModel ?? {}
  return conceptBlocks(book).flatMap(({ chapterId, block }) =>
    block.concepts.map((concept) => {
      const entries = Object.values(projection).filter((entry) => entry.conceptId === concept.id)
      const mastery = entries.length === 0
        ? null
        : Math.max(...entries.map((entry) => entry.mastery.concept))
      return { ...concept, chapterId, blockId: block.id, mastery }
    }))
}

/** 纠正匹配：优先 relationId，再按 (sourceId,targetId) 对回退（再生成改 ID 时纠正仍生效） */
export function matchCorrection(
  relation: ConceptRelation,
  corrections: ConceptRelationCorrection[],
): ConceptRelationCorrection | null {
  return corrections.find((correction) => correction.relationId === relation.id)
    ?? corrections.find((correction) =>
      correction.relationSourceId === relation.sourceId &&
      correction.relationTargetId === relation.targetId)
    ?? null
}

/** 应用单条纠正，返回覆盖后的关系副本（不改原对象） */
export function applyCorrection(
  relation: ConceptRelation,
  correction: ConceptRelationCorrection,
): ConceptRelation {
  switch (correction.action) {
    case 'confirm':
      return { ...relation, status: '已确认' }
    case 'reject':
      return { ...relation, status: '已拒绝' }
    case 'retype':
      return correction.suggestedType === undefined
        ? relation
        : { ...relation, type: correction.suggestedType, status: '已确认' }
    default:
      return relation
  }
}

/** 聚合全书关系并应用纠正覆盖层；原始生成记录不落改 */
export function aggregateRelations(book: StoredBook): AggregatedRelation[] {
  const corrections = book.relationCorrections ?? []
  return conceptBlocks(book).flatMap(({ chapterId, block }) =>
    block.relations.map((relation) => {
      const correction = matchCorrection(relation, corrections)
      const projected = correction ? applyCorrection(relation, correction) : relation
      return { ...projected, chapterId, blockId: block.id, correctedBy: correction?.id ?? null }
    }))
}

/** 在全书关系中定位一条（供纠正写入前校验存在性） */
export function findRelation(
  book: StoredBook,
  relationId: string,
): ConceptRelation | null {
  for (const { block } of conceptBlocks(book)) {
    const found = block.relations.find((relation) => relation.id === relationId)
    if (found) return found
  }
  return null
}
