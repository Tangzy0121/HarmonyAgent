import { useState } from 'react'
import { Icon } from '../components/Icon'
import { learningExplanation } from '../data/prototype'

interface LearningExplanationPageProps {
  isActive: boolean
  onAskAgent: () => void
  onBack: () => void
  onStartVerification: () => void
}

export function LearningExplanationPage({ isActive, onAskAgent, onBack, onStartVerification }: LearningExplanationPageProps) {
  const [isAlternateVisible, setIsAlternateVisible] = useState(false)
  const [isSourceOpen, setIsSourceOpen] = useState(false)
  const lesson = learningExplanation

  return (
    <section className="learning-reader-page" hidden={!isActive} aria-labelledby="learning-reader-title">
      <header className="learning-reader__navigation">
        <button type="button" className="document-detail__back" onClick={onBack} aria-label="返回文件理解结果">
          <Icon name="back" size={22} />
          <span>第三章</span>
        </button>
        <div className="learning-reader__stage" aria-label={`阶段 ${lesson.stageIndex}，${lesson.stage}`}>
          <span>{lesson.stageIndex}</span>
          <strong>{lesson.stage}</strong>
        </div>
      </header>

      <main className="learning-reader__content">
        <header className="learning-reader__hero">
          <p>正在学习</p>
          <h1 id="learning-reader-title">{lesson.title}</h1>
          <div className="learning-reader__progress" aria-label="解释阶段，当前为第一阶段，共两阶段">
            <span className="learning-reader__progress-current" />
            <span />
          </div>
        </header>

        <section className="learning-objective" aria-labelledby="learning-objective-title">
          <span>本次只完成一件事</span>
          <h2 id="learning-objective-title">{lesson.objective}</h2>
        </section>

        <article className="learning-article" aria-labelledby="learning-explanation-title">
          <p className="learning-article__lead">{lesson.introduction}</p>

          <figure className="learning-signal-diagram" aria-labelledby="learning-signal-title">
            <svg viewBox="0 0 340 188" role="img" aria-labelledby="learning-signal-title learning-signal-description">
              <title id="learning-signal-title">监督学习的训练信号</title>
              <desc id="learning-signal-description">带标签的样本进入模型，产生预测；预测与标签的差异作为反馈返回模型。</desc>
              <rect x="12" y="24" width="86" height="54" rx="14" />
              <rect x="127" y="24" width="86" height="54" rx="14" className="learning-signal-diagram__model" />
              <rect x="242" y="24" width="86" height="54" rx="14" />
              <path d="M98 51h29M213 51h29" />
              <path d="m121 46 6 5-6 5M236 46l6 5-6 5" />
              <path d="M285 78v57H170v-27" className="learning-signal-diagram__feedback" />
              <path d="m165 114 5-6 5 6" className="learning-signal-diagram__feedback" />
              <circle cx="170" cy="144" r="25" />
              <text x="55" y="47">带标签</text>
              <text x="55" y="64">样本</text>
              <text x="170" y="56">模型</text>
              <text x="285" y="56">预测</text>
              <text x="170" y="148">差异</text>
              <text x="226" y="159" className="learning-signal-diagram__caption">反馈信号</text>
            </svg>
            <figcaption>标签不是附加说明，它负责告诉模型预测偏离了多少。</figcaption>
          </figure>

          <h2 id="learning-explanation-title">先看训练信号</h2>
          <p>{lesson.signalExplanation}</p>

          <blockquote className="learning-key-point">
            <span>关键判断</span>
            <p>{lesson.keyPoint}</p>
          </blockquote>

          <section className="learning-example" aria-labelledby="learning-example-title">
            <p className="document-section-label">一个最小例子</p>
            <h2 id="learning-example-title">垃圾邮件过滤</h2>
            <p>{lesson.example.prompt}</p>
            <dl>
              <div><dt>输入</dt><dd>{lesson.example.input}</dd></div>
              <div><dt>答案</dt><dd>{lesson.example.label}</dd></div>
              <div><dt>预测</dt><dd>{lesson.example.result}</dd></div>
              <div><dt>反馈</dt><dd>{lesson.example.feedback}</dd></div>
            </dl>
          </section>

          <section className="learning-comparison" aria-labelledby="learning-comparison-title">
            <h2 id="learning-comparison-title">两种训练信号</h2>
            {lesson.comparison.map((item, index) => (
              <div key={item.label}>
                <span>0{index + 1}</span>
                <strong>{item.label}</strong>
                <p>{item.value}</p>
              </div>
            ))}
          </section>

          {isAlternateVisible && (
            <aside className="learning-alternate" aria-live="polite">
              <span>换一个角度</span>
              <p>{lesson.alternateExplanation}</p>
            </aside>
          )}

          <section className="learning-source" aria-labelledby="learning-reader-source-title">
            <button type="button" aria-expanded={isSourceOpen} aria-controls="learning-reader-source" onClick={() => setIsSourceOpen((current) => !current)}>
              <span className="learning-source__icon"><Icon name="link" size={18} /></span>
              <span>
                <small>来源 · {lesson.source.location}</small>
                <strong id="learning-reader-source-title">{lesson.source.title}</strong>
              </span>
              <span className={isSourceOpen ? 'document-source__chevron document-source__chevron--open' : 'document-source__chevron'}><Icon name="chevron" size={18} /></span>
            </button>
            {isSourceOpen && <div className="learning-source__excerpt" id="learning-reader-source"><p>{lesson.source.excerpt}</p></div>}
          </section>

          <div className="learning-reader__secondary-actions" aria-label="其他解释操作">
            <button type="button" aria-pressed={isAlternateVisible} onClick={() => setIsAlternateVisible((current) => !current)}>
              <Icon name="spark" size={18} />{isAlternateVisible ? '收起另一种解释' : '换一种解释'}
            </button>
            <button type="button" onClick={onAskAgent}><Icon name="agent" size={18} />向 Agent 提问</button>
          </div>
        </article>
      </main>

      <footer className="document-primary-action learning-reader__primary-action">
        <div>
          <span>下一阶段</span>
          <strong>用一次判断验证理解</strong>
        </div>
        <button type="button" className="document-primary-action__button" onClick={onStartVerification}>
          我理解了，继续验证<Icon name="arrow" size={19} />
        </button>
      </footer>
    </section>
  )
}
