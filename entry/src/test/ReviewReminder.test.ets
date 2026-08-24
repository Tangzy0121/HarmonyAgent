import { describe, expect, it } from '@ohos/hypium'
import {
  ReminderGateway,
  ReminderIdStore,
  ReminderRegistration,
  ReviewReminderScheduler,
  ReviewTask,
  buildReminderPayload,
  reviewReminderKey
} from '../main/ets/review/ReviewReminderScheduler'

class FakeReminderGateway implements ReminderGateway {
  published: number = 0
  cancelled: Array<number> = []
  nextId: number = 41
  failPublish: boolean = false

  async publish(_task: ReviewTask): Promise<number> {
    this.published += 1
    if (this.failPublish) throw new Error('notifications_disabled')
    this.nextId += 1
    return this.nextId
  }

  async cancel(reminderId: number): Promise<void> {
    this.cancelled.push(reminderId)
  }
}

class FakeReminderStore implements ReminderIdStore {
  values: Map<string, ReminderRegistration> = new Map<string, ReminderRegistration>()

  async get(taskId: string): Promise<ReminderRegistration | null> {
    return this.values.get(taskId) ?? null
  }

  async put(taskId: string, registration: ReminderRegistration): Promise<void> {
    this.values.set(taskId, registration)
  }

  async delete(taskId: string): Promise<void> {
    this.values.delete(taskId)
  }
}

function task(dueAt: string, explicitlyScheduled: boolean = true): ReviewTask {
  return new ReviewTask('review-1', 'book-1', 'chapter-1', 'quiz-1', dueAt,
    '监督学习复习', explicitlyScheduled)
}

export default function reviewReminderTest(): void {
  describe('review reminder scheduler', () => {
    it('due_at_becomes_calendar_fields_and_want_parameters_are_allowlisted', 0, () => {
      const value = task('2026-08-15T03:04:00')
      const payload = buildReminderPayload(value)

      expect(payload.dateTime.year).assertEqual(2026)
      expect(payload.dateTime.month).assertEqual(8)
      expect(payload.dateTime.day).assertEqual(15)
      expect(payload.parameters.bookId).assertEqual('book-1')
      expect(payload.parameters.chapterId).assertEqual('chapter-1')
      expect(payload.parameters.blockId).assertEqual('quiz-1')
      expect(payload.parameters.action).assertEqual('review')
      expect(payload.parameterCount).assertEqual(4)
      expect(reviewReminderKey(value)).assertEqual(reviewReminderKey(value))
    })

    it('same_task_and_schedule_is_deduplicated_but_changed_due_at_replaces_the_old_reminder', 0, async () => {
      const gateway = new FakeReminderGateway()
      const store = new FakeReminderStore()
      const scheduler = new ReviewReminderScheduler(gateway, store)
      const first = task('2026-08-15T03:04:00.000Z')

      await scheduler.schedule(first, Date.parse('2026-08-14T00:00:00.000Z'))
      await scheduler.schedule(first, Date.parse('2026-08-14T00:00:00.000Z'))
      await scheduler.schedule(task('2026-08-16T03:04:00.000Z'), Date.parse('2026-08-14T00:00:00.000Z'))

      expect(gateway.published).assertEqual(2)
      expect(gateway.cancelled.length).assertEqual(1)
      expect(gateway.cancelled[0]).assertEqual(42)
    })

    it('only_due_or_explicit_tasks_publish_and_notification_failure_is_non_blocking', 0, async () => {
      const gateway = new FakeReminderGateway()
      const scheduler = new ReviewReminderScheduler(gateway, new FakeReminderStore())
      const futureImplicit = task('2026-08-16T00:00:00.000Z', false)

      const skipped = await scheduler.schedule(futureImplicit, Date.parse('2026-08-14T00:00:00.000Z'))
      gateway.failPublish = true
      const failed = await scheduler.schedule(task('2026-08-14T00:00:00.000Z', false),
        Date.parse('2026-08-14T00:00:00.000Z'))

      expect(skipped).assertFalse()
      expect(failed).assertFalse()
      expect(gateway.published).assertEqual(1)
    })

    it('cancel_removes_the_persisted_mapping_without_duplicate_publication', 0, async () => {
      const gateway = new FakeReminderGateway()
      const store = new FakeReminderStore()
      const scheduler = new ReviewReminderScheduler(gateway, store)
      await scheduler.schedule(task('2026-08-15T00:00:00.000Z'), Date.parse('2026-08-14T00:00:00.000Z'))

      await scheduler.cancel('review-1')
      await scheduler.cancel('review-1')

      expect(gateway.cancelled.length).assertEqual(1)
      expect(await store.get('review-1')).assertNull()
    })
  })
}
