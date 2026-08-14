import { randomUUID } from 'node:crypto'

import { json, Router, type ErrorRequestHandler, type Response } from 'express'

import {
  BookAgentValidationError,
  normalizeBookAgentRequest,
} from '../agent/bookAgentContract.js'
import { buildBookAgentMessages } from '../agent/bookAgentPrompt.js'
import {
  BookAgentRunnerError,
  createBookAgentRunner,
  type BookAgentEnvironment,
  type BookAgentLogEvent,
  type BookAgentLogger,
} from '../agent/runtime/bookAgentRunner.js'

export type { BookAgentLogEvent, BookAgentLogger }

interface BookAgentRouterDependencies {
  fetchImpl?: typeof fetch
  env?: BookAgentEnvironment
  createTurnId?: () => string
  logger?: BookAgentLogger
  buildMessages?: typeof buildBookAgentMessages
}

const FAILURE_MESSAGE = '学习助手生成失败，请稍后重试。'
const NOT_CONFIGURED_MESSAGE = '学习助手暂时不可用，请稍后再试。'

function writeEvent(res: Response, type: string, data: unknown): void {
  if (res.destroyed || res.writableEnded) return
  res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)
}

export function createBookAgentRouter(
  dependencies: BookAgentRouterDependencies = {},
): Router {
  const router = Router()
  const createTurnId = dependencies.createTurnId ?? randomUUID
  const runner = createBookAgentRunner(dependencies)

  router.use(json({ limit: '10mb' }))

  router.post('/book-chat', async (req, res) => {
    let request
    try {
      request = normalizeBookAgentRequest(req.body)
    } catch (error) {
      const code = error instanceof BookAgentValidationError ? error.code : 'invalid_context'
      res.status(400).json({ error: code })
      return
    }
    if (!runner.isConfigured()) {
      res.status(503).json({ error: 'agent_not_configured', message: NOT_CONFIGURED_MESSAGE })
      return
    }

    res.status(200)
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    const abortController = new AbortController()
    let disconnected = false
    const onClientAbort = () => {
      disconnected = true
      abortController.abort(new DOMException('Client disconnected', 'AbortError'))
    }
    const onResponseClose = () => {
      if (!res.writableFinished) onClientAbort()
    }
    req.once('aborted', onClientAbort)
    res.once('close', onResponseClose)

    try {
      writeEvent(res, 'start', { turnId: createTurnId() })
      writeEvent(res, 'sources', { sources: request.context?.sources ?? [] })
      const result = await runner.run(request, {
        onDelta(text) {
          writeEvent(res, 'delta', { text })
        },
      }, { signal: abortController.signal })
      if (!abortController.signal.aborted && !res.destroyed) {
        writeEvent(res, 'done', result.usage === undefined ? {} : { usage: result.usage })
        res.end()
      }
    } catch (error) {
      if (!disconnected && !res.destroyed) {
        if (!(error instanceof BookAgentRunnerError)) runner.reportInternalError(error)
        const code = error instanceof BookAgentRunnerError
          ? error.code
          : 'upstream_unavailable'
        writeEvent(res, 'error', { code, message: FAILURE_MESSAGE })
        res.end()
      }
    } finally {
      req.removeListener('aborted', onClientAbort)
      res.removeListener('close', onResponseClose)
    }
  })

  const jsonErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
    const candidate = error as SyntaxError & { status?: unknown; type?: unknown }
    if (
      error instanceof SyntaxError &&
      candidate.status === 400 &&
      candidate.type === 'entity.parse.failed'
    ) {
      res.status(400).json({ error: 'invalid_json' })
      return
    }
    next(error)
  }
  router.use(jsonErrorHandler)

  return router
}
