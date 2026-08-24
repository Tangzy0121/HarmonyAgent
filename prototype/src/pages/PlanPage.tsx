import { usePrototype } from '../app/PrototypeContext'
import { CreateProgress } from '../components/project/CreateProgress'
import { ImmersiveHeader } from '../components/shell/ImmersiveHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'

export function PlanPage() {
  const { activeProject, dispatch } = usePrototype()

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= activeProject.chapters.length) return
    const chapters = [...activeProject.chapters]
    const [chapter] = chapters.splice(index, 1)
    chapters.splice(target, 0, chapter)
    dispatch({ type: 'update_plan', project: { ...activeProject, chapters: chapters.map((entry, order) => ({ ...entry, order })) } })
  }

  const updateTitle = (chapterId: string, title: string) => dispatch({
    type: 'update_plan',
    project: { ...activeProject, chapters: activeProject.chapters.map((chapter) => chapter.id === chapterId ? { ...chapter, title } : chapter) },
  })

  const remove = (chapterId: string) => dispatch({
    type: 'update_plan',
    project: { ...activeProject, chapters: activeProject.chapters.filter((chapter) => chapter.id !== chapterId).map((chapter, order) => ({ ...chapter, order })) },
  })

  return (
    <div className="immersive-page plan-page">
      <ImmersiveHeader title="确认方案" meta="3 / 3" />
      <main className="plan-layout">
        <CreateProgress current={3} />
        <section className="plan-intro">
          <p className="eyebrow">03 · 确认</p>
          <h1>{activeProject.shortTitle ?? activeProject.title}</h1>
          <dl><div><dt>水平</dt><dd>{activeProject.level}</dd></div><div><dt>深度</dt><dd>{activeProject.depth}</dd></div><div><dt>时间</dt><dd>{activeProject.chapters.reduce((sum, chapter) => sum + chapter.estimatedMinutes, 0)} 分钟</dd></div></dl>
          <div className="plan-rationale"><Icon name="spark" size={18} /><div><strong>方案依据</strong><p>先建立框架，再用例子验证。确认后优先生成第一章。</p></div></div>
        </section>
        <section className="plan-outline" aria-labelledby="plan-outline-title">
          <header><div><p className="eyebrow">学习路径</p><h2 id="plan-outline-title">{activeProject.chapters.length} 章</h2></div><span>可编辑</span></header>
          <ol>
            {activeProject.chapters.map((chapter, index) => (
              <li key={chapter.id}>
                <span className="plan-chapter__index">{String(index + 1).padStart(2, '0')}</span>
                <div className="plan-chapter__body"><input aria-label={`第 ${index + 1} 章标题`} value={chapter.title} onChange={(event) => updateTitle(chapter.id, event.target.value)} /><small>{chapter.estimatedMinutes} 分钟</small></div>
                <div className="plan-chapter__actions"><button type="button" aria-label="上移" disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" aria-label="下移" disabled={index === activeProject.chapters.length - 1} onClick={() => move(index, 1)}>↓</button><button type="button" aria-label="删除章节" disabled={activeProject.chapters.length <= 2} onClick={() => remove(chapter.id)}><Icon name="close" size={15} /></button></div>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <footer className="sticky-action-bar"><Button variant="accent" iconAfter="arrow" onClick={() => dispatch({ type: 'confirm_plan' })}>确认并生成</Button></footer>
    </div>
  )
}
