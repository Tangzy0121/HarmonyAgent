import type { ReactNode } from 'react'
import { KatexView } from './KatexView'

/** 把正文中 $...$ 包裹的行内公式交给 KaTeX 渲染，其余文本原样输出。 */
export function MathText({ text }: { text: string }) {
  const parts: ReactNode[] = []
  const pattern = /\$([^$\n]+)\$/gu
  let last = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    parts.push(<KatexView key={match.index} tex={match[1]} />)
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}
