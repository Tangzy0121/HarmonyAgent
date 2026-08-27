/**
 * M5a:StoredBook(wire) → LociProjectSummary 投影。
 * server 零改动,所有契约差异在此适配。
 *
 * 块 10 型 → UI 6 型映射终表:
 * | server type  | UI 去向                                                     |
 * | explanation  | blocks/explanation(body/keyPoint 直映)                      |
 * | example      | blocks/example(scenario/takeaway 直映)                      |
 * | formula      | blocks/formula_or_conclusion(formula + explanation→body)    |
 * | citation     | blocks/citation(excerpt 直映,location 暂丢,M5c SourceViewer 再接) |
 * | quiz         | blocks/quiz(options.label←text,correctOptionId←correctAnswerId,explanation←feedback) |
 * | concept      | 不进 blocks;聚合为 project.concepts/relations(概念图数据源) |
 * | flash_cards  | 不映射(M5d 复习流再接)                                     |
 * | figure       | 不映射(mermaid 图,M5c 再接)                                |
 * | callout      | 不映射(M5c 再接)                                           |
 * | user_note    | 不映射(笔记,M5c/d 再接)                                    |
 *
 * 概念学习状态映射:块内 learningState 打底(已学习→mastered、待复习→review、
 * 其余 learning),M5c 起再由 book.evidence 按概念最新 outcome 覆盖
 * (mastered 证据→mastered、review 证据→review;evidence 按写入顺序后写覆盖先写)。
 * 章 verified = 该章有 feynman 且 outcome=mastered 的证据。
 * server 无 feynman 块型:ready 章末合成一个 feynman 块(id `<chapterId>-feynman`),
 * 提交走 POST /:id/chapters/:cid/feynman(M5c);partial 章不合成(端点只接 ready)。
 * 概念关系映射:前置→depends_on、包含→part_of、相似→extends(近似归入)、
 * 对比→contrasts_with、应用→applies_to;status='已拒绝' 的关系不入图。
 *
 * 章任务态映射:pending→pending、generating→running、ready→ready、
 * partial→ready(章可读,个别块失败)、error→failed。
 *
 * M5d 接续:anchors 由章级+块级 sourceAnchors 按 sourceId 去重合成(precision 记 'page',
 * 供 SourceViewer 回跳);reviewConceptIds = 证据投影后仍处于 review 状态的概念
 * (概览「待复习」计数;ReviewPage 的 server 队列改由 review/due 驱动,不消费此字段)。
 * depth server 无此字段,固定派生 '系统学习';shortTitle 留空(消费侧 ?? title)。
 */
import {
  LociChapter,
  LociConcept,
  LociConceptRelation,
  LociEvidence,
  LociLearningBlock,
  LociProjectNotice,
  LociProjectSummary,
  LociQuizOption,
  LociSourceAnchor
} from '../../models/LociFixtures'
import {
  WireBookBlock,
  WireBookChapter,
  WireConceptItem,
  WireConceptRelation,
  WireLearningEvidence,
  WireQuizOption,
  WireSourceAnchor,
  WireStoredBook
} from './LociApiClient'

const MS_PER_DAY: number = 24 * 60 * 60 * 1000

/** updatedAt(ISO) → 今天/昨天/N 天前/更早。解析失败回退空串,不阻断加载。 */
function lastStudiedLabel(updatedAt: string): string {
  const time: number = Date.parse(updatedAt)
  if (isNaN(time)) {
    return ''
  }
  const now: Date = new Date()
  const then: Date = new Date(time)
  const startOfNow: number = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfThen: number = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime()
  const days: number = Math.round((startOfNow - startOfThen) / MS_PER_DAY)
  if (days <= 0) {
    return '今天'
  }
  if (days === 1) {
    return '昨天'
  }
  if (days < 30) {
    return `${days} 天前`
  }
  return '更早'
}

