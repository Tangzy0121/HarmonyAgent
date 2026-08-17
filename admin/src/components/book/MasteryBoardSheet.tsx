import { useState } from 'react'
import { Icon } from '../Icon'
import type { MasteryBoardRow, MasteryState } from '../../domain/masteryBoard'
import type { BankItem, LearningBook } from '../../types/learningBook'

interface MasteryBoardSheetProps {
  rows: MasteryBoardRow[]
  onOpenConcept: (chapterId: string, blockId: string) => void
  onClose: () => void
  /** 题库（真实书）：传入后渲染题库区（错题优先），quiz 可原地重练、闪卡可自评 */
  book?: LearningBook
  bankItems?: BankItem[]
  onSubmitQuizAttempt?: (blockId: string, answerId: string) => Promise<boolean | void>
  onFlashGrade?: (blockId: string, result: 'remembered' | 'forgotten') => Promise<boolean | void>
}

const stateClassName: Record<MasteryState, string> = {
  未学: 'is-unlearned',
  起步: 'is-started',
  掌握中: 'is-learning',
  已掌握: 'is-mastered',
  待复习: 'is-review',
}

function BankQuizRow({ item, book, onSubmit }: {
  item: BankItem
  book: LearningBook
  onSubmit: (blockId: string, answerId: string) => Promise<boolean | void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [selected, setSelected] = useState('')
  const [failed, setFailed] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const quizBlock = book.chapters
    .find((chapter) => chapter.id === item.chapterId)
    ?.blocks.find((block) => block.id === item.blockId && block.type === 'quiz')
  const latestAttempt = book.quizAttempts
    .filter((attempt) => attempt.blockId === item.blockId)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0]

  const submit = () => {
    setIsSubmitting(true)
    setFailed(false)
    Promise.resolve(onSubmit(item.blockId, selected))
      .then((ok) => { if (ok === false) setFailed(true) })
      .catch(() => setFailed(true))
      .finally(() => setIsSubmitting(false))
  }

  return (
    <div className={`bank-sheet__item${item.wrong ? ' bank-sheet__item--wrong' : ''}`}>
      <button type="button" className="bank-sheet__item-head" onClick={() => setExpanded((open) => !open)} aria-expanded={expanded}>
        <span className="bank-sheet__kind">快速验证</span>
        <span className="bank-sheet__title">{item.title}</span>
        <span className="bank-sheet__stats">
          {item.wrong && <em className="bank-sheet__wrong">错题</em>}
          {item.attempts > 0 ? `答 ${item.attempts} 次 · ${Math.round(item.mastery * 100)}%` : '未作答'}
        </span>
      </button>
      {expanded && quizBlock?.type === 'quiz' && (
        <div className="bank-sheet__quiz">
          <div className="book-quiz__options">
            {quizBlock.options.map((option) => (
              <button
                type="button"
                key={option.id}
                className={selected === option.id ? 'is-selected' : ''}
                disabled={isSubmitting}
                onClick={() => setSelected(option.id)}
              ><span>{option.marker}</span>{option.text}</button>
            ))}
          </div>
          {latestAttempt && (
            <p className={`book-quiz__feedback ${latestAttempt.isCorrect ? 'is-correct' : ''}`} role="status">
              {latestAttempt.isCorrect ? '最近作答正确。' : '最近作答错误。'} {quizBlock.feedback}
            </p>
          )}
          {failed && <p className="book-quiz__feedback" role="alert">提交失败，请检查网络后重试。</p>}
          <button type="button" className="book-block__primary" disabled={!selected || isSubmitting} onClick={submit}>再练一次</button>
        </div>
      )}
    </div>
  )
}

/**
 * 掌握度看板（升级为「题库与掌握度」，规格 D）：
 * 题库区（错题优先、可重练/自评）+ 概念掌握度行；点击概念行由父级切章滚动。
 */
