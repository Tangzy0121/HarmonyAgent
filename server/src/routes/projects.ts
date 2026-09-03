import { Router } from 'express'

import type { BookStore } from '../books/bookStore.js'
import { buildProjectDto, sortProjects, type ProjectOwner } from '../projects/projectMapper.js'

interface ProjectsRouterDependencies {
  bookStore: BookStore
  actorProvider: () => ProjectOwner
}

export function createProjectsRouter(dependencies: ProjectsRouterDependencies): Router {
  const router = Router()
  const { bookStore, actorProvider } = dependencies

  router.get('/', async (_req, res, next) => {
    try {
      const owner = actorProvider()
      const books = await bookStore.list()
      const projects = sortProjects(books.map((book) => buildProjectDto(book, owner)))
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
      res.json({ version: '1', project: buildProjectDto(book, actorProvider()) })
    } catch (error) {
      next(error)
    }
  })

  return router
}
