import type { ReactNode } from 'react'

import { usePrototype } from '../../app/PrototypeContext'
import { ChatPanel } from '../overlays/ChatPanel'
import { SourceViewer } from '../overlays/SourceViewer'
import { MobileIdentity } from './MobileIdentity'

const primaryScreens = new Set(['today', 'library'])

export function AppShell({ children }: { children: ReactNode }) {
  const { state } = usePrototype()
  const showIdentity = primaryScreens.has(state.screen)

  return (
    <div className={`prototype-shell ${showIdentity ? '' : 'prototype-shell--immersive'} ${state.screen === 'plan' ? 'prototype-shell--action-bar' : ''}`}>
      {showIdentity && <MobileIdentity />}
      <main className="app-content" id="main-content">{children}</main>
      <ChatPanel />
      <SourceViewer />
    </div>
  )
}
