import { Router } from 'express'

import type { BookStore } from '../books/bookStore.js'
import { deriveLearnerProfile } from '../learning/learnerProfile.js'
import { deriveSuggestions } from '../learning/suggestions.js'

interface LearnerRouterDependencies {
  bookStore: BookStore
}

/** 长期学习者模型：只读派生 API，无 LLM、无写入（规格 §6：画像不进日志） */
export function createLearnerRouter(dependencies: LearnerRouterDependencies): Router {
  const router = Router()
  const { bookStore } = dependencies

  router.get('/profile', async (_req, res) => {
    try {
      const books = await bookStore.list()
      res.status(200).json(deriveLearnerProfile(books, new Date()))
    } catch {
      res.status(500).json({ error: 'internal_error' })
    }
  })

  // starter 建议：模板化派生（悬崖>薄弱>继续读，≤3 条），零 LLM
  router.get('/suggestions', async (_req, res) => {
    try {
      const books = await bookStore.list()
      res.status(200).json({ suggestions: deriveSuggestions(books, new Date()) })
    } catch {
      res.status(500).json({ error: 'internal_error' })
    }
  })

  return router
}
