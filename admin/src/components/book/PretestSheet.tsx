import { useEffect, useState } from 'react'

import { BookApiError, getPretest, submitPretest } from '../../services/bookApi'
import type { BookChapter, BookPretest, LearningBook, PretestQuestion, PretestResult } from '../../types/learningBook'
import { Icon } from '../Icon'

interface PretestSheetProps {
  bookId: string
  chapters: BookChapter[]
  /** 书中已有的摸底数据（服务端幂等）：有结论直接展示、有题目直接作答，均不重复请求 */
  pretest?: BookPretest
  /** 提交成功：整书（含 pretest.result）回传父层合并 */
  onResolved: (book: LearningBook) => void
  /** 结论页“从建议章节开始”：父层负责跳章并开始生成 */
  onStartFromChapter: (chapterId: string) => void
  onClose: () => void
}

type SheetView =
  | { kind: 'loading' }
  | { kind: 'load_error' }
  | { kind: 'answering'; questions: PretestQuestion[] }
  | { kind: 'result'; questions: PretestQuestion[]; result: PretestResult }

const LOAD_ERROR_MESSAGE = '摸底题加载失败，请检查网络后重试。'
const SUBMIT_ERROR_MESSAGE = '摸底提交失败，请检查网络后重试。'

function initialView(pretest: BookPretest | undefined): SheetView {
  if (pretest?.result) return { kind: 'result', questions: pretest.questions, result: pretest.result }
  if (pretest && pretest.questions.length > 0) return { kind: 'answering', questions: pretest.questions }
  return { kind: 'loading' }
}

export function PretestSheet({ bookId, chapters, pretest, onResolved, onStartFromChapter, onClose }: PretestSheetProps) {
  const [view, setView] = useState<SheetView>(() => initialView(pretest))
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)

  // 仅当书中没有摸底数据时请求；服务端幂等，已生成则直接返回现存量
  useEffect(() => {
    if (pretest !== undefined) return
    let cancelled = false
    getPretest(bookId)
      .then((payload) => {
        if (cancelled) return
        setView(payload.result !== null
          ? { kind: 'result', questions: payload.questions, result: payload.result }
          : { kind: 'answering', questions: payload.questions })
      })
      .catch(() => {
        if (!cancelled) setView({ kind: 'load_error' })
      })
    return () => { cancelled = true }
  }, [bookId, pretest, loadAttempt])

  const allAnswered = view.kind === 'answering' && view.questions.every((question) => answers[question.id] !== undefined)

  const handleSubmit = () => {
    if (view.kind !== 'answering' || !allAnswered || submitting) return
    const { questions } = view
    setSubmitting(true)
    setSubmitError(null)
    submitPretest(bookId, answers)
      .then((book) => {
        onResolved(book)
        if (book.pretest?.result) {
          setView({ kind: 'result', questions, result: book.pretest.result })
        } else {
          setSubmitError(SUBMIT_ERROR_MESSAGE)
        }
      })
      .catch((error: unknown) => {
        setSubmitError(error instanceof BookApiError && error.code === 'pretest_unavailable'
          ? '这本书当前状态不支持摸底，可以直接开始生成。'
          : SUBMIT_ERROR_MESSAGE)
      })
      .finally(() => setSubmitting(false))
  }

  return (
    <>
      <button
        type="button"
        className="pretest-sheet__scrim"
        aria-label="关闭摸底面板"
        tabIndex={-1}
        onClick={onClose}
      />
      <aside className="pretest-sheet" role="dialog" aria-modal="true" aria-labelledby="pretest-sheet-title">
        <div className="pretest-sheet__grip" aria-hidden="true" />
        <header className="pretest-sheet__heading">
          <div>
            <p>摸底诊断</p>
            <h2 id="pretest-sheet-title">{view.kind === 'result' ? '摸底完成' : '先摸底（5 题）'}</h2>
          </div>
          <button type="button" className="pretest-sheet__close" aria-label="关闭" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </header>

        {view.kind === 'loading' && (
          <p className="pretest-sheet__status">正在准备摸底题…</p>
        )}

        {view.kind === 'load_error' && (
          <div className="pretest-sheet__status" role="alert">
            <p>{LOAD_ERROR_MESSAGE}</p>
            <button type="button" className="pretest-sheet__retry" onClick={() => setLoadAttempt((count) => count + 1)}>
              重新加载
            </button>
          </div>
        )}

        {view.kind === 'answering' && (
          <>
            <ol className="pretest-sheet__questions">
              {view.questions.map((question, index) => (
                <li key={question.id} className="pretest-sheet__question">
                  <h3>{index + 1}. {question.question}</h3>
                  <div className="pretest-sheet__options" role="group" aria-label={`第 ${index + 1} 题选项`}>
                    {question.options.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className="pretest-sheet__option"
                        aria-pressed={answers[question.id] === option.id}
                        onClick={() => setAnswers((current) => ({ ...current, [question.id]: option.id }))}
                      >
                        <strong>{option.marker}</strong>
                        <span>{option.text}</span>
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
            {submitError && (
              <p className="pretest-sheet__error" role="alert">{submitError}</p>
            )}
            <button
              type="button"
              className="pretest-sheet__submit"
              disabled={!allAnswered || submitting}
              onClick={handleSubmit}
            >
              {submitting ? '提交中…' : '提交摸底答案'}
            </button>
          </>
        )}

        {view.kind === 'result' && (() => {
          const { questions, result } = view
          const correctCount = questions.filter((question) => result.answers[question.id] === question.correctAnswerId).length
          const suggestedChapter = chapters.find((chapter) => chapter.id === result.suggestedStartChapterId) ?? chapters[0]
          const skippableChapters = chapters.filter((chapter) => result.skippableChapterIds.includes(chapter.id))
          return (
            <section className="pretest-sheet__result">
              <p className="pretest-sheet__score">答对 {correctCount}/{questions.length} 题</p>
              <p className="pretest-sheet__advice">
                建议从第 {suggestedChapter.order + 1} 章「{suggestedChapter.title}」开始
                {skippableChapters.length > 0 ? `，已掌握的 ${skippableChapters.length} 章可以跳过。` : '。'}
              </p>
              {skippableChapters.length > 0 && (
                <ul className="pretest-sheet__skippable">
                  {skippableChapters.map((chapter) => (
                    <li key={chapter.id}>
                      <Icon name="check" size={14} />
                      <span>{chapter.title}</span>
                      <em>可跳过</em>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                className="pretest-sheet__submit"
                onClick={() => onStartFromChapter(result.suggestedStartChapterId)}
              >
                从建议章节开始 <Icon name="arrow" size={17} />
              </button>
            </section>
          )
        })()}
      </aside>
    </>
  )
}
