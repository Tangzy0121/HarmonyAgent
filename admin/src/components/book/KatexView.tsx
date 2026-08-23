import { useEffect, useRef, useState } from 'react'

interface KatexViewProps {
  tex: string
  displayMode?: boolean
}

/** 展示公式缩放到卡片宽度的下限，低于此仍超出时退化为横向滚动。 */
const MIN_DISPLAY_SCALE = 0.55

function fitDisplayToWidth(host: HTMLSpanElement): void {
  host.style.fontSize = ''
  const available = host.clientWidth
  const needed = host.scrollWidth
  if (available > 0 && needed > available) {
    const scale = Math.max(MIN_DISPLAY_SCALE, available / needed)
    host.style.fontSize = `${scale}em`
  }
}

/** 懒加载 KaTeX 渲染 LaTeX；加载或解析失败时回退为原始文本，不影响页面其余部分。 */
export function KatexView({ tex, displayMode = false }: KatexViewProps) {
  const hostRef = useRef<HTMLSpanElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let observer: ResizeObserver | undefined
    setFailed(false)
    ;(async () => {
      try {
        const katex = (await import('katex')).default
        await import('katex/dist/katex.min.css')
        const html = katex.renderToString(tex, { displayMode, throwOnError: false })
        if (!cancelled && hostRef.current) {
          hostRef.current.innerHTML = html
          if (displayMode) {
            fitDisplayToWidth(hostRef.current)
            if (typeof ResizeObserver !== 'undefined') {
              observer = new ResizeObserver(() => {
                if (hostRef.current) fitDisplayToWidth(hostRef.current)
              })
              observer.observe(hostRef.current)
            }
          }
        }
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
      observer?.disconnect()
    }
  }, [tex, displayMode])

  if (failed) return <span className="katex-host katex-host--fallback">{tex}</span>
  return (
    <span ref={hostRef} className={displayMode ? 'katex-host katex-host--display' : 'katex-host'}>
      {tex}
    </span>
  )
}
