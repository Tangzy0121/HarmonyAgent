import { json, Router } from 'express'

import type { BookStore } from '../books/bookStore.js'
import { deriveTodayRecommendations, type TodayRecommendationDto } from '../today/todayRecommendation.js'
import type { TodayStore } from '../today/todayStore.js'

interface TodayRouterDependencies {
  bookStore: BookStore
  todayStore: TodayStore
  now?: () => Date
}

const STATES = new Set(['dismissed', 'snoozed', 'completed'])
const SNOOZE_DEFAULT_MS = 4 * 60 * 60 * 1000

/** 叠加展示状态：dismissed/completed 与未到点的 snoozed 不展示 */
async function filterActive(
  store: TodayStore,
  items: TodayRecommendationDto[],
  now: Date,
): Promise<TodayRecommendationDto[]> {
  const result: TodayRecommendationDto[] = []
  for (const item of items) {
    const entry = await store.get(item.id)
    if (entry === null) {
      result.push(item)
      continue
    }
    if (entry.state === 'snoozed' && entry.untilIso !== undefined && Date.parse(entry.untilIso) <= now.getTime()) {
      result.push({ ...item, state: 'active' })
    }
  }
  return result
}

export function createTodayRouter(dependencies: TodayRouterDependencies): Router {
  const router = Router()
  router.use(json({ limit: '1mb' }))
  const { bookStore, todayStore } = dependencies
  const now = dependencies.now ?? (() => new Date())

  router.get('/', async (_req, res, next) => {
    try {
      const at = now()
      const books = await bookStore.list()
      const derived = deriveTodayRecommendations(books, at)
      const active = await filterActive(todayStore, derived, at)
      const [primary = null, ...rest] = active
      res.json({
        version: '1',
        generatedAt: at.toISOString(),
        primary,
        alternatives: rest.map((item) => ({ ...item, rank: 'alternative' })),
      })
    } catch (error) {
      next(error)
    }
  })

  router.post('/state', async (req, res) => {
    const body = req.body as Record<string, unknown>
    const recommendationId = typeof body?.recommendationId === 'string' ? body.recommendationId.trim() : ''
    const state = typeof body?.state === 'string' ? body.state : ''
    if (!recommendationId || !STATES.has(state)) {
      res.status(400).json({ error: 'invalid_request' })
      return
    }
    let untilIso: string | undefined
    if (state === 'snoozed') {
      if (typeof body.untilIso === 'string' && !Number.isNaN(Date.parse(body.untilIso))) {
        untilIso = body.untilIso
      } else {
        untilIso = new Date(now().getTime() + SNOOZE_DEFAULT_MS).toISOString()
      }
    }
    await todayStore.set(recommendationId, {
      state: state as 'dismissed' | 'snoozed' | 'completed',
      ...(untilIso === undefined ? {} : { untilIso }),
      updatedAt: now().toISOString(),
    })
    res.json({ version: '1', recommendationId, state })
  })

  return router
}
