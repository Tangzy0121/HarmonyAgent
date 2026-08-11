import { useState } from 'react'
import { Icon } from '../Icon'
import { CalloutCard } from './CalloutCard'
import { FlashCards } from './FlashCards'
import { FigureBlockView } from './FigureBlockView'
import { KatexView } from './KatexView'
import { MathText } from './MathText'
import type { BookBlock, LearningEvidence, QuizAttempt, UserNote } from '../../types/learningBook'

interface BookBlockRendererProps {
  block: BookBlock
  note?: UserNote
  attempt?: QuizAttempt
  /** 答题对应的学习证据（客户端会话内记录，答后随反馈展示） */
  evidence?: LearningEvidence
  /** 块级“重生成”按钮显隐：mock 书本地重生成可用；真实书块由服务端整章生成，不渲染 */
  allowBlockRegenerate?: boolean
  onRegenerate: (blockId: string) => void
  onSubmitQuiz: (blockId: string, answerId: string) => void
  onUpdateNote: (noteId: string, body: string) => void
  onStartDeepLearning: (blockId: string) => void
  onAskAgent: (blockId: string) => void
}

export function BookBlockRenderer({ block, note, attempt, evidence, allowBlockRegenerate = true, onRegenerate, onSubmitQuiz, onUpdateNote, onStartDeepLearning, onAskAgent }: BookBlockRendererProps) {
  const [selectedAnswer, setSelectedAnswer] = useState(attempt?.answerId ?? '')
  const canRegenerate = allowBlockRegenerate && block.type !== 'citation' && block.type !== 'user_note'

  const content = (() => {
    switch (block.type) {
      case 'explanation':
        return <><p><MathText text={block.body} /></p><aside className="book-block__key-point"><Icon name="spark" size={18} /><span>{block.keyPoint}</span></aside></>
      case 'example':
        return <><p><MathText text={block.scenario} /></p><p className="book-block__takeaway"><strong>带走一句：</strong>{block.takeaway}</p></>
      case 'formula':
        return <><div className="book-block__formula"><KatexView tex={block.formula} displayMode /></div><p>{block.explanation}</p></>
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
      case 'quiz':
        return <div className="book-quiz">
          <p className="book-quiz__question">{block.question}</p>
          <div className="book-quiz__options">
            {block.options.map((option) => (
              <button
                type="button"
                key={option.id}
                className={selectedAnswer === option.id ? 'is-selected' : ''}
                disabled={Boolean(attempt)}
                onClick={() => setSelectedAnswer(option.id)}
              ><span>{option.marker}</span>{option.text}</button>
            ))}
          </div>
          {attempt ? (
            <>
              <p className={`book-quiz__feedback ${attempt.isCorrect ? 'is-correct' : ''}`} role="status">
                {attempt.isCorrect ? '回答正确。' : '这次还没有答对。'} {block.feedback}
              </p>
              {evidence && (
                <p className="book-quiz__evidence" role="status">已记录学习证据：{evidence.statement}</p>
              )}
            </>
          ) : (
            <button type="button" className="book-block__primary" disabled={!selectedAnswer} onClick={() => onSubmitQuiz(block.id, selectedAnswer)}>提交答案</button>
          )}
        </div>
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
      {block.type !== 'quiz' && block.type !== 'user_note' && (
        <footer>
          <button type="button" onClick={() => onStartDeepLearning(block.id)}>深入学习这一段 <Icon name="arrow" size={15} /></button>
          <button type="button" className="book-block__ask-agent" onClick={() => onAskAgent(block.id)}>向 Agent 提问 <Icon name="agent" size={15} /></button>
        </footer>
      )}
    </article>
  )
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
