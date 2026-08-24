import { usePrototype } from '../app/PrototypeContext'
import { ImmersiveHeader } from '../components/shell/ImmersiveHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { StatusBadge } from '../components/ui/StatusBadge'

export function SummaryPage() {
  const { activeProject, dispatch } = usePrototype()
  const mastered = activeProject.concepts.filter((concept) => concept.state === 'mastered')
  const review = activeProject.concepts.filter((concept) => concept.state === 'review')
  return (
    <div className="immersive-page summary-page">
      <ImmersiveHeader title="全书总结" meta={activeProject.source.name} />
      <main className="summary-layout">
        <header className="summary-hero"><span><Icon name="check" size={23} /></span><p className="eyebrow">计划范围已经完成</p><h1>{activeProject.title}</h1><p>你完成了计划中的章节与验证。这里回顾代表性证据和仍值得复查的方向，不把结果包装成分数。</p><div><Button variant="accent" iconAfter="arrow" onClick={() => dispatch({ type: 'navigate', destination: 'today' })}>返回今日</Button><Button variant="secondary" onClick={() => dispatch({ type: 'screen', screen: 'create' })}>开始新项目</Button></div></header>
        <section className="summary-section"><header><p className="eyebrow">完成的范围</p><h2>{activeProject.chapters.length} 个章节</h2></header><ol className="summary-chapters">{activeProject.chapters.map((chapter) => <li key={chapter.id}><span>{chapter.order + 1}</span><div><strong>{chapter.title}</strong><small>{chapter.objective}</small></div><Icon name="check" size={17} /></li>)}</ol></section>
        <section className="summary-section"><header><p className="eyebrow">代表性学习证据</p><h2>你的判断依据</h2></header><div className="summary-evidence">{activeProject.evidence.slice(0, 3).map((evidence) => <article key={evidence.id}><span><Icon name={evidence.result === 'supports' ? 'check' : 'warning'} size={17} /></span><div><small>{evidence.kind === 'quiz' ? '小测' : evidence.kind === 'feynman' ? '费曼讲述' : '复习'} · {evidence.occurredAt}</small><strong>{evidence.summary}</strong><button type="button" onClick={() => dispatch({ type: 'open_source', anchorId: evidence.sourceIds[0] })}>回到事件与来源</button></div></article>)}</div></section>
        <section className="summary-columns"><div className="summary-section"><header><p className="eyebrow">当前投影</p><h2>有证据支持</h2></header><ul className="concept-summary-list">{mastered.map((concept) => <li key={concept.id}><StatusBadge status={concept.state} /><strong>{concept.label}</strong><span>{concept.definition}</span></li>)}</ul></div><div className="summary-section"><header><p className="eyebrow">后续方向</p><h2>仍值得复查</h2></header><ul className="concept-summary-list">{review.map((concept) => <li key={concept.id}><StatusBadge status={concept.state} /><strong>{concept.label}</strong><span>{concept.definition}</span></li>)}</ul><button className="text-action" type="button" onClick={() => dispatch({ type: 'screen', screen: 'review' })}>开始一次短复习<Icon name="arrow" size={16} /></button></div></section>
      </main>
    </div>
  )
}
