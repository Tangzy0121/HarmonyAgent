import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { createAgentEvent } from './agentEvent.js'

describe('createAgentEvent', () => {
  it('creates a V1 envelope with monotonic string IDs and stable idempotency keys', () => {
    const first = createAgentEvent({
      turnId: 'turn-1',
      sequence: 1,
      type: 'turn_started',
      payload: { capability: 'free_chat' },
      timestamp: '2026-08-14T00:00:00.000Z',
    })
    const second = createAgentEvent({
      turnId: 'turn-1',
      sequence: 2,
      type: 'content_delta',
      payload: { text: '你好' },
      timestamp: '2026-08-14T00:00:01.000Z',
    })
    const repeated = createAgentEvent({
      turnId: 'turn-1',
      sequence: 2,
      type: 'content_delta',
      payload: { text: '你好' },
      timestamp: '2026-08-14T00:00:01.000Z',
    })

    expect(first).toMatchObject({
      version: '1',
      turnId: 'turn-1',
      eventId: '1',
      timestamp: '2026-08-14T00:00:00.000Z',
      type: 'turn_started',
      payload: { capability: 'free_chat' },
    })
    expect(Number(second.eventId)).toBeGreaterThan(Number(first.eventId))
    expect(second.idempotencyKey).toBe(repeated.idempotencyKey)
    expect(Object.keys(first)).toEqual([
      'version',
      'turnId',
      'eventId',
      'timestamp',
      'idempotencyKey',
      'type',
      'payload',
    ])
  })

  it('loads the shared V1 fixture as valid complete envelopes', async () => {
    const fixturePath = new URL('../../../tests/fixtures/agent-events-v1.json', import.meta.url)
    const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as unknown[]

    expect(fixture).toHaveLength(5)
    for (const event of fixture) {
      expect(event).toMatchObject({
        version: '1',
        turnId: 'turn-fixture-1',
        eventId: expect.any(String),
        timestamp: expect.stringMatching(/^2026-08-14T/u),
        idempotencyKey: expect.any(String),
        type: expect.any(String),
        payload: expect.any(Object),
      })
    }
  })
})
