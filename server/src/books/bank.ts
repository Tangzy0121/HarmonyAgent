import { computeMastery } from './mastery.js'
import type { StoredBook } from './bookTypes.js'

export interface BankItemSchedule {
  stage: number
  dueAt: string
}

export interface BankItem {
  blockId: string
  chapterId: string
  kind: 'quiz' | 'flash_cards'
  /** 题干预览 / 卡片正面 */
  title: string
  conceptId: string | null
  conceptLabel: string | null
  attempts: number
  lastCorrect: boolean | null
  mastery: number
  schedule: BankItemSchedule | null
  /** 最近作答为错 → 错题优先排序（规格 §4） */
  wrong: boolean
}

/**
 * 题库派生读模型（规格 §4）：quiz 块 + flash_cards 块 + 用户问答卡，
 * 实时派生不落表；错题优先，其次掌握度升序、blockId 稳定序。
 */
export function buildBankItems(book: StoredBook): BankItem[] {
  const labelByConceptId = new Map<string, string>()
  for (const chapter of book.chapters) {
    for (const block of chapter.blocks) {
      if (block.type !== 'concept') continue
      for (const concept of block.concepts) {
        labelByConceptId.set(concept.id, concept.label)
      }
    }
  }

  const schedule = book.reviewSchedule ?? {}
  const items: BankItem[] = []

  for (const chapter of book.chapters) {
    for (const block of chapter.blocks) {
      if (block.type !== 'quiz' && block.type !== 'flash_cards') continue
      const entry = schedule[block.id]
      if (block.type === 'quiz') {
        const attempts = book.quizAttempts.filter((attempt) => attempt.blockId === block.id)
        const latest = attempts.length === 0
          ? null
          : attempts.reduce((a, b) => (b.submittedAt >= a.submittedAt ? b : a))
        items.push({
          blockId: block.id,
          chapterId: chapter.id,
          kind: 'quiz',
          title: block.question || block.title,
          conceptId: block.conceptId,
          conceptLabel: labelByConceptId.get(block.conceptId) ?? null,
          attempts: attempts.length,
          lastCorrect: latest?.isCorrect ?? null,
          mastery: computeMastery(attempts),
          schedule: entry ? { stage: entry.stage, dueAt: entry.dueAt } : null,
          wrong: latest !== null && !latest.isCorrect,
        })
      } else {
        items.push({
          blockId: block.id,
          chapterId: chapter.id,
          kind: 'flash_cards',
          title: block.title,
          conceptId: null,
          conceptLabel: null,
          attempts: 0,
          lastCorrect: null,
          mastery: 0,
          schedule: entry ? { stage: entry.stage, dueAt: entry.dueAt } : null,
          wrong: false,
        })
      }
    }
  }

  // 用户问答卡（对话沉淀）：按闪卡条目收录
  for (const card of book.userCards ?? []) {
    const entry = schedule[card.id]
    items.push({
      blockId: card.id,
      chapterId: card.chapterId,
      kind: 'flash_cards',
      title: card.front,
      conceptId: null,
      conceptLabel: null,
      attempts: 0,
      lastCorrect: null,
      mastery: 0,
      schedule: entry ? { stage: entry.stage, dueAt: entry.dueAt } : null,
      wrong: false,
    })
  }

  return items.sort((a, b) =>
    Number(b.wrong) - Number(a.wrong)
    || a.mastery - b.mastery
    || a.blockId.localeCompare(b.blockId))
}
