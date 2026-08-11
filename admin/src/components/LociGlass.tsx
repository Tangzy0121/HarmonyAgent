import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type PropsWithChildren,
} from 'react'
import type { LociGlassSpec } from '../types/materials'
import { lociGlassPresets } from '../types/materials'

interface LociGlassProps extends PropsWithChildren, HTMLAttributes<HTMLDivElement> {
  spec?: Partial<LociGlassSpec>
  interactive?: boolean
}

type GlassStyle = CSSProperties & Record<`--loci-${string}`, string>

function smoothStep(start: number, end: number, value: number) {
  const progress = Math.max(0, Math.min(1, (value - start) / (end - start)))
  return progress * progress * (3 - 2 * progress)
}

function createDisplacementMap(width: number, height: number, spec: LociGlassSpec) {
  const scale = Math.min(window.devicePixelRatio || 1, 1.5)
  const canvas = document.createElement('canvas')
  const mapWidth = Math.max(1, Math.round(width * scale))
  const mapHeight = Math.max(1, Math.round(height * scale))
  canvas.width = mapWidth
  canvas.height = mapHeight

  const context = canvas.getContext('2d')
  if (!context) return ''

  const image = context.createImageData(mapWidth, mapHeight)
  const shortestSide = Math.max(1, Math.min(mapWidth, mapHeight))
  const radius = Math.min(0.48, (spec.cornerRadius * scale) / shortestSide)
  const edgeWidth = Math.max(0.025, spec.edgeWidth)

  for (let y = 0; y < mapHeight; y += 1) {
    for (let x = 0; x < mapWidth; x += 1) {
      const index = (y * mapWidth + x) * 4
      const nx = (x / Math.max(1, mapWidth - 1)) * 2 - 1
      const ny = (y / Math.max(1, mapHeight - 1)) * 2 - 1
      const qx = Math.abs(nx) - (1 - radius)
      const qy = Math.abs(ny) - (1 - radius)
      const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
      const inside = Math.min(Math.max(qx, qy), 0)
      const distance = outside + inside - radius
      const distanceInside = Math.max(0, -distance)
      const edge = 1 - smoothStep(0, edgeWidth, distanceInside)
      const radial = Math.min(1, Math.hypot(nx, ny) / Math.SQRT2)
      const lens = edge * (0.62 + radial * 0.38)
      const xDirection = nx === 0 ? 0 : Math.sign(nx)
      const yDirection = ny === 0 ? 0 : Math.sign(ny)

      image.data[index] = Math.round(128 + xDirection * lens * 118)
      image.data[index + 1] = Math.round(128 + yDirection * lens * 118)
      image.data[index + 2] = 128
      image.data[index + 3] = 255
    }
  }

  context.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}

export function LociGlass({
  children,
  className = '',
  spec: specOverride,
  interactive = true,
  style,
  onPointerMove,
  onPointerLeave,
  ...props
}: LociGlassProps) {
  const glassRef = useRef<HTMLDivElement>(null)
  const filterId = `loci-glass-${useId().replace(/:/g, '')}`
  const [displacementMap, setDisplacementMap] = useState('')
  const spec = useMemo(
    () => ({ ...lociGlassPresets.balanced, ...specOverride }),
    [specOverride],
  )

  useEffect(() => {
    const element = glassRef.current
    if (!element) return

    let animationFrame = 0
    const renderMap = () => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(() => {
        const bounds = element.getBoundingClientRect()
        if (bounds.width < 1 || bounds.height < 1) return
        setDisplacementMap(createDisplacementMap(bounds.width, bounds.height, spec))
      })
    }

    renderMap()
    const resizeObserver = new ResizeObserver(renderMap)
    resizeObserver.observe(element)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
    }
  }, [spec])

  const moveHighlight = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (interactive) {
      const bounds = event.currentTarget.getBoundingClientRect()
      event.currentTarget.style.setProperty('--loci-pointer-x', `${event.clientX - bounds.left}px`)
      event.currentTarget.style.setProperty('--loci-pointer-y', `${event.clientY - bounds.top}px`)
      event.currentTarget.dataset.engaged = 'true'
    }
    onPointerMove?.(event)
  }

  const resetHighlight = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.dataset.engaged = 'false'
    onPointerLeave?.(event)
  }

  const dispersionAlpha = Math.min(0.24, Math.max(0, spec.dispersion))
  const glassStyle: GlassStyle = {
    '--loci-glass-blur': `${spec.blurRadius}px`,
    '--loci-glass-tint': String(spec.tintOpacity),
    '--loci-glass-tint-high': String(Math.min(0.72, spec.tintOpacity + 0.18)),
    '--loci-glass-tint-low': String(spec.tintOpacity * 0.38),
    '--loci-glass-saturation': String(spec.saturation),
    '--loci-glass-brightness': String(spec.brightness),
    '--loci-glass-radius': `${spec.cornerRadius}px`,
    '--loci-glass-edge-light': String(spec.edgeLight),
    '--loci-glass-border-alpha': String(0.46 + spec.edgeLight * 0.42),
    '--loci-glass-inner-edge-alpha': String(spec.edgeLight * 0.64),
    '--loci-glass-highlight-opacity': String(0.42 + spec.edgeLight * 0.36),
    '--loci-glass-press-scale': String(1 - spec.interactionStrength * 0.018),
    '--loci-glass-dispersion-cyan': `rgb(255 193 117 / ${dispersionAlpha})`,
    '--loci-glass-dispersion-violet': `rgb(238 137 111 / ${dispersionAlpha * 0.82})`,
    '--loci-glass-interaction': String(spec.interactionStrength),
    backdropFilter: `url(#${filterId}) blur(${spec.blurRadius}px) saturate(${spec.saturation}) brightness(${spec.brightness})`,
    WebkitBackdropFilter: `blur(${spec.blurRadius}px) saturate(${spec.saturation}) brightness(${spec.brightness})`,
    ...style,
  }

  return (
    <div
      ref={glassRef}
      className={`loci-glass ${interactive ? 'loci-glass--interactive' : ''} ${className}`.trim()}
      data-engaged="false"
      style={glassStyle}
      onPointerMove={moveHighlight}
      onPointerLeave={resetHighlight}
      {...props}
    >
      <svg className="loci-glass__filter" aria-hidden="true">
        <defs>
          <filter id={filterId} x="-18%" y="-18%" width="136%" height="136%" colorInterpolationFilters="sRGB">
            {displacementMap && (
              <feImage
                href={displacementMap}
                preserveAspectRatio="none"
                result="lociDisplacement"
                x="0"
                y="0"
                width="100%"
                height="100%"
              />
            )}
            <feDisplacementMap
              in="SourceGraphic"
              in2="lociDisplacement"
              scale={spec.refractionStrength}
              xChannelSelector="R"
              yChannelSelector="G"
              result="lociRefracted"
            />
            <feGaussianBlur in="lociRefracted" stdDeviation="0.08" />
          </filter>
        </defs>
      </svg>
      <div className="loci-glass__content">{children}</div>
    </div>
  )
}
