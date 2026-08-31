import { LociChapter, LociProjectSummary } from '../../models/LociModels'
import { LociProgressSnapshot } from '../../models/LociServiceModels'

function copyChapter(chapter: LociChapter, read: boolean, bookmarked: boolean): LociChapter {
  return {
    id: chapter.id,
    order: chapter.order,
    title: chapter.title,
    estimatedMinutes: chapter.estimatedMinutes,
    taskState: chapter.taskState,
    read: read,
    bookmarked: bookmarked,
    objective: chapter.objective,
    sourceRange: chapter.sourceRange,
    verified: chapter.verified,
    blocks: chapter.blocks
  } as LociChapter
}

export function projectWithChapters(project: LociProjectSummary,
  chapters: LociChapter[]): LociProjectSummary {
  return {
    id: project.id,
    title: project.title,
    shortTitle: project.shortTitle,
    goal: project.goal,
    level: project.level,
    depth: project.depth,
    source: project.source,
    status: project.status,
    lastStudiedLabel: project.lastStudiedLabel,
    chapters: chapters,
    notice: project.notice,
    lastChapterId: project.lastChapterId,
    concepts: project.concepts,
    relations: project.relations,
    anchors: project.anchors,
    evidence: project.evidence,
    reviewConceptIds: project.reviewConceptIds
  } as LociProjectSummary
}

export function projectWithProgress(project: LociProjectSummary,
  progress: LociProgressSnapshot): LociProjectSummary {
  const chapters: LociChapter[] = project.chapters.map((chapter: LociChapter): LociChapter => {
    return copyChapter(chapter,
      progress.visitedChapterIds.includes(chapter.id),
      progress.bookmarkedChapterIds.includes(chapter.id))
  })
  return projectWithChapters(project, chapters)
}

export function projectWithBookmark(project: LociProjectSummary,
  chapterId: string, bookmarked: boolean): LociProjectSummary {
  const chapters: LociChapter[] = project.chapters.map((chapter: LociChapter): LociChapter => {
    if (chapter.id !== chapterId) {
      return chapter
    }
    return copyChapter(chapter, chapter.read, bookmarked)
  })
  return projectWithChapters(project, chapters)
}
