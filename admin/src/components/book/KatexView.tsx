import { useEffect, useRef } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

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

/** 同步渲染 KaTeX，避免多个公式各自懒加载时产生竞态；解析失败时回退原始文本。 */
export function KatexView({ tex, displayMode = false }: KatexViewProps) {
  const hostRef = useRef<HTMLSpanElement>(null)
  let html: string
  try {
    html = katex.renderToString(tex, { displayMode, throwOnError: false })
  } catch {
    return <span className="katex-host katex-host--fallback">{tex}</span>
  }

  useEffect(() => {
    let observer: ResizeObserver | undefined
    const timer = window.setTimeout(() => {
      if (!displayMode || !hostRef.current) return
      fitDisplayToWidth(hostRef.current)
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => {
          if (hostRef.current) fitDisplayToWidth(hostRef.current)
        })
        observer.observe(hostRef.current)
      }
    }, 0)
    return () => {
      window.clearTimeout(timer)
      observer?.disconnect()
    }
  }, [displayMode, html])

  return (
    <span
      ref={hostRef}
      className={displayMode ? 'katex-host katex-host--display' : 'katex-host'}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
