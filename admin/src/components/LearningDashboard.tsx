import { useMemo, useState } from 'react'
import { Icon } from './Icon'

interface LearningDashboardProps {
  onStartLearning: () => void
}

interface DashboardTask {
  id: string
  eyebrow: string
  title: string
  meta: string
  action?: string
  completed?: boolean
}

const weekDays = [
  { id: 'mon', weekday: '一', date: '10' },
  { id: 'tue', weekday: '二', date: '11' },
  { id: 'wed', weekday: '三', date: '12' },
  { id: 'thu', weekday: '四', date: '13' },
  { id: 'fri', weekday: '五', date: '14' },
  { id: 'sat', weekday: '六', date: '15' },
  { id: 'sun', weekday: '日', date: '16' },
] as const

const taskPlans: Record<string, DashboardTask[]> = {
  mon: [
    { id: 'mon-1', eyebrow: '已完成', title: '机器学习的基本形式', meta: '昨日完成 · 已加入知识地图', completed: true },
    { id: 'mon-2', eyebrow: '已完成', title: '训练数据与标签', meta: '复习完成 · 5 分钟', completed: true },
  ],
  tue: [
    { id: 'tue-1', eyebrow: '继续学习', title: '监督学习与无监督学习', meta: '已完成 37% · 约 8 分钟', action: '继续学习' },
    { id: 'tue-2', eyebrow: '今日复习', title: '训练数据与标签', meta: '计划复习 · 5 分钟', action: '开始复习' },
    { id: 'tue-3', eyebrow: '下一项', title: '聚类基础', meta: '新任务 · 15 分钟', action: '开始学习' },
  ],
  wed: [
    { id: 'wed-1', eyebrow: '重点学习', title: '模型评估的方法', meta: '新任务 · 12 分钟', action: '开始学习' },
    { id: 'wed-2', eyebrow: '计划复习', title: '监督学习判断依据', meta: '复习计划 · 5 分钟', action: '开始复习' },
  ],
  thu: [{ id: 'thu-1', eyebrow: '计划学习', title: '分类模型基础', meta: '新任务 · 15 分钟', action: '开始学习' }],
  fri: [{ id: 'fri-1', eyebrow: '计划复习', title: '聚类与分类的区别', meta: '复习计划 · 8 分钟', action: '开始复习' }],
  sat: [{ id: 'sat-1', eyebrow: '本周整理', title: '整理机器学习知识脉络', meta: '知识整理 · 20 分钟', action: '开始整理' }],
  sun: [{ id: 'sun-1', eyebrow: '每周回顾', title: '回顾本周学习成果', meta: '学习回顾 · 10 分钟', action: '开始回顾' }],
}

export function LearningDashboard({ onStartLearning }: LearningDashboardProps) {
  const [selectedDay, setSelectedDay] = useState('tue')
  const [selectedTask, setSelectedTask] = useState('tue-1')
  const [isReviewOpen, setIsReviewOpen] = useState(false)

  const tasks = useMemo(() => taskPlans[selectedDay] ?? [], [selectedDay])

  const selectDay = (dayId: string) => {
    setSelectedDay(dayId)
    setSelectedTask(taskPlans[dayId]?.find((task) => !task.completed)?.id ?? taskPlans[dayId]?.[0]?.id ?? '')
  }

  return (
    <main className="learning-dashboard" aria-labelledby="dashboard-title">
      <svg
        className="learning-dashboard__background"
        aria-hidden="true"
        focusable="false"
        preserveAspectRatio="none"
        viewBox="0 0 390 270"
      >
        <path d="M0 0H390V205C364 204 351 216 344 235C337 255 315 262 296 251C277 240 272 222 250 222C225 222 217 247 190 246C157 245 153 216 124 220C101 224 93 255 65 253C31 251 32 223 0 227Z" />
      </svg>

      <header className="learning-dashboard__header">
        <h1 id="dashboard-title">学习看板</h1>
        <p>8 月 11 日，星期二</p>
      </header>

      <div className="learning-dashboard__week" role="group" aria-label="选择日期">
        {weekDays.map((day) => {
          const isSelected = selectedDay === day.id
          return (
            <button
              key={day.id}
              className={isSelected ? 'dashboard-day dashboard-day--selected' : 'dashboard-day'}
              type="button"
              aria-pressed={isSelected}
              onClick={() => selectDay(day.id)}
            >
              <span>周{day.weekday}</span>
              <strong>{day.date}</strong>
            </button>
          )
        })}
      </div>

      <section className="learning-dashboard__tasks" aria-labelledby="daily-tasks-title">
        <div className="learning-dashboard__section-heading">
          <div>
            <p>按学习顺序</p>
            <h2 id="daily-tasks-title">{selectedDay === 'tue' ? '今日任务' : '学习计划'}</h2>
          </div>
          <span>{tasks.length} 项</span>
        </div>

        <ol className="dashboard-task-list">
          {tasks.map((task, index) => {
            const isSelected = selectedTask === task.id
            return (
              <li
                key={task.id}
                className={[
                  'dashboard-task',
                  isSelected ? 'dashboard-task--selected' : '',
                  task.completed ? 'dashboard-task--completed' : '',
                ].filter(Boolean).join(' ')}
              >
                <span className="dashboard-task__index" aria-hidden="true">
                  {task.completed ? <Icon name="check" size={13} strokeWidth={2.4} /> : index + 1}
                </span>
                <button className="dashboard-task__content" type="button" onClick={() => setSelectedTask(task.id)}>
                  <span>{task.eyebrow}</span>
                  <strong>{task.title}</strong>
                  {task.id === 'tue-1' && (
                    <span className="dashboard-task__progress" aria-label="学习进度 37%"><i /></span>
                  )}
                  <small>{task.meta}</small>
                </button>
                {isSelected && task.action && (
                  <button className="dashboard-task__action" type="button" onClick={onStartLearning}>
                    {task.action}<Icon name="arrow" size={15} />
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      </section>

      <section className={isReviewOpen ? 'dashboard-review dashboard-review--open' : 'dashboard-review'} aria-labelledby="review-plan-title">
        <button type="button" onClick={() => setIsReviewOpen((value) => !value)} aria-expanded={isReviewOpen}>
          <span>
            <small>本周复习</small>
            <strong id="review-plan-title">4 / 6 已完成</strong>
            <span className="dashboard-review__progress" aria-hidden="true"><i /></span>
          </span>
          <span className="dashboard-review__link">{isReviewOpen ? '收起' : '查看复习计划'}<Icon name="chevron" size={15} /></span>
        </button>
        {isReviewOpen && <p>还需复习 2 项，预计 10 分钟；下一项为“监督学习判断依据”。</p>}
      </section>
    </main>
  )
}
