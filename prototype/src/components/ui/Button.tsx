import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { Icon, type IconName } from './Icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger'
  icon?: IconName
  iconAfter?: IconName
  children: ReactNode
}

export function Button({ variant = 'primary', icon, iconAfter, children, className = '', ...props }: ButtonProps) {
  return (
    <button className={`button button--${variant} ${className}`.trim()} type="button" {...props}>
      {icon && <Icon name={icon} size={17} />}
      <span>{children}</span>
      {iconAfter && <Icon name={iconAfter} size={17} />}
    </button>
  )
}
