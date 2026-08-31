/**
 * M5d:今日推荐本地派生(server 无 suggestions 端点)。
 * 真源:admin/src/domain/todayNextStep.ts(pickTodayRealBook + deriveTodayFocus)——
 * 同一套优先级,但 admin 只产出「一本书的一个焦点」,这里产出 Swiper 用的多条推荐
 * (上限 3 条,按优先级填充,项目级去重,tone 循环 blue/mist/stone)。
 * 优先级(与 admin 一致):到期复习 > 遗忘悬崖 > 进行中 > 最新证据 > 学习节律。
 * 输入为 mapper 投影后的项目 + learner profile + 各书 review/due,纯函数不发请求;
 * 派生不出任何有效行动时返回空数组,由调用侧回退 fixture 推荐。
 */
import {
  LociChapter,
  LociEvidence,
  LociProjectSummary,
  LociRecommendation,
  RecommendationTone
} from '../../models/LociModels'
import {
  WireConceptMastery,
  WireConceptSource,
  WireLearnerProfile,
  WireReviewDueItem
} from './LociApiClient'

/** 推荐条数上限(与 fixture 3 条对齐,Swiper 滑动体验)。 */
const RECOMMENDATION_CAP: number = 3

const TONES: RecommendationTone[] = ['blue', 'mist', 'stone']

function latestEvidence(project: LociProjectSummary): LociEvidence | undefined {
  const evidence: LociEvidence[] = project.evidence ?? []
  return evidence.length > 0 ? evidence[evidence.length - 1] : undefined
}

/** admin periodOf 直译:6-12 早、12-18 午、18-23 晚、其余夜。 */
function periodOf(now: Date): string {
  const hour: number = now.getHours()
  if (hour >= 6 && hour < 12) {
    return 'morning'
  }
  if (hour >= 12 && hour < 18) {
    return 'afternoon'
  }
  if (hour >= 18 && hour < 23) {
    return 'evening'
  }
  return 'night'
}

/**
 * 派生今日推荐。dueByProject 的键为项目(server book)id,值为该书到期项(dueAt 升序)。
 * now 可注入便于复现节律判定;默认取当前时间。
 */
