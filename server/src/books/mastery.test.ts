import { describe, expect, it } from 'vitest'

import { computeMastery, MASTERY_WEIGHTS } from './mastery.js'

const at = (isCorrect: boolean, submittedAt: string) => ({ isCorrect, submittedAt })

describe('computeMastery', () => {
  it('returns 0 for an empty attempt list', () => {
    expect(computeMastery([])).toBe(0)
  })

  it('caps a single correct attempt at 0.5', () => {
    expect(computeMastery([at(true, '2026-08-11T01:00:00Z')])).toBe(0.5)
  })

  it('keeps a single wrong attempt at 0', () => {
    expect(computeMastery([at(false, '2026-08-11T01:00:00Z')])).toBe(0)
  })

  it('caps two correct attempts at 0.8', () => {
    expect(computeMastery([
      at(true, '2026-08-11T01:00:00Z'),
      at(true, '2026-08-11T02:00:00Z'),
    ])).toBe(0.8)
  })

  it('does not cap three or more attempts', () => {
    expect(computeMastery([
      at(true, '2026-08-11T01:00:00Z'),
      at(true, '2026-08-11T02:00:00Z'),
      at(true, '2026-08-11T03:00:00Z'),
    ])).toBe(1)
  })

  it('weights recent attempts more: latest wrong + four prior correct = 0.75', () => {
    // (0*1 + 1*(0.95+0.85+0.7+0.5)) / (1+0.95+0.85+0.7+0.5) = 3/4
    const fiveRecent = [
      at(true, '2026-08-11T01:00:00Z'),
      at(true, '2026-08-11T02:00:00Z'),
      at(true, '2026-08-11T03:00:00Z'),
      at(true, '2026-08-11T04:00:00Z'),
      at(false, '2026-08-11T05:00:00Z'),
    ]
    expect(computeMastery(fiveRecent)).toBe(0.75)
  })

  it('sorts unordered input by submittedAt before weighting', () => {
    const shuffled = [
      at(true, '2026-08-11T03:00:00Z'),
      at(false, '2026-08-11T05:00:00Z'),
      at(true, '2026-08-11T01:00:00Z'),
      at(true, '2026-08-11T04:00:00Z'),
      at(true, '2026-08-11T02:00:00Z'),
    ]
    expect(computeMastery(shuffled)).toBe(0.75)
  })

  it('only considers the most recent 5 attempts', () => {
    // 最早一次答对应被丢弃：最近 5 次全错 → 0
    const six = [
      at(true, '2026-08-11T01:00:00Z'),
      at(false, '2026-08-11T02:00:00Z'),
      at(false, '2026-08-11T03:00:00Z'),
      at(false, '2026-08-11T04:00:00Z'),
      at(false, '2026-08-11T05:00:00Z'),
      at(false, '2026-08-11T06:00:00Z'),
    ]
    expect(computeMastery(six)).toBe(0)
  })

  it('treats a later array position as more recent when timestamps tie', () => {
    // 同一毫秒连续作答：后追加的（最近一次）答错应拿到权重 1
    const tied = [
      at(true, '2026-08-11T01:00:00.000Z'),
      at(false, '2026-08-11T01:00:00.000Z'),
    ]
    // (0*1 + 1*0.95) / 1.95，2 次封顶 0.8 不触发
    expect(computeMastery(tied)).toBeCloseTo(0.95 / 1.95, 5)
  })

  it('exposes the recency weight table (index 0 = most recent)', () => {
    expect(MASTERY_WEIGHTS).toEqual([1, 0.95, 0.85, 0.7, 0.5])
  })
})
