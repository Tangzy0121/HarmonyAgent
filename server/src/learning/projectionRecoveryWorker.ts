export interface ProjectionRecoveryLogEvent {
  category: 'projection_recovery' | 'projection_recovery_failed'
  projected?: number
  pending?: number
  code?: 'drain_failed'
}

export interface ProjectionRecoveryScheduler {
  schedule(delayMs: number, callback: () => void | Promise<void>): unknown
  cancel(handle: unknown): void
}

interface ProjectionRecoveryWorkerDependencies {
  drain: () => Promise<{ projected: number; pending: number }>
  scheduler?: ProjectionRecoveryScheduler
  retryDelayMs?: number
  logger?: (event: ProjectionRecoveryLogEvent) => void
}

const defaultScheduler: ProjectionRecoveryScheduler = {
  schedule(delayMs, callback) {
    const timer = setTimeout(() => { void callback() }, delayMs)
    timer.unref()
    return timer
  },
  cancel(handle) {
    clearTimeout(handle as NodeJS.Timeout)
  },
}

export class ProjectionRecoveryWorker {
  private readonly drain: ProjectionRecoveryWorkerDependencies['drain']
  private readonly scheduler: ProjectionRecoveryScheduler
  private readonly retryDelayMs: number
  private readonly logger: NonNullable<ProjectionRecoveryWorkerDependencies['logger']>
  private active = false
  private scheduled: unknown

  constructor(dependencies: ProjectionRecoveryWorkerDependencies) {
    this.drain = dependencies.drain
    this.scheduler = dependencies.scheduler ?? defaultScheduler
    this.retryDelayMs = dependencies.retryDelayMs ?? 30_000
    this.logger = dependencies.logger ?? (() => undefined)
  }

  async start(): Promise<void> {
    if (this.active) return
    this.active = true
    await this.runOnce()
  }

  stop(): void {
    this.active = false
    if (this.scheduled !== undefined) {
      this.scheduler.cancel(this.scheduled)
      this.scheduled = undefined
    }
  }

  private emit(event: ProjectionRecoveryLogEvent): void {
    try {
      this.logger(event)
    } catch {
      // Recovery observability must not alter scheduling or shutdown.
    }
  }

  private scheduleRetry(): void {
    if (!this.active || this.scheduled !== undefined) return
    this.scheduled = this.scheduler.schedule(this.retryDelayMs, async () => {
      this.scheduled = undefined
      if (this.active) await this.runOnce()
    })
  }

  private async runOnce(): Promise<void> {
    try {
      const result = await this.drain()
      this.emit({ category: 'projection_recovery', ...result })
      this.scheduleRetry()
    } catch {
      this.emit({ category: 'projection_recovery_failed', code: 'drain_failed' })
      this.scheduleRetry()
    }
  }
}