export function deriveTodayRecommendations(
  projects: LociProjectSummary[],
  profile: WireLearnerProfile | null,
  dueByProject: Map<string, WireReviewDueItem[]>,
  now: Date = new Date()
): LociRecommendation[] {
  const result: LociRecommendation[] = []
  const usedProjectIds: Set<string> = new Set()
  const projectById: Map<string, LociProjectSummary> = new Map()
  projects.forEach((project: LociProjectSummary): void => {
    projectById.set(project.id, project)
  })

  // 1. 到期复习:每书一条,按最早 dueAt 升序(admin:复习到期:块标题 + 共 N 项到期)
  const dueProjects: LociProjectSummary[] = projects.filter((project: LociProjectSummary): boolean =>
    (dueByProject.get(project.id) ?? []).length > 0)
  dueProjects.sort((a: LociProjectSummary, b: LociProjectSummary): number => {
    const aDue: WireReviewDueItem[] = dueByProject.get(a.id) ?? []
    const bDue: WireReviewDueItem[] = dueByProject.get(b.id) ?? []
    return (aDue[0]?.dueAt ?? '').localeCompare(bDue[0]?.dueAt ?? '')
  })
  dueProjects.forEach((project: LociProjectSummary): void => {
    const items: WireReviewDueItem[] = dueByProject.get(project.id) ?? []
    if (items.length === 0) {
      return
    }
    result.push({
      id: `derived-due-${project.id}`,
      projectId: project.id,
      kind: 'review',
      tone: 'blue',
      eyebrow: '今日复习',
      title: `复习到期:${items[0].title}`,
      reason: '间隔重复已到期的内容,先复习再学新内容。',
      projectLabel: project.title,
      estimatedMinutes: Math.max(items.length * 2, 3),
      actionLabel: '去复习'
    })
    usedProjectIds.add(project.id)
  })

  // 2. 遗忘悬崖:掌握度最高且来源书仍在库中的悬崖概念(admin pickCliffConcept)
  if (profile !== null) {
    const cliffs: WireConceptMastery[] = profile.concepts.filter(
      (concept: WireConceptMastery): boolean => concept.forgettingCliff &&
        concept.sources.some((source: WireConceptSource): boolean =>
          projectById.has(source.bookId) && !usedProjectIds.has(source.bookId)))
    cliffs.sort((a: WireConceptMastery, b: WireConceptMastery): number => b.mastery - a.mastery)
    const cliff: WireConceptMastery | undefined = cliffs[0]
    if (cliff !== undefined) {
      const bookId: string =
        cliff.sources.find((source: WireConceptSource): boolean => projectById.has(source.bookId))?.bookId ?? ''
      const project: LociProjectSummary | undefined = projectById.get(bookId)
      if (project !== undefined) {
        result.push({
          id: `derived-cliff-${project.id}`,
          projectId: project.id,
          kind: 'review',
          tone: 'blue',
          eyebrow: '遗忘悬崖',
          title: `巩固:${cliff.displayLabel}`,
          reason: `这个概念你之前答对过,但已经很久没碰了,趁还记得先复习。掌握度 ${Math.round(cliff.mastery * 100)}%。`,
          projectLabel: project.title,
          estimatedMinutes: 5,
          actionLabel: '去复习'
        })
        usedProjectIds.add(project.id)
      }
    }
  }

  // 3. 进行中:plan_ready 催确认;active/preparing 继续读 lastChapterId
  const inProgress: LociProjectSummary | undefined = projects.find(
    (project: LociProjectSummary): boolean => !usedProjectIds.has(project.id) &&
      (project.status === 'plan_ready' || project.status === 'active' || project.status === 'preparing'))
  if (inProgress !== undefined) {
    if (inProgress.status === 'plan_ready') {
      result.push({
        id: `derived-plan-${inProgress.id}`,
        projectId: inProgress.id,
        kind: 'plan',
        tone: 'blue',
        eyebrow: '目录待确认',
        title: `确认《${inProgress.title}》的目录`,
        reason: '确认或修改目录后,第一章会优先生成。',
        projectLabel: inProgress.title,
        estimatedMinutes: 3,
        actionLabel: '去确认'
      })
    } else {
      const lastChapter: LociChapter | undefined = inProgress.chapters.find(
        (chapter: LociChapter): boolean => chapter.id === inProgress.lastChapterId)
      result.push({
        id: `derived-continue-${inProgress.id}`,
        projectId: inProgress.id,
        kind: 'continue',
        tone: 'blue',
        eyebrow: '继续学习',
        title: lastChapter !== undefined ? `继续:${lastChapter.title}` : `继续《${inProgress.title}》`,
        reason: inProgress.status === 'preparing' ?
          '章节还在生成,已生成的部分可以先读。' : '从上次停下的地方继续。',
        projectLabel: inProgress.title,
        estimatedMinutes: lastChapter?.estimatedMinutes ?? 10,
        actionLabel: '继续学习'
      })
    }
    usedProjectIds.add(inProgress.id)
  }

  // 4. 最新证据:weakness → 针对性复习;否则推进下一章(admin deriveTodayFocus 证据分支)
  const withEvidence: LociProjectSummary[] = projects.filter(
    (project: LociProjectSummary): boolean =>
      !usedProjectIds.has(project.id) && (project.evidence ?? []).length > 0)
  withEvidence.sort((a: LociProjectSummary, b: LociProjectSummary): number =>
    (latestEvidence(b)?.occurredAt ?? '').localeCompare(latestEvidence(a)?.occurredAt ?? ''))
  const evidenceProject: LociProjectSummary | undefined = withEvidence[0]
  if (evidenceProject !== undefined) {
    const latest: LociEvidence = latestEvidence(evidenceProject) as LociEvidence
    const chapter: LociChapter | undefined = evidenceProject.chapters.find(
      (entry: LociChapter): boolean => entry.id === latest.chapterId)
    if (latest.result === 'weakness') {
      result.push({
        id: `derived-evidence-${evidenceProject.id}`,
        projectId: evidenceProject.id,
        kind: 'review',
        tone: 'blue',
        eyebrow: '需要巩固',
        title: `再看一次:${chapter?.title ?? evidenceProject.title}`,
        reason: latest.summary,
        projectLabel: evidenceProject.title,
        estimatedMinutes: 5,
        actionLabel: '去复习'
      })
    } else {
      const nextChapter: LociChapter | undefined =
        chapter !== undefined ? evidenceProject.chapters[chapter.order + 1] : undefined
      result.push({
        id: `derived-evidence-${evidenceProject.id}`,
        projectId: evidenceProject.id,
        kind: 'continue',
        tone: 'blue',
        eyebrow: '下一步学习',
        title: nextChapter?.title ?? `巩固:${chapter?.title ?? evidenceProject.title}`,
        reason: nextChapter?.objective ?? '用新的例子复述本章判断框架,确认知识可以迁移。',
        projectLabel: evidenceProject.title,
        estimatedMinutes: nextChapter?.estimatedMinutes ?? 5,
        actionLabel: '继续学习'
      })
    }
    usedProjectIds.add(evidenceProject.id)
  }

  // 5. 学习节律:今日未学习且当前正处最活跃时段 → 回到最近的书(admin 节律分支)
  if (profile !== null && !profile.rhythm.studiedToday) {
    const dist: Record<string, number> = {
      'morning': profile.rhythm.periodDistribution.morning,
      'afternoon': profile.rhythm.periodDistribution.afternoon,
      'evening': profile.rhythm.periodDistribution.evening,
      'night': profile.rhythm.periodDistribution.night
    }
    const periods: string[] = ['morning', 'afternoon', 'evening', 'night']
    const topPeriod: string = periods.reduce((a: string, b: string): string =>
      (dist[b] ?? 0) > (dist[a] ?? 0) ? b : a)
    if ((dist[topPeriod] ?? 0) > 0 && periodOf(now) === topPeriod) {
      const target: LociProjectSummary | undefined = projects.find(
        (project: LociProjectSummary): boolean => !usedProjectIds.has(project.id))
      if (target !== undefined) {
        result.push({
          id: `derived-rhythm-${target.id}`,
          projectId: target.id,
          kind: 'continue',
          tone: 'blue',
          eyebrow: '学习节律',
          title: `回到《${target.title}》`,
          reason: `你通常在这个时段学习(已连续 ${profile.rhythm.streakDays} 天),今天还没开始。`,
          projectLabel: target.title,
          estimatedMinutes: 10,
          actionLabel: '继续学习'
        })
        usedProjectIds.add(target.id)
      }
    }
  }

  return result.slice(0, RECOMMENDATION_CAP).map((item: LociRecommendation,
    index: number): LociRecommendation => {
    item.tone = TONES[index % TONES.length]
    return item
  })
}
