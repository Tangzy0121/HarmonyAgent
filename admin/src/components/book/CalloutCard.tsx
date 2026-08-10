import type { CalloutBlock } from '../../types/learningBook'

const KIND_LABEL: Record<CalloutBlock['kind'], string> = {
  key_idea: '关键概念',
  pitfall: '常见坑',
  tip: '小贴士',
  insight: '洞察',
}

export function CalloutCard({ block }: { block: CalloutBlock }) {
  return (
    <div className={`book-callout book-callout--${block.kind}`} role="note">
      <span className="book-callout__kind">{KIND_LABEL[block.kind]}</span>
      <p>{block.body}</p>
    </div>
  )
}
