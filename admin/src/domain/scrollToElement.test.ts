import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { scrollToElementWhenReady } from './scrollToElement'

// 项目测试运行在 node 环境（无 jsdom），document 用最小桩替代
describe('scrollToElementWhenReady', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('scrolls immediately when the element already exists', () => {
    const el = { scrollIntoView: vi.fn() }
    vi.stubGlobal('document', { getElementById: (id: string) => (id === 'target' ? el : null) })

    scrollToElementWhenReady('target', { behavior: 'auto' })

    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' })
  })

  it('waits for a late-rendered element instead of silently giving up', () => {
    let el: { scrollIntoView: ReturnType<typeof vi.fn> } | null = null
    vi.stubGlobal('document', { getElementById: () => el })
    const scrollIntoView = vi.fn()

    scrollToElementWhenReady('late', { behavior: 'smooth' })
    expect(scrollIntoView).not.toHaveBeenCalled()

    // 元素在 250ms 后才渲染出来（模拟章节切换后的异步提交）
    vi.advanceTimersByTime(250)
    expect(scrollIntoView).not.toHaveBeenCalled()
    el = { scrollIntoView }
    vi.advanceTimersByTime(100)
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
  })

  it('stops retrying without throwing when the element never appears', () => {
    vi.stubGlobal('document', { getElementById: () => null })

    expect(() => {
      scrollToElementWhenReady('missing', { behavior: 'auto' }, 3, 50)
      vi.advanceTimersByTime(1_000)
    }).not.toThrow()
  })
})
