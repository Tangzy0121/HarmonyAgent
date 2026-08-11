import { useEffect, useRef, useState } from 'react'

interface KatexViewProps {
  tex: string
  displayMode?: boolean
}

/** 懒加载 KaTeX 渲染 LaTeX；加载或解析失败时回退为原始文本，不影响页面其余部分。 */
export function KatexView({ tex, displayMode = false }: KatexViewProps) {
  const hostRef = useRef<HTMLSpanElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setFailed(false)
    ;(async () => {
      try {
        const katex = (await import('katex')).default
        await import('katex/dist/katex.min.css')
        const html = katex.renderToString(tex, { displayMode, throwOnError: false })
        if (!cancelled && hostRef.current) hostRef.current.innerHTML = html
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => { cancelled = true }
  }, [tex, displayMode])

  if (failed) return <span className="katex-host katex-host--fallback">{tex}</span>
  return (
    <span ref={hostRef} className={displayMode ? 'katex-host katex-host--display' : 'katex-host'}>
      {tex}
    </span>
  )
}
