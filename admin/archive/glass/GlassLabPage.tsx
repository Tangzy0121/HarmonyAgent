import { useState } from 'react'
import { Icon } from '../../src/components/Icon'
import { LociGlass } from './LociGlass'
import { destinations } from '../../src/data/prototype'
import { lociGlassPresets, type LociGlassPreset, type LociGlassSpec } from './materials'
import type { Destination } from '../../src/types/prototype'

const presetLabels: Record<LociGlassPreset, string> = {
  balanced: '柔雾',
  clear: '清透',
  refractive: '折射',
}

type LightEnvironment = 'neutral' | 'smoke' | 'peach' | 'violet'

const lightEnvironmentLabels: Record<LightEnvironment, string> = {
  neutral: '中性',
  smoke: '烟灰',
  peach: '桃光',
  violet: '冷紫',
}

const labItems = [
  { index: '01', title: '监督学习', detail: '8 个知识节点', status: '已理解' },
  { index: '02', title: '模型评估', detail: '3 条待复习', status: '待复习' },
  { index: '03', title: '分类与聚类', detail: '12 道练习', status: '待处理' },
]

const referenceGlassOverrides: Record<LociGlassPreset, Partial<LociGlassSpec>> = {
  balanced: {
    blurRadius: 32,
    tintOpacity: 0.26,
    saturation: 0.9,
    brightness: 1.01,
    refractionStrength: 9,
    dispersion: 0.025,
    edgeWidth: 0.15,
    edgeLight: 0.46,
  },
  clear: {
    blurRadius: 20,
    tintOpacity: 0.18,
    saturation: 0.94,
    brightness: 1.01,
    refractionStrength: 7,
    dispersion: 0.018,
    edgeWidth: 0.12,
    edgeLight: 0.4,
  },
  refractive: {
    interactionStrength: 0.9,
  },
}

