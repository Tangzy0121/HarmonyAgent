import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject, WheelEvent as ReactWheelEvent } from 'react'
import type { MapViewport } from '../types/prototype'

interface Point {
  x: number
  y: number
}

interface UseMapGestureOptions {
  containerRef: RefObject<HTMLDivElement>
  viewport: MapViewport
  initialViewport: MapViewport
  worldSize: { width: number; height: number }
  onViewportChange: (viewport: MapViewport) => void
}

const minimumScale = 0.62
const maximumScale = 1.48
const snapScales = [0.68, 0.9, 1.14, 1.38]
const resistance = 0.28
const viewportPadding = 72
const maximumInertiaVelocity = 0.72

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

export function useMapGesture({
  containerRef,
  viewport,
  initialViewport,
  worldSize,
  onViewportChange,
}: UseMapGestureOptions) {
  const viewportRef = useRef(viewport)
  const pointersRef = useRef(new Map<number, Point>())
  const panStartRef = useRef<{ point: Point; viewport: MapViewport } | null>(null)
  const pinchStartRef = useRef<{ distance: number; midpoint: Point; viewport: MapViewport } | null>(null)
  const velocityRef = useRef({ x: 0, y: 0 })
  const lastMoveRef = useRef<{ point: Point; time: number } | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const wheelTimerRef = useRef<number | null>(null)
  const [isInteracting, setIsInteracting] = useState(false)

  useEffect(() => {
    viewportRef.current = viewport
  }, [viewport])

  const getBounds = useCallback(
    (scale: number) => {
      const rect = containerRef.current?.getBoundingClientRect()

      if (!rect) {
        return null
      }

      return {
        minimumX: Math.min(viewportPadding, rect.width - worldSize.width * scale - viewportPadding),
        maximumX: viewportPadding,
        minimumY: Math.min(viewportPadding, rect.height - worldSize.height * scale - viewportPadding),
        maximumY: viewportPadding,
        rect,
      }
    },
    [containerRef, worldSize.height, worldSize.width],
  )

  const commitViewport = useCallback(
    (nextViewport: MapViewport) => {
      viewportRef.current = nextViewport
      onViewportChange(nextViewport)
    },
    [onViewportChange],
  )

  const constrainViewport = useCallback(
    (candidate: MapViewport, useResistance: boolean) => {
      const bounds = getBounds(candidate.scale)

      if (!bounds) {
        return candidate
      }

      const constrainAxis = (value: number, minimum: number, maximum: number) => {
        if (!useResistance) {
          return clamp(value, minimum, maximum)
        }

        if (value < minimum) {
          return minimum + (value - minimum) * resistance
        }

        if (value > maximum) {
          return maximum + (value - maximum) * resistance
        }

        return value
      }

      return {
        ...candidate,
        x: constrainAxis(candidate.x, bounds.minimumX, bounds.maximumX),
        y: constrainAxis(candidate.y, bounds.minimumY, bounds.maximumY),
      }
    },
    [getBounds],
  )

  const pointForEvent = useCallback((event: { clientX: number; clientY: number }) => {
    const rect = containerRef.current?.getBoundingClientRect()

    if (!rect) {
      return { x: 0, y: 0 }
    }

    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }, [containerRef])

  const stopInertia = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }, [])

  const snapScale = useCallback(() => {
    const current = viewportRef.current
    const nearestScale = snapScales.reduce((nearest, scale) => (
      Math.abs(scale - current.scale) < Math.abs(nearest - current.scale) ? scale : nearest
    ))

    if (Math.abs(nearestScale - current.scale) > 0.09) {
      return
    }

    const bounds = getBounds(current.scale)

    if (!bounds) {
      return
    }

    const centerX = (bounds.rect.width / 2 - current.x) / current.scale
    const centerY = (bounds.rect.height / 2 - current.y) / current.scale
    const snapped = constrainViewport({
      ...current,
      scale: nearestScale,
      x: bounds.rect.width / 2 - centerX * nearestScale,
      y: bounds.rect.height / 2 - centerY * nearestScale,
    }, false)

    commitViewport(snapped)
  }, [commitViewport, constrainViewport, getBounds])

  const startInertia = useCallback(() => {
    const initialVelocity = velocityRef.current

    if (Math.hypot(initialVelocity.x, initialVelocity.y) < 0.34) {
      snapScale()
      return
    }

    let velocity = { ...initialVelocity }

    const step = () => {
      const current = viewportRef.current
      const candidate = constrainViewport({
        ...current,
        x: current.x + velocity.x * 16,
        y: current.y + velocity.y * 16,
        focusedNodeId: null,
      }, false)
      const hitHorizontalEdge = candidate.x !== current.x + velocity.x * 16
      const hitVerticalEdge = candidate.y !== current.y + velocity.y * 16

      commitViewport(candidate)
      velocity = {
        x: (hitHorizontalEdge ? 0 : velocity.x) * 0.9,
        y: (hitVerticalEdge ? 0 : velocity.y) * 0.9,
      }

      if (Math.hypot(velocity.x, velocity.y) > 0.02) {
        animationFrameRef.current = requestAnimationFrame(step)
      } else {
        animationFrameRef.current = null
        snapScale()
      }
    }

    animationFrameRef.current = requestAnimationFrame(step)
  }, [commitViewport, constrainViewport, snapScale])

  const beginPan = useCallback((point: Point) => {
    panStartRef.current = { point, viewport: viewportRef.current }
    pinchStartRef.current = null
    lastMoveRef.current = { point, time: performance.now() }
    velocityRef.current = { x: 0, y: 0 }
  }, [])

  const beginPinch = useCallback(() => {
    const pointers = [...pointersRef.current.values()]

    if (pointers.length < 2) {
      return
    }

    const [first, second] = pointers
    pinchStartRef.current = {
      distance: Math.hypot(second.x - first.x, second.y - first.y),
      midpoint: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
      viewport: viewportRef.current,
    }
    panStartRef.current = null
    velocityRef.current = { x: 0, y: 0 }
  }, [])

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    stopInertia()
    const point = pointForEvent(event)
    pointersRef.current.set(event.pointerId, point)
    setIsInteracting(true)

    if (pointersRef.current.size === 1) {
      beginPan(point)
    } else {
      beginPinch()
    }
  }, [beginPan, beginPinch, pointForEvent, stopInertia])

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) {
      return
    }

    const point = pointForEvent(event)
    pointersRef.current.set(event.pointerId, point)

    if (pointersRef.current.size >= 2 && pinchStartRef.current) {
      const [first, second] = [...pointersRef.current.values()]
      const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
      const distance = Math.hypot(second.x - first.x, second.y - first.y)
      const pinchStart = pinchStartRef.current
      const scale = clamp(pinchStart.viewport.scale * (distance / pinchStart.distance), minimumScale, maximumScale)
      const worldX = (pinchStart.midpoint.x - pinchStart.viewport.x) / pinchStart.viewport.scale
      const worldY = (pinchStart.midpoint.y - pinchStart.viewport.y) / pinchStart.viewport.scale

      commitViewport(constrainViewport({
        ...viewportRef.current,
        scale,
        x: midpoint.x - worldX * scale,
        y: midpoint.y - worldY * scale,
        focusedNodeId: null,
      }, true))
      return
    }

    const panStart = panStartRef.current

    if (!panStart) {
      return
    }

    const now = performance.now()
    const lastMove = lastMoveRef.current

    if (lastMove) {
      const elapsed = Math.max(now - lastMove.time, 16)
      const velocityX = (point.x - lastMove.point.x) / elapsed
      const velocityY = (point.y - lastMove.point.y) / elapsed
      velocityRef.current = {
        x: clamp(velocityX, -maximumInertiaVelocity, maximumInertiaVelocity),
        y: clamp(velocityY, -maximumInertiaVelocity, maximumInertiaVelocity),
      }
    }

    lastMoveRef.current = { point, time: now }
    commitViewport(constrainViewport({
      ...panStart.viewport,
      x: panStart.viewport.x + point.x - panStart.point.x,
      y: panStart.viewport.y + point.y - panStart.point.y,
      focusedNodeId: null,
    }, true))
  }, [commitViewport, constrainViewport, pointForEvent])

  const finishInteraction = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId)

    if (pointersRef.current.size === 1) {
      beginPan([...pointersRef.current.values()][0])
      return
    }

    if (pointersRef.current.size > 1) {
      beginPinch()
      return
    }

    panStartRef.current = null
    pinchStartRef.current = null
    setIsInteracting(false)
    startInertia()
  }, [beginPan, beginPinch, startInertia])

  const onWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    stopInertia()
    const point = pointForEvent(event)
    const current = viewportRef.current
    const scale = clamp(current.scale * (event.deltaY > 0 ? 0.92 : 1.08), minimumScale, maximumScale)
    const worldX = (point.x - current.x) / current.scale
    const worldY = (point.y - current.y) / current.scale

    commitViewport(constrainViewport({
      ...current,
      scale,
      x: point.x - worldX * scale,
      y: point.y - worldY * scale,
      focusedNodeId: null,
    }, true))
    setIsInteracting(true)

    if (wheelTimerRef.current !== null) {
      window.clearTimeout(wheelTimerRef.current)
    }

    wheelTimerRef.current = window.setTimeout(() => {
      setIsInteracting(false)
      snapScale()
    }, 140)
  }, [commitViewport, constrainViewport, pointForEvent, snapScale, stopInertia])

  const zoomBy = useCallback((direction: 1 | -1) => {
    const current = viewportRef.current
    const bounds = getBounds(current.scale)

    if (!bounds) {
      return
    }

    const scale = clamp(current.scale + direction * 0.14, minimumScale, maximumScale)
    const centerX = (bounds.rect.width / 2 - current.x) / current.scale
    const centerY = (bounds.rect.height / 2 - current.y) / current.scale

    commitViewport(constrainViewport({
      ...current,
      scale,
      x: bounds.rect.width / 2 - centerX * scale,
      y: bounds.rect.height / 2 - centerY * scale,
      focusedNodeId: null,
    }, false))
    snapScale()
  }, [commitViewport, constrainViewport, getBounds, snapScale])

  const focusOnPoint = useCallback((point: Point, nodeId: string) => {
    stopInertia()
    const bounds = getBounds(viewportRef.current.scale)

    if (!bounds) {
      return
    }

    const focusedViewport = constrainViewport({
      ...viewportRef.current,
      x: bounds.rect.width / 2 - point.x * viewportRef.current.scale,
      y: bounds.rect.height * 0.34 - point.y * viewportRef.current.scale,
      focusedNodeId: nodeId,
    }, false)

    commitViewport(focusedViewport)
  }, [commitViewport, constrainViewport, getBounds, stopInertia])

  const reset = useCallback(() => {
    stopInertia()
    commitViewport(initialViewport)
  }, [commitViewport, initialViewport, stopInertia])

  useEffect(() => () => {
    stopInertia()

    if (wheelTimerRef.current !== null) {
      window.clearTimeout(wheelTimerRef.current)
    }
  }, [stopInertia])

  return {
    isInteracting,
    focusOnPoint,
    reset,
    zoomBy,
    gestureProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finishInteraction,
      onPointerCancel: finishInteraction,
      onWheel,
    },
  }
}
