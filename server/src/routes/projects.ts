import { Router } from 'express'

import type { BookStore } from '../books/bookStore.js'
import { buildProjectDto, sortProjects, type ProjectOwner } from '../projects/projectMapper.js'

interface ProjectsRouterDependencies {
  bookStore: BookStore
  actorProvider: () => ProjectOwner
  /** 项目未读通知数（PR-D）；缺省恒 0 */
  noticeCounts?: () => Promise<Map<string, number>>
}
export function createProjectsRouter(dependencies: ProjectsRouterDependencies): Router {
  const router = Router()
  const { bookStore, actorProvider } = dependencies

  async function withNoticeCounts(projects: ReturnType<typeof buildProjectDto>[]): Promise<void> {
    if (dependencies.noticeCounts === undefined) return
    const counts = await dependencies.noticeCounts()
    for (const project of projects) {
      project.notices = { unreadCount: counts.get(project.projectId) ?? 0 }
    }
  }

  router.get('/', async (_req, res, next) => {
    try {
      const owner = actorProvider()
      const books = await bookStore.list()
      const projects = sortProjects(books.map((book) => buildProjectDto(book, owner)))
      await withNoticeCounts(projects)
      res.json({ version: '1', projects })
    } catch (error) {
      next(error)
    }
  })

  router.get('/:id', async (req, res, next) => {
    try {
      const book = await bookStore.get(req.params.id)
      if (!book) {
        res.status(404).json({ error: 'project_not_found' })
        return
      }
      const project = buildProjectDto(book, actorProvider())
      await withNoticeCounts([project])
      res.json({ version: '1', project })
    } catch (error) {
      next(error)
    }
  })

  return router
}
