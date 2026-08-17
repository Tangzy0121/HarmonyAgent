import { describe, expect, it } from 'vitest'

import {
  AdaptiveQuizValidationError,
  buildAdaptiveQuizMessages,
  normalizeAdaptiveQuiz,
} from './adaptiveQuizPrompt.js'

const SOURCE_TEXT = '监督学习依赖带标签的训练数据。模型通过最小化损失函数拟合参数。'

function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    question: '监督学习的训练数据必须具备什么？',
    options: [
      { id: 'o1', text: '目标标签' },
      { id: 'o2', text: '更多超参数' },
      { id: 'o3', text: '更大显存' },
      { id: 'o4', text: '随机种子' },
    ],
    correctAnswerId: 'o1',
    feedback: '监督学习依赖带标签数据，标签即监督信号。',
    excerpt: '监督学习依赖带标签的训练数据',
    ...overrides,
  }
}

describe('buildAdaptiveQuizMessages', () => {
  it('system 要求只输出 JSON 且 excerpt 必须是原文子串；user 携带概念/源文/错题', () => {
    const messages = buildAdaptiveQuizMessages({
      conceptLabel: '监督学习',
      conceptDescription: '用带标签数据训练模型',
      chapterTitle: '第一章',
      sourceText: SOURCE_TEXT,
      mistakes: [{ question: '旧题题干', feedback: '旧题解析' }],
    })
    expect(messages).toHaveLength(2)
    const [system, user] = messages
    expect(system.role).toBe('system')
    expect(system.content).toContain('JSON')
    expect(system.content).toContain('excerpt')
    expect(user.role).toBe('user')
    expect(user.content).toContain('监督学习')
    expect(user.content).toContain('用带标签数据训练模型')
    expect(user.content).toContain(SOURCE_TEXT)
    expect(user.content).toContain('旧题题干')
    expect(user.content).toContain('旧题解析')
    expect(user.content).toContain('<document_data>')
  })

  it('无历史错题时 user 不含错题段', () => {
    const messages = buildAdaptiveQuizMessages({
      conceptLabel: '监督学习',
      conceptDescription: '',
      chapterTitle: '第一章',
      sourceText: SOURCE_TEXT,
      mistakes: [],
    })
    expect(messages[1].content).not.toContain('答错')
  })
})

describe('normalizeAdaptiveQuiz', () => {
  it('合法载荷归一化：补齐选项 marker，保留题干/答案/解析/引文', () => {
    const quiz = normalizeAdaptiveQuiz(validPayload(), SOURCE_TEXT)
    expect(quiz.question).toBe('监督学习的训练数据必须具备什么？')
    expect(quiz.options.map((option) => option.marker)).toEqual(['A', 'B', 'C', 'D'])
    expect(quiz.options.map((option) => option.id)).toEqual(['o1', 'o2', 'o3', 'o4'])
    expect(quiz.correctAnswerId).toBe('o1')
    expect(quiz.feedback).toContain('监督信号')
    expect(quiz.excerpt).toBe('监督学习依赖带标签的训练数据')
  })

  it.each([
    ['非对象', null],
    ['缺题干', validPayload({ question: '' })],
    ['选项不是 4 个', validPayload({ options: [{ id: 'o1', text: 'a' }] })],
    ['选项缺文本', validPayload({ options: [
      { id: 'o1', text: 'a' },
      { id: 'o2' },
      { id: 'o3', text: 'c' },
      { id: 'o4', text: 'd' },
    ] })],
    ['答案与选项不匹配', validPayload({ correctAnswerId: 'o9' })],
    ['excerpt 为空', validPayload({ excerpt: '  ' })],
  ])('结构非法抛 AdaptiveQuizValidationError：%s', (_label, payload) => {
    expect(() => normalizeAdaptiveQuiz(payload, SOURCE_TEXT)).toThrow(AdaptiveQuizValidationError)
  })

  it('excerpt 不是源文子串 → 硬校验失败', () => {
    expect(() => normalizeAdaptiveQuiz(validPayload({ excerpt: '强化学习依赖奖励信号' }), SOURCE_TEXT))
      .toThrow(AdaptiveQuizValidationError)
  })

  it('excerpt 与源文空白差异不敏感（去空白后子串命中）', () => {
    const quiz = normalizeAdaptiveQuiz(
      validPayload({ excerpt: '监督学习依赖带标签的 训练数据' }),
      SOURCE_TEXT,
    )
    expect(quiz.excerpt).toBe('监督学习依赖带标签的 训练数据')
  })

  it('选项 id 缺省时按 o1..o4 补齐', () => {
    const quiz = normalizeAdaptiveQuiz(validPayload({
      options: [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }],
      correctAnswerId: 'o2',
    }), SOURCE_TEXT)
    expect(quiz.options.map((option) => option.id)).toEqual(['o1', 'o2', 'o3', 'o4'])
  })

  it('错误携带 code 与 reason，供重试提示拼接', () => {
    try {
      normalizeAdaptiveQuiz(validPayload({ excerpt: '不存在的句子' }), SOURCE_TEXT)
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(AdaptiveQuizValidationError)
      expect((error as AdaptiveQuizValidationError).code).toBe('adaptive_quiz_invalid')
      expect(typeof (error as AdaptiveQuizValidationError).reason).toBe('string')
    }
  })
})
