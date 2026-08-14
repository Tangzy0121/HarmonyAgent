import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createBookStore } from '../../books/bookStore.js'
import type { StoredBook } from '../../books/bookTypes.js'
import {
  createSingleUserBookAccess,
  LearningContextBuilder,
  LearningContextError,
} from './learningContext.js'
import type { RuntimeActor, StartTurnRequestV1 } from './agentRuntimeTypes.js'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function book(id: string, chapterId: string, blockId: string): StoredBook {
  const now = '2026-08-14T00:00:00.000Z'
  return {
    id,
    source: {
      id: `document-${id}`,
      fileName: `${id}.pdf`,
      format: 'PDF',
      pageCount: 8,
      sizeLabel: '1 MB',
      updatedLabel: '今天',
    },
    goal: '理解概念',
    learnerLevel: '入门',
    proposal: { title: id, description: 'desc', rationale: 'why', estimatedMinutes: 20 },
    status: 'ready',
    chapters: [{
      id: chapterId,
      title: '监督学习',
      order: 1,
      objective: '理解标签',
      coreConceptId: 'concept-label',
      estimatedMinutes: 10,
      sourceAnchors: [{
        sourceId: `source-${id}`,
        fileName: `${id}.pdf`,
        pageRange: '4-5',
        excerpt: '训练数据包含输入和对应标签。',
      }],
      status: 'ready',
      blocks: [{
        id: blockId,
        type: 'explanation',
        status: 'ready',
        title: '标签',
        revision: 1,
        sourceAnchors: [{
          sourceId: `source-${id}`,
          fileName: `${id}.pdf`,
          pageRange: '4-5',
          excerpt: '训练数据包含输入和对应标签。',
        }],
        body: '标签提供学习目标。',
        keyPoint: '标签',
      }],
    }],
    activeChapterId: chapterId,
    userNotes: [],
    quizAttempts: [],
    evidence: [],
    reviewSchedule: {},
    createdAt: now,
    updatedAt: now,
    generationJobs: [],
  }
}

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'learning-context-'))
  roots.push(root)
  const store = createBookStore(root)
  await store.save(book('book_one', 'chapter-1', 'block-1'))
  await store.save(book('book_two', 'chapter-2', 'block-2'))
  return new LearningContextBuilder({
    bookAccess: createSingleUserBookAccess(store, actor),
  })
}

const actor: RuntimeActor = { userId: 'server-user', workspaceId: 'server-workspace' }

function request(refs: StartTurnRequestV1['refs']): StartTurnRequestV1 {
  return {
    version: '1',
    message: '解释这一节',
    surface: 'learning',
    refs,
    capabilityHint: 'guided_learning',
  }
}

describe('LearningContextBuilder', () => {
  it('reloads authoritative book, chapter and block objects from the server store', async () => {
    const builder = await setup()

    const context = await builder.build(
      request({ bookId: 'book_one', chapterId: 'chapter-1', blockId: 'block-1' }),
      actor,
      'guided_learning',
    )

    expect(context.actor).toEqual(actor)
    expect(context.refs).toEqual({
      bookId: 'book_one',
      chapterId: 'chapter-1',
      blockId: 'block-1',
      documentId: 'document-book_one',
    })
    expect(context.authority.book?.proposal.title).toBe('book_one')
    expect(context.authority.chapter?.title).toBe('监督学习')
    expect(context.authority.block?.id).toBe('block-1')
    expect(context.readScope).toEqual({
      bookId: 'book_one',
      chapterIds: ['chapter-1'],
      blockIds: ['block-1'],
      sourceIds: ['source-book_one'],
    })
    expect(context.learningStateSummary).toEqual({
      quizAttemptCount: 0,
      evidenceCount: 0,
      dueReviewCount: 0,
    })
    expect(context.toolAllowlist).toContain('ask_user')
  })

  it.each([
    [{ bookId: 'book_one', chapterId: 'missing' }, 'chapter_not_found'],
    [{ bookId: 'book_one', chapterId: 'chapter-1', blockId: 'block-2' }, 'invalid_ref_ownership'],
    [{ bookId: 'book_one', documentId: 'document-book_two' }, 'invalid_ref_ownership'],
  ] satisfies Array<[StartTurnRequestV1['refs'], string]>)('rejects non-authoritative references', async (refs, code) => {
    const builder = await setup()

    await expect(builder.build(request(refs), actor, 'guided_learning'))
      .rejects.toMatchObject<Partial<LearningContextError>>({ code })
  })

  it('allows guided learning to build a context without a chapter so runtime can ask the user', async () => {
    const builder = await setup()

    const context = await builder.build(request({ bookId: 'book_one' }), actor, 'guided_learning')

    expect(context.refs).toEqual({ bookId: 'book_one', documentId: 'document-book_one' })
    expect(context.authority.chapter).toBeUndefined()
  })

  it('exposes recovered mastery projections through the authorized learning state', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'learning-context-projection-'))
    roots.push(root)
    const store = createBookStore(root)
    const projected = book('book_projected', 'chapter-1', 'block-1')
    projected.masteryProjectionReadModel = {
      'evidence-1': {
        evidenceId: 'evidence-1', chapterId: 'chapter-1', conceptId: 'concept-label',
        sourceBlockId: 'block-1', mastery: { chapter: 0.7, concept: 0.6 },
        status: 'projected', projectedAt: '2026-08-14T01:00:00.000Z',
      },
    }
    await store.save(projected)
    const builder = new LearningContextBuilder({
      bookAccess: createSingleUserBookAccess(store, actor),
    })

    const context = await builder.build(request({ bookId: 'book_projected' }), actor)

    expect(context.learningStateSummary.masteryProjections).toEqual([
      {
        evidenceId: 'evidence-1', chapterId: 'chapter-1', conceptId: 'concept-label',
        sourceBlockId: 'block-1', mastery: { chapter: 0.7, concept: 0.6 },
        status: 'projected', projectedAt: '2026-08-14T01:00:00.000Z',
      },
    ])
  })

  it('treats a second actor book lookup exactly like a missing book', async () => {
    const builder = await setup()

    await expect(builder.build(
      request({ bookId: 'book_one', chapterId: 'chapter-1' }),
      { userId: 'other-user', workspaceId: 'other-workspace' },
      'guided_learning',
    )).rejects.toMatchObject({ code: 'book_not_found', message: 'book_not_found' })
  })
})
