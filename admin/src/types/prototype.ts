export type Destination = 'today' | 'learning' | 'library'

export type DrawerSnap = 'closed' | 'default' | 'full'

export interface MapViewport {
  x: number
  y: number
  scale: number
  focusedNodeId: string | null
}
