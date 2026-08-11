import { TodayActionItem, TodayFocusItem } from '../models/AppModels'

export const TODAY_TITLE: string = '今日'
export const TODAY_DATE_LABEL: string = '7 月 26 日，周日'

export const TODAY_FOCUS: TodayFocusItem = new TodayFocusItem(
  '今日学习',
  '可开始',
  '分清监督学习与无监督学习',
  '用训练数据是否包含目标答案，判断两种学习方式。',
  ['概念理解', '约 8 分钟'],
  '机器学习 · 第三章',
  '3.1 学习的基本形式',
  '继续'
)

export const TODAY_ACTIONS: Array<TodayActionItem> = [
  new TodayActionItem('review-signal', '复习', '监督学习的判断依据', '约 5 分钟', '↻'),
  new TodayActionItem('confirm-relations', '确认', '检查两条知识关系', '机器学习 · 第三章', '↗')
]
