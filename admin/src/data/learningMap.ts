import type { MapViewport } from '../types/prototype'

export type KnowledgeCategory = 'method' | 'theory' | 'practice' | 'application'

export interface KnowledgeNode {
  id: string
  label: string
  category: KnowledgeCategory
  x: number
  y: number
  size: 'large' | 'medium' | 'small'
  learningState: '学习中' | '待复习' | '已掌握' | '暂无学习记录'
  summary: string
}

export interface KnowledgeRelationship {
  from: string
  to: string
  recentChange?: boolean
}

export const learningMapSize = {
  width: 1120,
  height: 940,
} as const

export const initialMapViewport: MapViewport = {
  x: -150,
  y: 132,
  scale: 0.72,
  focusedNodeId: null,
}

export const knowledgeNodes: KnowledgeNode[] = [
  {
    id: 'machine-learning',
    label: '机器学习',
    category: 'theory',
    x: 500,
    y: 380,
    size: 'large',
    learningState: '学习中',
    summary: '通过从数据中发现规律，让模型对新样本做出判断的方法体系。',
  },
  {
    id: 'training-data',
    label: '训练数据',
    category: 'method',
    x: 250,
    y: 180,
    size: 'medium',
    learningState: '待复习',
    summary: '模型学习所依赖的样本集合，决定了可识别的模式边界。',
  },
  {
    id: 'features',
    label: '特征',
    category: 'method',
    x: 250,
    y: 570,
    size: 'small',
    learningState: '暂无学习记录',
    summary: '用于描述样本的可计算属性，是建立模型的输入。',
  },
  {
    id: 'supervised-learning',
    label: '监督学习',
    category: 'method',
    x: 750,
    y: 180,
    size: 'medium',
    learningState: '已掌握',
    summary: '利用带有目标答案的数据学习输入与输出关系。',
  },
  {
    id: 'unsupervised-learning',
    label: '无监督学习',
    category: 'theory',
    x: 750,
    y: 550,
    size: 'medium',
    learningState: '学习中',
    summary: '从没有标签的数据中寻找结构、分组和潜在规律。',
  },
  {
    id: 'classification',
    label: '分类',
    category: 'application',
    x: 990,
    y: 180,
    size: 'small',
    learningState: '暂无学习记录',
    summary: '将样本归入已定义类别的常见监督学习任务。',
  },
  {
    id: 'clustering',
    label: '聚类',
    category: 'application',
    x: 990,
    y: 640,
    size: 'small',
    learningState: '暂无学习记录',
    summary: '根据相似性将无标签样本划分为不同群组。',
  },
  {
    id: 'model-evaluation',
    label: '模型评估',
    category: 'practice',
    x: 500,
    y: 820,
    size: 'medium',
    learningState: '待复习',
    summary: '用合适的指标检查模型在未知数据上的表现。',
  },
]

export const knowledgeRelationships: KnowledgeRelationship[] = [
  { from: 'machine-learning', to: 'training-data' },
  { from: 'machine-learning', to: 'features' },
  { from: 'machine-learning', to: 'supervised-learning' },
  { from: 'machine-learning', to: 'unsupervised-learning' },
  { from: 'machine-learning', to: 'model-evaluation' },
  { from: 'supervised-learning', to: 'classification' },
  { from: 'unsupervised-learning', to: 'clustering' },
  { from: 'training-data', to: 'supervised-learning', recentChange: true },
  { from: 'features', to: 'model-evaluation' },
]

export const categoryLegend: Array<{ category: KnowledgeCategory; label: string }> = [
  { category: 'method', label: '方法' },
  { category: 'theory', label: '理论' },
  { category: 'practice', label: '实践' },
  { category: 'application', label: '应用' },
]
