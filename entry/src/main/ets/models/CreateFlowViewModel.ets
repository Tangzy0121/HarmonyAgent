/**
 * 创建流 ViewModel(@ObservedV2):新建项目三步(来源/设置/确认)+ 方案确认编辑。
 * 真源:prototype/src/app/PrototypeContext.tsx 的 patch_draft / create_plan /
 * update_plan / confirm_plan 分支;docs/product/03 §5。
 * 实例由 AppRoot 持有并传给 CreateProjectPage / PlanPage,返回不丢草稿。
 * M5b:server 模式下 createPlanFromServer 走 POST /api/documents + POST /api/books 真实提案,
 * confirmPlanOnServer 走 PUT /proposal + POST /confirm;FIXTURE 模式保留本地克隆路径。
 */
import { util } from '@kit.ArkTS'
import {
  LociChapter,
  LociProjectNotice,
  LociProjectSummary,
  LociSource
} from './LociFixtures'
import {
  LociApiClient,
  WireBookChapter,
  WireDocumentMeta,
  WireProposalChapterEdit,
  WireProposalEdits,
  WireStoredBook
} from '../loci/data/LociApiClient'
import { mapBookToProject } from '../loci/data/ServerProjectMapper'

/** 已选来源文件(CreateDraft.file 的 ArkTS 投影);M5b 起携带原始字节供上传。 */
@ObservedV2
export class LociDraftFile {
  @Trace name: string = ''
  @Trace format: string = 'PDF'
  @Trace size: string = ''
  /** 原始字节(picker 读入 / 演示内嵌);FIXTURE 本地 mock 为空数组,不会上传。 */
  bytes: Uint8Array = new Uint8Array(0)
  contentType: string = ''
  sizeBytes: number = 0
}

/** 方案章节(PlanPage 可改标题/删章/调序;order 在确认时按数组序重排)。 */
@ObservedV2
export class LociPlanChapter {
  @Trace id: string = ''
  @Trace title: string = ''
  @Trace estimatedMinutes: number = 0
  /** 章目标(PUT /proposal 必填,server 校验非空;fixture 本地路径不消费)。 */
  @Trace objective: string = ''
}

/** POST /api/documents 上限(server raw body limit 20mb)。 */
export const MAX_UPLOAD_BYTES: number = 20 * 1024 * 1024

const DOCX_CONTENT_TYPE: string = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const DEMO_FILE_NAME: string = '机器学习基础(演示).md'

/** 演示文件内容(Markdown,上传时走 text/markdown;须满足 server 非空白 ≥200 字约束)。 */
const DEMO_MARKDOWN: string = `# 机器学习基础(演示)

## 什么是机器学习
机器学习是让计算机从数据中发现规律、而不是由人逐条编写规则的方法。
给定输入与期望输出的样例,模型通过不断调整内部参数,让预测逐渐逼近真实答案。
这条"从样例到规则"的路径,是监督学习的核心思想。

## 监督学习的基本流程
第一步是收集并清洗数据,把数据分成训练集与测试集;
第二步是选择模型并定义损失函数,用训练集反复优化参数;
第三步是在测试集上评估泛化能力,警惕过拟合——模型把训练数据的噪声也背了下来,
在新数据上反而表现变差。常用手段有正则化、交叉验证与早停。

## 分类与回归
预测离散标签(如"是否会流失")是分类问题,常用准确率、精确率与召回率评估;
预测连续数值(如房价)是回归问题,常用均方误差评估。
两类问题共享同一套训练范式,差别主要在输出层与损失函数的选择。
`

function stripExtension(name: string): string {
  return name.replace(/\.(pdf|md|markdown|docx)$/i, '')
}

/** 按扩展名判 Content-Type(server detectFormat 扩展名优先);不支持返回 ''。 */
function contentTypeForFile(name: string): string {
  const lower: string = name.toLowerCase()
  if (lower.endsWith('.pdf')) {
    return 'application/pdf'
  }
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    return 'text/markdown'
  }
  if (lower.endsWith('.docx')) {
    return DOCX_CONTENT_TYPE
  }
  return ''
}

function formatLabelForFile(name: string): string {
  const contentType: string = contentTypeForFile(name)
  if (contentType === 'application/pdf') {
    return 'PDF'
  }
  if (contentType === 'text/markdown') {
    return 'Markdown'
  }
  return 'DOCX'
}

