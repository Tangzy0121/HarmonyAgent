import { describe, expect, it } from 'vitest'

import { createHash, createHmac } from 'node:crypto'
import { createBookStore, type BookStore } from '../books/bookStore.js'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { LearningEvidenceV1, StoredBook } from '../books/bookTypes.js'
import { computeMastery } from '../books/mastery.js'
import {
  LearningEvidenceService,
  migrateLegacyLearningEvidence,
} from './learningEvidenceService.js'
import { MasteryProjector } from './masteryProjector.js'

const actor = { userId: 'user-1', workspaceId: 'workspace-1' }

function book(): StoredBook {
  return {
    id: 'book_one',
    source: { id: 'doc-1', fileName: 'a.pdf', format: 'PDF', pageCount: 1, sizeLabel: '1 KB', updatedLabel: '今天' },
    goal: '理解概念', learnerLevel: '入门',
    proposal: { title: '书', description: '', rationale: '', estimatedMinutes: 5 },
    status: 'ready', activeChapterId: 'ch-1',
    chapters: [{
      id: 'ch-1', title: '章', order: 1, objective: '', coreConceptId: 'concept-1',
      estimatedMinutes: 5, sourceAnchors: [], status: 'ready',
      blocks: [{
        id: 'quiz-1', type: 'quiz', status: 'ready', title: '题', revision: 1,
        sourceAnchors: [], conceptId: 'concept-1', question: '敏感题目全文',
        options: [{ id: 'a', marker: 'A', text: '甲' }, { id: 'b', marker: 'B', text: '乙' }],
        correctAnswerId: 'a', feedback: '',
      }, {
        id: 'flash-1', type: 'flash_cards', status: 'ready', title: '卡', revision: 1,
        sourceAnchors: [], cards: [{ front: '正', back: '反' }],
      }],
    }],
    userNotes: [], quizAttempts: [], evidence: [], reviewSchedule: {},
    createdAt: '2026-08-14T00:00:00.000Z', updatedAt: '2026-08-14T00:00:00.000Z',
    generationJobs: [],
  }
}

function memoryStore(initial = book()): BookStore & { current: StoredBook } {
  let current = structuredClone(initial)
  return {
    get current() { return current },
    async save(value) { current = structuredClone(value) },
    async get(id) { return id === current.id ? structuredClone(current) : null },
    async list() { return [structuredClone(current)] },
    async remove() { return false },
    async update(id, mutator) {
      if (id !== current.id) throw new Error('book_not_found')
      const next = structuredClone(current)
      const result = await mutator(next)
      current = next
      return { book: structuredClone(current), result }
    },
  }
}

const evidence: LearningEvidenceV1 = {
  version: '1', id: 'evidence_stable', kind: 'review', chapterId: 'ch-1',
  conceptId: 'concept-1', sourceBlockId: 'flash-1', statement: '复习记住',
  outcome: 'mastered', createdAt: '2026-08-14T01:00:00.000Z',
  payload: { reviewKind: 'flash_cards', remembered: true },
}

function receiptFor(
  service: LearningEvidenceService,
  value: LearningEvidenceV1 = evidence,
  receiptActor = actor,
  receiptBookId = 'book_one',
  ttlMs?: number,
) {
  const { id: _id, createdAt: _createdAt, ...draft } = value
  return service.issueEvidenceReceipt(receiptActor, receiptBookId, draft, { ttlMs })
}

describe('migrateLegacyLearningEvidence', () => {
  it('backfills deterministic quiz evidence so old attempts keep their mastery result', () => {
    const legacy = book()
    legacy.evidence = []
    legacy.quizAttempts = [
      { id: 'attempt-1', chapterId: 'ch-1', blockId: 'quiz-1', answerId: 'a', isCorrect: true, submittedAt: '2026-08-14T01:00:00.000Z' },
      { id: 'attempt-2', chapterId: 'ch-1', blockId: 'quiz-1', answerId: 'b', isCorrect: false, submittedAt: '2026-08-14T02:00:00.000Z' },
    ]

    migrateLegacyLearningEvidence(legacy)
    const firstIds = legacy.evidence.map((item) => item.id)
    migrateLegacyLearningEvidence(legacy)

    expect(legacy.evidence.map((item) => item.id)).toEqual(firstIds)
    expect(legacy.evidence).toHaveLength(2)
    const projected = new MasteryProjector().project(
      legacy.evidence as LearningEvidenceV1[],
      { chapterId: 'ch-1', conceptId: 'concept-1', sourceBlockId: 'quiz-1' },
    )
    const expected = computeMastery(legacy.quizAttempts)
    expect(projected).toEqual({ chapter: expected, concept: expected })
  })
})

