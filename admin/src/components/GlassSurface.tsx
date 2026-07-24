import type { HTMLAttributes, PropsWithChildren } from 'react'

interface GlassSurfaceProps extends PropsWithChildren, HTMLAttributes<HTMLDivElement> {
  density?: 'thin' | 'thick'
}

export function GlassSurface({ children, className = '', density = 'thin', ...props }: GlassSurfaceProps) {
  return (
    <div className={`glass-surface glass-surface--${density} ${className}`.trim()} {...props}>
      {children}
    </div>
  )
}
