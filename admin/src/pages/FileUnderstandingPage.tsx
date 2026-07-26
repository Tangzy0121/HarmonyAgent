import { useState } from 'react'
import { Icon } from '../components/Icon'
import { fileUnderstandingDocument } from '../data/prototype'

interface FileUnderstandingPageProps {
  isActive: boolean
  onAskAgent: () => void
  onBack: () => void
  onStartLearning: () => void
  onViewMap: () => void
}

export function FileUnderstandingPage({ isActive, onAskAgent, onBack, onStartLearning, onViewMap }: FileUnderstandingPageProps) {
  const [isSourceOpen, setIsSourceOpen] = useState(false)
  const document = fileUnderstandingDocument

  return (
    <section className="document-detail-page" hidden={!isActive} aria-labelledby="document-detail-title">
      <header className="document-detail__navigation">
        <button type="button" className="document-detail__back" onClick={onBack} aria-label="返回知识库">
          <Icon name="back" size={22} />
          <span>知识库</span>
        </button>
        <span className="document-detail__status"><Icon name="check" size={14} />{document.understandingStatus}</span>
      </header>

      <main className="document-detail__content">
        <section className="document-detail__identity" aria-label="资料信息">
          <div className="document-detail__cover" aria-hidden="true">
            <span className="document-detail__cover-index">03</span>
            <svg className="document-detail__cover-network" viewBox="0 0 180 116" focusable="false">
              <g className="document-detail__cover-network-lines">
                <path d="M31 24 L68 50" />
                <path d="M31 58 L68 58" />
                <path d="M31 92 L68 66" />
                <path d="M116 58 L148 58" />
              </g>
              <g className="document-detail__cover-network-inputs">
                <circle cx="25" cy="24" r="7" />
                <circle cx="25" cy="58" r="7" />
                <circle cx="25" cy="92" r="7" />
              </g>
              <rect className="document-detail__cover-network-model" x="68" y="34" width="48" height="48" rx="12" />
              <text className="document-detail__cover-network-mark" x="92" y="63" textAnchor="middle">ML</text>
              <circle className="document-detail__cover-network-output" cx="155" cy="58" r="13" />
              <path className="document-detail__cover-network-check" d="M149 58 L153 62 L161 53" />
              <g className="document-detail__cover-network-labels">
                <text x="25" y="112" textAnchor="middle">数据</text>
                <text x="92" y="112" textAnchor="middle">模型</text>
                <text x="155" y="112" textAnchor="middle">结果</text>
              </g>
            </svg>
            <span className="document-detail__cover-label">Machine learning</span>
          </div>
          <div className="document-detail__identity-copy">
            <p>{document.meta.join(' · ')}</p>
            <h1 id="document-detail-title">机器学习<br />第三章</h1>
            <span>{document.subtitle}</span>
          </div>
        </section>

        <section className="document-understanding" aria-labelledby="understanding-title">
          <p className="document-section-label">Agent 阅读结果</p>
          <h2 id="understanding-title">这一章在回答什么？</h2>
          <p className="document-understanding__summary">{document.summary}</p>
          <blockquote>
            <span>关键判断</span>
            <p>{document.insight}</p>
          </blockquote>
        </section>

        <section className="document-concepts" aria-labelledby="concepts-title">
          <div className="document-section-heading">
            <div>
              <p className="document-section-label">知识结构</p>
              <h2 id="concepts-title">三个核心概念</h2>
            </div>
            <span>已建立关系</span>
          </div>
          <div className="document-concept-list">
            {document.concepts.map((concept) => (
              <article className={concept.title === document.learningTarget ? 'document-concept document-concept--focus' : 'document-concept'} key={concept.index}>
                <span>{concept.index}</span>
                <div>
                  <div className="document-concept__title">
                    <h3>{concept.title}</h3>
                    {concept.title === document.learningTarget && <small>下一步</small>}
                  </div>
                  <p>{concept.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="document-prerequisites" aria-labelledby="prerequisites-title">
          <div>
            <p className="document-section-label">进入前</p>
            <h2 id="prerequisites-title">需要的基础</h2>
          </div>
          <div className="document-prerequisites__list">
            {document.prerequisites.map((item) => <span key={item}>{item}</span>)}
          </div>
        </section>

        <section className="document-source" aria-labelledby="source-title">
          <button type="button" className="document-source__trigger" aria-expanded={isSourceOpen} onClick={() => setIsSourceOpen((current) => !current)}>
            <span className="document-source__icon"><Icon name="link" size={18} /></span>
            <span>
              <small>理解依据 · {document.source.location}</small>
              <strong id="source-title">{document.source.title}</strong>
            </span>
            <span className={isSourceOpen ? 'document-source__chevron document-source__chevron--open' : 'document-source__chevron'}><Icon name="chevron" size={18} /></span>
          </button>
          {isSourceOpen && <div className="document-source__excerpt">
            <p>{document.source.excerpt}</p>
            <button type="button">定位到原文 <Icon name="arrow" size={16} /></button>
          </div>}
        </section>

        <div className="document-secondary-actions" aria-label="其他操作">
          <button type="button" onClick={onAskAgent}><Icon name="spark" size={18} />向 Agent 提问</button>
          <button type="button" onClick={onViewMap}><Icon name="map" size={18} />在地图中查看</button>
        </div>
      </main>

      <footer className="document-primary-action">
        <div>
          <span>下一步</span>
          <strong>{`深入理解${document.learningTarget}`}</strong>
        </div>
        <button type="button" className="document-primary-action__button" onClick={onStartLearning}>
          开始深入学习<Icon name="arrow" size={19} />
        </button>
      </footer>
    </section>
  )
}
