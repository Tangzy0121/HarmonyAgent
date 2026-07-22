import type { ReactNode } from 'react'

interface AppShellProps {
  children: ReactNode
  controls: ReactNode
  overlay: ReactNode
}

export function AppShell({ children, controls, overlay }: AppShellProps) {
  return (
    <main className="prototype-app app-shell">
      <div className="prototype-app__canvas app-shell__content">{children}</div>
      <div className="prototype-controls app-shell__controls">{controls}</div>
      {overlay}
    </main>
  )
}
