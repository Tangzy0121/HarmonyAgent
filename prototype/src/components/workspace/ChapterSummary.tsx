import { usePrototype } from '../../app/PrototypeContext'
import type { Chapter, LearningProject } from '../../types/product'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'

export function ChapterSummary({ chapter, project }: { chapter: Chapter; project: LearningProject }) {
  const { dispatch } = usePrototype()
  const evidence = project.evidence.filter((item) => item.chapterId === chapter.id)
  const reviewConcepts = project.concepts.filter((concept) => project.reviewConceptIds.includes(concept.id) && concept.chapterIds.includes(chapter.id))
  const nextChapter = project.chapters[chapter.order + 1]
  return (
    <section className="chapter-summary" aria-labelledby="chapter-summary-title">
      <header><p className="block-kicker">章末总结</p><h2 id="chapter-summary-title">这一章留下了什么</h2></header>
      <div className="evidence-strip">{evidence.length ? evidence.map((item) => <article key={item.id}><span><Icon name={item.result === 'supports' ? 'check' : 'warning'} size={17} /></span><div><small>{item.sourceEventLabel} · {item.occurredAt}</small><strong>{item.summary}</strong><button type="button" onClick={() => dispatch({ type: 'open_source', anchorId: item.sourceIds[0] })}>查看事件与来源</button></div></article>) : <p>完成本章小测或费曼讲述后，正式证据会出现在这里。</p>}</div>
      {reviewConcepts.length > 0 && <div className="chapter-review-concepts"><span>待复习</span>{reviewConcepts.map((concept) => <button key={concept.id} type="button" onClick={() => dispatch({ type: 'screen', screen: 'review' })}>{concept.label}<Icon name="arrow" size={14} /></button>)}</div>}
      <footer>
        {nextChapter?.taskState === 'ready' && <Button variant="accent" iconAfter="arrow" onClick={() => dispatch({ type: 'set_chapter', chapterId: nextChapter.id })}>继续下一章</Button>}
        {reviewConcepts.length > 0 && <Button variant="secondary" onClick={() => dispatch({ type: 'screen', screen: 'review' })}>复习薄弱概念</Button>}
        <Button variant="ghost" icon="chat" onClick={() => dispatch({ type: 'open_chat', scope: 'chapter', label: chapter.title })}>询问 Agent</Button>
      </footer>
    </section>
  )
}
