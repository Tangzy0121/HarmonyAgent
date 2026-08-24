import { usePrototype } from '../app/PrototypeContext'
import { ProjectNotice } from '../components/project/ProjectNotice'
import { ImmersiveHeader } from '../components/shell/ImmersiveHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { StatusBadge } from '../components/ui/StatusBadge'

export function ProjectOverviewPage() {
  const { activeProject, dispatch } = usePrototype()
  const hasReadable = activeProject.chapters.some((chapter) => chapter.taskState === 'ready')
  return (
    <div className="immersive-page overview-page">
      <ImmersiveHeader title="项目概览" meta={activeProject.source.name} actions={<button className="icon-button" type="button" aria-label="更多项目操作"><Icon name="more" size={19} /></button>} />
      <main className="overview-layout">
        <header className="overview-hero"><StatusBadge status={activeProject.status} /><h1>{activeProject.title}</h1><p>{activeProject.goal}</p><div><span>{activeProject.level}</span><span>{activeProject.depth}</span><span>{activeProject.chapters.length} 章</span></div></header>
        {activeProject.notice && <ProjectNotice notice={activeProject.notice} onAction={() => {
          if (activeProject.status === 'blocked') dispatch({ type: 'retry_project' })
          else if (activeProject.status === 'preparing') document.getElementById('overview-chapters-title')?.scrollIntoView({ behavior: 'smooth' })
          else dispatch({ type: 'open_workspace' })
        }} />}
        <section className="overview-section" aria-labelledby="overview-chapters-title">
          <header><div><p className="eyebrow">学习书</p><h2 id="overview-chapters-title">章节状态</h2></div>{hasReadable && <Button variant="accent" iconAfter="arrow" onClick={() => dispatch({ type: 'open_workspace' })}>继续学习</Button>}</header>
          {activeProject.chapters.length ? (
            <ol className="overview-chapters">{activeProject.chapters.map((chapter) => <li key={chapter.id}><span>{chapter.order + 1}</span><div><strong>{chapter.title}</strong><small>{chapter.objective}</small></div><StatusBadge status={chapter.taskState} />{chapter.taskState === 'ready' && <button type="button" onClick={() => dispatch({ type: 'open_workspace', chapterId: chapter.id })}>打开</button>}{chapter.taskState === 'failed' && <button type="button" onClick={() => dispatch({ type: 'retry_project' })}>重试</button>}</li>)}</ol>
          ) : (
            <div className="generation-state" role="status"><span className="generation-state__mark"><Icon name="spark" size={20} /></span><div><strong>正在整理学习方案</strong><p>资料结构、章节边界与来源锚点会依次完成。你可以先离开，进度会保留在学习库。</p><div className="generation-progress" aria-label="资料处理进度"><i /><i /><i /></div></div></div>
          )}
        </section>
        <section className="overview-columns">
          <div className="overview-section"><p className="eyebrow">学习状态</p><h2>已保存的进展</h2><dl className="fact-list"><div><dt>已读</dt><dd>{activeProject.chapters.filter((chapter) => chapter.read).length} 章</dd></div><div><dt>已验证</dt><dd>{activeProject.evidence.length} 条证据</dd></div><div><dt>待复习</dt><dd>{activeProject.reviewConceptIds.length} 个概念</dd></div></dl></div>
          <div className="overview-section"><p className="eyebrow">来源资料</p><h2>{activeProject.source.name}</h2><p>{activeProject.source.format} · {activeProject.source.size} · {activeProject.source.units}</p>{activeProject.anchors.length ? <button className="text-action" type="button" onClick={() => dispatch({ type: 'open_source', anchorId: activeProject.anchors[0].id })}>查看来源与依据<Icon name="arrow" size={16} /></button> : <span className="muted-action"><Icon name="clock" size={15} />来源定位仍在生成</span>}</div>
        </section>
        <section className="overview-settings"><div><Icon name="archive" size={19} /><span><strong>项目管理</strong><small>调整方案、暂停或归档这个项目</small></span></div><button type="button">项目设置<Icon name="chevron" size={16} /></button></section>
      </main>
    </div>
  )
}
