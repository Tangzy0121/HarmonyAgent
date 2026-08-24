import { useRef, useState, type ChangeEvent } from 'react'

import { usePrototype } from '../app/PrototypeContext'
import { CreateProgress } from '../components/project/CreateProgress'
import { ImmersiveHeader } from '../components/shell/ImmersiveHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import type { CreateDraft } from '../types/product'

function formatFromName(name: string): NonNullable<CreateDraft['file']>['format'] {
  if (name.toLowerCase().endsWith('.docx')) return 'DOCX'
  if (/\.(md|markdown)$/iu.test(name)) return 'Markdown'
  return 'PDF'
}

function sizeLabel(bytes: number): string {
  if (!bytes) return '2.4 MB'
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`
}

export function CreateProjectPage() {
  const { state, dispatch } = usePrototype()
  const [step, setStep] = useState<1 | 2>(state.createDraft.file ? 2 : 1)
  const inputRef = useRef<HTMLInputElement>(null)
  const draft = state.createDraft

  const pickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    dispatch({ type: 'patch_draft', patch: { file: { name: file.name, format: formatFromName(file.name), size: sizeLabel(file.size) } } })
  }

  return (
    <div className="immersive-page create-page">
      <ImmersiveHeader title="新建项目" meta={`${step} / 3`} />
      <main className="flow-layout">
        <CreateProgress current={step} />

        {step === 1 ? (
          <section className="flow-stage" aria-labelledby="source-stage-title">
            <p className="eyebrow">01 · 来源</p>
            <h1 id="source-stage-title">选择学习资料</h1>
            <p className="flow-stage__intro">支持 PDF、Markdown、DOCX，仅用于原型展示。</p>
            <input ref={inputRef} className="sr-only" type="file" accept=".pdf,.md,.markdown,.docx" onChange={pickFile} />
            {!draft.file ? (
              <button className="file-drop" type="button" onClick={() => inputRef.current?.click()}>
                <span><Icon name="upload" size={25} /></span>
                <strong>选择文件</strong>
                <p>PDF · Markdown · DOCX</p>
              </button>
            ) : (
              <div className="selected-file">
                <span><Icon name="document" size={24} /></span>
                <div><strong>{draft.file.name}</strong><small>{draft.file.format} · {draft.file.size}</small></div>
                <button type="button" aria-label="移除资料" onClick={() => dispatch({ type: 'patch_draft', patch: { file: null } })}><Icon name="close" size={17} /></button>
              </div>
            )}
            <div className="demo-file-row"><button type="button" onClick={() => dispatch({ type: 'patch_draft', patch: { file: { name: 'AI 产品设计方法.md', format: 'Markdown', size: '286 KB' } } })}>使用演示资料</button></div>
            <footer className="flow-actions"><Button variant="primary" iconAfter="arrow" disabled={!draft.file} onClick={() => setStep(2)}>下一步</Button></footer>
          </section>
        ) : (
          <section className="flow-stage" aria-labelledby="settings-stage-title">
            <p className="eyebrow">02 · 设置</p>
            <h1 id="settings-stage-title">设置学习方式</h1>
            <p className="flow-stage__intro">用于调整讲解与练习深度。</p>
            <div className="form-stack">
              <label className="field"><span>学习目标</span><textarea rows={2} value={draft.goal} placeholder="例如：能评审一个 AI 产品方案。" onChange={(event) => dispatch({ type: 'patch_draft', patch: { goal: event.target.value } })} /></label>
              <fieldset><legend>当前水平</legend><div className="choice-row">{(['入门', '了解', '熟悉'] as const).map((level) => <button key={level} type="button" aria-pressed={draft.level === level} onClick={() => dispatch({ type: 'patch_draft', patch: { level } })}><strong>{level}</strong><span>{level === '入门' ? '首次系统学习' : level === '了解' ? '知道基本术语' : '已有实践经验'}</span></button>)}</div></fieldset>
              <fieldset><legend>学习深度</legend><div className="choice-row">{(['快速理解', '系统学习', '深入掌握'] as const).map((depth) => <button key={depth} type="button" aria-pressed={draft.depth === depth} onClick={() => dispatch({ type: 'patch_draft', patch: { depth } })}><strong>{depth}</strong><span>{depth === '快速理解' ? '约 20 分钟' : depth === '系统学习' ? '约 45 分钟' : '约 90 分钟'}</span></button>)}</div></fieldset>
            </div>
            <footer className="flow-actions"><Button variant="ghost" icon="back" onClick={() => setStep(1)}>上一步</Button><Button variant="primary" iconAfter="arrow" disabled={!draft.goal.trim()} onClick={() => dispatch({ type: 'create_plan' })}>生成方案</Button></footer>
          </section>
        )}
      </main>
    </div>
  )
}
