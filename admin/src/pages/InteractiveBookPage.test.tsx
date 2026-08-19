import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { learningBookFixture } from '../data/learningBook'
import { advanceGeneration } from '../domain/learningBook'
import { BookBlockRenderer } from '../components/book/BookBlockRenderer'
import { BookContextBar } from '../components/book/BookContextBar'
import { InteractiveBookPage } from './InteractiveBookPage'

function findElement(root: ReactNode, type: ReactElement['type']): ReactElement | undefined {
  if (!isValidElement(root)) return undefined
  if (root.type === type) return root
  let match: ReactElement | undefined
  Children.forEach((root.props as { children?: ReactNode }).children, (child) => {
    match ??= findElement(child, type)
  })
  return match
}

describe('InteractiveBookPage', () => {
  it('renders a ready chapter with typed blocks and chapter-scoped Agent context', () => {
    const book = advanceGeneration(learningBookFixture)
    const html = renderToStaticMarkup(
      <InteractiveBookPage
        book={book}
        activeChapterId="ch-1"
        contextScope="chapter"
        onAskAgent={() => undefined}
        onBack={() => undefined}
        onBookChange={() => undefined}
        onChapterChange={() => undefined}
        onContextScopeChange={() => undefined}
        onStartDeepLearning={() => undefined}
      />,
    )

    expect(html).toContain('从训练信号理解机器学习')
    expect(html).toContain('优先参考当前章节')
    expect(html).toContain('快速验证')
    expect(html).toContain('第 4–6 页 · 3.1.1 监督学习')
    expect(html).toContain('继续生成下一章')
    expect(html).toContain('向 Agent 提问')
  })

  it('propagates chapter and block focus separately when asking Agent', () => {
    const onAskAgent = vi.fn()
    const book = advanceGeneration(learningBookFixture)

    const tree = InteractiveBookPage({
      book,
      activeChapterId: 'ch-1',
      contextScope: 'chapter',
      onAskAgent,
      onBack: () => undefined,
      onBookChange: () => undefined,
      onChapterChange: () => undefined,
      onContextScopeChange: () => undefined,
      onStartDeepLearning: () => undefined,
    })
    const contextBar = findElement(tree, BookContextBar)
    const firstBlock = findElement(tree, BookBlockRenderer)

    expect(contextBar).toBeDefined()
    expect(firstBlock).toBeDefined()
    const renderedContextBar = BookContextBar(contextBar!.props as Parameters<typeof BookContextBar>[0])
    const contextAskButton = (renderedContextBar.props as { children: ReactElement[] }).children[1]
    ;(contextAskButton.props as { onClick: () => void }).onClick()
    ;(firstBlock!.props as { onAskAgent: (blockId: string) => void; block: { id: string } }).onAskAgent(
      (firstBlock!.props as { block: { id: string } }).block.id,
    )

    expect(onAskAgent).toHaveBeenNthCalledWith(1, undefined)
    expect(onAskAgent).toHaveBeenNthCalledWith(2, 'blk-explanation-1')
  })

  it('shows an honest generation state instead of empty chapter content', () => {
    const html = renderToStaticMarkup(
      <InteractiveBookPage
        book={learningBookFixture}
        activeChapterId="ch-1"
        contextScope="chapter"
        onAskAgent={() => undefined}
        onBack={() => undefined}
        onBookChange={() => undefined}
        onChapterChange={() => undefined}
        onContextScopeChange={() => undefined}
        onStartDeepLearning={() => undefined}
      />,
    )

    expect(html).toContain('正在生成第一章')
    expect(html).toContain('完成本章生成')
  })

  it('describes later chapter generation without calling it the first chapter', () => {
    const thirdChapterBook = advanceGeneration(advanceGeneration(learningBookFixture))
    const html = renderToStaticMarkup(
      <InteractiveBookPage
        book={thirdChapterBook}
        activeChapterId="ch-3"
        contextScope="chapter"
        onAskAgent={() => undefined}
        onBack={() => undefined}
        onBookChange={() => undefined}
        onChapterChange={() => undefined}
        onContextScopeChange={() => undefined}
        onStartDeepLearning={() => undefined}
      />,
    )

    expect(html).toContain('正在生成第三章')
    expect(html).toContain('本章完成后即可开始阅读')
    expect(html).not.toContain('第一章完成后')
  })

  it('真实书 pending 章渲染「继续生成」按钮并回调；mock 书保持纯排队提示', () => {
    const pendingBook = {
      ...learningBookFixture,
      chapters: learningBookFixture.chapters.map((chapter, index) => index === 0
        ? { ...chapter, status: 'pending' as const, blocks: [] }
        : chapter),
    }
    const baseProps = {
      book: pendingBook,
      activeChapterId: 'ch-1',
      contextScope: 'chapter' as const,
      onAskAgent: () => undefined,
      onBack: () => undefined,
      onBookChange: () => undefined,
      onChapterChange: () => undefined,
      onContextScopeChange: () => undefined,
      onStartDeepLearning: () => undefined,
    }

    const html = renderToStaticMarkup(<InteractiveBookPage {...baseProps} isRealBook onResumeGeneration={() => undefined} />)
    expect(html).toContain('这一章正在排队')
    expect(html).toContain('继续生成</button>')

    const mockHtml = renderToStaticMarkup(<InteractiveBookPage {...baseProps} />)
    expect(mockHtml).toContain('这一章正在排队')
    expect(mockHtml).not.toContain('继续生成</button>')
  })
})
