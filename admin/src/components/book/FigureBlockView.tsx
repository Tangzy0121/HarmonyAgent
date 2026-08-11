import { useEffect, useState } from 'react'
import type { FigureBlock } from '../../types/learningBook'

const MIN_SCALE = 0.5
const MAX_SCALE = 4
const SCALE_STEP = 0.5

export function FigureBlockView({ block }: { block: FigureBlock }) {
  const [svg, setSvg] = useState('')
  const [failed, setFailed] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const [scale, setScale] = useState(1)
  const caption = block.caption || block.title

  useEffect(() => {
    let cancelled = false
    setSvg('')
    setFailed(false)
    ;(async () => {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
        await mermaid.parse(block.mermaid)
        const rendered = await mermaid.render(`fig-${block.id}`, block.mermaid)
        if (!cancelled) setSvg(rendered.svg)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => { cancelled = true }
  }, [block.id, block.mermaid])

  // 大图打开时 Esc 关闭；Fake DOM 测试环境走关闭按钮路径
  useEffect(() => {
    if (!zoomed) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setZoomed(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [zoomed])

  const openZoom = () => {
    setScale(1)
    setZoomed(true)
  }

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
        <button
          type="button"
          className="book-figure__canvas"
          aria-label={`放大查看${caption}`}
          disabled={!svg}
          onClick={openZoom}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
      {block.caption && <figcaption>{block.caption}</figcaption>}
      {zoomed && (
        <div className="book-figure-zoom" role="dialog" aria-modal="true" aria-label={`大图：${caption}`}>
          <div className="book-figure-zoom__toolbar">
            <button type="button" aria-label="继续放大" disabled={scale >= MAX_SCALE} onClick={() => setScale((value) => Math.min(MAX_SCALE, value + SCALE_STEP))}>＋</button>
            <button type="button" aria-label="缩小" disabled={scale <= MIN_SCALE} onClick={() => setScale((value) => Math.max(MIN_SCALE, value - SCALE_STEP))}>－</button>
            <button type="button" aria-label="重置缩放" onClick={() => setScale(1)}>重置</button>
            <button type="button" aria-label="关闭大图" autoFocus onClick={() => setZoomed(false)}>关闭</button>
          </div>
          <div className="book-figure-zoom__stage">
            <div
              className="book-figure-zoom__content"
              style={{ transform: `scale(${scale})` }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
        </div>
      )}
    </figure>
  )
}
