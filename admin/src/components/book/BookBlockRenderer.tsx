import { useState } from 'react'
import { Icon } from '../Icon'
import { CalloutCard } from './CalloutCard'
import { FlashCards } from './FlashCards'
import { FigureBlockView } from './FigureBlockView'
import { KatexView } from './KatexView'
import { MathText } from './MathText'
import type { AttemptDiagnosis, BookBlock, DiagnosisType, LearningEvidence, QuizAttempt, QuizBlock, UserNote } from '../../types/learningBook'

interface BookBlockRendererProps {
  block: BookBlock
  note?: UserNote
  attempt?: QuizAttempt
  /** 答题对应的学习证据（最近一次作答的证据，答后随反馈展示） */
  evidence?: LearningEvidence
  /** 块级“重生成”按钮显隐：mock 书本地重生成可用；真实书块由服务端整章生成，不渲染 */
  allowBlockRegenerate?: boolean
  /** 答错后提供“重新作答”（真实书走服务端多次记录；mock 书保持单次作答） */
  allowQuizRetry?: boolean
  onRegenerate: (blockId: string) => void
  /** 返回 Promise 且 resolve false 或 reject 时视为提交失败（组件显示可重试的错误提示） */
  onSubmitQuiz: (blockId: string, answerId: string) => void | Promise<boolean | void>
  onUpdateNote: (noteId: string, body: string) => void
  onStartDeepLearning: (blockId: string) => void
  /** 缺省时隐藏「向 Agent 提问 / 带着诊断问 Agent」入口（如复习弹层内不复用 Agent 链路） */
  onAskAgent?: (blockId: string, draft?: string) => void
}

