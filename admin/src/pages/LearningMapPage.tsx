import { useEffect, useMemo, useRef, useState } from 'react'
import { LearningMapChangePanel } from '../components/LearningMapChangePanel'
import { NodeDetailPanel } from '../components/NodeDetailPanel'
import { MapFilterBar } from '../components/MapFilterBar'
import { MobileTopBar } from '../components/MobileTopBar'
import { Icon } from '../components/Icon'
import { LociGlass } from '../components/LociGlass'
import {
  categoryLegend,
  initialMapViewport,
  knowledgeNodes,
  knowledgeRelationships,
  learningMapSize,
  type KnowledgeNode,
} from '../data/learningMap'
import { useMapGesture } from '../hooks/useMapGesture'
import { projectLearningEvidence } from '../domain/learningProjection'
import { lociGlassPresets } from '../types/materials'
import type { LearningEvidence } from '../types/learningBook'
import type { MapViewport } from '../types/prototype'

interface LearningMapPageProps {
  isActive: boolean
  viewport: MapViewport
  onViewportChange: (viewport: MapViewport) => void
  isChangeFocus?: boolean
  onScheduleNext?: () => void
  learningEvidence?: LearningEvidence[]
}

const learningStateStyle: Record<KnowledgeNode['learningState'], {
  className: 'active' | 'review' | 'mastered' | 'unseen'
  icon: 'arrow' | 'history' | 'check' | 'document'
}> = {
  学习中: { className: 'active', icon: 'arrow' },
  待复习: { className: 'review', icon: 'history' },
  已掌握: { className: 'mastered', icon: 'check' },
  暂无学习记录: { className: 'unseen', icon: 'document' },
}

function buildRelationshipPath(from: KnowledgeNode, to: KnowledgeNode) {
  const deltaX = to.x - from.x
  const deltaY = to.y - from.y
  const directionX = Math.sign(deltaX)
  const directionY = Math.sign(deltaY)
  const midpointX = (from.x + to.x) / 2
  const radius = Math.min(26, Math.abs(deltaX) / 4, Math.abs(deltaY) / 3)

  if (radius === 0) {
    return `M ${from.x} ${from.y} L ${to.x} ${to.y}`
  }

  return [
    `M ${from.x} ${from.y}`,
    `H ${midpointX - directionX * radius}`,
    `Q ${midpointX} ${from.y} ${midpointX} ${from.y + directionY * radius}`,
    `V ${to.y - directionY * radius}`,
    `Q ${midpointX} ${to.y} ${midpointX + directionX * radius} ${to.y}`,
    `H ${to.x}`,
  ].join(' ')
}