export function GlassLabPage() {
  const [preset, setPreset] = useState<LociGlassPreset>('refractive')
  const [lightEnvironment, setLightEnvironment] = useState<LightEnvironment>('smoke')
  const [activeDestination, setActiveDestination] = useState<Destination>('today')
  const spec = { ...lociGlassPresets[preset], ...referenceGlassOverrides[preset] }

  return (
    <main className={`glass-lab glass-lab--v2 glass-lab--light-${lightEnvironment}`}>
      <div className="glass-lab__ambient" aria-hidden="true">
        <span className="glass-lab__ambient-shape glass-lab__ambient-shape--cool" />
        <span className="glass-lab__ambient-shape glass-lab__ambient-shape--peach" />
        <span className="glass-lab__ambient-shape glass-lab__ambient-shape--dark" />
      </div>

      <div className="glass-lab__scroll">
      <header className="glass-lab__brandbar">
        <div className="glass-lab__brand">
          <Icon name="blossom" size={22} />
          <span>loci</span>
        </div>
        <span className="glass-lab__edition">Material 02</span>
      </header>

      <section className="glass-lab__intro" aria-labelledby="glass-lab-title">
        <p>Liquid Glass Study</p>
        <h1 id="glass-lab-title">今天想先<br />理解什么？</h1>
      </section>

      <LociGlass className="glass-lab__assistant-panel" spec={spec} interactive={false}>
        <div className="glass-lab__assistant-meta">
          <span>知识 Agent</span>
          <strong>{presetLabels[preset]}</strong>
        </div>
        <div className="glass-lab__assistant-options" aria-label="快捷操作">
          <button type="button"><Icon name="scan" size={15} />资料解析</button>
          <button type="button"><Icon name="route" size={15} />学习规划</button>
        </div>
        <div className="glass-lab__assistant-current">
          <span className="glass-lab__assistant-orb" aria-hidden="true" />
          <div>
            <strong>机器学习 · 第三章</strong>
            <small>上次学习 18 分钟</small>
          </div>
          <button type="button">继续</button>
        </div>
      </LociGlass>

      <section className="glass-lab__material-controls" aria-label="材质实验控制">
        <div className="glass-lab__control-heading">
          <span>材质</span>
          <small>折射 {spec.refractionStrength} · 模糊 {spec.blurRadius}</small>
        </div>
        <div className="glass-lab__presets" role="group" aria-label="液态玻璃预设">
          {(Object.keys(presetLabels) as LociGlassPreset[]).map((item) => (
            <button
              key={item}
              type="button"
              className={preset === item ? 'glass-lab__preset glass-lab__preset--active' : 'glass-lab__preset'}
              aria-pressed={preset === item}
              onClick={() => setPreset(item)}
            >
              {presetLabels[item]}
            </button>
          ))}
        </div>
        <div className="glass-lab__lighting" role="group" aria-label="环境光实验">
          {(Object.keys(lightEnvironmentLabels) as LightEnvironment[]).map((item) => (
            <button
              key={item}
              type="button"
              className={lightEnvironment === item ? 'glass-lab__light-option glass-lab__light-option--active' : 'glass-lab__light-option'}
              aria-pressed={lightEnvironment === item}
              onClick={() => setLightEnvironment(item)}
            >
              <i aria-hidden="true" />
              <span>{lightEnvironmentLabels[item]}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="glass-lab__weekly" aria-labelledby="glass-lab-weekly-title">
        <header>
          <div>
            <p>本周重点</p>
            <h2 id="glass-lab-weekly-title">机器学习<br />第三章</h2>
          </div>
          <span>24 页 · 已建立 8 个节点</span>
        </header>

        <div className="glass-lab__feature-grid">
          <article className="glass-lab__feature glass-lab__feature--primary">
            <span>当前章节</span>
            <strong>理解监督学习<br />与无监督学习</strong>
            <small>预计 18 分钟</small>
            <i aria-hidden="true" />
          </article>
          <article className="glass-lab__feature glass-lab__feature--secondary">
            <Icon name="network" size={24} />
            <div>
              <span>知识地图</span>
              <strong>新增 2 条关系</strong>
            </div>
          </article>
        </div>
      </section>

      <section className="glass-lab__stream" aria-labelledby="glass-lab-stream-title">
        <header>
          <h2 id="glass-lab-stream-title">知识流</h2>
          <button type="button">查看全部</button>
        </header>
        <div className="glass-lab__stream-filters" aria-label="知识流筛选">
          <button className="glass-lab__stream-filter--active" type="button">全部</button>
          <button type="button">资料</button>
          <button type="button">复习</button>
        </div>
        <LociGlass
          className="glass-lab__stream-glass"
          spec={{ ...spec, blurRadius: spec.blurRadius + 4 }}
          interactive={false}
        >
          <div className="glass-lab__items">
            {labItems.map((item) => (
              <article key={item.index}>
                <span>{item.index}</span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </div>
                <small>{item.status}</small>
              </article>
            ))}
          </div>
        </LociGlass>
      </section>
      </div>

      <div className="glass-lab__controls">
        <LociGlass className="glass-lab__navigation-glass" spec={spec} interactive={false}>
          <nav className="glass-lab__navigation" aria-label="材质实验导航">
            {destinations.map((destination) => {
              const isActive = destination.id === activeDestination
              return (
                <button
                  key={destination.id}
                  type="button"
                  className={isActive ? 'glass-lab__navigation-item glass-lab__navigation-item--active' : 'glass-lab__navigation-item'}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => setActiveDestination(destination.id)}
                >
                  <Icon name={destination.id === 'learning' ? 'map' : destination.id} size={19} />
                  <span>{destination.label}</span>
                </button>
              )
            })}
          </nav>
        </LociGlass>

        <LociGlass
          className="glass-lab__agent-glass"
          spec={{ ...spec, cornerRadius: 999, refractionStrength: spec.refractionStrength * 1.2 }}
          interactive={false}
        >
          <button type="button" aria-label="测试 Agent 液态玻璃按钮">
            <Icon name="blossom" size={24} />
          </button>
        </LociGlass>
      </div>
    </main>
  )
}
