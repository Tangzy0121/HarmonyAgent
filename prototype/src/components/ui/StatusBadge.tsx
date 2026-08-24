import type { ChapterTaskState, ConceptState, ProjectStatus } from '../../types/product'

type Status = ProjectStatus | ChapterTaskState | ConceptState

const labels: Record<Status, string> = {
  draft: '草稿', preparing: '准备中', plan_ready: '待确认', active: '进行中', blocked: '需要处理', completed: '已完成', archived: '已归档',
  pending: '等待生成', running: '正在生成', ready: '可以阅读', failed: '生成失败',
  unverified: '未验证', learning: '学习中', mastered: '已掌握', review: '待复习',
}

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`status-badge status-badge--${status}`}><i aria-hidden="true" />{labels[status]}</span>
}
