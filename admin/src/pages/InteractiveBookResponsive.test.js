import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

describe('interactive book responsive shell', () => {
  it('uses the app container instead of the browser viewport for the split layout', () => {
    expect(css).toContain('container-name: interactive-book-shell')
    expect(css).toContain('@container interactive-book-shell (min-width: 860px)')
    expect(css).not.toContain('@media (min-width: 860px) {\n  .interactive-book-page')
  })

  it('hides the global identity control while a book-owned header is visible', () => {
    expect(css).toContain('.prototype-app--book.prototype-app--third-batch-shell .app-shell__identity')
  })

  it('keeps the drawer context toggle at the minimum touch target height', () => {
    const rule = css.match(/\.context-row button,\s*\.context-add\s*\{([^}]*)\}/)?.[1]

    expect(rule).toMatch(/min-height:\s*44px/)
  })

  it('gives book pages their own scroll container inside the clipped shell', () => {
    const rule = css.match(/\.prototype-app--third-batch-shell :is\(\s*\.book-proposal-page,\s*\.interactive-book-page\s*\)\s*\{([^}]*)\}/)?.[1]

    expect(rule).toMatch(/height:\s*100%/)
    expect(rule).toMatch(/min-height:\s*0/)
    expect(rule).toMatch(/overflow-y:\s*auto/)
  })

  it('keeps the upload sheet submit button clear of the bottom navigation', () => {
    const rule = css.match(/\.upload-book-sheet\s*\{([^}]*)\}/)?.[1]

    // 底部导航高约 60px，sheet 需留出 120px+ 底部余量且自身可滚动，提交按钮不被遮挡
    expect(rule).toMatch(/overflow-y:\s*auto/)
    expect(rule).toMatch(/calc\(120px \+ env\(safe-area-inset-bottom\)\)/)
  })
})
