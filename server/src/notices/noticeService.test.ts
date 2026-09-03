import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createNoticeService, type NoticeService } from './noticeService.js'

let dir: string
let service: NoticeService
let clock: Date

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'notice-service-'))
  clock = new Date('2026-08-15T10:00:00.000Z')
  service = createNoticeService(dir, () => clock)
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('NoticeService', () => {
  it('append 落通知；list 按 createdAt 降序', async () => {
    await service.append({ kind: 'chapter_ready', severity: 'info', message: 'm1', target: { bookId: 'b1' } })
    clock = new Date('2026-08-15T11:00:00.000Z')
    await service.append({ kind: 'chapter_failed', severity: 'error', message: 'm2', target: { bookId: 'b1', chapterId: 'c1' } })
    const list = await service.list()
    expect(list.map((notice) => notice.message)).toEqual(['m2', 'm1'])
    expect(list[0]).toMatchObject({ version: '1', kind: 'chapter_failed', readAt: null })
    expect(list[0].id).toMatch(/^notice_/)
  })

  it('dedupeKey 未读期间去重；已读后允许新通知', async () => {
    const first = await service.append({
      kind: 'chapter_failed', severity: 'error', message: '失败', target: { bookId: 'b1', chapterId: 'c1' },
      dedupeKey: 'chapter_failed:b1:c1',
    })
    expect(first.created).toBe(true)
    const dup = await service.append({
      kind: 'chapter_failed', severity: 'error', message: '失败', target: { bookId: 'b1', chapterId: 'c1' },
      dedupeKey: 'chapter_failed:b1:c1',
    })
    expect(dup.created).toBe(false)
    expect(dup.notice.id).toBe(first.notice.id)

    await service.markRead(first.notice.id)
    const again = await service.append({
      kind: 'chapter_failed', severity: 'error', message: '失败', target: { bookId: 'b1', chapterId: 'c1' },
      dedupeKey: 'chapter_failed:b1:c1',
    })
    expect(again.created).toBe(true)
    expect(again.notice.id).not.toBe(first.notice.id)
  })

  it('markRead 幂等；未知 id 返回 null', async () => {
    const { notice } = await service.append({ kind: 'book_ready', severity: 'info', message: 'm', target: { bookId: 'b1' } })
    const read = await service.markRead(notice.id)
    expect(read?.readAt).not.toBeNull()
    const again = await service.markRead(notice.id)
    expect(again?.readAt).toBe(read?.readAt)
    expect(await service.markRead('notice_missing')).toBeNull()
  })

  it('list 支持 bookId 过滤；unreadCountByBook 只数未读', async () => {
    await service.append({ kind: 'chapter_failed', severity: 'error', message: 'a', target: { bookId: 'b1' } })
    await service.append({ kind: 'chapter_failed', severity: 'error', message: 'b', target: { bookId: 'b1' } })
    const other = await service.append({ kind: 'parse_failed', severity: 'error', message: 'c', target: { fileName: 'x.pdf' } })
    void other
    const readOne = await service.append({ kind: 'chapter_ready', severity: 'info', message: 'd', target: { bookId: 'b1' } })
    await service.markRead(readOne.notice.id)

    expect(await service.list('b1')).toHaveLength(3)
    expect(await service.list('b2')).toHaveLength(0)
    const counts = await service.unreadCountByBook()
    expect(counts.get('b1')).toBe(2)
    expect(counts.has('b2')).toBe(false) // parse_failed 无 bookId 不计入
  })

  it('持久化：重建 service 后数据仍在', async () => {
    await service.append({ kind: 'book_ready', severity: 'info', message: 'm', target: { bookId: 'b1' } })
    const reloaded = createNoticeService(dir)
    expect(await reloaded.list()).toHaveLength(1)
  })
})
