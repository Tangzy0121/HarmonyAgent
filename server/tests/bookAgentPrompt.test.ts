import { describe, expect, it } from 'vitest'

import { normalizeBookAgentRequest } from '../src/agent/bookAgentContract.js'
import { buildBookAgentMessages } from '../src/agent/bookAgentPrompt.js'

function makeRequest() {
  return {
    question: '为什么有标签才算监督学习？',
    history: Array.from({ length: 8 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `历史消息 ${index + 1}`,
    })),
    context: {
      bookId: 'book-1',
      title: '机器学习',
      scope: 'chapter',
      label: '第 1 章 · 监督学习',
      focusBlockId: 'block-1',
      chapters: [
        {
          id: 'chapter-1',
          title: '监督学习',
          objective: '理解标签',
          blocks: [
            {
              id: 'block-1',
              type: 'explanation',
              title: '标签的作用',
              content: '标签为模型提供预测目标。',
              sourceIds: ['S1'],
              userAuthored: false,
            },
            {
              id: 'note-1',
              type: 'user_note',
              title: '我的笔记',
              content: '我觉得标签像答案。',
              sourceIds: [],
              userAuthored: true,
            },
          ],
        },
      ],
      sources: [
        {
          id: 'S1',
          sourceId: 'source-1',
          fileName: '机器学习 · 第三章.pdf',
          pageRange: '4–6',
          excerpt: '监督学习使用带标签的数据。',
          chapterId: 'chapter-1',
          blockId: 'block-1',
        },
      ],
      warnings: [],
    },
    apiKey: 'sk-never-copy-this-value',
  }
}

describe('buildBookAgentMessages', () => {
  it('places grounded Chinese rules and serialized book context before recent history', () => {
    const request = normalizeBookAgentRequest(makeRequest())
    const messages = buildBookAgentMessages(request)
    const system = messages[0].content
    const context = messages[1].content

    expect(system).toContain('只能依据下面提供的互动学习书上下文')
    expect(system).toContain('当前学习书内容中没有足够依据')
    expect(system).toContain('只允许引用来源区实际列出的编号')
    expect(system).toContain('用户笔记不是原文证据')
    expect(system).toContain('不得修改学习进度、掌握度或任何学习数据')
    expect(context).toContain('【学习书内容区】')
    expect(context).toContain('【原文来源区】')
    expect(context.indexOf('【学习书内容区】')).toBeLessThan(context.indexOf('【原文来源区】'))
    expect(context).toContain('[S1] 机器学习 · 第三章.pdf，第 4–6 页')
    expect(context).toContain('标签为模型提供预测目标。')
    expect(context).toContain('用户笔记（非原文证据）')
    expect(messages.slice(2, -1)).toEqual(request.history)
    expect(messages.at(-1)).toEqual({ role: 'user', content: request.question })
  })

  it('keeps source records separate from blocks and lists only present citation IDs', () => {
    const request = normalizeBookAgentRequest(makeRequest())
    const messages = buildBookAgentMessages(request)
    const system = messages[0].content
    const context = messages[1].content

    expect(system).toContain('本次可用引用编号：[S1]')
    expect(system).not.toContain('[S2]')
    expect(context.match(/\[S1\]/gu)).toHaveLength(2)
    expect(context).not.toContain('[S99]')
  })

  it('drops unknown request fields so provider credentials cannot enter the prompt', () => {
    const request = normalizeBookAgentRequest(makeRequest())
    const messages = buildBookAgentMessages(request)

    expect(JSON.stringify(messages)).not.toContain('sk-never-copy-this-value')
    expect(JSON.stringify(messages)).not.toContain('apiKey')
  })

  it('states that citations are unavailable when no book context is attached', () => {
    const request = normalizeBookAgentRequest({
      question: '帮我解释这个概念',
      history: [{ role: 'user', content: '继续' }],
      context: null,
    })
    const messages = buildBookAgentMessages(request)
    const systemText = messages.slice(0, 2).map((message) => message.content).join('\n')

    expect(systemText).toContain('未附加学习书依据')
    expect(systemText).toContain('引用不可用')
    expect(systemText).not.toContain('[S1]')
    expect(messages.at(-1)).toEqual({ role: 'user', content: '帮我解释这个概念' })
  })
})