describe('LearningEvidenceService', () => {
  it('does not append the same stable evidence id twice', async () => {
    const store = memoryStore()
    const service = new LearningEvidenceService({
      bookStore: store, owner: actor,
      now: () => new Date(evidence.createdAt), createId: () => 'stable', receiptSecret: 'test-secret',
    })
    const receipt = receiptFor(service)

    const first = await service.appendEvidence(actor, 'book_one', receipt)
    const second = await service.appendEvidence(actor, 'book_one', receipt)

    expect(first.appended).toBe(true)
    expect(second.appended).toBe(false)
    expect(store.current.evidence).toHaveLength(1)
  })

  it('rejects an evidence id reused with different normalized content, including legacy conflicts', async () => {
    const store = memoryStore()
    const service = new LearningEvidenceService({
      bookStore: store, owner: actor,
      now: () => new Date(evidence.createdAt), createId: () => 'stable', receiptSecret: 'test-secret',
    })
    await service.appendEvidence(actor, 'book_one', receiptFor(service))

    await expect(service.appendEvidence(actor, 'book_one', receiptFor(service, {
      ...evidence, statement: '同 id 的不同内容',
    }))).rejects.toMatchObject({ code: 'evidence_id_conflict' })

    const legacyBook = book()
    legacyBook.evidence = [{
      id: 'evidence_legacy-conflict', chapterId: 'ch-1', conceptId: 'concept-1',
      sourceBlockId: 'flash-1', statement: '旧证据', outcome: 'review',
      createdAt: '2026-08-14T00:00:00.000Z',
    }]
    const legacyService = new LearningEvidenceService({
      bookStore: memoryStore(legacyBook), owner: actor,
      now: () => new Date(evidence.createdAt), createId: () => 'legacy-conflict',
      receiptSecret: 'legacy-secret',
    })
    await expect(legacyService.appendEvidence(
      actor, 'book_one', receiptFor(legacyService),
    )).rejects.toMatchObject({ code: 'evidence_id_conflict' })
  })

  it('rejects a tampered server receipt before reading or mutating the book', async () => {
    const store = memoryStore()
    const service = new LearningEvidenceService({
      bookStore: store, owner: actor, receiptSecret: 'test-secret',
    })
    const receipt = receiptFor(service)
    const [payload, signature] = receipt.split('.')
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      evidence: LearningEvidenceV1
    }
    claims.evidence.statement = 'tampered'
    const tampered = `${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${signature}`

    await expect(service.appendEvidence(actor, 'book_one', tampered))
      .rejects.toMatchObject({ code: 'evidence_receipt_invalid' })
    expect(store.current.evidence).toEqual([])
  })

  it('rejects a signed receipt whose concept or source block does not match the book', async () => {
    const store = memoryStore()
    const service = new LearningEvidenceService({
      bookStore: store, owner: actor,
      now: () => new Date(evidence.createdAt), createId: () => 'wrong-scope',
      receiptSecret: 'test-secret',
    })
    const { id: _id, createdAt: _createdAt, ...draft } = evidence
    const wrongConcept = service.issueEvidenceReceipt(actor, 'book_one', {
      ...draft, conceptId: 'concept-other',
    })
    const wrongBlock = service.issueEvidenceReceipt(actor, 'book_one', {
      ...draft, sourceBlockId: 'flash-other',
    })

    await expect(service.appendEvidence(actor, 'book_one', wrongConcept))
      .rejects.toMatchObject({ code: 'evidence_scope_invalid' })
    await expect(service.appendEvidence(actor, 'book_one', wrongBlock))
      .rejects.toMatchObject({ code: 'evidence_scope_invalid' })
    expect(store.current.evidence).toEqual([])
  })

  it('binds receipts to actor, workspace, book, purpose, and expiry', async () => {
    let clock = Date.parse('2026-08-14T01:00:00.000Z')
    const first = book()
    const second = { ...book(), id: 'book_two' }
    const books = new Map([[first.id, structuredClone(first)], [second.id, structuredClone(second)]])
    const store: BookStore = {
      async get(id) { return structuredClone(books.get(id) ?? null) },
      async list() { return [...books.values()].map((item) => structuredClone(item)) },
      async save(value) { books.set(value.id, structuredClone(value)) },
      async remove(id) { return books.delete(id) },
      async update(id, mutator) {
        const current = books.get(id)
        if (!current) throw new Error('book_not_found')
        const next = structuredClone(current)
        const result = await mutator(next)
        books.set(id, next)
        return { book: structuredClone(next), result }
      },
    }
    const service = new LearningEvidenceService({
      bookStore: store, owner: actor, now: () => new Date(clock),
      createId: () => 'bound', receiptKeyring: {
        active: { id: 'key-1', secret: 'receipt-secret-1' }, verification: [],
      },
    })
    const receipt = receiptFor(service, evidence, actor, 'book_one', 1_000)

    await expect(service.appendEvidence(actor, 'book_two', receipt))
      .rejects.toMatchObject({ code: 'evidence_receipt_invalid' })
    await expect(service.appendEvidence(
      { userId: 'other-user', workspaceId: actor.workspaceId }, 'book_one', receipt,
    )).rejects.toMatchObject({ code: 'evidence_receipt_invalid' })
    await expect(service.appendEvidence(
      { userId: actor.userId, workspaceId: 'other-workspace' }, 'book_one', receipt,
    )).rejects.toMatchObject({ code: 'evidence_receipt_invalid' })
    clock += 1_001
    await expect(service.appendEvidence(actor, 'book_one', receipt))
      .rejects.toMatchObject({ code: 'evidence_receipt_expired' })
    expect(books.get('book_one')?.evidence).toEqual([])
    expect(books.get('book_two')?.evidence).toEqual([])
  })

  it('accepts a pre-restart receipt with the same key and supports explicit key rotation', async () => {
    const store = memoryStore()
    const oldKey = { id: 'old', secret: 'old-secret' }
    const issuer = new LearningEvidenceService({
      bookStore: store, owner: actor, receiptKeyring: { active: oldKey, verification: [] },
      now: () => new Date(evidence.createdAt), createId: () => 'restart',
    })
    const receipt = receiptFor(issuer)
    const restarted = new LearningEvidenceService({
      bookStore: store, owner: actor, receiptKeyring: { active: oldKey, verification: [] },
      now: () => new Date(evidence.createdAt),
    })
    await expect(restarted.appendEvidence(actor, 'book_one', receipt))
      .resolves.toMatchObject({ appended: true })

    const secondStore = memoryStore()
    const rotated = new LearningEvidenceService({
      bookStore: secondStore, owner: actor,
      receiptKeyring: {
        active: { id: 'new', secret: 'new-secret' }, verification: [oldKey],
      },
      now: () => new Date(evidence.createdAt),
    })
    await expect(rotated.appendEvidence(actor, 'book_one', receipt))
      .resolves.toMatchObject({ appended: true })
    const retired = new LearningEvidenceService({
      bookStore: memoryStore(), owner: actor,
      receiptKeyring: { active: { id: 'new', secret: 'new-secret' }, verification: [] },
      now: () => new Date(evidence.createdAt),
    })
    await expect(retired.appendEvidence(actor, 'book_one', receipt))
      .rejects.toMatchObject({ code: 'evidence_receipt_invalid' })
  })

  it('keeps appended evidence when projection fails and reports pending', async () => {
    const store = memoryStore()
    const projector = { project: () => { throw new Error('private projector output') } } as unknown as MasteryProjector
    const service = new LearningEvidenceService({
      bookStore: store, owner: actor, projector,
      now: () => new Date(evidence.createdAt), createId: () => 'stable', receiptSecret: 'test-secret',
    })

    const result = await service.appendEvidence(actor, 'book_one', receiptFor(service))

    expect(result.projectionStatus).toBe('pending')
    expect(store.current.evidence).toEqual([evidence])
  })

  it('rechecks cancellation inside the atomic update before appending evidence', async () => {
    const delegate = memoryStore()
    let releaseUpdate: (() => void) | undefined
    const updateReleased = new Promise<void>((resolve) => { releaseUpdate = resolve })
    let markUpdateWaiting: (() => void) | undefined
    const updateWaiting = new Promise<void>((resolve) => { markUpdateWaiting = resolve })
    const store: BookStore = {
      ...delegate,
      async update(id, mutator) {
        markUpdateWaiting?.()
        await updateReleased
        return delegate.update(id, mutator)
      },
    }
    const service = new LearningEvidenceService({
      bookStore: store, owner: actor,
      now: () => new Date(evidence.createdAt), createId: () => 'stable',
      receiptSecret: 'test-secret',
    })
    const receipt = receiptFor(service)
    const controller = new AbortController()

    const pending = service.appendEvidence(actor, 'book_one', receipt, controller.signal)
    await updateWaiting
    controller.abort(new DOMException('cancelled', 'AbortError'))
    releaseUpdate?.()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(delegate.current.evidence).toEqual([])
  })

  it('stores only an irreversible digest, length, and categorical Feynman assessment', async () => {
    const store = memoryStore()
    const service = new LearningEvidenceService({
      bookStore: store, owner: actor,
      now: () => new Date('2026-08-14T03:00:00.000Z'),
      createId: () => 'feynman-stable',
      feynmanDigestKey: 'persistent-digest-secret',
    })
    const raw = '短复述不能原样保存'

    await service.recordFeynman(actor, {
      bookId: 'book_one', chapterId: 'ch-1', confirmedText: raw,
      result: { passed: true, feedback: '讲清了核心。', gap: '' },
    })

    const saved = store.current.evidence[0] as LearningEvidenceV1
    expect(saved.kind).toBe('feynman')
    expect(saved.payload).toMatchObject({
      passed: true,
      confirmedTextLength: raw.length,
      feedbackCategory: 'positive',
      gapCategory: 'none',
    })
    expect(saved.payload).toHaveProperty(
      'confirmedTextDigest',
      createHmac('sha256', 'persistent-digest-secret').update(raw).digest('hex'),
    )
    expect(saved.payload).not.toHaveProperty(
      'confirmedTextDigest', createHash('sha256').update(raw).digest('hex'),
    )
    const serialized = JSON.stringify(saved)
    expect(serialized).not.toContain(raw)
    expect(serialized).not.toContain(raw.slice(0, 4))
    expect(serialized).not.toContain('讲清了核心。')
    expect(serialized).not.toContain('audio')
  })

  it('writes review evidence and advances the schedule together', async () => {
    const store = memoryStore()
    const service = new LearningEvidenceService({
      bookStore: store, owner: actor,
      now: () => new Date('2026-08-14T04:00:00.000Z'),
      createId: () => 'review-stable',
    })

    const result = await service.recordReview(actor, {
      bookId: 'book_one', blockId: 'flash-1', result: 'remembered',
    })

    expect(result.schedule).toMatchObject({ kind: 'flash_cards', stage: 1 })
    expect(store.current.reviewSchedule?.['flash-1']).toEqual(result.schedule)
    expect(store.current.evidence[0]).toMatchObject({ id: 'evidence_review-stable', kind: 'review' })
  })

  it('rejects a different actor or workspace before reading a book', async () => {
    const store = memoryStore()
    const service = new LearningEvidenceService({
      bookStore: store, owner: actor, receiptSecret: 'test-secret',
    })

    await expect(service.appendEvidence(
      { userId: 'user-2', workspaceId: actor.workspaceId }, 'book_one', receiptFor(service),
    )).rejects.toMatchObject({ code: 'evidence_receipt_invalid' })
  })

  it('preserves concurrent quiz, Feynman, review, and unrelated book mutations', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'learning-evidence-concurrent-'))
    try {
      const store = createBookStore(root)
      await store.save(book())
      const service = new LearningEvidenceService({ bookStore: store, owner: actor })

      await Promise.all([
        service.recordQuiz(actor, { bookId: 'book_one', blockId: 'quiz-1', answerId: 'a' }),
        service.recordFeynman(actor, {
          bookId: 'book_one', chapterId: 'ch-1', confirmedText: '短复述不能原样保存',
          result: { passed: true, feedback: '抓住核心', gap: '' },
        }),
        service.recordReview(actor, { bookId: 'book_one', blockId: 'flash-1', result: 'remembered' }),
        store.update('book_one', (current) => { current.proposal.title = '并发标题更新' }),
      ])

      const saved = (await store.get('book_one'))!
      expect(saved.proposal.title).toBe('并发标题更新')
      expect(saved.quizAttempts).toHaveLength(1)
      expect(saved.evidence.map((item) => 'kind' in item ? item.kind : 'legacy').sort())
        .toEqual(['feynman', 'quiz', 'review'])
      expect(saved.reviewSchedule?.['flash-1']).toBeDefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('persists projection pending across restart and an idempotent drain clears it', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'learning-projection-outbox-'))
    try {
      const store = createBookStore(root)
      await store.save(book())
      const failing = new LearningEvidenceService({
        bookStore: store,
        owner: actor,
        projector: { project: () => { throw new Error('private projection failure') } } as unknown as MasteryProjector,
      })

      const recorded = await failing.recordQuiz(actor, {
        bookId: 'book_one', blockId: 'quiz-1', answerId: 'a',
      })
      expect(recorded.projectionStatus).toBe('pending')
      expect(Object.values((await store.get('book_one'))?.projectionOutbox ?? {})).toHaveLength(1)

      const restarted = new LearningEvidenceService({ bookStore: store, owner: actor })
      await expect(restarted.drainProjectionOutbox(actor)).resolves.toEqual({
        projected: 1, pending: 0,
      })
      const recovered = await store.get('book_one')
      expect(recovered?.projectionOutbox).toEqual({})
      expect(Object.values(recovered?.masteryProjectionReadModel ?? {})).toEqual([
        expect.objectContaining({
          evidenceId: recorded.evidence.id, status: 'projected',
          chapterId: 'ch-1', conceptId: 'concept-1', sourceBlockId: 'quiz-1',
          mastery: { chapter: 0.5, concept: 0.5 },
        }),
      ])
      await expect(restarted.drainProjectionOutbox(actor)).resolves.toEqual({
        projected: 0, pending: 0,
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('isolates a bad pending entry and still persists the other projection read model', async () => {
    const pendingBook = book()
    pendingBook.evidence = [
      {
        version: '1', id: 'evidence-bad', kind: 'review', chapterId: 'ch-1',
        conceptId: 'concept-1', sourceBlockId: 'flash-1', statement: '复习记住',
        outcome: 'mastered', createdAt: '2026-08-14T01:00:00.000Z',
        payload: { reviewKind: 'flash_cards', remembered: true },
      }, {
        version: '1', id: 'evidence-good', kind: 'quiz', chapterId: 'ch-1',
        conceptId: 'concept-1', sourceBlockId: 'quiz-1', statement: '答对',
        outcome: 'mastered', createdAt: '2026-08-14T02:00:00.000Z',
        payload: { attemptId: 'attempt-good', answerId: 'a', isCorrect: true },
      },
    ]
    pendingBook.projectionOutbox = {
      bad: {
        id: 'bad', chapterId: 'ch-1', conceptId: 'concept-1', sourceBlockId: 'flash-1',
        evidenceId: 'evidence-bad', createdAt: '2026-08-14T01:00:00.000Z', attempts: 0,
      },
      good: {
        id: 'good', chapterId: 'ch-1', conceptId: 'concept-1', sourceBlockId: 'quiz-1',
        evidenceId: 'evidence-good', createdAt: '2026-08-14T02:00:00.000Z', attempts: 0,
      },
    }
    const store = memoryStore(pendingBook)
    const delegate = new MasteryProjector()
    const service = new LearningEvidenceService({
      bookStore: store, owner: actor,
      projector: {
        project(items, scope) {
          if (scope.sourceBlockId === 'flash-1') throw new Error('private bad projection')
          return delegate.project(items, scope)
        },
      } as MasteryProjector,
    })

    await expect(service.drainProjectionOutbox(actor)).resolves.toEqual({ projected: 1, pending: 1 })
    expect(Object.keys(store.current.projectionOutbox ?? {})).toEqual(['bad'])
    expect(store.current.masteryProjectionReadModel?.['evidence-good']).toMatchObject({
      status: 'projected', mastery: { chapter: 0.5, concept: 0.5 },
    })
  })

  it('isolates unreadable books so healthy entries recover now and repaired books recover next drain', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'learning-projection-isolation-'))
    try {
      const store = createBookStore(root)
      const pendingBook = (id: string, evidenceId: string): StoredBook => {
        const value = { ...book(), id }
        value.evidence = [{
          version: '1', id: evidenceId, kind: 'review', chapterId: 'ch-1',
          conceptId: 'concept-1', sourceBlockId: 'flash-1', statement: '复习记住',
          outcome: 'mastered', createdAt: '2026-08-14T01:00:00.000Z',
          payload: { reviewKind: 'flash_cards', remembered: true },
        }]
        value.projectionOutbox = {
          [`pending-${evidenceId}`]: {
            id: `pending-${evidenceId}`, chapterId: 'ch-1', conceptId: 'concept-1',
            sourceBlockId: 'flash-1', evidenceId, createdAt: '2026-08-14T01:00:00.000Z',
            attempts: 0,
          },
        }
        return value
      }
      const healthy = pendingBook('book_good', 'evidence-good')
      const repairable = pendingBook('book_bad', 'evidence-repaired')
      await store.save(healthy)
      await store.save(repairable)
      await writeFile(path.join(root, 'book_bad.json'), '{broken-json')
      const service = new LearningEvidenceService({ bookStore: store, owner: actor })

      await expect(service.drainProjectionOutbox(actor)).resolves.toEqual({
        projected: 1, pending: 1,
      })
      expect((await store.get('book_good'))?.masteryProjectionReadModel?.['evidence-good'])
        .toMatchObject({ status: 'projected' })

      await writeFile(path.join(root, 'book_bad.json'), JSON.stringify(repairable))
      await expect(service.drainProjectionOutbox(actor)).resolves.toEqual({
        projected: 1, pending: 0,
      })
      expect((await store.get('book_bad'))?.masteryProjectionReadModel?.['evidence-repaired'])
        .toMatchObject({ status: 'projected' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('isolates a malformed outbox entry and recovers it on a later drain after repair', async () => {
    const pendingBook = book()
    pendingBook.evidence = [
      { ...evidence, id: 'evidence-bad' },
      { ...evidence, id: 'evidence-good' },
    ]
    pendingBook.projectionOutbox = {
      bad: null as unknown as NonNullable<StoredBook['projectionOutbox']>[string],
      good: {
        id: 'good', chapterId: 'ch-1', conceptId: 'concept-1', sourceBlockId: 'flash-1',
        evidenceId: 'evidence-good', createdAt: evidence.createdAt, attempts: 0,
      },
    }
    const store = memoryStore(pendingBook)
    const service = new LearningEvidenceService({ bookStore: store, owner: actor })

    await expect(service.drainProjectionOutbox(actor)).resolves.toEqual({
      projected: 1, pending: 1,
    })
    expect(store.current.masteryProjectionReadModel?.['evidence-good'])
      .toMatchObject({ status: 'projected' })

    store.current.projectionOutbox!.bad = {
      id: 'bad', chapterId: 'ch-1', conceptId: 'concept-1', sourceBlockId: 'flash-1',
      evidenceId: 'evidence-bad', createdAt: evidence.createdAt, attempts: 0,
    }
    await expect(service.drainProjectionOutbox(actor)).resolves.toEqual({
      projected: 1, pending: 0,
    })
    expect(store.current.masteryProjectionReadModel?.['evidence-bad'])
      .toMatchObject({ status: 'projected' })
  })

  it('keeps empty-concept review projection scopes separated by chapter and block', async () => {
    const scoped = book()
    scoped.chapters[0].coreConceptId = ''
    scoped.chapters.push({
      ...structuredClone(scoped.chapters[0]),
      id: 'ch-2',
      title: '第二章',
      coreConceptId: '',
      blocks: [{
        id: 'flash-2', type: 'flash_cards', status: 'ready', title: '卡二', revision: 1,
        sourceAnchors: [], cards: [{ front: '正二', back: '反二' }],
      }],
    })
    const store = memoryStore(scoped)
    const service = new LearningEvidenceService({
      bookStore: store,
      owner: actor,
      projector: { project: () => { throw new Error('pending') } } as unknown as MasteryProjector,
    })

    await service.recordReview(actor, {
      bookId: 'book_one', blockId: 'flash-1', result: 'remembered',
    })
    await service.recordReview(actor, {
      bookId: 'book_one', blockId: 'flash-2', result: 'remembered',
    })

    const pending = Object.values(store.current.projectionOutbox ?? {})
    expect(pending).toHaveLength(2)
    expect(pending.map((entry) => [entry.chapterId, entry.sourceBlockId]).sort()).toEqual([
      ['ch-1', 'flash-1'], ['ch-2', 'flash-2'],
    ])
  })
})
