/**
 * 创建流 ViewModel(@ObservedV2):新建项目三步(来源/设置/确认)+ 方案确认编辑。
 * 真源:prototype/src/app/PrototypeContext.tsx 的 patch_draft / create_plan /
 * update_plan / confirm_plan 分支;docs/product/03 §5。
 * 实例由 AppRoot 持有并传给 CreateProjectPage / PlanPage,返回不丢草稿。
 */
import {
  LociChapter,
  LociProjectNotice,
  LociProjectSummary,
  LociSource
} from './LociFixtures'

/** 已选来源文件(CreateDraft.file 的 ArkTS 投影)。 */
@ObservedV2
export class LociDraftFile {
  @Trace name: string = ''
  @Trace format: string = 'PDF'
  @Trace size: string = ''
}

/** 方案章节(PlanPage 可改标题/删章/调序;order 在确认时按数组序重排)。 */
@ObservedV2
export class LociPlanChapter {
  @Trace id: string = ''
  @Trace title: string = ''
  @Trace estimatedMinutes: number = 0
}

const DEMO_FILE_NAME: string = 'AI 产品设计方法.md'
const DEMO_FILE_FORMAT: string = 'Markdown'
const DEMO_FILE_SIZE: string = '286 KB'

function stripExtension(name: string): string {
  return name.replace(/\.(pdf|md|markdown|docx)$/i, '')
}

@ObservedV2
export class CreateFlowViewModel {
  /** 当前步骤:1 来源 / 2 设置(3 为 PlanPage,不占本 VM 步骤位) */
  @Trace step: number = 1
  @Trace file: LociDraftFile | null = null
  @Trace goal: string = ''
  @Trace level: string = '入门'
  @Trace depth: string = '系统学习'
  @Trace planTitle: string = ''
  @Trace planChapters: LociPlanChapter[] = []
  /** 非空表示方案来自已有 plan_ready 项目(学习库行点击进入),确认时更新而非新建。 */
  @Trace sourceProjectId: string = ''
  private sourceProject: LociProjectSummary | null = null

  canProceedSource(): boolean {
    return this.file !== null
  }

  canGeneratePlan(): boolean {
    return this.goal.trim().length > 0
  }

  /** patch_draft:本期文件 picker 用 mock 文件代替系统选择。 */
  pickMockFile(): void {
    const file: LociDraftFile = new LociDraftFile()
    file.name = '机器学习导论.pdf'
    file.format = 'PDF'
    file.size = '2.4 MB'
    this.file = file
  }

  pickDemoFile(): void {
    const file: LociDraftFile = new LociDraftFile()
    file.name = DEMO_FILE_NAME
    file.format = DEMO_FILE_FORMAT
    file.size = DEMO_FILE_SIZE
    this.file = file
  }

  removeFile(): void {
    this.file = null
  }

  goToSettings(): void {
    if (this.canProceedSource()) {
      this.step = 2
    }
  }

  backToSource(): void {
    this.step = 1
  }

  /**
   * create_plan:以 fixture 中 plan_ready 项目(project-hcai)的章节为模板克隆方案。
   * 真源:prototype planFromDraft(...template, 章节沿用模板)。
   */
  createPlan(templateChapters: LociChapter[]): void {
    const fileName: string = this.file !== null ? this.file.name : '示例学习资料.pdf'
    this.planTitle = stripExtension(fileName) || '新的学习项目'
    this.planChapters = templateChapters.map((chapter: LociChapter, index: number): LociPlanChapter => {
      const entry: LociPlanChapter = new LociPlanChapter()
      entry.id = `plan-chapter-${index}`
      entry.title = chapter.title
      entry.estimatedMinutes = chapter.estimatedMinutes
      return entry
    })
    if (this.planChapters.length === 0) {
      this.planChapters = [this.mockChapter(0, '建立整体框架', 8),
        this.mockChapter(1, '核心概念精读', 10), this.mockChapter(2, '例子与误区验证', 9)]
    }
    this.sourceProjectId = ''
    this.sourceProject = null
  }

  /** open_project(plan_ready):把已有项目方案载入,确认时更新原项目。 */
  loadPlanFromProject(project: LociProjectSummary): void {
    this.planTitle = project.shortTitle ?? project.title
    this.planChapters = project.chapters.map((chapter: LociChapter): LociPlanChapter => {
      const entry: LociPlanChapter = new LociPlanChapter()
      entry.id = chapter.id
      entry.title = chapter.title
      entry.estimatedMinutes = chapter.estimatedMinutes
      return entry
    })
    this.goal = project.goal
    this.level = project.level
    this.depth = project.depth
    this.sourceProjectId = project.id
    this.sourceProject = project
  }

