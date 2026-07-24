import { Icon } from '../components/Icon'
import { learningCompletion } from '../data/prototype'

interface LearningCompletionPageProps {
  isActive: boolean
  onAskAgent: () => void
  onBack: () => void
  onReturnToday: () => void
  onViewMapChange: () => void
}

export function LearningCompletionPage({ isActive, onAskAgent, onBack, onReturnToday, onViewMapChange }: LearningCompletionPageProps) {
  const completion = learningCompletion

  return (
    <section className="learning-completion-page" hidden={!isActive} aria-labelledby="learning-completion-title">
      <header className="learning-reader__navigation learning-completion__navigation">
        <button type="button" className="document-detail__back" onClick={onBack} aria-label="返回验证阶段">
          <Icon name="back" size={22} />
          <span>验证</span>
        </button>
        <span className="learning-completion__status"><Icon name="check" size={15} />{completion.status}</span>
      </header>

      <main className="learning-completion__content">
        <section className="learning-completion__hero" aria-label="学习完成确认">
          <div className="learning-completion__convergence" aria-hidden="true">
            <span className="learning-completion__convergence-line learning-completion__convergence-line--one" />
            <span className="learning-completion__convergence-line learning-completion__convergence-line--two" />
            <span className="learning-completion__convergence-line learning-completion__convergence-line--three" />
            <span className="learning-completion__convergence-core"><Icon name="check" size={27} strokeWidth={1.7} /></span>
          </div>
          <p>{completion.completedAt}</p>
          <h1 id="learning-completion-title">{completion.title}</h1>
          <strong>{completion.summary}</strong>
        </section>

        <section className="learning-evidence-ledger" aria-labelledby="learning-evidence-title">
          <div className="learning-evidence-ledger__heading">
            <div>
              <p>本次学习</p>
              <h2 id="learning-evidence-title">证据已经稳定下来</h2>
            </div>
            <span>4 项</span>
          </div>
          <dl>
            {completion.evidence.map((item, index) => (
              <div key={item.label}>
                <dt><span>0{index + 1}</span>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="learning-record-preview" aria-labelledby="learning-record-title">
          <header>
            <div>
              <p>将写入知识节点</p>
              <h2 id="learning-record-title">{completion.record.node}</h2>
            </div>
            <span>{completion.record.type}</span>
          </header>
          <div className="learning-record-preview__relation" aria-label={`关系：${completion.record.relation}`}>
            <span>训练数据</span>
            <i />
            <strong>{completion.record.node}</strong>
          </div>
          <blockquote>{completion.record.statement}</blockquote>
          <footer>
            <span><Icon name="document" size={16} />{completion.record.source}</span>
            <span>可追溯</span>
          </footer>
        </section>

        <div className="learning-completion__secondary-actions" aria-label="其他完成操作">
          <button type="button" onClick={onAskAgent}><Icon name="agent" size={18} />向 Agent 复盘</button>
          <button type="button" onClick={onReturnToday}><Icon name="today" size={18} />返回今日</button>
        </div>
      </main>

      <footer className="document-primary-action learning-completion__primary-action">
        <div>
          <span>下一步</span>
          <strong>查看节点与关系如何变化</strong>
        </div>
        <button
          type="button"
          className="document-primary-action__button"
          onClick={onViewMapChange}
        >
          查看地图变化<Icon name="arrow" size={19} />
        </button>
      </footer>
    </section>
  )
}
