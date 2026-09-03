import { Router } from 'express'

import type { NoticeService } from '../notices/noticeService.js'

interface NoticesRouterDependencies {
  noticeService: NoticeService
}

export function createNoticesRouter(dependencies: NoticesRouterDependencies): Router {
  const router = Router()
  const { noticeService } = dependencies

  router.get('/', async (req, res, next) => {
    try {
      const bookId = typeof req.query.bookId === 'string' ? req.query.bookId : undefined
      const notices = await noticeService.list(bookId)
      res.json({ version: '1', notices })
    } catch (error) {
      next(error)
    }
  })

  router.post('/:id/read', async (req, res, next) => {
    try {
      const notice = await noticeService.markRead(req.params.id)
      if (notice === null) {
        res.status(404).json({ error: 'notice_not_found' })
        return
      }
      res.json({ version: '1', notice })
    } catch (error) {
      next(error)
    }
  })

  return router
}
