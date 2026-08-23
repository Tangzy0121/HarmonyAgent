import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { learningBookFixture } from '../data/learningBook'
import type { StoredBook } from '../services/bookApi'
import type { LearningBookStatus } from '../types/learningBook'
import { KnowledgeLibraryPage } from './KnowledgeLibraryPage'

function realBook(status: LearningBookStatus, readyChapters = 0): StoredBook {
  return {
    ...learningBookFixture,
    id: `book-${status}-${readyChapters}`,
    proposal: { ...learningBookFixture.proposal, title: `${status} 学习书` },
    status,
    chapters: learningBookFixture.chapters.map((chapter, index) => ({
      ...chapter,
      status: index < readyChapters ? 'ready' : 'pending',
    })),
    createdAt: '2026-08-10T02:00:00.000Z',
    updatedAt: '2026-08-10T02:30:00.000Z',
    generationJobs: [],
  }
}

describe('KnowledgeLibraryPage real book entry', () => {
  it('keeps the static list unchanged when no real-book props are provided', () => {
    const html = renderToStaticMarkup(
      <KnowledgeLibraryPage isActive onOpenDocument={() => undefined} />,
    )

    expect(html).toContain('机器学习 · 第三章.pdf')
    expect(html).toContain('监督学习判断依据')
    expect(html).not.toContain('上传学习资料')
    expect(html).not.toContain('目录待确认')
  })

  it('renders the upload entry and real books with mapped status labels', () => {
    const books = [
      realBook('proposal'),
      realBook('generating', 2),
      realBook('partial', 2),
      realBook('ready', 4),
      realBook('error', 1),
    ]
    const html = renderToStaticMarkup(
      <KnowledgeLibraryPage
        isActive
        onOpenDocument={() => undefined}
        realBooks={books}
        onUploadBook={() => undefined}
        onOpenRealBook={() => undefined}
      />,
    )

    expect(html).toContain('上传学习资料')
    expect(html).toContain('proposal 学习书')
    expect(html).toContain('目录待确认')
    expect(html).toContain('生成中 2/4')
    expect(html).toContain('部分可读')
    expect(html).toContain('可阅读')
    expect(html).toContain('生成失败')
  })

  it('hides real books that do not match the current search or kind filter', () => {
    // 真实书按"资料"类别参与过滤：选中"笔记"过滤时不显示
    const books = [realBook('ready', 4)]
    const html = renderToStaticMarkup(
      <KnowledgeLibraryPage
        isActive
        onOpenDocument={() => undefined}
        realBooks={books}
        onUploadBook={() => undefined}
        onOpenRealBook={() => undefined}
      />,
    )

    expect(html).toContain('ready 学习书')
  })
})
