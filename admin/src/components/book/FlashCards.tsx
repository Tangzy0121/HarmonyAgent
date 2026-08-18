import { useState } from 'react'
import type { FlashCardsBlock } from '../../types/learningBook'
import { MathText } from './MathText'

export function FlashCards({ block }: { block: FlashCardsBlock }) {
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const card = block.cards[index]

  if (!card) return null

  const goTo = (next: number) => {
    setIndex(next)
    setFlipped(false)
  }

  return (
    <div className="book-flashcards">
      <button
        type="button"
        className={`book-flashcards__card${flipped ? ' is-flipped' : ''}`}
        aria-pressed={flipped}
        onClick={() => setFlipped((value) => !value)}
      >
        <span className="book-flashcards__side">{flipped ? '背面' : '正面'}</span>
        <span className="book-flashcards__text"><MathText text={flipped ? card.back : card.front} /></span>
        {!flipped && card.hint && <span className="book-flashcards__hint">提示：{card.hint}</span>}
      </button>
      <div className="book-flashcards__controls">
        <button type="button" aria-label="上一张闪卡" disabled={index === 0} onClick={() => goTo(index - 1)}>‹</button>
        <span className="book-flashcards__position">{index + 1} / {block.cards.length}</span>
        <button type="button" aria-label="下一张闪卡" disabled={index === block.cards.length - 1} onClick={() => goTo(index + 1)}>›</button>
      </div>
    </div>
  )
}
