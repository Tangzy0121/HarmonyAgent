import type { ParsedPage } from './pdfParser.js'

export interface VirtualPageOptions {
  /** 每虚拟页目标字符数（规格：1,500） */
  pageSize?: number
  /** 段落边界截断容差（规格：±10%） */
  tolerance?: number
}

/**
 * 无页码文本（md/docx 解析产物）→ 虚拟分页（规格 §4）：
 * 按 pageSize 目标切分，在 [pageSize×(1−tol), pageSize×(1+tol)] 窗口内优先找
 * 段落边界（空行/换行）截断，找不到才按 pageSize 硬切。页码 1 基。
 */
export function splitIntoVirtualPages(text: string, options: VirtualPageOptions = {}): ParsedPage[] {
  const pageSize = options.pageSize ?? 1500
  const tolerance = options.tolerance ?? 0.1
  const trimmed = text.trim()
  if (trimmed.length === 0) return []

  const pages: ParsedPage[] = []
  let rest = trimmed
  while (rest.length > 0) {
    if (rest.length <= pageSize * (1 + tolerance)) {
      pages.push({ page: pages.length + 1, text: rest })
      break
    }
    // 在容差窗口内从后往前找段落边界（优先空行，其次单换行）
    const windowStart = Math.floor(pageSize * (1 - tolerance))
    const window = rest.slice(0, Math.ceil(pageSize * (1 + tolerance)))
    let cut = window.lastIndexOf('\n\n')
    if (cut < windowStart) cut = window.lastIndexOf('\n')
    if (cut < windowStart) cut = pageSize
    const pageText = rest.slice(0, cut).trimEnd()
    pages.push({ page: pages.length + 1, text: pageText })
    rest = rest.slice(cut).trimStart()
  }
  return pages
}
