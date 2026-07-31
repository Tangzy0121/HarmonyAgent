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

export const agentConversation = {
  title: '监督学习的判断依据',
  history: [
    { id: 'supervised-signal', title: '监督学习的判断依据', meta: '当前 · 4 条消息' },
    { id: 'chapter-order', title: '第三章学习顺序', meta: '昨天 · 6 条消息' },
    { id: 'training-data', title: '训练数据与标签', meta: '7 月 21 日 · 3 条消息' },
  ],
  messages: [
    {
      id: 'agent-context',
      role: 'agent',
      label: '基于当前学习结果',
      body: '判断监督学习最稳定的起点，是确认训练数据里是否存在被当作目标答案使用的标签。',
      citation: {
        title: '《机器学习》第三章',
        location: '第 4–6 页',
        excerpt: '带标签样本中的目标值会形成可比较的误差信号。',
      },
    },
    {
      id: 'user-follow-up',
      role: 'user',
      label: '你',
      body: '所以只要数据里有标签，就一定是监督学习吗？',
    },
    {
      id: 'agent-clarification',
      role: 'agent',
      label: 'Knowledge Agent',
      body: '可以先这样判断，但还需要确认标签是否真正参与训练。标签只是附在资料上、却没有作为预测目标使用时，它不构成监督信号。',
      points: [
        '先看训练时有没有目标答案',
        '再看预测是否会与这个答案比较',
      ],
    },
  ],
  followUps: [
    '用一个反例再解释一次',
    '把判断标准整理成两步',
  ],
} as const

export const todayLearningOutcome = {
  status: '今日学习已完成',
  title: '第一份学习证据已经建立',
  summary: '你完成了“监督学习”的理解与验证，学习记录已经附着到知识节点。',
  source: '机器学习 · 第三章',
  changes: [
    '监督学习获得首条可追溯证据',
    '训练数据关系已经更新',
  ],
  recommendation: {
    label: '下一次建议',
    title: '用 5 分钟复习监督学习的判断依据',
    reason: '短暂间隔后再次判断“训练数据是否提供目标标签”，更容易稳定这条知识证据。',
  },
  options: [
    {
      id: 'tomorrow',
      label: '明天',
      detail: '推荐',
      actionLabel: '安排到明天',
      confirmedTitle: '已安排到明天',
      confirmedDetail: '用 5 分钟复习监督学习的判断依据',
    },
    {
      id: 'today',
      label: '今天继续',
      detail: '稍后',
      actionLabel: '今天继续',
      confirmedTitle: '已加入今天',
      confirmedDetail: '准备好时，可从今日重新进入学习',
    },
    {
      id: 'none',
      label: '暂不安排',
      detail: '结束',
      actionLabel: '今天不安排',
      confirmedTitle: '今天已经结束',
      confirmedDetail: '没有追加新的学习任务',
    },
  ],
} as const

export const fileUnderstandingDocument = {
  id: 'ml-chapter-03',
  title: '机器学习 · 第三章',
  subtitle: '从数据中学习',
  fileName: '机器学习 · 第三章.pdf',
  meta: ['PDF', '24 页', '昨天更新'],
  understandingStatus: '已完成理解',
  summary: '这一章建立了机器学习最基本的判断框架：模型从什么信号中学习，以及不同训练信号如何决定它能解决的问题。',
  insight: '先分清“有没有标签”，再理解模型如何利用误差调整自身，是进入分类、回归与聚类之前最重要的一步。',
  concepts: [
    {
      index: '01',
      title: '监督学习',
      detail: '从带有正确答案的样本中学习输入与输出之间的映射。',
    },
    {
      index: '02',
      title: '无监督学习',
      detail: '在没有标签的情况下寻找数据中的结构、分组与分布。',
    },
    {
      index: '03',
      title: '训练信号',
      detail: '决定模型能获得什么反馈，也决定学习任务可以如何被验证。',
    },
  ],
  prerequisites: ['概率与统计', '向量基础'],
  source: {
    location: '第 3–6 页',
    title: '3.1 学习的基本形式',
    excerpt: '学习算法利用经验改善任务表现，而经验所包含的反馈形式决定了学习问题的基本类型。',
  },
  learningTarget: '监督学习',
} as const

