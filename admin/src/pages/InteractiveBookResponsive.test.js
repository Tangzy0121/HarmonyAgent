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

  it('keeps pretest touch targets at the minimum 44px height', () => {
    const entryButtons = css.match(/\.pretest-entry__primary,\s*\.pretest-entry__ghost\s*\{([^}]*)\}/)?.[1]
    const option = css.match(/\.pretest-sheet__option\s*\{([^}]*)\}/)?.[1]
    const submit = css.match(/\.pretest-sheet__submit\s*\{([^}]*)\}/)?.[1]

    expect(entryButtons).toMatch(/min-height:\s*44px/)
    expect(option).toMatch(/min-height:\s*44px/)
    expect(submit).toMatch(/min-height:\s*44px/)
  })

  it('keeps the pretest entry card inside a 320px viewport', () => {
    const rule = css.match(/\.pretest-entry\s*\{([^}]*)\}/)?.[1]

    // 左右各留 12px：卡片宽度 = 视口 - 24px，320px 下不溢出
    expect(rule).toMatch(/right:\s*12px/)
    expect(rule).toMatch(/left:\s*12px/)
  })

  it('constrains the pretest sheet to the viewport width', () => {
    const rule = css.match(/\.pretest-sheet\s*\{([^}]*)\}/)?.[1]

    expect(rule).toMatch(/width:\s*100%/)
    expect(rule).toMatch(/overflow-y:\s*auto/)
  })

  it('keeps review entry buttons at the minimum 44px touch target height', () => {
    const railEntry = css.match(/\.book-generation-rail__review button\s*\{([^}]*)\}/)?.[1]
    const chapterEntry = css.match(/\.interactive-book-chapter__review button\s*\{([^}]*)\}/)?.[1]

    expect(railEntry).toMatch(/min-height:\s*44px/)
    expect(chapterEntry).toMatch(/min-height:\s*45px/)
  })

  it('keeps the review sheet quiz list scrollable inside the reused sheet shell', () => {
    const rule = css.match(/\.review-sheet__blocks\s*\{([^}]*)\}/)?.[1]

    expect(rule).toMatch(/overflow-y:\s*auto/)
  })
})
