export const todayPageContent = {
  title: '今日',
  dateLabel: '7 月 26 日，周日',
  focus: {
    label: '今日学习',
    status: '可开始',
    title: '分清监督学习与无监督学习',
    summary: '用训练数据是否包含目标答案，判断两种学习方式。',
    tags: ['概念理解', '约 8 分钟'],
    source: '机器学习 · 第三章',
    position: '3.1 学习的基本形式',
    actionLabel: '继续',
  },
  secondaryActions: [
    {
      id: 'review-signal',
      label: '复习',
      title: '监督学习的判断依据',
      meta: '约 5 分钟',
      icon: 'clock',
    },
    {
      id: 'confirm-relations',
      label: '确认',
      title: '检查两条知识关系',
      meta: '机器学习 · 第三章',
      icon: 'link',
    },
  ],
} as const
