import { useEffect, useRef, useState } from 'react'
import type { FigureBlock } from '../../types/learningBook'

const MIN_SCALE = 0.5
const MAX_SCALE = 4
const SCALE_STEP = 0.5

// 与书本暖白/陶土色板对齐的 mermaid 主题；fontSize 保证小屏缩放后仍可读
const MERMAID_CONFIG = {
  startOnLoad: false,
  securityLevel: 'strict' as const,
  theme: 'base' as const,
  themeVariables: {
    background: '#ffffff',
    primaryColor: '#f5f1eb',
    primaryTextColor: '#211f1e',
    primaryBorderColor: '#9c5848',
    lineColor: '#6f665e',
    secondaryColor: '#fbfaf7',
    tertiaryColor: '#f5f1eb',
    fontSize: '16px',
  },
}

export function FigureBlockView({ block }: { block: FigureBlock }) {
  const [svg, setSvg] = useState('')
  const [failed, setFailed] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; baseX: number; baseY: number } | null>(null)
  const caption = block.caption || block.title

  useEffect(() => {
    let cancelled = false
    setSvg('')
    setFailed(false)
    ;(async () => {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize(MERMAID_CONFIG)
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

  // 滚轮缩放需要非 passive 监听才能阻止页面滚动；Fake DOM 下 addEventListener 为空操作，由按钮路径覆盖测试
  useEffect(() => {
    if (!zoomed) return
    const stage = stageRef.current
    if (!stage) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const delta = event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP
      setScale((value) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value + delta)))
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [zoomed])

  const openZoom = () => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
    setZoomed(true)
  }

  const resetView = () => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, baseX: offset.x, baseY: offset.y }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setOffset({ x: drag.baseX + event.clientX - drag.startX, y: drag.baseY + event.clientY - drag.startY })
  }
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
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
            <button type="button" aria-label="重置缩放" onClick={resetView}>重置</button>
            <button type="button" aria-label="关闭大图" autoFocus onClick={() => setZoomed(false)}>关闭</button>
          </div>
          <div
            ref={stageRef}
            className="book-figure-zoom__stage"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div
              className="book-figure-zoom__content"
              style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
        </div>
      )}
    </figure>
  )
}
