// 项目通知：解析/生成/失败/恢复等项目任务状态（docs/product/04 §10.2）。
// 不参与掌握投影，不修改学习事实；合同见 docs/server/functions-and-roadmap.md PR-D。

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type NoticeKind = 'chapter_failed' | 'chapter_ready' | 'book_ready' | 'parse_failed'
export type NoticeSeverity = 'info' | 'error'

export interface NoticeTarget {
  bookId?: string
  chapterId?: string
  documentId?: string
  fileName?: string
}

export interface ProjectNotice {
  version: '1'
  id: string
  kind: NoticeKind
  severity: NoticeSeverity
  message: string
  target: NoticeTarget
  createdAt: string
  readAt: string | null
}

export interface AppendNoticeInput {
  kind: NoticeKind
  severity: NoticeSeverity
  message: string
  target: NoticeTarget
  /** 未读期间同键去重（如 chapter_failed:<bookId>:<chapterId>）：重试失败不刷重复横幅 */
  dedupeKey?: string
}

interface StoredNotice extends ProjectNotice {
  dedupeKey?: string
}

export interface NoticeService {
  append(input: AppendNoticeInput): Promise<{ notice: ProjectNotice; created: boolean }>
  list(bookId?: string): Promise<ProjectNotice[]>
  markRead(id: string): Promise<ProjectNotice | null>
  unreadCountByBook(): Promise<Map<string, number>>
}

export function createNoticeService(dataRoot: string, now: () => Date = () => new Date()): NoticeService {
  const file = path.join(dataRoot, 'notices.json')

  async function readAll(): Promise<StoredNotice[]> {
    try {
      const raw = await readFile(file, 'utf-8')
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) ? parsed as StoredNotice[] : []
    } catch {
      return []
    }
  }

  async function writeAll(notices: StoredNotice[]): Promise<void> {
    await mkdir(dataRoot, { recursive: true })
    const tmp = `${file}.tmp`
    await writeFile(tmp, JSON.stringify(notices, null, 2), 'utf-8')
    await rename(tmp, file)
  }

  function toDto(notice: StoredNotice): ProjectNotice {
    const { dedupeKey: _dedupeKey, ...dto } = notice
    return dto
  }

  return {
    async append(input) {
      const notices = await readAll()
      if (input.dedupeKey !== undefined) {
        const existing = notices.find((notice) =>
          notice.dedupeKey === input.dedupeKey && notice.readAt === null)
        if (existing) return { notice: toDto(existing), created: false }
      }
      const notice: StoredNotice = {
        version: '1',
        id: `notice_${randomUUID()}`,
        kind: input.kind,
        severity: input.severity,
        message: input.message,
        target: input.target,
        createdAt: now().toISOString(),
        readAt: null,
        ...(input.dedupeKey === undefined ? {} : { dedupeKey: input.dedupeKey }),
      }
      notices.push(notice)
      await writeAll(notices)
      return { notice: toDto(notice), created: true }
    },

    async list(bookId) {
      const notices = await readAll()
      return notices
        .filter((notice) => bookId === undefined || notice.target.bookId === bookId)
        .sort((a, b) => {
          if (a.createdAt !== b.createdAt) return Date.parse(b.createdAt) - Date.parse(a.createdAt)
          return a.id.localeCompare(b.id)
        })
        .map(toDto)
    },

    async markRead(id) {
      const notices = await readAll()
      const found = notices.find((notice) => notice.id === id)
      if (!found) return null
      if (found.readAt === null) {
        found.readAt = now().toISOString()
        await writeAll(notices)
      }
      return toDto(found)
    },

    async unreadCountByBook() {
      const notices = await readAll()
      const counts = new Map<string, number>()
      for (const notice of notices) {
        if (notice.readAt !== null) continue
        const bookId = notice.target.bookId
        if (bookId === undefined) continue
        counts.set(bookId, (counts.get(bookId) ?? 0) + 1)
      }
      return counts
    },
  }
}
