import { useState } from 'react'

import { usePrototype } from '../../app/PrototypeContext'
import type { FeynmanBlock, LearningBlock, QuizBlock } from '../../types/product'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'

function SourceLinks({ sourceIds }: { sourceIds: string[] }) {
  const { dispatch } = usePrototype()
  return <div className="source-links">{sourceIds.map((sourceId, index) => <button key={sourceId} type="button" onClick={() => dispatch({ type: 'open_source', anchorId: sourceId })}><Icon name="source" size={14} />资料依据 {index + 1}</button>)}</div>
}

function Quiz({ block }: { block: QuizBlock }) {
  const [answer, setAnswer] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const correct = submitted && answer === block.correctOptionId
  return (
    <section className="learning-block learning-block--quiz" id={block.id}>
      <header><p className="block-kicker">小测 · 正式学习证据</p><h3>{block.title}</h3></header>
      <p className="quiz-question">{block.question}</p>
      <div className="quiz-options">{block.options.map((option, index) => <button key={option.id} type="button" aria-pressed={answer === option.id} className={submitted && option.id === block.correctOptionId ? 'is-correct' : submitted && answer === option.id ? 'is-wrong' : ''} disabled={submitted} onClick={() => setAnswer(option.id)}><span>{String.fromCharCode(65 + index)}</span>{option.label}</button>)}</div>
      {!submitted ? <Button variant="primary" disabled={!answer} onClick={() => setSubmitted(true)}>提交回答</Button> : <div className={`inline-feedback ${correct ? 'inline-feedback--success' : 'inline-feedback--review'}`}><span><Icon name={correct ? 'check' : 'warning'} size={18} /></span><div><strong>{correct ? '回答正确，已保存一条证据' : '这里还有一个关键混淆'}</strong><p>{block.explanation}</p><SourceLinks sourceIds={block.sourceIds} />{!correct && <button type="button" onClick={() => { setAnswer(null); setSubmitted(false) }}>重新作答</button>}</div></div>}
    </section>
  )
}

function Feynman({ block }: { block: FeynmanBlock }) {
  const [body, setBody] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const passed = body.trim().length >= 40
  return (
    <section className="learning-block learning-block--feynman" id={block.id}>
      <header><p className="block-kicker">费曼讲述 · 章末验证</p><h3>{block.title}</h3><span>{block.prompt}</span></header>
      {!submitted ? <><textarea rows={6} value={body} placeholder="合上资料，用自己的话讲给一个不了解这个主题的人…" onChange={(event) => setBody(event.target.value)} /><div className="feynman-meta"><span>{body.length} 字</span><Button variant="primary" disabled={!body.trim()} onClick={() => setSubmitted(true)}>提交讲述</Button></div></> : <div className={`inline-feedback ${passed ? 'inline-feedback--success' : 'inline-feedback--review'}`}><span><Icon name={passed ? 'check' : 'warning'} size={18} /></span><div><strong>{passed ? '已经覆盖关键链路' : '方向正确，但还缺一个环节'}</strong><p>{passed ? '你说明了目标、偏差和更新之间的关系。下一步可以用一个新的例子检验迁移。' : '请补充预测和目标如何形成损失，以及损失为什么能影响参数更新。'}</p><SourceLinks sourceIds={block.sourceIds} />{!passed && <button type="button" onClick={() => setSubmitted(false)}>回到讲述</button>}</div></div>}
    </section>
  )
}

export function LearningBlockView({ block }: { block: LearningBlock }) {
  const { state, dispatch } = usePrototype()
  if (block.type === 'quiz') return <Quiz block={block} />
  if (block.type === 'feynman') return <Feynman block={block} />

  if (block.type === 'explanation') return (
    <section className="learning-block learning-block--explanation" id={block.id}>
      <header><p className="block-kicker">讲解</p><h3>{block.title}</h3></header>
      <p>{block.body}</p>
      <blockquote><strong>关键判断</strong><span>{block.keyPoint}</span></blockquote>
      <div className="selection-actions"><span>基于这段内容</span><button type="button" onClick={() => dispatch({ type: 'open_chat', scope: 'selection', label: '选中文字 · 当前章节' })}>解释</button><button type="button" onClick={() => dispatch({ type: 'open_chat', scope: 'selection', label: '选中文字 · 当前章节' })}>对比</button><button type="button" onClick={() => dispatch({ type: 'open_chat', scope: 'selection', label: '选中文字 · 当前章节' })}><Icon name="chat" size={14} />提问</button></div>
      <SourceLinks sourceIds={block.sourceIds} />
    </section>
  )

  if (block.type === 'example') return (
    <section className="learning-block learning-block--example" id={block.id}>
      <header><p className="block-kicker">示例</p><h3>{block.title}</h3></header>
      <p>{block.scenario}</p><div className="takeaway"><span>从例子带走</span><strong>{block.takeaway}</strong></div><SourceLinks sourceIds={block.sourceIds} />
    </section>
  )

  if (block.type === 'formula_or_conclusion') return (
    <section className="learning-block learning-block--conclusion" id={block.id}>
      <header><p className="block-kicker">{block.formula ? '公式与结论' : '关键结论'}</p><h3>{block.title}</h3></header>
      {block.formula && <code>{block.formula}</code>}<p>{block.body}</p><SourceLinks sourceIds={block.sourceIds} />
    </section>
  )

  return (
    <figure className="learning-block learning-block--citation" id={block.id}>
      <Icon name="quote" size={22} /><blockquote>{block.excerpt}</blockquote><figcaption>{block.title}</figcaption><SourceLinks sourceIds={block.sourceIds} />
      {state.source.open && <span className="sr-only">来源查看器已打开</span>}
    </figure>
  )
}
