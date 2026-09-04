import { randomUUID } from 'node:crypto'

import { json, Router } from 'express'

import { BookStoreError, type BookStore } from '../books/bookStore.js'
import type { ConceptRelation, ConceptRelationCorrection } from '../books/bookTypes.js'
import { aggregateConcepts, aggregateRelations, findRelation } from '../concepts/conceptGraph.js'
import type { ProjectOwner } from '../projects/projectMapper.js'

const RELATION_TYPES = new Set<ConceptRelation['type']>(['前置', '包含', '相似', '对比', '应用'])
const ACTIONS = new Set<ConceptRelationCorrection['action']>(['confirm', 'reject', 'retype'])

interface ConceptsRouterDependencies {
  bookStore: BookStore
  actorProvider: () => ProjectOwner
  now?: () => Date
}

export function createConceptsRouter(dependencies: ConceptsRouterDependencies): Router {
  const router = Router()
  router.use(json({ limit: '1mb' }))
  const { bookStore, actorProvider } = dependencies
  const now = dependencies.now ?? (() => new Date())

  router.get('/:id/concepts', async (req, res, next) => {
    try {
      const book = await bookStore.get(req.params.id)
      if (!book) {
        res.status(404).json({ error: 'book_not_found' })
        return
      }
      res.json({ version: '1', concepts: aggregateConcepts(book) })
    } catch (error) {
      next(error)
    }
  })

  router.get('/:id/relations', async (req, res, next) => {
    try {
      const book = await bookStore.get(req.params.id)
      if (!book) {
        res.status(404).json({ error: 'book_not_found' })
        return
      }
      res.json({ version: '1', relations: aggregateRelations(book) })
    } catch (error) {
      next(error)
    }
  })

  router.post('/:id/relations/:rid/corrections', async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>
      const action = typeof body?.action === 'string' ? body.action : ''
      if (!ACTIONS.has(action as ConceptRelationCorrection['action'])) {
        res.status(400).json({ error: 'invalid_correction' })
        return
      }
      const suggestedType = typeof body.suggestedType === 'string' ? body.suggestedType : undefined
      if (action === 'retype' && (
        suggestedType === undefined || !RELATION_TYPES.has(suggestedType as ConceptRelation['type'])
      )) {
        res.status(400).json({ error: 'invalid_correction' })
        return
      }
      const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : undefined

      const { result } = await bookStore.update(req.params.id, (book) => {
        const relation = findRelation(book, req.params.rid)
        if (!relation) return { correction: null, created: false }
        const corrections = book.relationCorrections ?? []
        // 幂等：同 relation+action+suggestedType 重复提交返回既有纠正
        const existing = corrections.find((correction) =>
          correction.relationId === relation.id &&
          correction.action === action &&
          correction.suggestedType === suggestedType)
        if (existing) return { correction: existing, created: false }
        const correction: ConceptRelationCorrection = {
          id: `crc_${randomUUID()}`,
          relationId: relation.id,
          relationSourceId: relation.sourceId,
          relationTargetId: relation.targetId,
          action: action as ConceptRelationCorrection['action'],
          ...(suggestedType === undefined
            ? {}
            : { suggestedType: suggestedType as ConceptRelation['type'] }),
          ...(note === undefined ? {} : { note }),
          operator: { ...actorProvider() },
          createdAt: now().toISOString(),
        }
        book.relationCorrections = [...corrections, correction]
        return { correction, created: true }
      })

      if (!result.correction) {
        res.status(404).json({ error: 'relation_not_found' })
        return
      }
      res.status(result.created ? 201 : 200).json({ version: '1', correction: result.correction })
    } catch (error) {
      if (error instanceof BookStoreError) {
        res.status(404).json({ error: 'book_not_found' })
        return
      }
      throw error
    }
  })

  return router
}