export function LearningMapPage({ isActive, viewport, onViewportChange, isChangeFocus = false, onScheduleNext, learningEvidence = [] }: LearningMapPageProps) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const previousViewportRef = useRef<MapViewport | null>(null)
  const hasAutoFocusedRef = useRef(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'全部' | '学习中' | '待复习' | '已掌握'>('全部')
  const { didDrag, focusOnPoint, gestureProps, isInteracting, reset } = useMapGesture({
    containerRef: canvasRef,
    viewport,
    initialViewport: initialMapViewport,
    worldSize: learningMapSize,
    onViewportChange,
  })

  const projectedNodes = useMemo(() => projectLearningEvidence(knowledgeNodes, learningEvidence), [learningEvidence])
  const nodeById = useMemo(() => new Map(projectedNodes.map((node) => [node.id, node])), [projectedNodes])
  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) : undefined
  const activeNodeId = viewport.focusedNodeId ?? selectedNodeId
  const reviewCount = projectedNodes.filter((node) => node.learningState === '待复习').length
  const changeTarget = nodeById.get('supervised-learning')

  const selectNode = (node: KnowledgeNode) => {
    if (!isChangeFocus) {
      setSelectedNodeId(node.id)
      return
    }

    if (!previousViewportRef.current) {
      previousViewportRef.current = { ...viewport, focusedNodeId: null }
    }
    setSelectedNodeId(node.id)
    focusOnPoint(node, node.id)
  }

  const closeNodePanel = () => {
    setSelectedNodeId(null)
    if (previousViewportRef.current) {
      onViewportChange(previousViewportRef.current)
      previousViewportRef.current = null
    }
  }

  useEffect(() => {
    if (!isActive || !isChangeFocus || !changeTarget || hasAutoFocusedRef.current) {
      return
    }

    hasAutoFocusedRef.current = true
    previousViewportRef.current = { ...viewport, focusedNodeId: null }
    setSelectedNodeId(changeTarget.id)
    focusOnPoint(changeTarget, changeTarget.id, 0.62, { x: 0.72, y: 0.28 })
  }, [changeTarget, focusOnPoint, isActive, isChangeFocus, viewport])

  useEffect(() => {
    if (isChangeFocus) {
      return
    }

    hasAutoFocusedRef.current = false
    setSelectedNodeId(null)
    if (previousViewportRef.current) {
      onViewportChange(previousViewportRef.current)
      previousViewportRef.current = null
    }
  }, [isChangeFocus, onViewportChange])

  return (
    <section className={isChangeFocus ? 'destination-page learning-page learning-page--change-focus' : 'destination-page learning-page'} hidden={!isActive} aria-labelledby="learning-title">
      {isChangeFocus ? (
        <header className="map-change-header">
          <div>
            <span>地图变化</span>
            <h1 id="learning-title">监督学习已更新</h1>
          </div>
          <span className="map-change-header__summary"><i aria-hidden="true" />1 条关系</span>
        </header>
      ) : (
        <LociGlass
          className="loci-glass--smoke-reference learning-map-command"
          interactive={false}
          spec={{ ...lociGlassPresets.refractive, cornerRadius: 24, interactionStrength: 0 }}
        >
          <div className="learning-page__header">
            <MobileTopBar title="学习地图" titleId="learning-title" subtitle={`${projectedNodes.length} 个主题 · ${reviewCount} 个待复习`} showProfile={false} />
          </div>
          <div className="map-filter-row">
            <MapFilterBar value={filter} onChange={setFilter} />
            <div className="page-inline-actions" aria-label="学习地图操作">
              <button type="button" aria-label="搜索主题"><Icon name="search" size={18} /></button>
              <button type="button" aria-label="定位到地图中心" onClick={reset}><Icon name="locate" size={18} /></button>
            </div>
          </div>
        </LociGlass>
      )}

      <div
        ref={canvasRef}
        className={isInteracting ? 'learning-map learning-map--interacting' : 'learning-map'}
        aria-label="机器学习第三章知识地图"
        onClick={(event) => {
          if (event.target === event.currentTarget && !isChangeFocus && !didDrag()) {
            closeNodePanel()
          }
        }}
        {...gestureProps}
      >
        <div className="learning-map__blossom-bg learning-map__blossom-bg--large" aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => <i key={index} />)}
          <b />
        </div>

        <div
          className="map-world"
          style={{
            width: learningMapSize.width,
            height: learningMapSize.height,
            transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.scale})`,
          }}
        >
          <svg className="map-relationships" viewBox={`0 0 ${learningMapSize.width} ${learningMapSize.height}`} aria-hidden="true">
            {knowledgeRelationships.map((relationship) => {
              const from = nodeById.get(relationship.from)
              const to = nodeById.get(relationship.to)

              if (!from || !to) {
                return null
              }

              const isConnectedToFocus = activeNodeId === from.id || activeNodeId === to.id

              const relationshipClasses = [
                'map-relationship',
                isConnectedToFocus ? 'map-relationship--active' : '',
                isChangeFocus && relationship.recentChange ? 'map-relationship--recent' : '',
              ].filter(Boolean).join(' ')

              return (
                <path
                  key={`${relationship.from}-${relationship.to}`}
                  className={relationshipClasses}
                  d={buildRelationshipPath(from, to)}
                />
              )
            })}
          </svg>

          {projectedNodes.map((node) => {
            const isFocused = activeNodeId === node.id
            const isRecentChange = isChangeFocus && node.id === 'supervised-learning'
            const categoryLabel = categoryLegend.find((item) => item.category === node.category)?.label
            const stateStyle = learningStateStyle[node.learningState]
            const isDimmed = (!isChangeFocus && filter !== '全部' && node.learningState !== filter) || (Boolean(activeNodeId) && !isFocused && !knowledgeRelationships.some((relationship) => (
              (relationship.from === activeNodeId && relationship.to === node.id)
              || (relationship.to === activeNodeId && relationship.from === node.id)
            )))

            return (
              <button
                key={node.id}
                className={`map-node map-node--state-${stateStyle.className}${node.x >= 700 ? ' map-node--label-left' : ''}${isFocused ? ' map-node--focused' : ''}${isDimmed ? ' map-node--dimmed' : ''}${isRecentChange ? ' map-node--recent-change' : ''}`}
                type="button"
                style={{ left: node.x, top: node.y }}
                aria-label={`${node.label}，类别：${categoryLabel}，学习状态：${node.learningState}`}
                onClick={(event) => {
                  if (didDrag()) {
                    event.preventDefault()
                    return
                  }

                  selectNode(node)
                }}
              >
                <span className="map-node__form" aria-hidden="true">
                  <Icon name={stateStyle.icon} size={22} strokeWidth={1.65} />
                </span>
                <span className="map-node__label">{node.label}</span>
                <small className="map-node__category">{categoryLabel} · {node.learningState}</small>
                {isRecentChange && <em className="map-node__mastery">已掌握</em>}
              </button>
            )
          })}
        </div>

      </div>

      {selectedNode && isChangeFocus && selectedNode.id === 'supervised-learning' ? (
        <LearningMapChangePanel node={selectedNode} onScheduleNext={onScheduleNext ?? (() => undefined)} />
      ) : selectedNode && <NodeDetailPanel
        node={selectedNode}
        relatedCount={knowledgeRelationships.filter((relationship) => relationship.from === selectedNode.id || relationship.to === selectedNode.id).length}
        onClose={closeNodePanel}
      />}
      {selectedNode && !isChangeFocus && (
        <button
          type="button"
          className="node-detail-scrim"
          aria-label="关闭节点详情弹窗"
          onClick={closeNodePanel}
        />
      )}
    </section>
  )
}
