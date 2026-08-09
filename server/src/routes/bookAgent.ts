import { randomUUID } from 'node:crypto'

import { Router, type Response } from 'express'

import {
  BookAgentValidationError,
  normalizeBookAgentRequest,
} from '../agent/bookAgentContract.js'
import { buildBookAgentMessages } from '../agent/bookAgentPrompt.js'
import {
  OpenAIStreamParseError,
  parseOpenAIStream,
  type OpenAIStreamUsage,
} from '../agent/openAIStream.js'

interface BookAgentEnvironment {
  LLM_API_KEY?: string
  LLM_BASE_URL?: string
  LLM_MODEL?: string
}

interface BookAgentRouterDependencies {
  fetchImpl?: typeof fetch
  env?: BookAgentEnvironment
  createTurnId?: () => string
}

const FAILURE_MESSAGE = '学习助手生成失败，请稍后重试。'
const NOT_CONFIGURED_MESSAGE = '学习助手暂时不可用，请稍后再试。'

class UpstreamHttpError extends Error {
  constructor() {
    super('upstream_unavailable')
    this.name = 'UpstreamHttpError'
  }
}

function writeEvent(res: Response, type: string, data: unknown): void {
  if (res.destroyed || res.writableEnded) return
  res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)
}

function safeStreamError(error: unknown): { code: string; message: string } {
  if (error instanceof OpenAIStreamParseError) {
    return { code: error.code, message: FAILURE_MESSAGE }
  }
  return { code: 'upstream_unavailable', message: FAILURE_MESSAGE }
}

export function createBookAgentRouter(
  dependencies: BookAgentRouterDependencies = {},
): Router {
  const router = Router()
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch
  const env = dependencies.env ?? process.env
  const createTurnId = dependencies.createTurnId ?? randomUUID

  router.post('/book-chat', async (req, res) => {
    let request
    try {
      request = normalizeBookAgentRequest(req.body)
    } catch (error) {
      const code = error instanceof BookAgentValidationError ? error.code : 'invalid_context'
      res.status(400).json({ error: code })
      return
    }

    const apiKey = env.LLM_API_KEY?.trim() ?? ''
    if (!apiKey) {
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
    let timedOut = false
    const onClientAbort = () => {
      disconnected = true
      abortController.abort(new DOMException('Client disconnected', 'AbortError'))
    }
    const onResponseClose = () => {
      if (!res.writableFinished) onClientAbort()
    }
    req.once('aborted', onClientAbort)
    res.once('close', onResponseClose)
    const timeout = setTimeout(() => {
      timedOut = true
      abortController.abort(new DOMException('Upstream timed out', 'TimeoutError'))
    }, 60_000)
    timeout.unref()

    writeEvent(res, 'start', { turnId: createTurnId() })
    writeEvent(res, 'sources', { sources: request.context?.sources ?? [] })

    try {
      const baseUrl = (env.LLM_BASE_URL?.trim() || 'https://api.deepseek.com').replace(/\/$/u, '')
      const upstream = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: env.LLM_MODEL?.trim() || 'deepseek-v4-flash',
          messages: buildBookAgentMessages(request),
          stream: true,
          stream_options: { include_usage: true },
          max_completion_tokens: 1200,
          temperature: 0.2,
        }),
        signal: abortController.signal,
      })

      if (!upstream.ok) throw new UpstreamHttpError()
      if (!upstream.body) throw new OpenAIStreamParseError('invalid_upstream_stream')

      let usage: OpenAIStreamUsage | undefined
      await parseOpenAIStream(upstream.body, (frame) => {
        if (frame.type === 'delta') writeEvent(res, 'delta', { text: frame.text })
        if (frame.type === 'usage') usage = frame.usage
      })

      if (!abortController.signal.aborted && !res.destroyed) {
        writeEvent(res, 'done', usage === undefined ? {} : { usage })
        res.end()
      }
    } catch (error) {
      if (!disconnected && !res.destroyed) {
        const payload = timedOut
          ? { code: 'upstream_timeout', message: FAILURE_MESSAGE }
          : safeStreamError(error)
        writeEvent(res, 'error', payload)
        res.end()
      }
    } finally {
      clearTimeout(timeout)
      req.removeListener('aborted', onClientAbort)
      res.removeListener('close', onResponseClose)
    }
  })

  return router
}
