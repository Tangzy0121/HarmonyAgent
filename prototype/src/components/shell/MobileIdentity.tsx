import { useEffect, useRef, useState } from 'react'

import { usePrototype } from '../../app/PrototypeContext'
import type { Screen } from '../../types/product'
import { Icon } from '../ui/Icon'

type PrimaryMenuScreen = Extract<Screen, 'today' | 'library' | 'settings' | 'account'>

export const primaryMenuItems: ReadonlyArray<{ screen: PrimaryMenuScreen; label: string }> = [
  { screen: 'today', label: '今日' },
  { screen: 'library', label: '学习库' },
  { screen: 'settings', label: '设置' },
  { screen: 'account', label: '账户' },
]

function BrandMark() {
  return (
    <div className="brand-mark" aria-label="loci">
      <span className="brand-mark__symbol" aria-hidden="true"><i /><i /><i /><i /><i /></span>
      <strong>loci</strong>
    </div>
  )
}

export function MobileIdentity() {
  const { state, dispatch } = usePrototype()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  const closeMenu = () => {
    setOpen(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  useEffect(() => {
    if (!open) return undefined
    closeRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open])

  const navigate = (screen: PrimaryMenuScreen) => {
    if (screen === 'today' || screen === 'library') dispatch({ type: 'navigate', destination: screen })
    else dispatch({ type: 'screen', screen })
    closeMenu()
  }

  return (
    <>
      <header className="mobile-identity" aria-label="loci">
        <button ref={triggerRef} className="nav-trigger" type="button" aria-label="打开导航" aria-expanded={open} aria-controls="primary-menu" onClick={() => setOpen(true)}>
          <span /><span />
        </button>
        <BrandMark />
      </header>

      {open && (
        <section className="nav-menu" id="primary-menu" role="dialog" aria-modal="true" aria-labelledby="primary-menu-title">
          <header className="nav-menu__header">
            <button ref={closeRef} className="nav-menu__close" type="button" aria-label="关闭导航" onClick={closeMenu}><Icon name="close" size={26} /></button>
            <BrandMark />
          </header>
          <nav className="nav-menu__list" aria-labelledby="primary-menu-title">
            <h2 className="sr-only" id="primary-menu-title">页面导航</h2>
            {primaryMenuItems.map((item) => (
              <button key={item.screen} type="button" aria-current={state.screen === item.screen ? 'page' : undefined} onClick={() => navigate(item.screen)}>
                <span>{item.label}</span>
                {state.screen === item.screen && <Icon name="arrow" size={28} />}
              </button>
            ))}
          </nav>
        </section>
      )}
    </>
  )
}
