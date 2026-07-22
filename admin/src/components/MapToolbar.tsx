import { GlassSurface } from './GlassSurface'
import { Icon } from './Icon'

interface MapToolbarProps {
  onZoomOut: () => void
  onReset: () => void
  onZoomIn: () => void
}

export function MapToolbar({ onZoomOut, onReset, onZoomIn }: MapToolbarProps) {
  return (
    <GlassSurface className="map-toolbar" aria-label="地图控制">
      <button type="button" aria-label="缩小地图" onClick={onZoomOut}><Icon name="minus" size={18} /></button>
      <button type="button" aria-label="重置地图位置" onClick={onReset}><Icon name="locate" size={18} /></button>
      <button type="button" aria-label="放大地图" onClick={onZoomIn}><Icon name="plus" size={18} /></button>
    </GlassSurface>
  )
}
