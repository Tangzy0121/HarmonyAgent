import { usePrototype } from '../app/PrototypeContext'
import { ImmersiveHeader } from '../components/shell/ImmersiveHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { StatusBadge } from '../components/ui/StatusBadge'
import { ChapterRail } from '../components/workspace/ChapterRail'
import { ChapterSummary } from '../components/workspace/ChapterSummary'
import { ConceptGraph } from '../components/workspace/ConceptGraph'
import { LearningBlockView } from '../components/workspace/LearningBlocks'

export function WorkspacePage() {
  const { state, activeProject, dispatch } = usePrototype()
  const chapter = activeProject.chapters.find((entry) => entry.id === state.activeChapterId) ?? activeProject.chapters[0]
  return (
    <div className="immersive-page workspace-page">
      <ImmersiveHeader
        title={activeProject.title}
        meta="学习书工作区"
        actions={<><button type="button" className="icon-button workspace-menu-button" aria-label="打开章节目录" onClick={() => dispatch({ type: 'toggle_chapters' })}><Icon name="menu" size={19} /></button><button type="button" className="icon-button" aria-label="收藏当前章节"><Icon name="bookmark" size={18} /></button><button type="button" className="icon-button" aria-label="更多学习书操作" onClick={() => dispatch({ type: 'screen', screen: 'overview' })}><Icon name="more" size={19} /></button></>}
      />
      <div className="workspace-layout">
        <ChapterRail project={activeProject} />
        <main className="workspace-main">
          <div className="workspace-toolbar"><div className="mode-switch" role="tablist" aria-label="学习书模式"><button type="button" role="tab" aria-selected={state.workspaceMode === 'content'} onClick={() => dispatch({ type: 'set_mode', mode: 'content' })}><Icon name="book" size={16} />正文</button><button type="button" role="tab" aria-selected={state.workspaceMode === 'graph'} onClick={() => dispatch({ type: 'set_mode', mode: 'graph' })}><Icon name="map" size={16} />概念图</button></div><button type="button" className="scope-chip" onClick={() => dispatch({ type: 'open_chat', scope: state.workspaceMode === 'graph' ? 'concept' : 'chapter', label: state.workspaceMode === 'graph' ? '当前学习书 · 概念图' : chapter.title })}><Icon name="spark" size={14} />Chat 作用域：{state.workspaceMode === 'graph' ? '当前学习书' : '当前章节'}</button></div>
          {state.workspaceMode === 'graph' ? <ConceptGraph project={activeProject} chapterId={chapter.id} /> : (
            <article className="reader">
              <header className="chapter-hero"><div><StatusBadge status={chapter.taskState} /><span>第 {chapter.order + 1} 章 · {chapter.estimatedMinutes} 分钟</span></div><h1>{chapter.title}</h1><p>{chapter.objective}</p><button type="button" onClick={() => dispatch({ type: 'open_source', anchorId: chapter.blocks[0]?.sourceIds[0] ?? activeProject.anchors[0]?.id ?? '' })}><Icon name="source" size={15} />来源范围：{chapter.sourceRange}</button></header>
              {chapter.taskState === 'running' ? <section className="chapter-state"><span className="chapter-state__pulse"><Icon name="spark" size={25} /></span><p className="eyebrow">正在生成</p><h2>这一章还在组织内容</h2><p>已有章节和学习记录不受影响。你可以离开，完成后会在学习库出现项目通知。</p><Button variant="secondary" onClick={() => dispatch({ type: 'set_chapter', chapterId: activeProject.chapters.find((entry) => entry.taskState === 'ready')?.id ?? chapter.id })}>阅读已有章节</Button></section> : chapter.taskState === 'failed' ? <section className="chapter-state chapter-state--failed"><span><Icon name="warning" size={25} /></span><p className="eyebrow">部分可用</p><h2>这一章生成失败了</h2><p>已有内容、笔记和学习证据都已保留。重试只从当前失败阶段继续。</p><Button variant="primary" icon="refresh" onClick={() => dispatch({ type: 'retry_project' })}>重新生成本章</Button></section> : chapter.blocks.length === 0 ? <section className="chapter-state"><span><Icon name="clock" size={25} /></span><h2>内容即将可读</h2><p>这是原型中的后台生成状态。返回项目概览可以查看其他章节。</p></section> : <><div className="learning-blocks">{chapter.blocks.map((block) => <LearningBlockView key={block.id} block={block} />)}</div><ChapterSummary chapter={chapter} project={activeProject} /></>}
            </article>
          )}
        </main>
      </div>
    </div>
  )
}
