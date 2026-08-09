import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { learningBookFixture } from '../data/learningBook'
import { BookProposalPage } from './BookProposalPage'

describe('BookProposalPage', () => {
  it('renders the editable proposal before generation is confirmed', () => {
    const html = renderToStaticMarkup(
      <BookProposalPage
        book={learningBookFixture}
        onBack={() => undefined}
        onBookChange={() => undefined}
        onConfirm={() => undefined}
      />,
    )

    expect(html).toContain('目录待确认')
    expect(html).toContain('从训练信号理解机器学习')
    expect(html).toContain('理解概念')
    expect(html).toContain('确认目录并生成')
    expect(html.match(/data-testid="book-proposal-chapter"/g)).toHaveLength(4)
  })

  it('disables deleting when only three chapters remain', () => {
    const threeChapterBook = { ...learningBookFixture, chapters: learningBookFixture.chapters.slice(0, 3) }
    const html = renderToStaticMarkup(
      <BookProposalPage
        book={threeChapterBook}
        onBack={() => undefined}
        onBookChange={() => undefined}
        onConfirm={() => undefined}
      />,
    )

    expect(html.match(/aria-label="删除第/g)).toHaveLength(3)
    expect(html.match(/disabled=""/g)).toHaveLength(8)
  })
})