/** 与 server formatSizeLabel 同规则。 */
function sizeLabelFor(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`
  }
  return `${Math.max(1, Math.ceil(sizeBytes / 1024))} KB`
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
  /** M5b:非空表示 planChapters 是 server 新书(status='proposal')的提案章,确认走 PUT+POST。 */
  @Trace createdBookId: string = ''
  private sourceProject: LociProjectSummary | null = null
  private api: LociApiClient = new LociApiClient()

  canProceedSource(): boolean {
    return this.file !== null
  }

  canGeneratePlan(): boolean {
    return this.goal.trim().length > 0
  }

  /** patch_draft:FIXTURE 模式的假文件(不弹 picker,也不上传)。 */
  pickMockFile(): void {
    const file: LociDraftFile = new LociDraftFile()
    file.name = '机器学习导论.pdf'
    file.format = 'PDF'
    file.size = '2.4 MB'
    this.file = file
  }

  /**
   * M5b:系统 picker 选回的文件。校验格式与 20MB 上限,
   * 合法返回 ''(file 已就位),非法返回提示文案且不覆盖现有选择。
   */
  setPickedFile(name: string, bytes: Uint8Array): string {
    const contentType: string = contentTypeForFile(name)
    if (contentType.length === 0) {
      return '仅支持 PDF、Markdown、DOCX 文件'
    }
    if (bytes.byteLength === 0) {
      return '文件内容为空'
    }
    if (bytes.byteLength > MAX_UPLOAD_BYTES) {
      return '文件超过 20MB 上限'
    }
    const file: LociDraftFile = new LociDraftFile()
    file.name = name
    file.format = formatLabelForFile(name)
    file.size = sizeLabelFor(bytes.byteLength)
    file.bytes = bytes
    file.contentType = contentType
    file.sizeBytes = bytes.byteLength
    this.file = file
    return ''
  }

  /** 演示文件(内嵌 Markdown 文本):server 模式下随 createPlanFromServer 真实上传。 */
  pickDemoFile(): void {
    const bytes: Uint8Array = util.TextEncoder.create('utf-8').encodeInto(DEMO_MARKDOWN)
    const file: LociDraftFile = new LociDraftFile()
    file.name = DEMO_FILE_NAME
    file.format = 'Markdown'
    file.size = sizeLabelFor(bytes.byteLength)
    file.bytes = bytes
    file.contentType = 'text/markdown'
    file.sizeBytes = bytes.byteLength
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

  /**
   * M5b create_plan(server):上传文档 → POST /api/books 生成提案 →
   * 提案章节载入 planChapters(order 1基→数组序),返回投影后的项目供调用侧 upsert。
   * 失败(网络/413/422/503 等)抛 Error(已归一中文文案),不改动草稿状态。
   */
  async createPlanFromServer(): Promise<LociProjectSummary> {
    if (this.file === null || this.file.bytes.byteLength === 0) {
      throw new Error('请先选择学习资料')
    }
    const meta: WireDocumentMeta =
      await this.api.uploadDocument(this.file.name, this.file.bytes, this.file.contentType)
    const book: WireStoredBook = await this.api.createBook(meta.id, this.goal, this.level)
    this.planTitle = book.proposal.title
    const sortedChapters: WireBookChapter[] = book.chapters.slice()
      .sort((a: WireBookChapter, b: WireBookChapter): number => a.order - b.order)
    this.planChapters = sortedChapters.map((chapter: WireBookChapter): LociPlanChapter => {
      const entry: LociPlanChapter = new LociPlanChapter()
      entry.id = chapter.id
      entry.title = chapter.title
      entry.objective = chapter.objective
      entry.estimatedMinutes = chapter.estimatedMinutes
      return entry
    })
    this.createdBookId = book.id
    this.sourceProjectId = ''
    this.sourceProject = null
    return mapBookToProject(book)
  }

  /**
   * M5b confirm_plan(server):先 PUT /proposal(order 发数组下标 0..N-1)再 POST /confirm,
   * 返回确认后(status=generating)的投影项目。调用侧负责 upsert 与导航。
   */
  async confirmPlanOnServer(): Promise<LociProjectSummary> {
    const edits: WireProposalEdits = {
      title: this.planTitle,
      chapters: this.planChapters.map((chapter: LociPlanChapter,
        index: number): WireProposalChapterEdit => {
        return {
          id: chapter.id,
          title: chapter.title,
          order: index,
          objective: chapter.objective,
          estimatedMinutes: chapter.estimatedMinutes
        }
      })
    }
    await this.api.updateProposal(this.createdBookId, edits)
    const book: WireStoredBook = await this.api.confirmBook(this.createdBookId)
    return mapBookToProject(book)
  }

  /** update_plan:删章下限——server 提案 3 章(server 校验 3–6),fixture 本地路径 2 章(原型语义)。 */
  minChapters(): number {
    return this.createdBookId.length > 0 ? 3 : 2
  }

  /** update_plan:删章,至少保留 minChapters() 章。 */
  removeChapter(id: string): void {
    if (this.planChapters.length <= this.minChapters()) {
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
    this.createdBookId = ''
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