export function MasteryBoardSheet({ rows, onOpenConcept, onClose, book, bankItems, onSubmitQuizAttempt, onFlashGrade }: MasteryBoardSheetProps) {
  const groups: { chapterId: string; chapterTitle: string; rows: MasteryBoardRow[] }[] = []
  for (const row of rows) {
    const last = groups[groups.length - 1]
    if (last && last.chapterId === row.chapterId) last.rows.push(row)
    else groups.push({ chapterId: row.chapterId, chapterTitle: row.chapterTitle, rows: [row] })
  }

  const chapterTitleOf = (chapterId: string) => book?.chapters.find((chapter) => chapter.id === chapterId)?.title ?? chapterId
  const [gradeFeedback, setGradeFeedback] = useState<Record<string, string>>({})

  const grade = (blockId: string, result: 'remembered' | 'forgotten') => {
    if (!onFlashGrade) return
    Promise.resolve(onFlashGrade(blockId, result))
      .then((ok) => setGradeFeedback((current) => ({ ...current, [blockId]: ok === false ? 'failed' : result })))
      .catch(() => setGradeFeedback((current) => ({ ...current, [blockId]: 'failed' })))
  }

  return (
    <>
      <button
        type="button"
        className="pretest-sheet__scrim"
        aria-label="关闭掌握度看板"
        tabIndex={-1}
        onClick={onClose}
      />
      <aside className="pretest-sheet mastery-sheet" role="dialog" aria-modal="true" aria-labelledby="mastery-sheet-title">
        <div className="pretest-sheet__grip" aria-hidden="true" />
        <header className="pretest-sheet__heading">
          <div>
            <p>题库与掌握度</p>
            <h2 id="mastery-sheet-title">
              {bankItems && bankItems.length > 0 ? `${bankItems.length} 题 · ${rows.length} 个概念` : `${rows.length} 个概念`}
            </h2>
          </div>
          <button type="button" className="pretest-sheet__close" aria-label="关闭" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </header>

        {bankItems && book && onSubmitQuizAttempt && (
          <section className="bank-sheet" aria-label="题库">
            <h3 className="mastery-sheet__chapter-title">题库（错题优先）</h3>
            {bankItems.length === 0 ? (
              <p className="pretest-sheet__status">这本书还没有题目。章节生成后，快速验证题会收录到这里。</p>
            ) : (
              <div className="bank-sheet__items">
                {bankItems.map((item) => item.kind === 'quiz' ? (
                  <BankQuizRow key={item.blockId} item={item} book={book} onSubmit={onSubmitQuizAttempt} />
                ) : (
                  <div className="bank-sheet__item" key={item.blockId}>
                    <div className="bank-sheet__item-head">
                      <span className="bank-sheet__kind">闪卡</span>
                      <span className="bank-sheet__title">{item.title}</span>
                      <span className="bank-sheet__stats">
                        {item.schedule ? `第 ${item.schedule.stage} 档` : '未入调度'} · {chapterTitleOf(item.chapterId)}
                      </span>
                    </div>
                    {onFlashGrade && (
                      <div className="bank-sheet__grade">
                        <button type="button" className="review-sheet__grade-button" onClick={() => grade(item.blockId, 'forgotten')}>没记住</button>
                        <button type="button" className="review-sheet__grade-button is-remembered" onClick={() => grade(item.blockId, 'remembered')}>记住了</button>
                        {gradeFeedback[item.blockId] === 'failed' && <span role="alert">提交失败</span>}
                        {(gradeFeedback[item.blockId] === 'remembered' || gradeFeedback[item.blockId] === 'forgotten') && <span role="status">已记录</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {rows.length === 0 ? (
          <p className="pretest-sheet__status">这本书还没有概念块。</p>
        ) : (
          <div className="mastery-sheet__groups">
            {groups.map((group) => (
              <section key={group.chapterId} className="mastery-sheet__chapter">
                <h3 className="mastery-sheet__chapter-title">{group.chapterTitle}</h3>
                <div className="mastery-sheet__rows">
                  {group.rows.map((row) => (
                    <button
                      key={`${row.blockId}:${row.conceptId}`}
                      type="button"
                      className="mastery-sheet__row"
                      onClick={() => onOpenConcept(row.chapterId, row.blockId)}
                    >
                      <span className="mastery-sheet__label">{row.label}</span>
                      <span className={`mastery-sheet__badge ${stateClassName[row.state]}`}>{row.state}</span>
                      <span className="mastery-sheet__percent">{Math.round(row.mastery * 100)}%</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </aside>
    </>
  )
}
