import { describe, expect, it } from 'vitest'

import { ProjectionRecoveryWorker } from './projectionRecoveryWorker.js'

interface ScheduledTask {
  callback: () => void | Promise<void>
  cancelled: boolean
}

function controlledScheduler() {
  const tasks: ScheduledTask[] = []
  return {
    tasks,
    scheduler: {
      schedule(_delayMs: number, callback: () => void | Promise<void>) {
        const task = { callback, cancelled: false }
        tasks.push(task)
        return task
      },
      cancel(task: ScheduledTask) { task.cancelled = true },
    },
  }
}

describe('ProjectionRecoveryWorker', () => {
  it('drains at startup and keeps a stoppable scan scheduled after recovery succeeds', async () => {
    const controlled = controlledScheduler()
    const logs: unknown[] = []
    let attempt = 0
    const worker = new ProjectionRecoveryWorker({
      drain: async () => ++attempt === 1
        ? { projected: 1, pending: 1 }
        : { projected: 1, pending: 0 },
      scheduler: controlled.scheduler,
      retryDelayMs: 10,
      logger: (event) => logs.push(event),
    })

    await worker.start()
    expect(controlled.tasks).toHaveLength(1)
    await controlled.tasks[0].callback()

    expect(attempt).toBe(2)
    expect(controlled.tasks).toHaveLength(2)
    expect(logs).toEqual([
      { category: 'projection_recovery', projected: 1, pending: 1 },
      { category: 'projection_recovery', projected: 1, pending: 0 },
    ])
    worker.stop()
    expect(controlled.tasks[1].cancelled).toBe(true)
  })

  it('discovers pending work created after an initially empty startup drain', async () => {
    const controlled = controlledScheduler()
    let pending = 0
    const worker = new ProjectionRecoveryWorker({
      drain: async () => ({ projected: 0, pending }),
      scheduler: controlled.scheduler,
      retryDelayMs: 10,
    })

    await worker.start()
    expect(controlled.tasks).toHaveLength(1)
    pending = 1
    await controlled.tasks[0].callback()

    expect(controlled.tasks).toHaveLength(2)
    worker.stop()
  })

  it('logs only a fixed failure code, schedules retry, and stop cancels the timer', async () => {
    const controlled = controlledScheduler()
    const logs: unknown[] = []
    const worker = new ProjectionRecoveryWorker({
      drain: async () => { throw new Error('private evidence and projector output') },
      scheduler: controlled.scheduler,
      retryDelayMs: 10,
      logger: (event) => logs.push(event),
    })

    await worker.start()
    worker.stop()

    expect(logs).toEqual([{ category: 'projection_recovery_failed', code: 'drain_failed' }])
    expect(JSON.stringify(logs)).not.toContain('private evidence')
    expect(controlled.tasks[0].cancelled).toBe(true)
  })
})
