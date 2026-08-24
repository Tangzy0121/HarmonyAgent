import { Icon } from '../ui/Icon'

const steps = ['来源', '设置', '确认']

export function CreateProgress({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="flow-steps" aria-label="创建进度">
      {steps.map((label, index) => {
        const number = index + 1
        return (
          <li key={label} className={number === current ? 'is-current' : number < current ? 'is-done' : ''} aria-current={number === current ? 'step' : undefined}>
            <span>{number < current ? <Icon name="check" size={14} /> : number}</span>
            <strong>{label}</strong>
          </li>
        )
      })}
    </ol>
  )
}
