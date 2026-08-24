import { usePrototype } from '../../app/PrototypeContext'
import type { LearningProject } from '../../types/product'
import { Icon } from '../ui/Icon'
import { StatusBadge } from '../ui/StatusBadge'

export function ChapterRail({ project }: { project: LearningProject }) {
  const { state, dispatch } = usePrototype()
  return (
    <aside className={state.chapterMenuOpen ? 'chapter-rail is-open' : 'chapter-rail'} aria-label="章节目录">
      <header><div><p>学习书目录</p><strong>{project.chapters.length} 个章节</strong></div><button type="button" className="icon-button chapter-rail__close" aria-label="关闭目录" onClick={() => dispatch({ type: 'toggle_chapters', open: false })}><Icon name="close" size={18} /></button></header>
      <ol>
        {project.chapters.map((chapter) => {
          const active = chapter.id === state.activeChapterId
          return (
            <li key={chapter.id}>
              <button type="button" className={active ? 'is-active' : ''} aria-current={active ? 'step' : undefined} disabled={chapter.taskState === 'pending'} onClick={() => dispatch({ type: 'set_chapter', chapterId: chapter.id })}>
                <span className="chapter-rail__index">{chapter.order + 1}</span>
                <span><strong>{chapter.title}</strong><small>{chapter.estimatedMinutes} 分钟 · {chapter.sourceRange}</small></span>
                <StatusBadge status={chapter.taskState} />
              </button>
            </li>
          )
        })}
      </ol>
      <footer><button type="button" onClick={() => dispatch({ type: 'screen', screen: 'overview' })}><Icon name="more" size={17} />项目概览与设置</button></footer>
    </aside>
  )
}