export function BookBlockRenderer({ block, note, attempt, evidence, allowBlockRegenerate = true, allowQuizRetry = false, onRegenerate, onSubmitQuiz, onUpdateNote, onStartDeepLearning, onAskAgent }: BookBlockRendererProps) {
  const [selectedAnswer, setSelectedAnswer] = useState(attempt?.answerId ?? '')
  // “重新作答”仅清除本次展示态：dismissedAttemptId 记录被点掉的作答，
  // 服务端返回新作答（id 不同）后自动回到结果视图
  const [dismissedAttemptId, setDismissedAttemptId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitFailed, setSubmitFailed] = useState(false)
  const visibleAttempt = attempt && attempt.id !== dismissedAttemptId ? attempt : undefined
  const canRegenerate = allowBlockRegenerate && block.type !== 'citation' && block.type !== 'user_note'

  const content = (() => {
    switch (block.type) {
      case 'explanation':
        return <><p><MathText text={block.body} /></p><aside className="book-block__key-point"><Icon name="spark" size={18} /><span>{block.keyPoint}</span></aside></>
      case 'example':
        return <><p><MathText text={block.scenario} /></p><p className="book-block__takeaway"><strong>带走一句：</strong>{block.takeaway}</p></>
      case 'formula':
        return <><div className="book-block__formula"><KatexView tex={block.formula} displayMode /></div><p><MathText text={block.explanation} /></p></>
      case 'citation':
        return <blockquote><p>“{block.excerpt}”</p><cite><Icon name="quote" size={15} />{block.location}</cite></blockquote>
      case 'concept':
        return <div className="book-concept-list">
          {block.concepts.map((concept) => (
            <article key={concept.id}>
              <span>{concept.label}</span><p>{concept.description}</p><small>{concept.learningState}</small>
            </article>
          ))}
          {block.relations.map((relation) => (
            <p className="book-concept-relation" key={relation.id}>
              {block.concepts.find((item) => item.id === relation.sourceId)?.label} → {relation.type} → {block.concepts.find((item) => item.id === relation.targetId)?.label}
            </p>
          ))}
        </div>
      case 'quiz': {
        const submitAnswer = () => {
          setIsSubmitting(true)
          setSubmitFailed(false)
          // mock 路径同步返回 undefined，真实书路径返回 Promise<boolean>；统一成 Promise 跟踪提交态与失败信号
          Promise.resolve(onSubmitQuiz(block.id, selectedAnswer))
            .then((ok) => { if (ok === false) setSubmitFailed(true) })
            .catch(() => setSubmitFailed(true))
            .finally(() => setIsSubmitting(false))
        }
        return <div className="book-quiz">
          <p className="book-quiz__question">{block.question}</p>
          <div className="book-quiz__options">
            {block.options.map((option) => (
              <button
                type="button"
                key={option.id}
                className={selectedAnswer === option.id ? 'is-selected' : ''}
                disabled={Boolean(visibleAttempt) || isSubmitting}
                onClick={() => setSelectedAnswer(option.id)}
              ><span>{option.marker}</span>{option.text}</button>
            ))}
          </div>
          {visibleAttempt ? (
            <>
              <p className={`book-quiz__feedback ${visibleAttempt.isCorrect ? 'is-correct' : ''}`} role="status">
                {visibleAttempt.isCorrect ? '回答正确。' : '这次还没有答对。'} {block.feedback}
              </p>
              {evidence && (
                <p className="book-quiz__evidence" role="status">已记录学习证据：{evidence.statement}</p>
              )}
              {!visibleAttempt.isCorrect && visibleAttempt.diagnosis && (
                <div className="book-quiz__diagnosis">
                  <span className="book-quiz__diagnosis-label">{DIAGNOSIS_LABELS[visibleAttempt.diagnosis.type]}</span>
                  <p>{visibleAttempt.diagnosis.advice}</p>
                  {onAskAgent && (
                    <button
                      type="button"
                      className="book-quiz__diagnosis-ask"
                      onClick={() => onAskAgent(block.id, diagnosisDraft(block, visibleAttempt.diagnosis!))}
                    >带着诊断问 Agent <Icon name="agent" size={15} /></button>
                  )}
                </div>
              )}
              {!visibleAttempt.isCorrect && allowQuizRetry && (
                <button
                  type="button"
                  className="book-block__primary"
                  onClick={() => {
                    setDismissedAttemptId(visibleAttempt.id)
                    setSelectedAnswer('')
                  }}
                >重新作答</button>
              )}
            </>
          ) : (
            <>
              {submitFailed && (
                <p className="book-quiz__feedback" role="alert">提交失败，请检查网络后重试。</p>
              )}
              <button type="button" className="book-block__primary" disabled={!selectedAnswer || isSubmitting} onClick={submitAnswer}>提交答案</button>
            </>
          )}
        </div>
      }
      case 'user_note':
        return <div className="book-user-note">
          <Icon name="note" size={19} />
          <textarea
            value={note?.body ?? ''}
            aria-label="我的学习笔记"
            placeholder="写下你的理解、疑问或例子。重新生成本章时，这条笔记仍会保留。"
            onChange={(event) => onUpdateNote(block.noteId, event.target.value)}
          />
        </div>
      case 'callout':
        return <CalloutCard block={block} />
      case 'flash_cards':
        return <FlashCards block={block} />
      case 'figure':
        return <FigureBlockView block={block} />
      default:
        return <p className="book-block__unsupported" role="alert">这一内容块暂不受当前版本支持，请稍后重试或重新生成本章。</p>
    }
  })()

  return (
    <article id={block.id} className={`book-block book-block--${block.type}`}>
      <header>
        <div><span className="book-block__type">{blockTypeLabel[block.type]}</span><h2>{block.title}</h2></div>
        {canRegenerate && <button type="button" onClick={() => onRegenerate(block.id)} aria-label={`重新生成${block.title}`}><Icon name="refresh" size={16} />重生成</button>}
      </header>
      {content}
      {onAskAgent && block.type !== 'quiz' && block.type !== 'user_note' && (
        <footer>
          <button type="button" onClick={() => onStartDeepLearning(block.id)}>深入学习这一段 <Icon name="arrow" size={15} /></button>
          <button type="button" className="book-block__ask-agent" onClick={() => onAskAgent(block.id)}>向 Agent 提问 <Icon name="agent" size={15} /></button>
        </footer>
      )}
    </article>
  )
}

/** 答错诊断的四类标签（与服务端 AttemptDiagnosis.type 对齐） */
const DIAGNOSIS_LABELS: Record<DiagnosisType, string> = {
  concept: '概念不清',
  application: '应用偏差',
  misread: '审题偏差',
  overconfident: '会但做错',
}

/** 「带着诊断问 Agent」的预填草稿：题干截断 + 诊断标签，要求引导式提问而非直接给答案 */
function diagnosisDraft(block: QuizBlock, diagnosis: AttemptDiagnosis): string {
  return `我刚才在这道题答错了：「${block.question.slice(0, 60)}」。错误类型是${DIAGNOSIS_LABELS[diagnosis.type]}。请用提问引导我，不要直接给答案。`
}

const blockTypeLabel: Record<BookBlock['type'], string> = {
  explanation: '核心讲解',
  example: '例子',
  formula: '公式',
  citation: '原文依据',
  concept: '知识节点',
  quiz: '快速验证',
  callout: '学习提示',
  flash_cards: '记忆闪卡',
  figure: '图解',
  user_note: '我的笔记',
}