function mapBlockType(block: WireBookBlock): LociLearningBlock | null {
  const sourceIds: string[] = (block.sourceAnchors ?? []).map((anchor: WireSourceAnchor): string => anchor.sourceId)
  switch (block.type) {
    case 'explanation':
      return {
        id: block.id, type: 'explanation', title: block.title,
        body: block.body ?? '', keyPoint: block.keyPoint, sourceIds: sourceIds
      }
    case 'example':
      return {
        id: block.id, type: 'example', title: block.title,
        scenario: block.scenario ?? '', takeaway: block.takeaway, sourceIds: sourceIds
      }
    case 'formula':
      return {
        id: block.id, type: 'formula_or_conclusion', title: block.title,
        formula: block.formula ?? '', body: block.explanation ?? '', sourceIds: sourceIds
      }
    case 'citation':
      return {
        id: block.id, type: 'citation', title: block.title,
        excerpt: block.excerpt ?? '', sourceIds: sourceIds
      }
    case 'quiz':
      return {
        id: block.id, type: 'quiz', title: block.title,
        conceptId: block.conceptId, question: block.question ?? '',
        options: (block.options ?? []).map((option: WireQuizOption): LociQuizOption => {
          return { id: option.id, label: option.text }
        }),
        correctOptionId: block.correctAnswerId, explanation: block.feedback,
        sourceIds: sourceIds
      }
    default:
      // concept → 概念图聚合;flash_cards/figure/callout/user_note → M5c/d 再接(见头注释表)
      return null
  }
}

/** M5c 导出:章节生成 SSE 的 block 事件载荷逐块走同一映射,渐进渲染与详情投影保持一致。 */
export function mapWireBlock(block: WireBookBlock): LociLearningBlock | null {
  return mapBlockType(block)
}

function mapChapterTaskState(status: string): string {
  switch (status) {
    case 'pending': return 'pending'
    case 'generating': return 'running'
    case 'ready': return 'ready'
    case 'partial': return 'ready'
    case 'error': return 'failed'
    default: return 'pending'
  }
}

function mapConceptState(learningState: string): string {
  switch (learningState) {
    case '已学习': return 'mastered'
    case '待复习': return 'review'
    default: return 'learning'
  }
}

function mapRelationType(type: string): string {
  switch (type) {
    case '前置': return 'depends_on'
    case '包含': return 'part_of'
    case '对比': return 'contrasts_with'
    case '应用': return 'applies_to'
    case '相似': return 'extends'
    default: return 'extends'
  }
}

interface ConceptAggregation {
  concepts: LociConcept[]
  relations: LociConceptRelation[]
}

/** 跨章聚合 concept 块:同 id 概念合并 chapterIds/sourceIds;已拒绝关系剔除。 */
function aggregateConcepts(chapters: WireBookChapter[]): ConceptAggregation {
  const conceptById: Map<string, LociConcept> = new Map()
  const relations: LociConceptRelation[] = []
  chapters.forEach((chapter: WireBookChapter): void => {
    (chapter.blocks ?? []).forEach((block: WireBookBlock): void => {
      if (block.type !== 'concept') {
        return
      }
      (block.concepts ?? []).forEach((item: WireConceptItem): void => {
        const existing: LociConcept | undefined = conceptById.get(item.id)
        if (existing !== undefined) {
          if (!existing.chapterIds.includes(chapter.id)) {
            existing.chapterIds.push(chapter.id)
          }
          return
        }
        conceptById.set(item.id, {
          id: item.id,
          label: item.label,
          definition: item.description,
          state: mapConceptState(item.learningState),
          chapterIds: [chapter.id],
          sourceIds: (block.sourceAnchors ?? []).map((anchor: WireSourceAnchor): string => anchor.sourceId)
        })
      });
      (block.relations ?? []).forEach((relation: WireConceptRelation): void => {
        if (relation.status === '已拒绝') {
          return
        }
        relations.push({
          id: relation.id,
          from: relation.sourceId,
          to: relation.targetId,
          type: mapRelationType(relation.type),
          reason: '',
          sourceIds: [relation.sourceAnchor.sourceId]
        })
      })
    })
  })
  const concepts: LociConcept[] = []
  conceptById.forEach((concept: LociConcept): void => {
    concepts.push(concept)
  })
  return { concepts: concepts, relations: relations }
}

