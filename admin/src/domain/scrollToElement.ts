/**
 * 等目标元素出现后滚动到位：章节切换是异步渲染，固定延时滚动会与提交竞争，
 * 元素尚不存在时静默失败。按固定间隔重试，直到元素出现或重试耗尽。
 */
export function scrollToElementWhenReady(
  id: string,
  options: { behavior: ScrollBehavior },
  retries = 20,
  intervalMs = 100,
): void {
  const attempt = (attemptsLeft: number): void => {
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: options.behavior, block: 'center' })
      return
    }
    if (attemptsLeft > 0) setTimeout(() => attempt(attemptsLeft - 1), intervalMs)
  }
  attempt(retries)
}
