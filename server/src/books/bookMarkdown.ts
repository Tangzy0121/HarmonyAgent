import { bookSources } from './bookSources.js'
import type { BookBlock, BookChapter, StoredBook } from './bookTypes.js'

/** 块类型 → 中文小节标签（与 admin blockTypeLabel 对齐） */
const BLOCK_TYPE_LABEL: Record<BookBlock['type'], string> = {
  explanation: '核心讲解',
  example: '例子',
  formula: '公式',
  citation: '原文依据',
  concept: '知识节点',
  quiz: '快速验证',
  callout: '学习提示',
  flash_cards: '记忆闪卡',
  figure: '图解',
  user_note: '我的笔记',
}

const CHAPTER_STATUS_LABEL: Record<BookChapter['status'], string> = {
  pending: '等待生成',
  generating: '生成中',
  ready: '可阅读',
  partial: '部分失败',
  error: '生成失败',
}

function renderBlock(block: BookBlock): string[] {
  const lines: string[] = []
  const heading = `### ${block.title}（${BLOCK_TYPE_LABEL[block.type]}）`
  switch (block.type) {
    case 'explanation':
      lines.push(heading, '', block.body, '', `> 💡 ${block.keyPoint}`)
      break
    case 'example':
      lines.push(heading, '', block.scenario, '', `**带走一句：**${block.takeaway}`)
      break
    case 'formula':
      lines.push(heading, '', '$$', block.formula, '$$', '', block.explanation)
      break
    case 'citation':
      lines.push(heading, '', `> “${block.excerpt}”`, `> —— 原文：${block.location}`)
      break
    case 'concept': {
      lines.push(heading, '')
      for (const concept of block.concepts) {
        lines.push(`- **${concept.label}**：${concept.description}`)
      }
      const labelOf = (id: string) => block.concepts.find((item) => item.id === id)?.label ?? id
      for (const relation of block.relations) {
        if (relation.status === '已拒绝') continue
        lines.push(`- ${labelOf(relation.sourceId)} →${relation.type}→ ${labelOf(relation.targetId)}（置信度 ${relation.confidence}，${relation.status}）`)
      }
      break
    }
    case 'quiz': {
      lines.push(heading, '', block.question, '')
      for (const option of block.options) {
        lines.push(`- ${option.marker}. ${option.text}`)
      }
      const correct = block.options.find((option) => option.id === block.correctAnswerId)
      lines.push('', `**答案：${correct?.marker ?? '?'}** — ${block.feedback}`)
      break
    }
    case 'callout':
      lines.push(heading, '', `> ${block.body}`)
      break
    case 'flash_cards':
      lines.push(heading, '')
      for (const card of block.cards) {
        lines.push(`- **${card.front}** → ${card.back}${card.hint ? `（提示：${card.hint}）` : ''}`)
      }
      break
    case 'figure':
      lines.push(heading, '', '```mermaid', block.mermaid, '```', '', `*${block.caption}*`)
      break
    case 'user_note':
      // 真实书的笔记存书级 userNotes，在所属块后渲染；user_note 块（mock 遗留）跳过标题由笔记段覆盖
      break
  }
  return lines
}

/**
 * 把一本学习书序列化为单个 Markdown 文档。
 * 纯确定性投影：无 LLM、无副作用；AI 生成内容与用户笔记分别标注（规格 §6.2 延伸）。
 */
export function renderBookMarkdown(book: StoredBook, exportedAt: string = new Date().toISOString()): string {
  // 多文件合书：书头列出全部来源；单源书输出与旧格式逐字一致
  const sourceLabel = bookSources(book)
    .map((source) => `${source.fileName}（${source.pageCount} 页）`)
    .join('、')
  const lines: string[] = [
    `# 《${book.proposal.title}》`,
    '',
    `> 来源：${sourceLabel} · 学习目标：${book.goal} · 当前基础：${book.learnerLevel}`,
    `> 导出于 ${exportedAt} · 由 HarmonyAgent 生成，AI 生成内容请以原文为准`,
  ]

  const chapters = [...book.chapters].sort((a, b) => a.order - b.order)
  for (const chapter of chapters) {
    // 落盘章节 order 为 1..N（buildBook/proposalEdits 归一化），直接打印，不再 +1
    lines.push('', `## 第 ${chapter.order} 章 ${chapter.title}`, '', chapter.objective)
    if (chapter.status !== 'ready') {
      lines.push('', `> ⚠️ 本章${CHAPTER_STATUS_LABEL[chapter.status]}，内容可能不完整`)
    }
    for (const block of chapter.blocks) {
      const rendered = renderBlock(block)
      if (rendered.length > 0) lines.push('', ...rendered)
      // 用户笔记挂在所属块后；标注为用户内容
      const notes = book.userNotes.filter((note) => note.blockId === block.id)
      if (notes.length > 0) {
        lines.push('', '#### 我的笔记', '')
        for (const note of notes) {
          lines.push(`> ${note.body}`, `> —— 用户笔记，写于 ${note.createdAt}`)
        }
      }
    }
  }

  lines.push(
    '',
    '## 学习记录摘要',
    '',
    `- 答题 ${book.quizAttempts.length} 次（答对 ${book.quizAttempts.filter((attempt) => attempt.isCorrect).length} 次）`,
    `- 学习证据 ${book.evidence.length} 条`,
    `- 用户笔记 ${book.userNotes.length} 条`,
  )

  return `${lines.join('\n')}\n`
}
