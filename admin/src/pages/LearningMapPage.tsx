import { useMemo, useRef, useState } from 'react'
import { NodeDetailPanel } from '../components/NodeDetailPanel'
import { MapFilterBar } from '../components/MapFilterBar'
import { MapToolbar } from '../components/MapToolbar'
import { MobileTopBar } from '../components/MobileTopBar'
import { Icon } from '../components/Icon'
import {
  categoryLegend,
  initialMapViewport,
  knowledgeNodes,
  knowledgeRelationships,
  learningMapSize,
  type KnowledgeNode,
} from '../data/learningMap'
import { useMapGesture } from '../hooks/useMapGesture'
import type { MapViewport } from '../types/prototype'

interface LearningMapPageProps {
  isActive: boolean
  viewport: MapViewport
  onViewportChange: (viewport: MapViewport) => void
}

export function LearningMapPage({ isActive, viewport, onViewportChange }: LearningMapPageProps) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'全部' | '学习中' | '待复习' | '已掌握'>('全部')
  const [isLegendOpen, setIsLegendOpen] = useState(false)
  const { focusOnPoint, gestureProps, isInteracting, reset, zoomBy } = useMapGesture({
    containerRef: canvasRef,
    viewport,
    initialViewport: initialMapViewport,
    worldSize: learningMapSize,
    onViewportChange,
  })

  const nodeById = useMemo(() => new Map(knowledgeNodes.map((node) => [node.id, node])), [])
  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) : undefined
  const activeNodeId = viewport.focusedNodeId ?? selectedNodeId
  const reviewCount = knowledgeNodes.filter((node) => node.learningState === '待复习').length

  const selectNode = (node: KnowledgeNode) => {
    setSelectedNodeId(node.id)
    focusOnPoint(node, node.id)
  }

  return (
    <section className="destination-page learning-page" hidden={!isActive} aria-labelledby="learning-title">
      <div className="learning-page__header">
        <MobileTopBar title="学习地图" titleId="learning-title" subtitle={`${knowledgeNodes.length} 个主题 · ${reviewCount} 个待复习`} actions={
          <div className="learning-page__tools">
          <button type="button" aria-label="搜索主题"><Icon name="search" size={20} /></button>
          <button type="button" aria-label="更多地图操作"><Icon name="more" size={20} /></button>
          </div>
        } />
      </div>

      <MapFilterBar value={filter} onChange={setFilter} />

      <div
        ref={canvasRef}
        className={isInteracting ? 'learning-map learning-map--interacting' : 'learning-map'}
        aria-label="机器学习第三章知识地图"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setSelectedNodeId(null)
          }
        }}
        {...gestureProps}
      >
        <MapToolbar onZoomOut={() => zoomBy(-1)} onReset={reset} onZoomIn={() => zoomBy(1)} />

        <div
          className="map-world"
          style={{
            width: learningMapSize.width,
            height: learningMapSize.height,
            transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.scale})`,
          }}
        >
          <span className="map-cluster map-cluster--method" aria-hidden="true" />
          <span className="map-cluster map-cluster--theory" aria-hidden="true" />
          <span className="map-cluster map-cluster--application" aria-hidden="true" />

          <svg className="map-relationships" viewBox={`0 0 ${learningMapSize.width} ${learningMapSize.height}`} aria-hidden="true">
            {knowledgeRelationships.map((relationship) => {
              const from = nodeById.get(relationship.from)
              const to = nodeById.get(relationship.to)

              if (!from || !to) {
                return null
              }

              const isConnectedToFocus = activeNodeId === from.id || activeNodeId === to.id

              return (
                <line
                  key={`${relationship.from}-${relationship.to}`}
                  className={isConnectedToFocus ? 'map-relationship map-relationship--active' : 'map-relationship'}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                />
              )
            })}
          </svg>

          {knowledgeNodes.map((node) => {
            const isFocused = activeNodeId === node.id
            const isDimmed = (filter !== '全部' && node.learningState !== filter) || (Boolean(activeNodeId) && !isFocused && !knowledgeRelationships.some((relationship) => (
              (relationship.from === activeNodeId && relationship.to === node.id)
              || (relationship.to === activeNodeId && relationship.from === node.id)
            )))

            return (
              <button
                key={node.id}
                className={`map-node map-node--${node.category} map-node--${node.size}${isFocused ? ' map-node--focused' : ''}${isDimmed ? ' map-node--dimmed' : ''}`}
                type="button"
                style={{ left: node.x, top: node.y }}
                aria-label={`${node.label}，类别：${categoryLegend.find((item) => item.category === node.category)?.label}，学习状态：${node.learningState}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => selectNode(node)}
              >
                <span>{node.label}</span>
                {node.learningState !== '暂无学习记录' && <i className={`map-node__state map-node__state--${node.learningState}`} aria-label={node.learningState} />}
              </button>
            )
          })}
        </div>

        <div className="map-legend-control">
          <button type="button" aria-expanded={isLegendOpen} onClick={() => setIsLegendOpen((current) => !current)}><span className="legend-symbol" aria-hidden="true" />图例</button>
          {isLegendOpen && <div className="map-legend" aria-label="知识类别图例">
            {categoryLegend.map((item) => (
              <span key={item.category}>
                <i className={`legend-dot legend-dot--${item.category}`} aria-hidden="true" />
                {item.label}
              </span>
            ))}
          </div>}
        </div>
      </div>

      {selectedNode && <NodeDetailPanel
        node={selectedNode}
        relatedCount={knowledgeRelationships.filter((relationship) => relationship.from === selectedNode.id || relationship.to === selectedNode.id).length}
        onClose={() => setSelectedNodeId(null)}
      />}
    </section>
  )
}
