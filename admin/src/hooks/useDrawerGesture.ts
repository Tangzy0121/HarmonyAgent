import { useCallback, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import type { DrawerSnap } from '../types/prototype'

const dragThreshold = 8
const velocityThreshold = 0.85

interface UseDrawerGestureOptions {
  snap: DrawerSnap
  onSnapChange: (snap: DrawerSnap) => void
}

function viewportHeight() {
  return typeof window === 'undefined' ? 800 : window.innerHeight
}

export function useDrawerGesture({ snap, onSnapChange }: UseDrawerGestureOptions) {
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startRef = useRef({ y: 0, time: 0 })
  const lastRef = useRef({ y: 0, time: 0 })
  const offsetRef = useRef(0)
  const velocityRef = useRef(0)
  const hasDraggedRef = useRef(false)

  const settle = useCallback(() => {
    if (snap === 'closed') {
      offsetRef.current = 0
      setDragOffset(0)
      setIsDragging(false)
      hasDraggedRef.current = false
      return
    }

    const height = viewportHeight()
    const offset = offsetRef.current
    const velocity = velocityRef.current
    const defaultHeight = height * 0.75

    if (snap === 'default') {
      if (velocity > velocityThreshold || offset > defaultHeight * 0.42) {
        onSnapChange('closed')
      } else if (velocity < -0.58 || offset < -defaultHeight * 0.26) {
        onSnapChange('full')
      } else {
        onSnapChange('default')
      }
    } else if (velocity > velocityThreshold) {
      onSnapChange('closed')
    } else if (offset > height * 0.7) {
      onSnapChange('closed')
    } else if (offset > height * 0.18 || velocity > 0.48) {
      onSnapChange('default')
    } else {
      onSnapChange('full')
    }

    offsetRef.current = 0
    setDragOffset(0)
    setIsDragging(false)
    hasDraggedRef.current = false
  }, [onSnapChange, snap])

  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest('button')) {
      return
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    const start = { y: event.clientY, time: event.timeStamp }
    startRef.current = start
    lastRef.current = start
    offsetRef.current = 0
    velocityRef.current = 0
    hasDraggedRef.current = false
  }, [])

  const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return
    }

    const distance = event.clientY - startRef.current.y
    if (!hasDraggedRef.current && Math.abs(distance) < dragThreshold) {
      return
    }

    hasDraggedRef.current = true
    setIsDragging(true)

    const height = viewportHeight()
    const defaultHeight = height * 0.75
    let nextOffset = distance

    if (snap === 'full' && nextOffset < 0) {
      nextOffset *= 0.18
    }

    if (snap === 'default' && nextOffset < -height * 0.28) {
      nextOffset = -height * 0.28 + (nextOffset + height * 0.28) * 0.2
    }

    const downwardLimit = snap === 'full' ? height * 0.86 : defaultHeight * 0.88
    if (nextOffset > downwardLimit) {
      nextOffset = downwardLimit + (nextOffset - downwardLimit) * 0.2
    }

    const elapsed = Math.max(event.timeStamp - lastRef.current.time, 8)
    velocityRef.current = (event.clientY - lastRef.current.y) / elapsed
    lastRef.current = { y: event.clientY, time: event.timeStamp }
    offsetRef.current = nextOffset
    setDragOffset(nextOffset)
  }, [snap])

  const onPointerEnd = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return
    }

    event.currentTarget.releasePointerCapture(event.pointerId)
    if (!hasDraggedRef.current) {
      return
    }

    settle()
  }, [settle])

  return {
    isDragging,
    transform: dragOffset ? `translate3d(0, ${dragOffset}px, 0)` : undefined,
    grabAreaProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
    },
  }
}