/** M5c:book.evidence 按写入顺序取各概念最新 outcome(server append-only,顺序即时间序)。 */
function latestOutcomeByConcept(evidence: WireLearningEvidence[]): Map<string, string> {
  const latest: Map<string, string> = new Map()
  evidence.forEach((item: WireLearningEvidence): void => {
    latest.set(item.conceptId, item.outcome)
  })
  return latest
}

/** M5c:wire evidence → 章末总结证据条;outcome mastered→supports,其余→weakness。 */
function mapEvidence(item: WireLearningEvidence): LociEvidence {
  const kindLabel: string = item.kind === 'feynman' ? '费曼讲述' : item.kind === 'review' ? '复习' : '小测'
  return {
    id: item.id,
    conceptId: item.conceptId,
    chapterId: item.chapterId,
    kind: item.kind,
    result: item.outcome === 'mastered' ? 'supports' : 'weakness',
    summary: item.statement,
    occurredAt: item.createdAt.substring(0, 10),
    sourceEventLabel: kindLabel,
    sourceIds: []
  }
}

/** M5c:server 无 feynman 块型,ready/partial 章末合成章末验证入口(提交走章级 feynman 端点)。 */
function synthesizeFeynmanBlock(chapter: WireBookChapter): LociLearningBlock {
  return {
    id: `${chapter.id}-feynman`,
    type: 'feynman',
    title: '费曼讲述',
    prompt: `合上资料,用自己的话把「${chapter.title}」讲给一个不了解这个主题的人。`,
    sourceIds: []
  }
}

/** M5d:章级+块级 sourceAnchors 按 sourceId 去重合成 UI anchors(SourceViewer 回跳数据源)。 */
function collectAnchors(book: WireStoredBook, chapters: WireBookChapter[]): LociSourceAnchor[] {
  const seen: Set<string> = new Set()
  const anchors: LociSourceAnchor[] = []
  const push = (anchor: WireSourceAnchor): void => {
    if (seen.has(anchor.sourceId)) {
      return
    }
    seen.add(anchor.sourceId)
    anchors.push({
      id: anchor.sourceId,
      documentId: book.source.id,
      location: anchor.pageRange,
      excerpt: anchor.excerpt,
      precision: 'page'
    })
  }
  chapters.forEach((chapter: WireBookChapter): void => {
    (chapter.sourceAnchors ?? []).forEach(push);
    (chapter.blocks ?? []).forEach((block: WireBookBlock): void => {
      (block.sourceAnchors ?? []).forEach(push)
    })
  })
  return anchors
}

/** book 5 态 → 项目 7 态(partial 的 notice 单独在 mapBook 里挂)。 */function mapProjectStatus(book: WireStoredBook, visitedIds: string[]): string {
  switch (book.status) {
    case 'proposal':
      return 'plan_ready'
    case 'generating': {
      const hasReadable: boolean = book.chapters.some((chapter: WireBookChapter): boolean =>
        chapter.status === 'ready' || chapter.status === 'partial')
      return hasReadable ? 'active' : 'preparing'
    }
    case 'partial':
      return 'active'
    case 'ready': {
      const allVisited: boolean = book.chapters.length > 0 &&
        book.chapters.every((chapter: WireBookChapter): boolean => visitedIds.includes(chapter.id))
      return allVisited ? 'completed' : 'active'
    }
    case 'error':
      return 'blocked'
    default:
      return 'active'
  }
}