export const learningExplanation = {
  id: 'supervised-learning',
  title: '监督学习',
  stage: '解释',
  stageIndex: '01 / 02',
  sourceLabel: '机器学习 · 第三章',
  objective: '区分监督学习与无监督学习的训练信号',
  introduction: '监督学习的关键不在于模型“看过很多数据”，而在于每个训练样本都带着一个可供比较的正确答案。',
  signalExplanation: '模型先根据输入给出预测，再把预测与标签比较。两者之间的差异形成误差信号，模型据此调整内部参数。这个反复比较和调整的过程，就是监督发生的位置。',
  keyPoint: '判断一个任务是否属于监督学习，先问训练数据是否提供了目标答案，而不是先看它最终用于分类还是预测数值。',
  example: {
    prompt: '用一组已经标注“垃圾邮件”或“正常邮件”的样本训练过滤器。',
    input: '邮件内容',
    label: '人工标签',
    result: '垃圾邮件概率',
    feedback: '预测与标签的差异',
  },
  comparison: [
    { label: '监督学习', value: '训练时有标签，模型能够直接比较预测与答案。' },
    { label: '无监督学习', value: '训练时没有标签，模型只能从数据本身寻找结构。' },
  ],
  alternateExplanation: '也可以把它理解为“带答案练习”：每做一次预测，标签都会告诉模型偏差在哪里；没有标签时，模型只能自己观察哪些样本更相似。',
  source: {
    location: '第 4–5 页',
    title: '3.1.1 监督学习',
    excerpt: '监督学习从带标签的训练样本中学习映射关系，并使用预测结果与目标值之间的差异更新模型。',
  },
} as const

export const learningVerification = {
  id: 'supervised-learning-verification',
  title: '监督学习',
  stage: '验证',
  stageIndex: '02 / 02',
  promptLabel: '一次判断',
  question: '这个过程属于监督学习吗？',
  scenario: '团队拿到 10 万封没有“垃圾邮件 / 正常邮件”标签的邮件，让模型自行把相似邮件分组。团队将这个过程称为监督学习。',
  options: [
    {
      id: 'large-dataset',
      marker: 'A',
      text: '属于。数据量足够大，模型能够自己学出正确答案。',
      feedback: 'review',
      feedbackLabel: '需要重看',
      feedbackTitle: '数据量不是监督信号',
      feedbackBody: '更多数据可以帮助模型发现结构，但不会自动产生可供比较的正确答案。这里没有标签，模型也没有预测与目标之间的误差信号。',
      evidence: '是否属于监督学习，取决于训练时有没有目标标签，而不是样本数量。',
    },
    {
      id: 'no-labels',
      marker: 'B',
      text: '不属于。没有目标标签，模型无法把预测与正确答案比较。',
      feedback: 'correct',
      feedbackLabel: '判断成立',
      feedbackTitle: '你抓住了训练信号',
      feedbackBody: '这个过程只利用邮件之间的相似性寻找结构，没有标签提供目标答案，因此属于无监督学习中的聚类。',
      evidence: '没有标签，就没有预测值与目标值之间的直接比较；模型只能从数据本身寻找分组。',
    },
    {
      id: 'depends-on-result',
      marker: 'C',
      text: '暂时不能判断，还要看最后的分组结果是否准确。',
      feedback: 'partial',
      feedbackLabel: '部分正确',
      feedbackTitle: '关注点接近，但条件已经足够',
      feedbackBody: '你意识到结果质量需要验证，但学习类型由训练阶段的信号决定。题目已经明确没有标签，所以不需要等待分组结果。',
      evidence: '先判断训练数据是否提供目标答案，再讨论模型结果是否有效。',
    },
  ],
  source: {
    location: '第 4–6 页',
    title: '3.1 学习的基本形式',
    excerpt: '有监督学习利用带标签样本中的目标值形成误差信号；无监督学习则在没有目标标签时，从数据自身的分布与相似性中发现结构。',
  },
} as const

export const learningCompletion = {
  id: 'supervised-learning-evidence',
  title: '监督学习',
  status: '学习已完成',
  completedAt: '刚刚完成',
  summary: '你已经能够根据训练数据是否提供目标标签，判断监督学习与无监督学习。',
  evidence: [
    {
      label: '本次目标',
      value: '区分监督学习与无监督学习的训练信号',
    },
    {
      label: '理解结果',
      value: '标签提供可比较的目标答案，预测与标签之间的差异形成监督信号。',
    },
    {
      label: '验证证据',
      value: '正确判断无标签邮件分组属于无监督学习，并说明了判断依据。',
    },
    {
      label: '引用来源',
      value: '《机器学习》第三章，第 4–6 页',
    },
  ],
  record: {
    node: '监督学习',
    type: '学习证据',
    relation: '训练数据 → 监督学习',
    statement: '训练样本中的目标标签，使模型能够根据预测误差调整参数。',
    source: '机器学习 · 第三章.pdf',
  },
} as const
