import { useEffect, useRef, useState } from 'react'
import type { FigureBlock } from '../../types/learningBook'

export function FigureBlockView({ block }: { block: FigureBlock }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setFailed(false)
    ;(async () => {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
        await mermaid.parse(block.mermaid)
        const { svg } = await mermaid.render(`fig-${block.id}`, block.mermaid)
        if (!cancelled && hostRef.current) hostRef.current.innerHTML = svg
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => { cancelled = true }
  }, [block.id, block.mermaid])

  return (
    <figure className="book-figure">
      {failed ? (
        <div className="book-figure__fallback" role="status">
          <p>图示生成失败，可查看源码或重新生成本章。</p>
          <details>
            <summary>查看图源码</summary>
            <pre>{block.mermaid}</pre>
          </details>
        </div>
      ) : (
        <div ref={hostRef} className="book-figure__canvas" aria-label={block.caption || block.title} />
      )}
      {block.caption && <figcaption>{block.caption}</figcaption>}
    </figure>
  )
}
