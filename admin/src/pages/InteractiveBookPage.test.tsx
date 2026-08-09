import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { learningBookFixture } from '../data/learningBook'
import { advanceGeneration } from '../domain/learningBook'
import { InteractiveBookPage } from './InteractiveBookPage'

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
})
