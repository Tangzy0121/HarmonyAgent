import { describe, expect, it } from 'vitest'

import { splitIntoVirtualPages } from './virtualPages.js'

describe('splitIntoVirtualPages', () => {
  it('returns no pages for empty text', () => {
    expect(splitIntoVirtualPages('')).toEqual([])
    expect(splitIntoVirtualPages('   \n\n  ')).toEqual([])
  })

  it('keeps short text on a single 1-based page', () => {
    expect(splitIntoVirtualPages('短文本')).toEqual([{ page: 1, text: '短文本' }])
  })

  it('splits at a paragraph boundary near the page size instead of mid-paragraph', () => {
    const paraA = '甲'.repeat(1400)
    const paraB = '乙'.repeat(1400)
    const text = `${paraA}\n\n${paraB}\n\n${'丙'.repeat(400)}`

    const pages = splitIntoVirtualPages(text, { pageSize: 1500 })

    expect(pages).toHaveLength(3)
    expect(pages[0].text).toBe(paraA)
    expect(pages[1].text).toBe(paraB)
    expect(pages[2].text).toBe('丙'.repeat(400))
    expect(pages.map((page) => page.page)).toEqual([1, 2, 3])
  })

  it('hard-cuts at the page size when no paragraph boundary is nearby', () => {
    const text = '字'.repeat(3200)

    const pages = splitIntoVirtualPages(text, { pageSize: 1500 })

    expect(pages).toHaveLength(3)
    expect(pages[0].text).toHaveLength(1500)
    expect(pages[1].text).toHaveLength(1500)
    expect(pages[2].text).toHaveLength(200)
  })

  it('does not create a trailing empty page when text lands exactly on the page size', () => {
    const pages = splitIntoVirtualPages('字'.repeat(1500), { pageSize: 1500 })
    expect(pages).toHaveLength(1)
  })
})
