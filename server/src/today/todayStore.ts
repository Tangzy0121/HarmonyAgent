import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { TodayState } from './todayRecommendation.js'

export interface TodayStateEntry {
  state: Exclude<TodayState, 'active'>
  /** snoozed 专用：到点前不再展示 */
  untilIso?: string
  updatedAt: string
}

type TodayStateMap = Record<string, TodayStateEntry>

/** 今日推荐展示状态存储（server/data/today-state.json）；只记展示状态，不触碰学习事实 */
export interface TodayStore {
  get(id: string): Promise<TodayStateEntry | null>
  set(id: string, entry: TodayStateEntry): Promise<void>
}

export function createTodayStore(dataRoot: string): TodayStore {
  const file = path.join(dataRoot, 'today-state.json')

  async function readAll(): Promise<TodayStateMap> {
    try {
      const raw = await readFile(file, 'utf-8')
      const parsed = JSON.parse(raw) as unknown
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? parsed as TodayStateMap
        : {}
    } catch {
      return {}
    }
  }

  async function writeAll(map: TodayStateMap): Promise<void> {
    await mkdir(dataRoot, { recursive: true })
    const tmp = `${file}.tmp`
    await writeFile(tmp, JSON.stringify(map, null, 2), 'utf-8')
    await rename(tmp, file)
  }

  return {
    async get(id) {
      return (await readAll())[id] ?? null
    },
    async set(id, entry) {
      const map = await readAll()
      map[id] = entry
      await writeAll(map)
    },
  }
}
