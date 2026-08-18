export class ReviewTask {
  id: string
  bookId: string
  chapterId: string
  blockId: string
  dueAt: string
  title: string
  explicitlyScheduled: boolean

  constructor(id: string, bookId: string, chapterId: string, blockId: string, dueAt: string,
    title: string, explicitlyScheduled: boolean = false) {
    this.id = id
    this.bookId = bookId
    this.chapterId = chapterId
    this.blockId = blockId
    this.dueAt = dueAt
    this.title = title
    this.explicitlyScheduled = explicitlyScheduled
  }
}

export class ReminderDateTime {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number

  constructor(value: Date) {
    this.year = value.getFullYear()
    this.month = value.getMonth() + 1
    this.day = value.getDate()
    this.hour = value.getHours()
    this.minute = value.getMinutes()
    this.second = value.getSeconds()
  }
}

export class ReminderParameters {
  bookId: string
  chapterId: string
  blockId: string
  action: string = 'review'

  constructor(task: ReviewTask) {
    this.bookId = task.bookId
    this.chapterId = task.chapterId
    this.blockId = task.blockId
  }
}

export class ReviewReminderPayload {
  dateTime: ReminderDateTime
  parameters: ReminderParameters
  parameterCount: number = 4

  constructor(dateTime: ReminderDateTime, parameters: ReminderParameters) {
    this.dateTime = dateTime
    this.parameters = parameters
  }
}

export function buildReminderPayload(task: ReviewTask): ReviewReminderPayload {
  return new ReviewReminderPayload(new ReminderDateTime(new Date(task.dueAt)), new ReminderParameters(task))
}

export function reviewReminderKey(task: ReviewTask): string {
  return `${task.id}|${task.bookId}|${task.chapterId}|${task.blockId}|${task.dueAt}`
}

export class ReminderRegistration {
  reminderId: number
  fingerprint: string

  constructor(reminderId: number, fingerprint: string) {
    this.reminderId = reminderId
    this.fingerprint = fingerprint
  }
}

export interface ReminderGateway {
  publish(task: ReviewTask): Promise<number>
  cancel(reminderId: number): Promise<void>
}

export interface ReminderIdStore {
  get(taskId: string): Promise<ReminderRegistration | null>
  put(taskId: string, registration: ReminderRegistration): Promise<void>
  delete(taskId: string): Promise<void>
}

export class ReviewReminderScheduler {
  private gateway: ReminderGateway
  private store: ReminderIdStore

  constructor(gateway: ReminderGateway, store: ReminderIdStore) {
    this.gateway = gateway
    this.store = store
  }

  async schedule(task: ReviewTask, now: number = Date.now()): Promise<boolean> {
    const dueAt: number = Date.parse(task.dueAt)
    if (!Number.isFinite(dueAt) || (!task.explicitlyScheduled && dueAt > now)) return false
    const fingerprint: string = reviewReminderKey(task)
    const current: ReminderRegistration | null = await this.store.get(task.id)
    if (current !== null && current.fingerprint === fingerprint) return true
    try {
      if (current !== null) {
        await this.gateway.cancel(current.reminderId)
        await this.store.delete(task.id)
      }
      const reminderId: number = await this.gateway.publish(task)
      await this.store.put(task.id, new ReminderRegistration(reminderId, fingerprint))
      return true
    } catch (_error) {
      return false
    }
  }

  async cancel(taskId: string): Promise<boolean> {
    const current: ReminderRegistration | null = await this.store.get(taskId)
    if (current === null) return true
    try {
      await this.gateway.cancel(current.reminderId)
      await this.store.delete(taskId)
      return true
    } catch (_error) {
      return false
    }
  }
}
