import { useState } from 'react'

import { PageHeader } from '../components/shell/PageHeader'
import { Icon } from '../components/ui/Icon'

const learningModes = ['快速浏览', '系统学习', '深度研读'] as const

export function SettingsPage() {
  const [learningMode, setLearningMode] = useState<(typeof learningModes)[number]>('系统学习')
  const [reviewReminder, setReviewReminder] = useState(true)
  const [sourceHints, setSourceHints] = useState(true)

  const cycleLearningMode = () => {
    const current = learningModes.indexOf(learningMode)
    setLearningMode(learningModes[(current + 1) % learningModes.length])
  }

  return (
    <section className="page page--settings">
      <PageHeader eyebrow="偏好" title="设置" description="调整默认学习方式与阅读提醒。所有选项仅作用于这个原型。" />

      <section className="preference-section" aria-labelledby="learning-preferences-title">
        <header>
          <p className="eyebrow">学习</p>
          <h2 id="learning-preferences-title">默认方式</h2>
        </header>
        <div className="preference-list">
          <button className="preference-row" type="button" onClick={cycleLearningMode}>
            <span><strong>学习深度</strong><small>新项目会优先使用这项设置</small></span>
            <em>{learningMode}</em>
            <Icon name="chevron" size={16} />
          </button>
          <div className="preference-row">
            <span><strong>每日复习提醒</strong><small>到期复习时显示一次提醒</small></span>
            <button className="switch-control" type="button" role="switch" aria-checked={reviewReminder} aria-label="每日复习提醒" onClick={() => setReviewReminder((value) => !value)}><i /></button>
          </div>
          <div className="preference-row">
            <span><strong>来源提示</strong><small>在解释与判断旁保留资料定位</small></span>
            <button className="switch-control" type="button" role="switch" aria-checked={sourceHints} aria-label="来源提示" onClick={() => setSourceHints((value) => !value)}><i /></button>
          </div>
        </div>
      </section>

      <p className="prototype-disclosure">设置仅用于本次页面演示，离开页面或刷新后会恢复默认值。</p>
    </section>
  )
}
