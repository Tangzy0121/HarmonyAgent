import { useEffect, useRef, useState } from 'react'

import { usePrototype } from '../../app/PrototypeContext'
import { Icon } from '../ui/Icon'

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

  const navigate = (destination: 'today' | 'library' | 'create') => {
    if (destination === 'create') dispatch({ type: 'screen', screen: 'create' })
    else dispatch({ type: 'navigate', destination })
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
            <button type="button" aria-current={state.screen === 'today' ? 'page' : undefined} onClick={() => navigate('today')}><span>今日</span>{state.screen === 'today' && <Icon name="arrow" size={28} />}</button>
            <button type="button" aria-current={state.screen === 'library' ? 'page' : undefined} onClick={() => navigate('library')}><span>学习库</span>{state.screen === 'library' && <Icon name="arrow" size={28} />}</button>
            <button type="button" onClick={() => navigate('create')}><span>新建项目</span></button>
          </nav>
        </section>
      )}
    </>
  )
}
