import type { StoredBook } from '../services/bookApi'

export const libraryPageContent = {
  title: '知识库',
  subtitle: '机器学习基础',
  filters: ['全部', '资料', '笔记'] as const,
  items: [
    {
      id: 'ml-chapter-03',
      name: '机器学习 · 第三章.pdf',
      type: 'PDF',
      kind: '资料',
      detail: '24 页 · 今天更新',
      status: '已理解',
      icon: 'document',
    },
    {
      id: 'supervised-note',
      name: '监督学习判断依据',
      type: '笔记',
      kind: '笔记',
      detail: '6 个关联节点 · 今天',
      status: '已同步',
      icon: 'note',
    },
    {
      id: 'exercise-collection',
      name: '分类与聚类练习',
      type: 'DOCX',
      kind: '资料',
      detail: '12 题 · 昨天',
      status: '待处理',
      icon: 'document',
    },
    {
      id: 'evaluation-note',
      name: '模型评估摘要',
      type: '笔记',
      kind: '笔记',
      detail: '3 个关联节点 · 7 月 24 日',
      status: '待复习',
      icon: 'note',
    },
  ],
} as const

/** 真实学习书在知识库列表中的视图模型。 */
export interface RealBookListItem {
  id: string
  name: string
  detail: string
  status: string
}

/** 状态列映射：proposal→目录待确认、generating→生成中 n/N、partial→部分可读、ready→可阅读、error→生成失败。 */
export function realBookStatusLabel(book: StoredBook): string {
  switch (book.status) {
    case 'proposal':
      return '目录待确认'
    case 'generating': {
      const ready = book.chapters.filter((chapter) => chapter.status === 'ready').length
      return `生成中 ${ready}/${book.chapters.length}`
    }
    case 'partial':
      return '部分可读'
    case 'ready':
      return '可阅读'
    case 'error':
      return '生成失败'
  }
}

export function toRealBookListItem(book: StoredBook): RealBookListItem {
  return {
    id: book.id,
    name: book.proposal.title || book.source.fileName,
    detail: `${book.source.pageCount} 页 · ${book.source.updatedLabel}`,
    status: realBookStatusLabel(book),
  }
}
