import type { Destination } from '../types/prototype'

export const destinations: Array<{ id: Destination; label: string }> = [
  { id: 'today', label: '今日' },
  { id: 'learning', label: '学习' },
  { id: 'library', label: '知识库' },
]

export const pageContext: Record<Destination, string> = {
  today: '今日建议',
  learning: '学习地图',
  library: '机器学习基础',
}

export const agentPrompts = [
  '我现在应该先理解哪个概念？',
  '监督学习和无监督学习有什么联系？',
  '帮我整理这一章的学习顺序。',
]

export const todaySnapshot = {
  dateLabel: '7 月 22 日，周三',
  primaryAction: {
    title: '理解监督学习与无监督学习',
    duration: '约 8 分钟',
    reason: '它们是本章后续两个主题共同依赖的基础概念。',
    topic: '机器学习 · 第三章',
    actionLabel: '开始学习',
  },
  recentChanges: [
    {
      type: '资料',
      time: '刚刚',
      title: '第三章解析已准备好',
      detail: '可从概念关系开始浏览',
    },
    {
      type: '关系',
      time: '昨天',
      title: '监督学习连接到训练数据',
      detail: '新增一条可追溯关联',
    },
  ],
} as const

export const knowledgeLibraryItems = [
  {
    id: 'ml-chapter-03',
    name: '机器学习 · 第三章.pdf',
    type: 'PDF',
    kind: '资料',
    detail: '24 页 · 昨天更新',
    status: '已理解',
  },
  {
    id: 'supervised-note',
    name: '监督学习笔记',
    type: '笔记',
    kind: '笔记',
    detail: '6 个关联节点 · 今天',
    status: '已同步',
  },
  {
    id: 'exercise-collection',
    name: '分类与聚类练习',
    type: 'DOCX',
    kind: '资料',
    detail: '12 题 · 等待整理',
    status: '待处理',
  },
  {
    id: 'evaluation-note',
    name: '模型评估摘要',
    type: '笔记',
    kind: '笔记',
    detail: '3 个关联节点 · 7 月 20 日',
    status: '待复习',
  },
] as const
