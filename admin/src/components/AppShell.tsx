import type { ReactNode } from 'react'

interface AppShellProps {
  children: ReactNode
  className?: string
  controls: ReactNode
  identity?: ReactNode
  overlay: ReactNode
}

export function AppShell({ children, className = '', controls, identity, overlay }: AppShellProps) {
  return (
    <main className={`prototype-app app-shell ${className}`.trim()}>
      <div className="app-shell__ambient" aria-hidden="true">
        <span className="app-shell__light app-shell__light--silver" />
        <span className="app-shell__light app-shell__light--shadow" />
        <span className="app-shell__light app-shell__light--peach" />
        <span className="app-shell__light app-shell__light--cool" />
      </div>
      <div className="prototype-app__canvas app-shell__content">{children}</div>
      {identity && <div className="app-shell__identity">{identity}</div>}
      <div className="prototype-controls app-shell__controls">{controls}</div>
      {overlay}
    </main>
  )
}
