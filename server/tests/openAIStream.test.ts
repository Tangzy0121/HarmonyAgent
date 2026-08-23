import { describe, expect, it, vi } from 'vitest'

import {
  OpenAIStreamParseError,
  parseOpenAIStream,
  type OpenAIStreamFrame,
} from '../src/agent/openAIStream.js'

function streamFromByteChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
}

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

describe('parseOpenAIStream', () => {
  it('preserves JSON and multi-byte text split across arbitrary byte chunks', async () => {
    const encoded = bytes(
      ': keepalive\n\n' +
      'data: {"choices":[{"delta":{"content":"监督学习"}}]}\n\n' +
      'data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":3,"total_tokens":15}}\n\n' +
      'data: [DONE]\n\n',
    )
    const chineseStart = encoded.indexOf(bytes('监督学习')[0])
    const chunks = [
      encoded.slice(0, 2),
      encoded.slice(2, 7),
      encoded.slice(7, chineseStart + 1),
      encoded.slice(chineseStart + 1, chineseStart + 4),
      encoded.slice(chineseStart + 4, encoded.length - 9),
      encoded.slice(encoded.length - 9),
    ]
    const frames: OpenAIStreamFrame[] = []

    await parseOpenAIStream(streamFromByteChunks(chunks), (frame) => frames.push(frame))

    expect(frames).toEqual([
      { type: 'delta', text: '监督学习' },
      {
        type: 'usage',
        usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
      },
      { type: 'done' },
    ])
  })

  it('normalizes DeepSeek usage to closed top-level numeric token counters', async () => {
    const frames: OpenAIStreamFrame[] = []
    const upstream = streamFromByteChunks([bytes(
      'data: {"choices":[],"usage":{' +
      '"prompt_tokens":120,"completion_tokens":30,"total_tokens":150,' +
      '"prompt_cache_hit_tokens":80,"prompt_cache_miss_tokens":40,' +
      '"prompt_tokens_details":{"cached_tokens":80},' +
      '"completion_tokens_details":{"reasoning_tokens":12},' +
      '"unknown_tokens":999}}\n\n' +
      'data: [DONE]\n\n',
    )])

    await parseOpenAIStream(upstream, (frame) => frames.push(frame))

    expect(frames).toEqual([
      {
        type: 'usage',
        usage: {
          prompt_tokens: 120,
          completion_tokens: 30,
          total_tokens: 150,
          prompt_cache_hit_tokens: 80,
          prompt_cache_miss_tokens: 40,
        },
      },
      { type: 'done' },
    ])
  })

  it('omits usage when no known counter is a finite nonnegative safe integer', async () => {
    const frames: OpenAIStreamFrame[] = []
    const upstream = streamFromByteChunks([bytes(
      'data: {"choices":[],"usage":{' +
      '"prompt_tokens":-1,"completion_tokens":1.5,' +
      '"total_tokens":9007199254740992,' +
      '"prompt_cache_hit_tokens":"20",' +
      '"prompt_tokens_details":{"cached_tokens":20},' +
      '"unknown_tokens":12}}\n\n' +
      'data: [DONE]\n\n',
    )])

    await parseOpenAIStream(upstream, (frame) => frames.push(frame))

    expect(frames).toEqual([{ type: 'done' }])
  })

  it('ignores blank, comment, non-data, and empty data lines', async () => {
    const frames: OpenAIStreamFrame[] = []
    const upstream = streamFromByteChunks([
      bytes('\n: ping\nevent: message\ndata:\n\ndata: {"choices":[{"delta":{}}]}\n\ndata: [DONE]\n\n'),
    ])

    await parseOpenAIStream(upstream, (frame) => frames.push(frame))

    expect(frames).toEqual([{ type: 'done' }])
  })

  it('ignores valid JSON with invalid choice and non-string content shapes', async () => {
    const frames: OpenAIStreamFrame[] = []
    const upstream = streamFromByteChunks([bytes(
      'data: {"choices":"not-an-array"}\n\n' +
      'data: {"choices":[null,{"delta":"invalid"},{"delta":{"content":42}}]}\n\n' +
      'data: [DONE]\n\n',
    )])

    await parseOpenAIStream(upstream, (frame) => frames.push(frame))

    expect(frames).toEqual([{ type: 'done' }])
  })

  it('joins every data field in one SSE event before parsing its JSON payload', async () => {
    const frames: OpenAIStreamFrame[] = []
    const upstream = streamFromByteChunks([bytes(
      ': provider comment\n' +
      'event: ignored-provider-event\n' +
      'data: {"choices":[{"delta":\n' +
      'data: {"content":"多行事件"}}]}\n\n' +
      'data: [DONE]\n\n',
    )])

    await parseOpenAIStream(upstream, (frame) => frames.push(frame))

    expect(frames).toEqual([
      { type: 'delta', text: '多行事件' },
      { type: 'done' },
    ])
  })

  it('recognizes lone carriage returns as SSE line endings across chunks', async () => {
    const frames: OpenAIStreamFrame[] = []
    const payload = bytes(
      'data: {"choices":[{"delta":{"content":"回车"}}]}\r\r' +
      'data: [DONE]\r\r',
    )
    const upstream = streamFromByteChunks([
      payload.slice(0, payload.length - 2),
      payload.slice(payload.length - 2),
    ])

    await parseOpenAIStream(upstream, (frame) => frames.push(frame))

    expect(frames).toEqual([
      { type: 'delta', text: '回车' },
      { type: 'done' },
    ])
  })

  it('stops reading and safely cancels after DONE even when cancellation rejects', async () => {
    let pullCount = 0
    let cancelCount = 0
    const upstream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount += 1
        if (pullCount === 1) {
          controller.enqueue(bytes('data: [DONE]\n\n'))
          return
        }
        throw new Error('parser read beyond DONE')
      },
      cancel() {
        cancelCount += 1
        return Promise.reject(new Error('provider cancel failed'))
      },
    }, { highWaterMark: 0 })
    const frames: OpenAIStreamFrame[] = []

    await parseOpenAIStream(upstream, (frame) => frames.push(frame))

    expect(frames).toEqual([{ type: 'done' }])
    expect(pullCount).toBe(1)
    expect(cancelCount).toBe(1)
  })

  it('cancels after a parser error without masking that primary error', async () => {
    let cancelCount = 0
    const upstream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(bytes('data: {private-provider-body}\n\n'))
      },
      cancel() {
        cancelCount += 1
        return Promise.reject(new Error('provider cancel failed'))
      },
    }, { highWaterMark: 0 })

    await expect(parseOpenAIStream(upstream, vi.fn())).rejects.toMatchObject({
      code: 'invalid_upstream_stream',
      message: 'invalid_upstream_stream',
    })
    expect(cancelCount).toBe(1)
  })

  it('rejects a malformed provider data frame without exposing its contents', async () => {
    const upstream = streamFromByteChunks([bytes('data: {private-provider-body}\n\n')])

    await expect(parseOpenAIStream(upstream, vi.fn())).rejects.toEqual(
      expect.objectContaining<Partial<OpenAIStreamParseError>>({
        name: 'OpenAIStreamParseError',
        code: 'invalid_upstream_stream',
        message: 'invalid_upstream_stream',
      }),
    )
  })

  it('propagates an AbortError from the upstream reader', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    const upstream = new ReadableStream<Uint8Array>({
      pull() {
        throw abortError
      },
    })

    await expect(parseOpenAIStream(upstream, vi.fn())).rejects.toBe(abortError)
  })

  it('rejects a stream that ends before the provider DONE marker', async () => {
    const upstream = streamFromByteChunks([
      bytes('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'),
    ])

    await expect(parseOpenAIStream(upstream, vi.fn())).rejects.toMatchObject({
      code: 'incomplete_upstream_stream',
    })
  })

  it('does not dispatch a pending data event that lacks the SSE blank-line terminator at EOF', async () => {
    const frames: OpenAIStreamFrame[] = []
    const upstream = streamFromByteChunks([bytes('data: [DONE]\n')])

    await expect(parseOpenAIStream(upstream, (frame) => frames.push(frame))).rejects.toMatchObject({
      code: 'incomplete_upstream_stream',
    })
    expect(frames).toEqual([])
  })
})
