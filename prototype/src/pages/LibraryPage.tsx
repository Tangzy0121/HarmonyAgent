import { useMemo, useState } from 'react'

import { usePrototype } from '../app/PrototypeContext'
import { ProjectRow } from '../components/project/ProjectRow'
import { PageHeader } from '../components/shell/PageHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import type { ProjectFilter } from '../types/product'

const filters: Array<{ id: ProjectFilter; label: string }> = [
  { id: 'active', label: '进行中' },
  { id: 'completed', label: '已完成' },
  { id: 'archived', label: '已归档' },
]

export function LibraryPage() {
  const { state, dispatch } = usePrototype()
  const [query, setQuery] = useState('')
  const projects = useMemo(() => state.projects.filter((project) => {
    const statusMatches = state.projectFilter === 'active'
      ? !['completed', 'archived'].includes(project.status)
      : state.projectFilter === 'completed' ? project.status === 'completed' : project.status === 'archived'
    return statusMatches && (project.title.includes(query.trim()) || project.shortTitle?.includes(query.trim()) || project.goal.includes(query.trim()) || project.source.name.includes(query.trim()))
  }), [query, state.projectFilter, state.projects])

  return (
    <div className="page page--library">
      <PageHeader
        eyebrow="你的学习项目"
        title="学习库"
        action={<Button variant="primary" icon="add" aria-label="新建项目" onClick={() => dispatch({ type: 'screen', screen: 'create' })}>新建</Button>}
      />
      <div className="library-toolbar">
        <label className="search-field"><Icon name="search" size={17} /><input value={query} placeholder="搜索项目或来源" onChange={(event) => setQuery(event.target.value)} /><span className="sr-only">搜索学习项目</span></label>
        <div className="filter-tabs" role="tablist" aria-label="项目状态">
          {filters.map((filter) => <button key={filter.id} type="button" role="tab" aria-selected={state.projectFilter === filter.id} onClick={() => dispatch({ type: 'set_filter', filter: filter.id })}>{filter.label}<span>{state.projects.filter((project) => filter.id === 'active' ? !['completed', 'archived'].includes(project.status) : project.status === filter.id).length}</span></button>)}
        </div>
      </div>
      <section className="project-list" aria-label="学习项目列表">
        <header><span>{projects.length} 个项目</span><span>按最近学习时间</span></header>
        {projects.map((project) => <ProjectRow key={project.id} project={project} onOpen={() => dispatch({ type: 'open_project', projectId: project.id })} />)}
        {projects.length === 0 && <div className="empty-state"><span><Icon name="search" size={24} /></span><h2>没有找到学习项目</h2><p>换一个关键词，或者创建一个新的学习项目。</p><Button variant="secondary" onClick={() => setQuery('')}>清除搜索</Button></div>}
      </section>
    </div>
  )
}
