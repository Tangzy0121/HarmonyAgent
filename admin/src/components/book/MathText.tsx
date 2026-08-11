import type { ReactNode } from 'react'
import { KatexView } from './KatexView'

/** 把正文中 $...$ 包裹的行内公式交给 KaTeX、**...** 渲染为加粗，其余文本原样输出。 */
export function MathText({ text }: { text: string }) {
  const parts: ReactNode[] = []
  const pattern = /\*\*([^*\n]+)\*\*|\$([^$\n]+)\$/gu
  let last = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    if (match[1] !== undefined) {
      parts.push(<strong key={match.index}><MathText text={match[1]} /></strong>)
    } else {
      parts.push(<KatexView key={match.index} tex={match[2]} />)
    }
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}
