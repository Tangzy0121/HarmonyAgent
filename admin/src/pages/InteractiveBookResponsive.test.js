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
})
