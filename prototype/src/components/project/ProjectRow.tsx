import { projectPrimaryAction, projectStatusLabel } from '../../data/mockData'
import type { LearningProject } from '../../types/product'
import { Icon } from '../ui/Icon'

export function ProjectRow({ project, onOpen }: { project: LearningProject; onOpen: () => void }) {
  const read = project.chapters.filter((chapter) => chapter.read).length
  return (
    <article className={`project-row project-row--${project.status}`}>
      <button type="button" className="project-row__main" onClick={onOpen}>
        <span className="project-row__copy">
          <span className="project-row__status">{projectStatusLabel(project.status)} · {project.lastStudiedLabel}</span>
          <strong>{project.shortTitle ?? project.title}</strong>
          <small>{read}/{project.chapters.length} 章 · {project.source.format}</small>
        </span>
        <span className="project-row__action">{projectPrimaryAction(project)}<Icon name="arrow" size={16} /></span>
      </button>
      <button type="button" className="project-row__more" aria-label={`${project.title}更多操作`}><Icon name="more" size={18} /></button>
    </article>
  )
}
