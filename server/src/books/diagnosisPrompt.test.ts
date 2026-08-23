import { describe, expect, it } from 'vitest'

import { DIAGNOSIS_TYPES } from './bookTypes.js'
import { buildDiagnosisMessages, DiagnosisValidationError, normalizeDiagnosis } from './diagnosisPrompt.js'

const input = {
  question: '训练误差低而测试误差高说明什么？',
  options: [
    { id: 'o1', marker: 'A', text: '欠拟合' },
    { id: 'o2', marker: 'B', text: '过拟合' },
  ],
  chosenAnswerId: 'o1',
  correctAnswerId: 'o2',
  conceptLabel: '过拟合',
  chapterTitle: '从误差到参数更新',
}

describe('buildDiagnosisMessages', () => {
  it('包含四类标签、所选与正确选项，并把题目数据标记为不可信', () => {
    const [system, user] = buildDiagnosisMessages(input)
    for (const type of DIAGNOSIS_TYPES) expect(system.content).toContain(type)
    expect(system.content).toContain('不可信数据')
    expect(user.content).toContain('欠拟合')
    expect(user.content).toContain('过拟合')
    expect(user.content).toContain('过拟合') // conceptLabel
    expect(user.content).toContain('<document_data>')
  })
})

describe('normalizeDiagnosis', () => {
  it('接受合法四类并保留不超过 120 字的 advice', () => {
    expect(normalizeDiagnosis({ type: 'concept', advice: '回到概念块重读定义。' })).toEqual({ type: 'concept', advice: '回到概念块重读定义。' })
  })
  it('拒绝未知类型、空 advice 与超长 advice', () => {
    expect(() => normalizeDiagnosis({ type: 'guessing', advice: 'x' })).toThrow(DiagnosisValidationError)
    expect(() => normalizeDiagnosis({ type: 'concept', advice: '' })).toThrow(DiagnosisValidationError)
    expect(() => normalizeDiagnosis({ type: 'concept', advice: '长'.repeat(121) })).toThrow(DiagnosisValidationError)
  })
})
