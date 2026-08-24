import { useState } from 'react'

import { usePrototype } from '../app/PrototypeContext'
import { ImmersiveHeader } from '../components/shell/ImmersiveHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'

const reviewItems = [
  {
    conceptId: 'loss-function',
    kind: '主动回忆',
    prompt: '先不看资料：损失函数在训练中究竟告诉模型什么？',
    placeholder: '用一两句话回答…',
    feedback: '关键点是“描述当前预测与目标的偏差”，而不是直接评价模型在未见数据上的能力。',
    sourceId: 'src-loss',
  },
  {
    conceptId: 'model-evaluation',
    kind: '应用判断',
    prompt: '一个模型训练损失很低，但验证集表现变差。最合理的解释是什么？',
    placeholder: '说明训练拟合与泛化之间的区别…',
    feedback: '训练损失只反映训练数据上的拟合。验证表现变差说明规律没有稳定迁移，可能出现过拟合。',
    sourceId: 'src-eval',
  },
  {
    conceptId: 'loss-function',
    kind: '简短讲述',
    prompt: '把损失函数和独立评估的分工讲给一个同事听。',
    placeholder: '损失负责…，评估负责…',
    feedback: '把两者放在训练前后两个阶段理解：一个指导更新，一个检验迁移。',
    sourceId: 'src-loss',
  },
]

export function ReviewPage() {
  const { activeProject, dispatch } = usePrototype()
  const [index, setIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const done = index >= reviewItems.length
  const item = reviewItems[index]
  const concept = item ? activeProject.concepts.find((entry) => entry.id === item.conceptId) : null

  return (
    <div className="immersive-page review-page">
      <ImmersiveHeader title="短复习" meta={activeProject.title} backTo="workspace" />
      <main className="review-layout">
        <header className="review-progress"><div><p className="eyebrow">有限任务 · 随时可以退出</p><h1>{done ? '这次复习已经完成' : `${index + 1} / ${reviewItems.length}`}</h1></div><div className="progress-track" aria-label={`复习进度 ${Math.min(index + (submitted ? 1 : 0), reviewItems.length)} / ${reviewItems.length}`}><i style={{ width: `${(Math.min(index + (submitted ? 1 : 0), reviewItems.length) / reviewItems.length) * 100}%` }} /></div></header>
        {done ? (
          <section className="review-complete"><span><Icon name="check" size={28} /></span><p className="eyebrow">已保存 3 条复习事件</p><h2>先回到学习书继续</h2><p>这次回答会形成新的学习证据。概念状态由全部有效证据重新投影，不会因为一次回答就永久标记掌握。</p><div className="review-result-list"><div><strong>损失函数</strong><span>关键区别已经说清楚</span></div><div><strong>模型评估</strong><span>建议在下一章再做一次应用验证</span></div></div><Button variant="accent" iconAfter="arrow" onClick={() => dispatch({ type: 'screen', screen: 'workspace' })}>返回学习书</Button></section>
        ) : (
          <section className="review-card">
            <header><span>{item.kind}</span><strong>{concept?.label}</strong></header>
            <h2>{item.prompt}</h2>
            {!submitted ? <><textarea rows={6} value={answer} placeholder={item.placeholder} onChange={(event) => setAnswer(event.target.value)} /><footer><button type="button" onClick={() => dispatch({ type: 'screen', screen: 'workspace' })}>稍后处理</button><Button variant="primary" disabled={!answer.trim()} onClick={() => setSubmitted(true)}>提交回答</Button></footer></> : <div className="review-feedback"><span><Icon name="check" size={18} /></span><div><strong>已保存回答</strong><p>{item.feedback}</p><button type="button" onClick={() => dispatch({ type: 'open_source', anchorId: item.sourceId })}><Icon name="source" size={15} />查看来源与相关正文</button></div><Button variant="accent" iconAfter="arrow" onClick={() => { setIndex((value) => value + 1); setAnswer(''); setSubmitted(false) }}>{index === reviewItems.length - 1 ? '查看结果' : '下一项'}</Button></div>}
          </section>
        )}
      </main>
    </div>
  )
}
