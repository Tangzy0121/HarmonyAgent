// spine 成本估算：纯算术，零 LLM。
// 每章估算 = 章覆盖页数 × 页均 tokens + 章生成输出预算；合计为各章之和。
// 只读参考值，不参与计费与生成控制。

import { bookSources } from './bookSources.js'
import type { StoredBook } from './bookTypes.js'

/** 经验常数：一页源文档折算的输入 tokens（与 1500 字符虚拟页同量级） */
export const TOKENS_PER_PAGE = 800
/** 与章生成管线的 max tokens 预算一致（chapterPrompt 6000） */
export const CHAPTER_OUTPUT_BUDGET = 6000

export interface ChapterEstimate {
  chapterId: string
  title: string
  estimatedTokens: number
}

export interface BookEstimate {
  chapters: ChapterEstimate[]
  totalTokens: number
}

/** "3-5" → 3 页；"7" → 1 页；空/非法 → null */
function pageCountOf(pageRange: string): number | null {
  const match = pageRange.trim().match(/^(\d+)\s*[-–~]\s*(\d+)$/)
  if (match) {
    const span = Number(match[2]) - Number(match[1]) + 1
    return span > 0 ? span : null
  }
  return /^\d+$/.test(pageRange.trim()) ? 1 : null
}

export function deriveEstimate(book: StoredBook): BookEstimate {
  const totalChapters = book.chapters.length
  // 多文件合书：页数按全部来源合计均摊；单源书回退 book.source（行为不变）
  const totalPages = bookSources(book).reduce((sum, source) => sum + source.pageCount, 0)
  const fallbackPages = totalChapters > 0 ? totalPages / totalChapters : 0
  const chapters = book.chapters.map((chapter) => {
    const pages = chapter.sourceAnchors
      .map((anchor) => pageCountOf(anchor.pageRange))
      .filter((count): count is number => count !== null)
      .reduce((sum, count) => sum + count, 0)
    const effectivePages = pages > 0 ? pages : fallbackPages
    return {
      chapterId: chapter.id,
      title: chapter.title,
      estimatedTokens: Math.round(effectivePages * TOKENS_PER_PAGE) + CHAPTER_OUTPUT_BUDGET,
    }
  })
  return {
    chapters,
    totalTokens: chapters.reduce((sum, entry) => sum + entry.estimatedTokens, 0),
  }
}
