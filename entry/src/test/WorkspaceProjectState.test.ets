import { describe, expect, it } from '@ohos/hypium'
import { LociChapter, LociProjectSummary } from '../main/ets/models/LociModels'
import {
  projectWithBookmark,
  projectWithProgress
} from '../main/ets/loci/workspace/WorkspaceProjectState'

function fixtureProject(): LociProjectSummary {
  const chapters: LociChapter[] = [
    {
      id: 'chapter-1',
      order: 0,
      title: '第一章',
      estimatedMinutes: 12,
      taskState: 'ready',
      read: false,
      bookmarked: false,
      blocks: []
    } as LociChapter,
    {
      id: 'chapter-2',
      order: 1,
      title: '第二章',
      estimatedMinutes: 10,
      taskState: 'ready',
      read: false,
      bookmarked: true,
      blocks: []
    } as LociChapter
  ]
  return {
    id: 'book-1',
    title: '监督学习',
    goal: '掌握基础概念',
    level: '入门',
    depth: '标准',
    source: { id: 'source-1', name: 'ml.pdf', format: 'PDF', size: '1 MB' },
    status: 'active',
    lastStudiedLabel: '刚刚',
    chapters: chapters
  } as LociProjectSummary
}

export default function workspaceProjectStateTest(): void {
  describe('WorkspaceProjectState', () => {
    it('projects_server_progress_without_mutating_the_input', 0, () => {
      const project = fixtureProject()
      const updated = projectWithProgress(project, {
        visitedChapterIds: ['chapter-1'],
        bookmarkedChapterIds: ['chapter-1']
      })

      expect(updated.chapters[0].read).assertTrue()
      expect(updated.chapters[0].bookmarked).assertTrue()
      expect(updated.chapters[1].bookmarked).assertFalse()
      expect(project.chapters[0].read).assertFalse()
      expect(project.chapters[1].bookmarked).assertTrue()
    })

    it('updates_only_the_requested_bookmark', 0, () => {
      const project = fixtureProject()
      const updated = projectWithBookmark(project, 'chapter-1', true)

      expect(updated.chapters[0].bookmarked).assertTrue()
      expect(updated.chapters[1].bookmarked).assertTrue()
      expect(project.chapters[0].bookmarked).assertFalse()
    })
  })
}
