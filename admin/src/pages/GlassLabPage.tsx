import { useState } from 'react'
import { Icon } from '../components/Icon'
import { LociGlass } from '../components/LociGlass'
import { destinations } from '../data/prototype'
import { lociGlassPresets, type LociGlassPreset } from '../types/materials'
import type { Destination } from '../types/prototype'

const presetLabels: Record<LociGlassPreset, string> = {
  balanced: '平衡',
  clear: '清透',
  refractive: '强折射',
}

type LightEnvironment = 'flat' | 'directional' | 'pink' | 'forest'

const lightEnvironmentLabels: Record<LightEnvironment, string> = {
  flat: '平光',
  directional: '侧光',
  pink: '粉色',
  forest: '森林绿',
}

const labItems = [
  { index: '01', title: '监督学习', detail: '8 个知识节点', status: '已理解' },
  { index: '02', title: '模型评估', detail: '3 条待复习', status: '待复习' },
  { index: '03', title: '分类与聚类', detail: '12 道练习', status: '待处理' },
]

export function GlassLabPage() {
  const [preset, setPreset] = useState<LociGlassPreset>('clear')
  const [lightEnvironment, setLightEnvironment] = useState<LightEnvironment>('directional')
  const [activeDestination, setActiveDestination] = useState<Destination>('library')
  const spec = lociGlassPresets[preset]

  return (
    <main className={`glass-lab glass-lab--light-${lightEnvironment}`}>
      <header className="glass-lab__header">
        <div>
          <p>loci material study</p>
          <h1>Liquid<br />Glass 01</h1>
        </div>
        <span>WEB → ARKUI</span>
      </header>

      <section className="glass-lab__presets" aria-label="液态玻璃预设">
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
      </section>

      <section className="glass-lab__lighting" aria-label="环境光实验">
        <div>
          <span>环境光</span>
          <strong>{lightEnvironment === 'flat' ? '均匀照明' : '左上主光'}</strong>
        </div>
        <div role="group" aria-label="环境光模式">
          {(Object.keys(lightEnvironmentLabels) as LightEnvironment[]).map((item) => (
            <button
              key={item}
              type="button"
              className={lightEnvironment === item ? 'glass-lab__light-option glass-lab__light-option--active' : 'glass-lab__light-option'}
              aria-pressed={lightEnvironment === item}
              onClick={() => setLightEnvironment(item)}
            >
              {lightEnvironmentLabels[item]}
            </button>
          ))}
        </div>
      </section>

      <section className="glass-lab__spec" aria-label="当前材质参数">
        <div>
          <span>折射</span>
          <strong>{spec.refractionStrength}</strong>
        </div>
        <div>
          <span>模糊</span>
          <strong>{spec.blurRadius}</strong>
        </div>
        <div>
          <span>边缘</span>
          <strong>{Math.round(spec.edgeLight * 100)}</strong>
        </div>
      </section>

      <section className="glass-lab__content" aria-label="内容层测试样本">
        <div className="glass-lab__content-heading">
          <div>
            <p>内容层</p>
            <h2>知识流</h2>
          </div>
          <span>内容窗口</span>
        </div>

        <div className="glass-lab__focus">
          <span>本周重点</span>
          <strong>机器学习<br />第三章</strong>
          <small>24 页 · 8 个知识节点</small>
        </div>

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
      </section>

      <p className="glass-lab__underlay" aria-hidden="true">LOCI · LOCI · LOCI</p>

      <div className="glass-lab__controls">
        <LociGlass className="glass-lab__navigation-glass" spec={spec}>
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
        >
          <button type="button" aria-label="测试 Agent 液态玻璃按钮">
            <Icon name="agent" size={24} strokeWidth={1.65} />
          </button>
        </LociGlass>
      </div>
    </main>
  )
}
