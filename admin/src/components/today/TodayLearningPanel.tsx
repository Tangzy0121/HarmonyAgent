import { Icon } from '../Icon'
import { LociGlass } from '../LociGlass'
import { lociGlassPresets } from '../../types/materials'

interface TodayLearningPanelProps {
  focus: {
    readonly label: string
    readonly status: string
    readonly title: string
    readonly summary: string
    readonly tags: readonly string[]
    readonly source: string
    readonly position: string
    readonly actionLabel: string
  }
  onContinue: () => void
}

export function TodayLearningPanel({ focus, onContinue }: TodayLearningPanelProps) {
  return (
    <LociGlass
      className="loci-glass--smoke-reference today-learning-panel"
      interactive={false}
      spec={{ ...lociGlassPresets.refractive, cornerRadius: 30, interactionStrength: 0 }}
    >
      <article className="today-learning-panel__inner" aria-labelledby="today-learning-title">
        <header>
          <span>{focus.label}</span>
          <strong>{focus.status}</strong>
        </header>

        <h2 id="today-learning-title">{focus.title}</h2>
        <p>{focus.summary}</p>

        <div className="today-learning-panel__tags" aria-label="学习信息">
          {focus.tags.map((tag) => <span key={tag}>{tag}</span>)}
        </div>

        <footer>
          <span className="today-learning-panel__source-icon" aria-hidden="true">
            <Icon name="document" size={18} />
          </span>
          <div>
            <strong>{focus.source}</strong>
            <small>{focus.position}</small>
          </div>
          <button type="button" onClick={onContinue}>
            <span>{focus.actionLabel}</span>
            <Icon name="arrow" size={16} />
          </button>
        </footer>
      </article>
    </LociGlass>
  )
}
