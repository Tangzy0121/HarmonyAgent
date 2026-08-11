import { describe, expect, it } from 'vitest'

import { normalizePretestQuestions, PretestValidationError } from './pretestValidation.js'

const CHAPTER_IDS = ['ch-1', 'ch-2', 'ch-3']

function validRaw() {
  return {
    questions: [
      { chapterId: 'ch-1', question: '题一', options: [{ id: 'a', text: '甲' }, { id: 'b', text: '乙' }], correctAnswerId: 'a', explanation: '解析一' },
      { chapterId: 'ch-1', question: '题二', options: [{ id: 'a', text: '甲' }, { id: 'b', text: '乙' }, { id: 'c', text: '丙' }], correctAnswerId: 'b', explanation: '解析二' },
      { chapterId: 'ch-2', question: '题三', options: [{ id: 'a', text: '甲' }, { id: 'b', text: '乙' }], correctAnswerId: 'a', explanation: '解析三' },
      { chapterId: 'ch-2', question: '题四', options: [{ id: 'a', text: '甲' }, { id: 'b', text: '乙' }, { id: 'c', text: '丙' }, { id: 'd', text: '丁' }], correctAnswerId: 'd', explanation: '解析四' },
      { chapterId: 'ch-3', question: '题五', options: [{ id: 'a', text: '甲' }, { id: 'b', text: '乙' }], correctAnswerId: 'a', explanation: '解析五' },
    ],
  }
}

function expectInvalid(value: unknown, chapterIds: string[] = CHAPTER_IDS) {
  expect(() => normalizePretestQuestions(value, chapterIds))
    .toThrowError(expect.objectContaining({ name: 'PretestValidationError', code: 'pretest_invalid' }))
}

describe('normalizePretestQuestions', () => {
  it('接受合法输出：归一化题 id 为 pq-N、选项 marker 为 A/B/...', () => {
    const questions = normalizePretestQuestions(validRaw(), CHAPTER_IDS)

    expect(questions).toHaveLength(5)
    expect(questions.map((entry) => entry.id)).toEqual(['pq-1', 'pq-2', 'pq-3', 'pq-4', 'pq-5'])
    expect(questions[0]).toMatchObject({
      chapterId: 'ch-1',
      question: '题一',
      correctAnswerId: 'a',
      explanation: '解析一',
    })
    expect(questions[0].options).toEqual([
      { id: 'a', marker: 'A', text: '甲' },
      { id: 'b', marker: 'B', text: '乙' },
    ])
    expect(questions[1].options.map((option) => option.marker)).toEqual(['A', 'B', 'C'])
    expect(questions[3].options.map((option) => option.marker)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('拒绝非对象或缺少 questions 数组的输出', () => {
    expectInvalid(null)
    expectInvalid('题目')
    expectInvalid({})
    expectInvalid({ questions: '五道题' })
    expectInvalid([])
  })

  it('拒绝题数不为 5 的输出', () => {
    const tooFew = { questions: validRaw().questions.slice(0, 4) }
    const tooMany = { questions: [...validRaw().questions, validRaw().questions[0]] }
    expectInvalid(tooFew)
    expectInvalid(tooMany)
  })

  it('拒绝选项数越界（<2 或 >4）或选项缺文本', () => {
    const one = validRaw()
    one.questions[0].options = [{ id: 'a', text: '甲' }]
    expectInvalid(one)

    const five = validRaw()
    five.questions[0].options = [
      { id: 'a', text: '甲' }, { id: 'b', text: '乙' }, { id: 'c', text: '丙' },
      { id: 'd', text: '丁' }, { id: 'e', text: '戊' },
    ]
    expectInvalid(five)

    const noText = validRaw()
    noText.questions[0].options = [{ id: 'a', text: '甲' }, { id: 'b' }] as never
    expectInvalid(noText)
  })

  it('拒绝 correctAnswerId 未命中任何选项', () => {
    const raw = validRaw()
    raw.questions[0].correctAnswerId = 'z'
    expectInvalid(raw)
  })

  it('拒绝 chapterId 不是真实章节 id', () => {
    const raw = validRaw()
    raw.questions[0].chapterId = 'ch-99'
    expectInvalid(raw)
  })

  it('拒绝题干为空或非字符串', () => {
    const empty = validRaw()
    empty.questions[0].question = '   '
    expectInvalid(empty)

    const nonString = validRaw()
    nonString.questions[0].question = 42 as never
    expectInvalid(nonString)
  })

  it('错误实例携带校验原因供重试提示拼接', () => {
    try {
      normalizePretestQuestions({ questions: validRaw().questions.slice(0, 4) }, CHAPTER_IDS)
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(PretestValidationError)
      expect((error as PretestValidationError).reason).toBeTruthy()
    }
  })
})
