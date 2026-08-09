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

  it('ignores blank, comment, non-data, and empty data lines', async () => {
    const frames: OpenAIStreamFrame[] = []
    const upstream = streamFromByteChunks([
      bytes('\n: ping\nevent: message\ndata:\n\ndata: {"choices":[{"delta":{}}]}\n\ndata: [DONE]\n'),
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

  it('stops reading immediately after DONE without cancelling the provider stream', async () => {
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
      },
    }, { highWaterMark: 0 })
    const frames: OpenAIStreamFrame[] = []

    await parseOpenAIStream(upstream, (frame) => frames.push(frame))

    expect(frames).toEqual([{ type: 'done' }])
    expect(pullCount).toBe(1)
    expect(cancelCount).toBe(0)
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
})