  /** open_project(draft):恢复草稿继续创建,真源 PrototypeContext open_project 的 createDraft 回填。 */
  loadDraftFromProject(project: LociProjectSummary): void {
    const file: LociDraftFile = new LociDraftFile()
    file.name = project.source.name
    file.format = project.source.format
    file.size = project.source.size
    this.file = file
    this.goal = ''
    this.level = project.level
    this.depth = project.depth
    this.step = 1
    this.sourceProjectId = ''
    this.sourceProject = null
  }

  totalMinutes(): number {
    let sum: number = 0
    this.planChapters.forEach((chapter: LociPlanChapter): void => {
      sum += chapter.estimatedMinutes
    })
    return sum
  }

  /** update_plan:上移/下移。 */
  moveChapter(index: number, direction: number): void {
    const target: number = index + direction
    if (target < 0 || target >= this.planChapters.length) {
      return
    }
    const chapters: LociPlanChapter[] = this.planChapters.slice()
    const entry: LociPlanChapter = chapters.splice(index, 1)[0]
    chapters.splice(target, 0, entry)
    this.planChapters = chapters
  }

  /** update_plan:删章,至少保留 2 章(真源 PlanPage 删除按钮 disabled 条件)。 */
  removeChapter(id: string): void {
    if (this.planChapters.length <= 2) {
      return
    }
    this.planChapters = this.planChapters.filter((chapter: LociPlanChapter): boolean => chapter.id !== id)
  }

  /**
   * confirm_plan:产出确认后的项目数据(M3 消费形状)。
   * 已有项目:status → active、章节任务态第一章 ready/次章 running/其余 pending、附通知;
   * 新项目:同原型 planFromDraft + confirm_plan 的合成结果,插到学习库最前。
   */
  buildConfirmedProject(): LociProjectSummary {
    const stamp: number = Date.now()
    const chapters: LociChapter[] = this.planChapters.map((chapter: LociPlanChapter, index: number): LociChapter => {
      return {
        id: chapter.id,
        order: index,
        title: chapter.title,
        estimatedMinutes: chapter.estimatedMinutes,
        taskState: index === 0 ? 'ready' : index === 1 ? 'running' : 'pending',
        read: false
      } as LociChapter
    })
    const notice: LociProjectNotice = {
      id: '',
      tone: 'info',
      title: '第一章已经可以阅读',
      detail: '后续章节会继续生成,你可以随时离开并从学习库恢复。',
      actionLabel: '开始第一章'
    }
    const base: LociProjectSummary | null = this.sourceProject
    if (base !== null) {
      notice.id = `notice-${base.id}`
      return {
        id: base.id,
        title: base.title,
        shortTitle: base.shortTitle,
        goal: base.goal,
        level: base.level,
        depth: base.depth,
        source: base.source,
        status: 'active',
        lastStudiedLabel: '刚刚',
        chapters: chapters,
        notice: notice
      } as LociProjectSummary
    }
    const projectId: string = `project-new-${stamp}`
    notice.id = `notice-${projectId}`
    const fileName: string = this.file !== null ? this.file.name : '示例学习资料.pdf'
    const format: string = this.file !== null ? this.file.format : 'PDF'
    const source: LociSource = {
      id: `doc-new-${stamp}`,
      name: fileName,
      format: format,
      size: this.file !== null ? this.file.size : '2.4 MB',
      units: format === 'Markdown' ? '9 节' : '18 页'
    }
    return {
      id: projectId,
      title: this.planTitle,
      shortTitle: this.planTitle,
      goal: this.goal.trim() || '理解这份资料的核心框架,并能在真实问题中应用。',
      level: this.level,
      depth: this.depth,
      source: source,
      status: 'active',
      lastStudiedLabel: '刚刚',
      chapters: chapters,
      notice: notice
    } as LociProjectSummary
  }

  /** 确认完成后重置草稿,下一次「新建」从干净状态开始。 */
  reset(): void {
    this.step = 1
    this.file = null
    this.goal = ''
    this.level = '入门'
    this.depth = '系统学习'
    this.planTitle = ''
    this.planChapters = []
    this.sourceProjectId = ''
    this.sourceProject = null
  }

  private mockChapter(index: number, title: string, minutes: number): LociPlanChapter {
    const entry: LociPlanChapter = new LociPlanChapter()
    entry.id = `plan-chapter-${index}`
    entry.title = title
    entry.estimatedMinutes = minutes
    return entry
  }
}
