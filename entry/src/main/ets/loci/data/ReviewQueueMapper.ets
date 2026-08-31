import { LociQuizOption } from '../../models/LociModels'
import {
  LociReviewCard,
  LociReviewQueueItem,
  LociReviewQuiz
} from '../../models/LociServiceModels'
import {
  WireBookBlock,
  WireBookChapter,
  WireFlashCard,
  WireQuizOption,
  WireReviewDueItem,
  WireStoredBook
} from './LociApiClient'

const REVIEW_QUEUE_CAP: number = 5

function mapCards(cards: WireFlashCard[]): LociReviewCard[] {
  return cards.map((card: WireFlashCard): LociReviewCard => {
    return { front: card.front, back: card.back, hint: card.hint } as LociReviewCard
  })
}

function mapQuiz(block: WireBookBlock): LociReviewQuiz {
  const options: LociQuizOption[] = (block.options ?? []).map(
    (option: WireQuizOption): LociQuizOption => {
      return { id: option.id, label: option.text }
    })
  return {
    kindLabel: '复习小测',
    question: block.question ?? '',
    options: options,
    correctOptionId: block.correctAnswerId ?? '',
    explanation: block.feedback ?? ''
  } as LociReviewQuiz
}

function mapDueItem(dueItem: WireReviewDueItem,
  book: WireStoredBook | undefined): LociReviewQueueItem | null {
  const chapter: WireBookChapter | undefined = book?.chapters.find(
    (entry: WireBookChapter): boolean => entry.id === dueItem.chapterId)
  const block: WireBookBlock | undefined = (chapter?.blocks ?? []).find(
    (entry: WireBookBlock): boolean => entry.id === dueItem.blockId)
  if (block === undefined) {
    return null
  }
  const anchorId: string = block.sourceAnchors.length > 0 ? block.sourceAnchors[0].sourceId : ''
  if (dueItem.kind === 'flash_cards') {
    const cards: LociReviewCard[] = mapCards(block.cards ?? [])
    if (cards.length === 0) {
      return null
    }
    return {
      key: dueItem.blockId,
      label: block.title.length > 0 ? block.title : dueItem.title,
      reveal: cards.map((card: LociReviewCard): string => card.back).join('\n'),
      kind: 'flash_cards',
      blockId: dueItem.blockId,
      quiz: null,
      cards: cards,
      anchorId: anchorId
    } as LociReviewQueueItem
  }
  if (block.type !== 'quiz') {
    return null
  }
  return {
    key: dueItem.blockId,
    label: block.title.length > 0 ? block.title : dueItem.title,
    reveal: block.feedback ?? '',
    kind: 'quiz',
    blockId: dueItem.blockId,
    quiz: mapQuiz(block),
    cards: [],
    anchorId: anchorId
  } as LociReviewQueueItem
}

/** 将服务端到期队列投影为页面模型，并在边界处丢弃失配项。 */
export function mapReviewQueue(due: WireReviewDueItem[],
  book: WireStoredBook | undefined): LociReviewQueueItem[] {
  const items: LociReviewQueueItem[] = []
  due.slice(0, REVIEW_QUEUE_CAP).forEach((dueItem: WireReviewDueItem): void => {
    const item: LociReviewQueueItem | null = mapDueItem(dueItem, book)
    if (item !== null) {
      items.push(item)
    }
  })
  return items
}
