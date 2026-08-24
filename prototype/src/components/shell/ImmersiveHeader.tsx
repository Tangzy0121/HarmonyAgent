import type { ReactNode } from 'react'

import { usePrototype } from '../../app/PrototypeContext'
import { Icon } from '../ui/Icon'

interface ImmersiveHeaderProps {
  title: string
  meta?: string
  backTo?: 'library' | 'overview' | 'workspace'
  actions?: ReactNode
}

export function ImmersiveHeader({ title, meta, backTo = 'library', actions }: ImmersiveHeaderProps) {
  const { dispatch } = usePrototype()
  const backLabel = backTo === 'workspace' ? '返回学习书' : backTo === 'overview' ? '项目概览' : '学习库'
  const goBack = () => {
    if (backTo === 'workspace') dispatch({ type: 'screen', screen: 'workspace' })
    else if (backTo === 'overview') dispatch({ type: 'screen', screen: 'overview' })
    else dispatch({ type: 'navigate', destination: 'library' })
  }
  return (
    <header className="immersive-header">
      <button type="button" className="icon-text-button" aria-label={backLabel} onClick={goBack}><Icon name="back" size={20} /><span>{backLabel}</span></button>
      <div className="immersive-header__identity"><small>{meta}</small><strong>{title}</strong></div>
      <div className="immersive-header__actions">{actions}</div>
    </header>
  )
}