export function mapBookToProject(book: WireStoredBook): LociProjectSummary {
  const visitedIds: string[] = book.readingProgress?.visitedChapterIds ?? []
  const bookmarkedIds: string[] = book.readingProgress?.bookmarkedChapterIds ?? []
  const evidence: WireLearningEvidence[] = book.evidence ?? []
  const latestOutcome: Map<string, string> = latestOutcomeByConcept(evidence)
  // server order 1 基 → 排序后 UI 数组下标 0 基
  const sortedChapters: WireBookChapter[] = book.chapters.slice()
    .sort((a: WireBookChapter, b: WireBookChapter): number => a.order - b.order)
  const chapters: LociChapter[] = sortedChapters.map((chapter: WireBookChapter,
    index: number): LociChapter => {
    const blocks: LociLearningBlock[] = (chapter.blocks ?? [])
      .filter((block: WireBookBlock): boolean => block.status !== 'hidden')
      .map((block: WireBookBlock): LociLearningBlock | null => mapBlockType(block))
      .filter((block: LociLearningBlock | null): boolean => block !== null)
      .map((block: LociLearningBlock | null): LociLearningBlock => block as LociLearningBlock)
    if (chapter.status === 'ready') {
      // partial 章块不全,server feynman 端点也只接 ready(409 chapter_not_generatable)
      blocks.push(synthesizeFeynmanBlock(chapter))
    }
    const mapped: LociChapter = {
      id: chapter.id,
      order: index,
      title: chapter.title,
      estimatedMinutes: chapter.estimatedMinutes,
      taskState: mapChapterTaskState(chapter.status),
      read: visitedIds.includes(chapter.id),
      bookmarked: bookmarkedIds.includes(chapter.id),
      objective: chapter.objective,
      sourceRange: (chapter.sourceAnchors ?? []).length > 0 ? chapter.sourceAnchors[0].pageRange : undefined,
      verified: evidence.some((item: WireLearningEvidence): boolean =>
        item.chapterId === chapter.id && item.kind === 'feynman' && item.outcome === 'mastered'),
      blocks: blocks
    }
    return mapped
  })
  const aggregation: ConceptAggregation = aggregateConcepts(sortedChapters)
  // M5c:概念状态由学习证据驱动(块内 learningState 只是生成时快照)
  aggregation.concepts.forEach((concept: LociConcept): void => {
    const outcome: string | undefined = latestOutcome.get(concept.id)
    if (outcome === 'mastered') {
      concept.state = 'mastered'
    } else if (outcome === 'review') {
      concept.state = 'review'
    }
  })
  const project: LociProjectSummary = {
    id: book.id,
    title: book.proposal.title,
    goal: book.goal,
    level: book.learnerLevel,
    depth: '系统学习',
    source: {
      id: book.source.id,
      name: book.source.fileName,
      format: book.source.format,
      size: book.source.sizeLabel
    },
    status: mapProjectStatus(book, visitedIds),
    lastStudiedLabel: lastStudiedLabel(book.updatedAt),
    chapters: chapters,
    lastChapterId: book.activeChapterId.length > 0 ? book.activeChapterId : undefined,
    concepts: aggregation.concepts,
    relations: aggregation.relations,
    evidence: evidence.map((item: WireLearningEvidence): LociEvidence => mapEvidence(item)),
    anchors: collectAnchors(book, sortedChapters),
    reviewConceptIds: aggregation.concepts
      .filter((concept: LociConcept): boolean => concept.state === 'review')
      .map((concept: LociConcept): string => concept.id)
  }
  if (book.status === 'partial') {
    const notice: LociProjectNotice = {
      id: `partial-${book.id}`,
      tone: 'warning',
      title: '部分章节生成失败',
      detail: '失败章节可在项目概览中重试生成,已生成章节不受影响。',
      actionLabel: '查看项目'
    }
    project.notice = notice
  }
  return project
}

export function mapBooksToProjects(books: WireStoredBook[]): LociProjectSummary[] {
  return books.map((book: WireStoredBook): LociProjectSummary => mapBookToProject(book))
}
