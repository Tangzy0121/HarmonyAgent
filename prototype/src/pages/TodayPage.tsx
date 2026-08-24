import { useMemo, useRef, useState, type UIEvent } from 'react'

import { usePrototype } from '../app/PrototypeContext'
import { PageHeader } from '../components/shell/PageHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { mockRecommendations } from '../data/mockData'
import type { Recommendation } from '../types/product'

const baseDate = new Date(2026, 7, 24, 12)
const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function dateAtOffset(offset: number) {
  const date = new Date(baseDate)
  date.setDate(baseDate.getDate() + offset)
  return date
}

export function TodayPage() {
  const { state, activeRecommendation, dispatch } = usePrototype()
  const trackRef = useRef<HTMLDivElement>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [selectedDayOffset, setSelectedDayOffset] = useState(0)
  const [weekOffset, setWeekOffset] = useState(0)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const recommendations = [activeRecommendation, ...mockRecommendations.filter((item) => item.id !== activeRecommendation.id)]
  const selectedDate = dateAtOffset(selectedDayOffset)
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => dateAtOffset(weekOffset * 7 + index)), [weekOffset])

  const execute = (recommendation: Recommendation) => {
    if (!recommendation.projectId) {
      dispatch({ type: 'screen', screen: 'create' })
      return
    }
    if (recommendation.kind === 'review') {
      dispatch({ type: 'open_project', projectId: recommendation.projectId })
      dispatch({ type: 'screen', screen: 'review' })
      return
    }
    if (recommendation.kind === 'continue') {
      const project = state.projects.find((entry) => entry.id === recommendation.projectId)
      const chapterId = project?.chapters.find((chapter) => !chapter.read && chapter.taskState === 'ready')?.id
      dispatch({ type: 'open_workspace', projectId: recommendation.projectId, chapterId })
      return
    }
    dispatch({ type: 'open_project', projectId: recommendation.projectId })
  }

  const updateSelectedCard = (event: UIEvent<HTMLDivElement>) => {
    const track = event.currentTarget
    const viewportCenter = track.scrollLeft + track.clientWidth / 2
    const cards = Array.from(track.children) as HTMLElement[]
    const closestIndex = cards.reduce((closest, card, index) => {
      const cardCenter = card.offsetLeft + card.offsetWidth / 2
      const closestCard = cards[closest]
      const closestCenter = closestCard.offsetLeft + closestCard.offsetWidth / 2
      return Math.abs(cardCenter - viewportCenter) < Math.abs(closestCenter - viewportCenter) ? index : closest
    }, 0)
    setSelectedIndex(closestIndex)
  }

  const selectCard = (index: number) => {
    const card = trackRef.current?.children[index] as HTMLElement | undefined
    card?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }

  const selectDate = (offset: number) => {
    setSelectedDayOffset(offset)
    setWeekOffset(Math.floor(offset / 7))
    setCalendarOpen(false)
    setSelectedIndex(0)
    trackRef.current?.scrollTo({ left: 0, behavior: 'smooth' })
  }

  const moveDay = (direction: -1 | 1) => selectDate(selectedDayOffset + direction)
  const moveWeek = (direction: -1 | 1) => {
    const nextWeek = weekOffset + direction
    setWeekOffset(nextWeek)
    setSelectedDayOffset(nextWeek * 7)
  }

  const nextDate = dateAtOffset(selectedDayOffset + 1)
  return (
    <div className="page page--today">
      <PageHeader eyebrow={`${selectedDate.getMonth() + 1} 月 ${selectedDate.getDate()} 日 · ${weekdays[selectedDate.getDay()]}`} title="今日学习" />

      <div className="today-calendar-controls">
        <button className="week-control" type="button" onClick={() => selectDate(0)}>本周<Icon name="chevron" size={15} /></button>
        <button className="calendar-trigger" type="button" aria-label="打开本周日历" aria-expanded={calendarOpen} aria-controls="week-calendar" onClick={() => setCalendarOpen((value) => !value)}><Icon name="calendar" size={20} /></button>
      </div>

      {calendarOpen && (
        <section className="week-calendar" id="week-calendar" aria-label="选择学习日期">
          <header><button type="button" aria-label="上一周" onClick={() => moveWeek(-1)}><Icon name="back" size={17} /></button><strong>{weekDays[0].getMonth() + 1} 月 {weekDays[0].getDate()} 日起</strong><button type="button" aria-label="下一周" onClick={() => moveWeek(1)}><Icon name="arrow" size={17} /></button></header>
          <div>{weekDays.map((date, index) => { const offset = weekOffset * 7 + index; return <button key={offset} type="button" aria-pressed={selectedDayOffset === offset} onClick={() => selectDate(offset)}><span>{weekdays[date.getDay()].slice(1)}</span><strong>{date.getDate()}</strong></button> })}</div>
        </section>
      )}

      <section className="card-carousel" aria-label={`${selectedDate.getMonth() + 1}月${selectedDate.getDate()}日学习目标`}>
        <div ref={trackRef} className="card-carousel__track" onScroll={updateSelectedCard}>
          {recommendations.map((recommendation, index) => (
            <article key={recommendation.id} className={`recommendation-hero recommendation-hero--${recommendation.tone}`} aria-label={`${index + 1} / ${recommendations.length}，${recommendation.title}`} aria-current={selectedIndex === index ? 'true' : undefined}>
              <div className="recommendation-hero__meta"><span>{recommendation.eyebrow}</span><span><Icon name="clock" size={15} />约 {recommendation.estimatedMinutes} 分钟</span></div>
              <h2>{recommendation.title}</h2>
              <p>{recommendation.reason}</p>
              <div className="recommendation-hero__actions"><Button variant="accent" iconAfter="arrow" onClick={() => execute(recommendation)}>{recommendation.actionLabel}</Button><Button variant="ghost">稍后</Button></div>
            </article>
          ))}
        </div>

        <footer className="card-carousel__pagination"><span>左右滑动切换目标</span><div>{recommendations.map((recommendation, index) => <button key={recommendation.id} type="button" aria-label={`查看目标 ${index + 1}`} aria-current={selectedIndex === index ? 'true' : undefined} onClick={() => selectCard(index)} />)}</div></footer>
      </section>

      <footer className="today-date-pager">
        <button type="button" aria-label="前一天" onClick={() => moveDay(-1)}><Icon name="back" size={17} /></button>
        <button className="is-current" type="button" onClick={() => setCalendarOpen(true)}><span>{weekdays[selectedDate.getDay()]}</span><strong>{selectedDate.getDate()}</strong></button>
        <button type="button" onClick={() => moveDay(1)}><span>{weekdays[nextDate.getDay()]}</span><strong>{nextDate.getDate()}</strong></button>
        <button type="button" aria-label="后一天" onClick={() => moveDay(1)}><Icon name="arrow" size={17} /></button>
      </footer>
    </div>
  )
}
