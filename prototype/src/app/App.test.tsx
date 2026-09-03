import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { App } from './App'
import { PrototypeProvider } from './PrototypeContext'
import { ProjectRow } from '../components/project/ProjectRow'
import { mockProjects } from '../data/mockData'
import { CreateProjectPage } from '../pages/CreateProjectPage'
import { LibraryPage } from '../pages/LibraryPage'
import { PlanPage } from '../pages/PlanPage'
import { SettingsPage } from '../pages/SettingsPage'
import { AccountPage } from '../pages/AccountPage'
import { primaryMenuItems } from '../components/shell/MobileIdentity'

describe('mobile prototype shell', () => {
  it('shows the loci identity and menu trigger without persistent navigation or profile controls', () => {
    const html = renderToStaticMarkup(<PrototypeProvider><App /></PrototypeProvider>)

    expect(html).toContain('<header class="mobile-identity" aria-label="loci">')
    expect(html).toContain('<strong>loci</strong>')
    expect(html).toContain('aria-label="打开导航"')
    expect(html).not.toContain('<nav')
    expect(html).not.toContain('Profile')
    expect(html).not.toContain('打开个人中心')
  })

  it('does not render a persistent Agent launcher', () => {
    const html = renderToStaticMarkup(<PrototypeProvider><App /></PrototypeProvider>)

    expect(html).not.toContain('aria-label="打开 loci Chat"')
    expect(html).not.toContain('class="agent-launcher"')
  })

  it('uses settings and account as utility destinations in the primary menu', () => {
    expect(primaryMenuItems.map((item) => item.label)).toEqual(['今日', '学习库', '设置', '账户'])
    expect(primaryMenuItems.some((item) => item.label === '新建项目')).toBe(false)

    const settings = renderToStaticMarkup(<SettingsPage />)
    const account = renderToStaticMarkup(<AccountPage />)
    expect(settings).toContain('每日复习提醒')
    expect(account).toContain('本地演示账户')
  })

  it('renders Today as one horizontal learning-target carousel', () => {
    const html = renderToStaticMarkup(<PrototypeProvider><App /></PrototypeProvider>)

    expect(html).toContain('class="card-carousel__track"')
    expect((html.match(/class="recommendation-hero recommendation-hero--/gu) ?? [])).toHaveLength(3)
    expect(html).toContain('recommendation-hero--blue')
    expect(html).toContain('recommendation-hero--mist')
    expect(html).toContain('recommendation-hero--stone')
    expect(html).not.toContain('recommendation-evidence')
    expect((html.match(/aria-current="true"/gu) ?? []).length).toBeGreaterThanOrEqual(2)
    expect(html).toContain('左右滑动切换目标')
    expect(html).toContain('aria-label="打开本周日历"')
    expect(html).toContain('class="today-date-pager"')
    expect(html).not.toContain('alternative-section')
  })

  it('keeps library project rows concise', () => {
    const project = mockProjects[0]
    const html = renderToStaticMarkup(<ProjectRow project={project} onOpen={() => undefined} />)

    expect(html).toContain(`<strong>${project.shortTitle ?? project.title}</strong>`)
    expect(html).not.toContain(`<strong>${project.title}</strong>`)
    expect(html).toContain(`${project.chapters.filter((chapter) => chapter.read).length}/${project.chapters.length} 章 · ${project.source.format}`)
    expect(html).not.toContain(project.goal)
    expect(html).not.toContain(project.source.name)
  })

  it('gives the icon-only library add control an accessible name', () => {
    const html = renderToStaticMarkup(<PrototypeProvider><LibraryPage /></PrototypeProvider>)

    expect(html).toContain('aria-label="新建项目"')
  })

  it('uses concise copy across the three-step create flow', () => {
    const sourceStep = renderToStaticMarkup(<PrototypeProvider><CreateProjectPage /></PrototypeProvider>)
    const confirmStep = renderToStaticMarkup(<PrototypeProvider><PlanPage /></PrototypeProvider>)

    expect(sourceStep).toContain('1 / 3')
    expect(sourceStep).toContain('选择学习资料')
    expect(sourceStep).toContain('使用演示资料')
    expect(sourceStep).not.toContain('选择一份想真正学懂的资料')
    expect(confirmStep).toContain('3 / 3')
    expect(confirmStep).toContain('方案依据')
    expect(confirmStep).not.toContain('主要概念')
    expect(confirmStep).not.toContain('优先生成第一章，其余章节后台排队')
  })
})
