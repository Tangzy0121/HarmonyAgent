/**
 * M5a:server HTTP 客户端;M5b 补创建流写路径(上传/提案/确认);
 * M5c 补工作区写回:章节生成 SSE 流(requestInStream 逐帧解析)、
 *   quiz attempts / feynman / 阅读进度 POST。
 * M5d 补复习流:review/due 到期队列、flash_cards 复习结果 POST
 *   (quiz 块的复习写回走 attempts,review/result 仅 flash_cards——
 *   server 路由对非闪卡块 409 review_target_invalid,与 admin 对齐);
 *   learner/profile 供今日推荐本地派生。
 * 契约真源:server/src/books/bookTypes.ts + server/src/routes/books.ts
 *   + server/src/routes/documents.ts(只读,server 零改动)。
 * - GET /api/books → 裸数组 WireStoredBook[](无信封)
 * - GET /api/books/:id → 裸 WireStoredBook;404 {error:'book_not_found'}
 * - GET /api/books/:id/review/due → 200 {items:WireReviewDueItem[]}(dueAt 升序)
 * - POST /api/books/:id/review/:blockId/result {result:'remembered'|'forgotten'}
 *   → 200 {evidence,schedule(null=毕业),projectionStatus,mastery?};
 *   409 review_target_invalid(仅 flash_cards 块可复习)
 * - GET /api/learner/profile → 200 WireLearnerProfile(concepts + rhythm + derivedAt)
 * - POST /api/documents → raw body(非 multipart),x-file-name 百分号编码文件名;
 *   200 {id:'doc_<uuid>',fileName,format,sizeBytes,pageCount,createdAt}(WireDocumentMeta)
 * - POST /api/books {documentId,goal,learnerLevel} → 201 {book}(新书 status='proposal');
 *   503 proposal_not_configured(无 LLM key 时稳定触发)
 * - PUT /api/books/:id/proposal {title?,chapters:[{id,title,order,objective,estimatedMinutes}]}
 *   → 200 {book};仅 status='proposal' 可编辑,章节只能删不能增(3–6 章),order 只作相对排序
 * - POST /api/books/:id/confirm 无体 → 200 {book}(status→generating)
 * - JSON body 含中文时 Content-Type 必须带 charset=utf-8(requestJson 第 5 参覆盖)
 * - 错误体统一 {error:'snake_code'},此处归一化为中文文案 Error。
 * ArkTS 严格类型:不用 any,wire 字段逐一对应 StoredBook(M5a 只取消费侧需要的字段,
 * 其余字段原样保留在 JSON 里,wire interface 不声明即为忽略)。
 */
import { http } from '@kit.NetworkKit'
import { util } from '@kit.ArkTS'
import { ServerConfig } from '../../network/ServerConfig'
import { LociSseFrameParser } from './LociSseFrameParser'

// ---- wire 类型(镜像 StoredBook,M5a 消费子集 + 列表/详情共用形状) ----

export interface WireSourceDocument {
  id: string
  fileName: string
  format: string
  pageCount: number
  sizeLabel: string
  updatedLabel: string
}

export interface WireSourceAnchor {
  sourceId: string
  fileName: string
  pageRange: string
  excerpt: string
}

export interface WireBookProposal {
  title: string
  description: string
  rationale: string
  estimatedMinutes: number
}

export interface WireQuizOption {
  id: string
  marker: string
  text: string
}

/** flash_cards 块的单卡(M5d 复习卡路径消费)。 */
export interface WireFlashCard {
  front: string
  back: string
  hint?: string
}

export interface WireConceptItem {
  id: string
  label: string
  description: string
  learningState: string
}

export interface WireConceptRelation {
  id: string
  sourceId: string
  targetId: string
  type: string
  confidence: number
  status: string
  sourceAnchor: WireSourceAnchor
}

/**
 * 块 10 型判别联合的拍平投影:type 判别,各类型字段全部可选。
 * 类型:explanation/example/formula/citation/quiz/concept/flash_cards/figure/callout/user_note。
 */
export interface WireBookBlock {
  id: string
  type: string
  status: string
  title: string
  revision: number
  sourceAnchors: WireSourceAnchor[]
  body?: string            // explanation
  keyPoint?: string        // explanation
  scenario?: string        // example
  takeaway?: string        // example
  formula?: string         // formula
  explanation?: string     // formula(公式说明)
  excerpt?: string         // citation
  location?: string        // citation
  conceptId?: string       // quiz
  question?: string        // quiz
  options?: WireQuizOption[] // quiz
  correctAnswerId?: string // quiz
  feedback?: string        // quiz
  concepts?: WireConceptItem[]     // concept
  relations?: WireConceptRelation[] // concept
  cards?: WireFlashCard[]          // flash_cards
}

/** ChapterStatus:pending/generating/ready/partial/error。blocks 在列表投影里可能缺省。 */
export interface WireBookChapter {
  id: string
  title: string
  order: number
  objective: string
  coreConceptId: string
  estimatedMinutes: number
  sourceAnchors: WireSourceAnchor[]
  status: string
  blocks?: WireBookBlock[]
}

export interface WireReadingProgress {
  visitedChapterIds: string[]
  bookmarkedChapterIds: string[]
}

/** LearningEvidence 消费子集(M5c):kind/outcome 驱动概念状态、章 verified 与章末证据条。 */
export interface WireLearningEvidence {
  id: string
  kind: string
  chapterId: string
  conceptId: string
  statement: string
  outcome: string
  createdAt: string
}

/** StoredBook 的 M5a 消费子集(createdAt/userNotes 等暂不消费)。 */
export interface WireStoredBook {
  id: string
  source: WireSourceDocument
  goal: string
  learnerLevel: string
  proposal: WireBookProposal
  status: string
  chapters: WireBookChapter[]
  activeChapterId: string
  readingProgress?: WireReadingProgress
  evidence?: WireLearningEvidence[]
  updatedAt: string
}

/** POST /api/documents 200 响应(文档元数据)。 */
export interface WireDocumentMeta {
  id: string
  fileName: string
  format: string
  sizeBytes: number
  pageCount: number
  createdAt: string
}

/** PUT /api/books/:id/proposal 的章节编辑项;order 只作相对排序(发数组下标 0..N-1)。 */
export interface WireProposalChapterEdit {
  id: string
  title: string
  order: number
  objective: string
  estimatedMinutes: number
}

/** PUT /api/books/:id/proposal 请求体。 */
export interface WireProposalEdits {
  title?: string
  chapters: WireProposalChapterEdit[]
}

/** POST /api/books、PUT proposal、POST confirm 的 {book} 信封。 */
interface WireBookEnvelope {
  book: WireStoredBook
}

// ---- M5c 工作区写回 wire 类型 ----

/** 错题四类诊断(答对/未配置 LLM key/诊断失败时为 null)。 */
export interface WireAttemptDiagnosis {
  type: string
  advice: string
}

/** attempts 响应里的 attempt 子对象。 */
export interface WireQuizAttempt {
  id: string
  chapterId: string
  blockId: string
  answerId: string
  isCorrect: boolean
  submittedAt: string
}

/** mastery 投影(projectionStatus='pending' 时缺省)。 */
export interface WireMasteryProjection {
  chapter: number
  concept: number
}

/**
 * POST /api/books/:id/attempts → 201 扁平对象的消费子集
 * (evidence/schedule 原样保留在 JSON 里,wire 不声明即忽略)。
 */
export interface WireQuizAttemptResult {
  attempt: WireQuizAttempt
  diagnosis: WireAttemptDiagnosis | null
  projectionStatus: string
  mastery?: WireMasteryProjection
}

/** POST /api/books/:id/chapters/:cid/feynman → 200。 */
export interface WireFeynmanResult {
  passed: boolean
  feedback: string
  gap: string
  evidenceId: string
  projectionStatus: string
  mastery?: WireMasteryProjection
}

/** POST /api/books/:id/progress → 200(completion 派生对象不消费,wire 不声明即忽略)。 */
export interface WireProgressResult {
  progress: WireReadingProgress
}

// ---- M5d 复习流 + 学习者画像 wire 类型 ----

/** GET review/due 的到期项(dueAt 升序;kind 判别 quiz/flash_cards)。 */
export interface WireReviewDueItem {
  blockId: string
  chapterId: string
  kind: string
  title: string
  dueAt: string
  stage: number
  lapses: number
}

/** GET /api/books/:id/review/due → 200 信封。 */
interface WireReviewDueEnvelope {
  items: WireReviewDueItem[]
}

/**
 * POST review/:blockId/result → 200 的消费子集
 * (evidence/schedule 原样保留在 JSON 里,wire 不声明即忽略;schedule=null 表示毕业)。
 */
export interface WireReviewResult {
  projectionStatus: string
  mastery?: WireMasteryProjection
}

/** 概念掌握度的来源定位(遗忘悬崖推荐据 bookId 找项目)。 */
export interface WireConceptSource {
  bookId: string
  chapterId: string
  conceptId: string
}

/** 概念掌握度;lastOutcome/lastAttemptAt 无作答时为 null。 */
export interface WireConceptMastery {
  label: string
  displayLabel: string
  mastery: number
  attempts: number
  lastOutcome: string | null
  lastAttemptAt: string | null
  sources: WireConceptSource[]
  forgettingCliff: boolean
}

/** 学习时段分布(键固定 morning/afternoon/evening/night)。 */
export interface WirePeriodDistribution {
  morning: number
  afternoon: number
  evening: number
  night: number
}

export interface WireLearningRhythm {
  activeDays30: number
  streakDays: number
  periodDistribution: WirePeriodDistribution
  dailyAverageEvents: number
  studiedToday: boolean
  activeDayKeys: string[]
}

/** GET /api/learner/profile → 200(只读派生,镜像 server learnerProfile.ts)。 */
export interface WireLearnerProfile {
  concepts: WireConceptMastery[]
  rhythm: WireLearningRhythm
  derivedAt: string
}

/** PR-C:GET /api/today 的推荐项(确定性零 LLM,按日重置)。action 四值见 server todayRecommendation.ts。 */
export interface WireTodayRecommendation {
  id: string
  action: string
  bookId: string
  conceptLabel: string | null
  reason: string
  evidenceRefs: string[]
  estimatedMinutes: number
  expiresAt: string
  rank: string
  state: string
}

/** GET /api/today → 200 信封;无推荐时 primary=null。 */
export interface WireTodayResponse {
  version: string
  generatedAt: string
  primary: WireTodayRecommendation | null
  alternatives: WireTodayRecommendation[]
}

/** PR-A:GET /api/projects 的聚合 DTO(消费子集;goal/owner 等暂不声明)。 */
export interface WireLearningProject {
  projectId: string
  title: string
  bookId: string
  status: string
  createdAt: string
  updatedAt: string
  lastLearnedAt: string | null
  progress: WireProjectProgress
  actions: WireProjectActions
  notices: WireProjectNotices
}

export interface WireProjectProgress {
  chaptersReady: number
  chaptersTotal: number
  completion: number | null
}

export interface WireProjectActions {
  canRead: boolean
  hasPendingGeneration: boolean
  dueReviewCount: number
}

export interface WireProjectNotices {
  unreadCount: number
}

interface WireProjectsEnvelope {
  version: string
  projects: WireLearningProject[]
}

/** PR-B:聚合概念(附章节/块定位与掌握度投影;无投影 mastery=null)。 */
export interface WireAggregatedConcept {
  id: string
  label: string
  description: string
  learningState: string
  chapterId: string
  blockId: string
  mastery: number | null
}

/** PR-B:聚合关系(纠正已应用:reject 剔除/retype 已改型;correctedBy 标记命中纠正)。 */
export interface WireAggregatedRelation {
  id: string
  sourceId: string
  targetId: string
  type: string
  status: string
  chapterId: string
  blockId: string
  correctedBy: string | null
}

interface WireConceptsEnvelope {
  version: string
  concepts: WireAggregatedConcept[]
}

interface WireRelationsEnvelope {
  version: string
  relations: WireAggregatedRelation[]
}

/** PR-D:项目通知(章节就绪/失败等;dedupeKey 服务端未读去重,端侧不感知)。 */
export interface WireProjectNotice {
  id: string
  kind: string
  severity: string
  message: string
  target: WireNoticeTarget
  createdAt: string
  readAt: string | null
}

export interface WireNoticeTarget {
  bookId?: string
  chapterId?: string
  documentId?: string
  fileName?: string
}

interface WireNoticesEnvelope {
  version: string
  notices: WireProjectNotice[]
}

/** 关系纠正请求体(ArkTS 不支持 Record 字面量,用具体接口)。 */
interface WireCorrectionPayload {
  action: string
  suggestedType?: string
}

/** 章节生成 SSE 白名单事件回调(chapter_start/block/chapter_done/error,其余帧忽略)。 */
export interface ChapterGenerationCallbacks {
  onChapterStart: (chapterId: string) => void
  onBlock: (index: number, block: WireBookBlock) => void
  onChapterDone: (blockCount: number, warnings: string[]) => void
  /** SSE error 帧(终态):server 已把章翻为 error 并落盘。 */
  onError: (code: string, message: string) => void
}

/**
 * 章节生成会话。cancel() 供切章/退页中断底层请求;
 * 取消后 done 静默 resolve(不当错误上报),其余路径 done reject Error(中文文案)。
 */
export interface ChapterGenerationSession {
  done: Promise<void>
  cancel: () => void
}

// SSE 帧 data 载荷
interface WireChapterStartEvent {
  chapterId: string
}

interface WireChapterBlockEvent {
  index: number
  block: WireBookBlock
}

interface WireChapterDoneEvent {
  blockCount: number
  warnings?: string[]
}

interface WireChapterErrorEvent {
  code: string
  message: string
}

/** server 错误体 {error:'snake_code'}。 */
interface WireErrorBody {
  error?: string
}

/** snake_code → 中文文案;未知码回退原文,调用侧可看 message 定位。 */
const ERROR_TEXTS: Record<string, string> = {
  'book_not_found': '这本书不存在或已被删除',
  'chapter_not_found': '章节不存在或已被删除',
  'document_not_found': '来源文档不存在',
  'invalid_request': '请求参数不完整',
  'internal_error': '服务器开小差了,请稍后再试',
  'book_not_editable': '当前状态不允许修改',
  'chapter_not_generatable': '章节暂时不能生成',
  'chapter_not_configured': '章节生成服务未配置',
  'proposal_not_configured': '方案生成服务未配置 API Key,请配置后重试',
  'proposal_generation_failed': '方案生成失败,请重试',
  // M5b 创建流(documents / proposal 编辑)
  'invalid_content_type': '文件格式不支持,仅支持 PDF、Markdown、DOCX',
  'pdf_too_large': '文件超过 20MB 上限',
  'pdf_no_text': 'PDF 没有可提取的文字(可能是扫描件)',
  'doc_no_text': '文档内容为空或不足 200 字',
  'doc_too_long': '文档超过 45,000 字上限',
  'pdf_encrypted': 'PDF 已加密,无法解析',
  'pdf_unreadable': 'PDF 解析失败,文件可能已损坏',
  'docx_unreadable': 'DOCX 解析失败,文件可能已损坏',
  'invalid_proposal_edit': '方案修改不合法(3–6 章、标题与目标不能为空)',
  // M5c 工作区写回
  'quiz_not_found': '这道小测不存在或已被更新,请刷新后重试',
  'invalid_answer': '选项无效,请刷新后重试',
  'feynman_not_configured': '费曼评判服务未配置 API Key,请配置后重试',
  'upstream_unavailable': '上游模型服务暂时不可用,请稍后再试',
  'chapter_generation_failed': '章节生成失败,请重试',
  'incomplete_stream': '生成中断,已生成的内容会保留,可重新生成',
  // M5d 复习流
  'review_target_invalid': '这个内容不在复习队列中,请刷新后重试'
}

function normalizeError(status: number, body: string): Error {
  let code: string = ''
  try {
    const parsed: WireErrorBody = JSON.parse(body) as WireErrorBody
    code = parsed.error ?? ''
  } catch (e) {
    // 非 JSON 错误体(网关/断网等),落到 HTTP 状态文案
  }
  if (code.length > 0) {
    const text: string = ERROR_TEXTS[code] ?? `服务返回错误(${code})`
    return new Error(text)
  }
  if (status === 404) {
    return new Error('资源不存在(404)')
  }
  return new Error(`网络请求失败(HTTP ${status})`)
}

/**
 * JSON 请求公共路径。contentType 默认 'application/json';
 * body 含中文的写请求须传 'application/json; charset=utf-8'(M5b 实机踩坑:不带 charset 中文会乱码)。
 */
async function requestJson(path: string, method: http.RequestMethod,
  body: string = '', timeoutMs: number = ServerConfig.TIMEOUT_MS,
  contentType: string = 'application/json'): Promise<string> {
  const request: http.HttpRequest = http.createHttp()
  try {
    const options: http.HttpRequestOptions = {
      method,
      expectDataType: http.HttpDataType.STRING,
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
      usingCache: false,
      header: { 'Content-Type': contentType }
    }
    if (body.length > 0) {
      options.extraData = body
    }
    const response: http.HttpResponse = await request.request(ServerConfig.BASE_URL + path, options)
    const text: string = typeof response.result === 'string' ? response.result : ''
    if (response.responseCode < 200 || response.responseCode >= 300) {
      throw normalizeError(response.responseCode, text)
    }
    return text
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('网络连接失败,请检查网络后重试')
  } finally {
    request.destroy()
  }
}

/**
 * SSE 逐行解析器:`event:`/`data:` 组帧,空行派发;CRLF 在入行时去尾 `\r` 归一。
 * 注释行(`:` 开头,心跳)与未知字段忽略;帧事件名缺省为 'message'(派发侧再按白名单过滤)。
 */
export class LociApiClient {
  /** AUTO 探活:短超时、永不抛错,不可达即 false。 */
  async health(): Promise<boolean> {
    try {
      await requestJson('/health', http.RequestMethod.GET, '', ServerConfig.HEALTH_TIMEOUT_MS)
      return true
    } catch (error) {
      return false
    }
  }

  async getBooks(): Promise<WireStoredBook[]> {
    const text: string = await requestJson('/api/books', http.RequestMethod.GET)
    return JSON.parse(text) as WireStoredBook[]
  }

  async getBook(id: string): Promise<WireStoredBook> {
    const text: string =
      await requestJson('/api/books/' + encodeURIComponent(id), http.RequestMethod.GET)
    return JSON.parse(text) as WireStoredBook
  }

  /**
   * M5b:POST /api/documents,raw body(非 multipart)。
   * x-file-name 百分号编码(server sanitizeFileName 会 decode);20MB 文件超时放宽。
   */
  async uploadDocument(fileName: string, bytes: Uint8Array,
    contentType: string): Promise<WireDocumentMeta> {
    const request: http.HttpRequest = http.createHttp()
    try {
      const options: http.HttpRequestOptions = {
        method: http.RequestMethod.POST,
        expectDataType: http.HttpDataType.STRING,
        connectTimeout: ServerConfig.UPLOAD_TIMEOUT_MS,
        readTimeout: ServerConfig.UPLOAD_TIMEOUT_MS,
        usingCache: false,
        header: {
          'Content-Type': contentType,
          'x-file-name': encodeURIComponent(fileName)
        },
        // Uint8Array 的底层 buffer 可能带偏移/余量,切出精确窗口
        extraData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      }
      const response: http.HttpResponse =
        await request.request(ServerConfig.BASE_URL + '/api/documents', options)
      const text: string = typeof response.result === 'string' ? response.result : ''
      if (response.responseCode < 200 || response.responseCode >= 300) {
        throw normalizeError(response.responseCode, text)
      }
      return JSON.parse(text) as WireDocumentMeta
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error('网络连接失败,请检查网络后重试')
    } finally {
      request.destroy()
    }
  }

  /** M5b:POST /api/books → 201 {book}(新书 status='proposal';503 proposal_not_configured)。 */
  async createBook(documentId: string, goal: string, learnerLevel: string): Promise<WireStoredBook> {
    const body: string = JSON.stringify({
      documentId: documentId,
      goal: goal,
      learnerLevel: learnerLevel
    })
    const text: string = await requestJson('/api/books', http.RequestMethod.POST, body,
      ServerConfig.TIMEOUT_MS, 'application/json; charset=utf-8')
    return (JSON.parse(text) as WireBookEnvelope).book
  }

  /** M5b:PUT /api/books/:id/proposal → 200 {book};仅 status='proposal' 可编辑。 */
  async updateProposal(bookId: string, edits: WireProposalEdits): Promise<WireStoredBook> {
    const text: string = await requestJson('/api/books/' + encodeURIComponent(bookId) + '/proposal',
      http.RequestMethod.PUT, JSON.stringify(edits),
      ServerConfig.TIMEOUT_MS, 'application/json; charset=utf-8')
    return (JSON.parse(text) as WireBookEnvelope).book
  }

  /** M5b:POST /api/books/:id/confirm(无体)→ 200 {book}(status→generating)。 */
  async confirmBook(bookId: string): Promise<WireStoredBook> {
    const text: string = await requestJson('/api/books/' + encodeURIComponent(bookId) + '/confirm',
      http.RequestMethod.POST)
    return (JSON.parse(text) as WireBookEnvelope).book
  }

  /**
   * M5c:POST /api/books/:id/chapters/:cid/generate → SSE 流(requestInStream 写法
   * 参考 loci/agent/LociAgentTurnClient.ets 的 stream())。
   * 帧处理:字节级缓冲,按 \n 切行(0x0A 不会出现在 UTF-8 多字节序列内,行边界 decode 安全),
   * LociSseFrameParser 组帧后白名单派发。终态 = chapter_done / error 帧;
   * 未收终态就 EOF → reject incomplete_stream(断线恢复靠调用侧重拉详情 + 重新 POST)。
   * 前置校验失败(409/404/503)走 JSON 错误体,与非 2xx 统一 normalizeError。
   */
  startChapterGeneration(bookId: string, chapterId: string,
    callbacks: ChapterGenerationCallbacks): ChapterGenerationSession {
    const request: http.HttpRequest = http.createHttp()
    let cancelled: boolean = false
    let terminated: boolean = false
    let pending: Uint8Array = new Uint8Array(0)
    let allBytes: Uint8Array = new Uint8Array(0)
    const decoder: util.TextDecoder = util.TextDecoder.create('utf-8')

    const parser: LociSseFrameParser = new LociSseFrameParser((event: string, data: string): void => {
      try {
        switch (event) {
          case 'chapter_start': {
            const payload: WireChapterStartEvent = JSON.parse(data) as WireChapterStartEvent
            callbacks.onChapterStart(payload.chapterId)
            break
          }
          case 'block': {
            const payload: WireChapterBlockEvent = JSON.parse(data) as WireChapterBlockEvent
            callbacks.onBlock(payload.index, payload.block)
            break
          }
          case 'chapter_done': {
            terminated = true
            const payload: WireChapterDoneEvent = JSON.parse(data) as WireChapterDoneEvent
            callbacks.onChapterDone(payload.blockCount, payload.warnings ?? [])
            break
          }
          case 'error': {
            terminated = true
            const payload: WireChapterErrorEvent = JSON.parse(data) as WireChapterErrorEvent
            callbacks.onError(payload.code, payload.message)
            break
          }
          default:
            break // 白名单外事件忽略
        }
      } catch (e) {
        // 单帧 JSON 损坏不阻断流,等后续帧或 EOF 终态判定
      }
    })

    /** 字节缓冲推入行:只消费到最后一个 \n;final 时把残留(无换行尾行)也推入解析器。 */
    const drain = (isFinal: boolean): void => {
      let cut: number = -1
      for (let i = pending.length - 1; i >= 0; i--) {
        if (pending[i] === 0x0A) {
          cut = i
          break
        }
      }
      if (cut < 0 && !isFinal) {
        return
      }
      const head: Uint8Array = cut < 0 ? pending : pending.subarray(0, cut + 1)
      pending = cut < 0 ? new Uint8Array(0) : pending.subarray(cut + 1)
      const text: string = decoder.decodeToString(head)
      const lines: string[] = text.split('\n')
      // split 的末段是最后一个 \n 之后的残余:head 以 \n 结尾时末段恒为 '',
      // 它不是真实空行,直接推入会把刚设置的 event 名当空帧冲掉(实测踩坑),必须丢弃
      if (lines.length > 0 && lines[lines.length - 1].length === 0) {
        lines.pop()
      }
      lines.forEach((line: string): void => parser.pushLine(line))
    }

    request.on('dataReceive', (data: ArrayBuffer): void => {
      const chunk: Uint8Array = new Uint8Array(data)
      const merged: Uint8Array = new Uint8Array(pending.length + chunk.length)
      merged.set(pending, 0)
      merged.set(chunk, pending.length)
      pending = merged
      const full: Uint8Array = new Uint8Array(allBytes.length + chunk.length)
      full.set(allBytes, 0)
      full.set(chunk, allBytes.length)
      allBytes = full
      drain(false)
    })

    const done: Promise<void> = (async (): Promise<void> => {
      try {
        const options: http.HttpRequestOptions = {
          method: http.RequestMethod.POST,
          connectTimeout: ServerConfig.TIMEOUT_MS,
          // 上游整段生成最长 180s(server CHAPTER_UPSTREAM_TIMEOUT_MS),读超时放宽到 240s
          readTimeout: ServerConfig.GENERATE_TIMEOUT_MS,
          usingCache: false,
          header: { 'Accept': 'text/event-stream' }
        }
        const path: string = '/api/books/' + encodeURIComponent(bookId) +
          '/chapters/' + encodeURIComponent(chapterId) + '/generate'
        const responseCode: number =
          await request.requestInStream(ServerConfig.BASE_URL + path, options)
        if (cancelled) {
          return
        }
        drain(true)
        parser.end()
        if (responseCode < 200 || responseCode >= 300) {
          throw normalizeError(responseCode, decoder.decodeToString(allBytes))
        }
        if (!terminated) {
          throw new Error(ERROR_TEXTS['incomplete_stream'])
        }
      } catch (error) {
        if (cancelled) {
          return
        }
        if (error instanceof Error) {
          throw error
        }
        throw new Error('网络连接失败,请检查网络后重试')
      } finally {
        request.off('dataReceive')
        request.destroy()
      }
    })()

    return {
      done: done,
      cancel: (): void => {
        cancelled = true
        try {
          request.destroy()
        } catch (e) {
          // 已销毁/未连接时忽略
        }
      }
    }
  }

  /** M5c:POST /api/books/:id/attempts {blockId,answerId} → 201;无 LLM key 时 diagnosis=null。 */
  async submitQuizAttempt(bookId: string, blockId: string,
    answerId: string): Promise<WireQuizAttemptResult> {
    const body: string = JSON.stringify({ blockId: blockId, answerId: answerId })
    const text: string = await requestJson('/api/books/' + encodeURIComponent(bookId) + '/attempts',
      http.RequestMethod.POST, body, ServerConfig.TIMEOUT_MS, 'application/json; charset=utf-8')
    return JSON.parse(text) as WireQuizAttemptResult
  }

  /** M5c:POST /api/books/:id/chapters/:cid/feynman {explanation} → 200;503 feynman_not_configured。 */
  async submitFeynman(bookId: string, chapterId: string,
    explanation: string): Promise<WireFeynmanResult> {
    const body: string = JSON.stringify({ explanation: explanation })
    const text: string = await requestJson('/api/books/' + encodeURIComponent(bookId) +
      '/chapters/' + encodeURIComponent(chapterId) + '/feynman',
      http.RequestMethod.POST, body, ServerConfig.TIMEOUT_MS, 'application/json; charset=utf-8')
    return JSON.parse(text) as WireFeynmanResult
  }

  /** M5c:POST /api/books/:id/progress {chapterId,action} 幂等 → 200 {progress,completion}。 */
  async reportProgress(bookId: string, chapterId: string,
    action: string): Promise<WireProgressResult> {
    const body: string = JSON.stringify({ chapterId: chapterId, action: action })
    const text: string = await requestJson('/api/books/' + encodeURIComponent(bookId) + '/progress',
      http.RequestMethod.POST, body, ServerConfig.TIMEOUT_MS, 'application/json; charset=utf-8')
    return JSON.parse(text) as WireProgressResult
  }

  /** M5d:GET /api/books/:id/review/due → 到期复习项(dueAt 升序,空队列 items=[])。 */
  async getReviewDue(bookId: string): Promise<WireReviewDueItem[]> {
    const text: string = await requestJson('/api/books/' + encodeURIComponent(bookId) + '/review/due',
      http.RequestMethod.GET)
    return (JSON.parse(text) as WireReviewDueEnvelope).items ?? []
  }

  /**
   * M5d:POST /api/books/:id/review/:blockId/result {result} → 200。
   * 仅 flash_cards 块可复习(409 review_target_invalid);quiz 块的复习写回走 attempts。
   */
  async submitReviewResult(bookId: string, blockId: string, result: string): Promise<WireReviewResult> {
    const body: string = JSON.stringify({ result: result })
    const text: string = await requestJson('/api/books/' + encodeURIComponent(bookId) +
      '/review/' + encodeURIComponent(blockId) + '/result',
      http.RequestMethod.POST, body, ServerConfig.TIMEOUT_MS, 'application/json; charset=utf-8')
    return JSON.parse(text) as WireReviewResult
  }

  /** M5d:GET /api/learner/profile → 学习者画像(今日推荐本地派生输入,只读)。 */
  async getLearnerProfile(): Promise<WireLearnerProfile> {
    const text: string = await requestJson('/api/learner/profile', http.RequestMethod.GET)
    return JSON.parse(text) as WireLearnerProfile
  }

  /** PR-C:GET /api/today → 服务端今日推荐(primary + alternatives;无推荐 primary=null)。 */
  async getTodayRecommendations(): Promise<WireTodayResponse> {
    const text: string = await requestJson('/api/today', http.RequestMethod.GET)
    return JSON.parse(text) as WireTodayResponse
  }

  /**
   * PR-C:POST /api/today/state {recommendationId, state, untilIso?}。
   * state: dismissed | snoozed | completed;snoozed 不传 untilIso 时服务端默认 +4h。
   */
  async setTodayRecommendationState(recommendationId: string, state: string): Promise<void> {
    const body: string = JSON.stringify({ recommendationId: recommendationId, state: state })
    await requestJson('/api/today/state', http.RequestMethod.POST, body,
      ServerConfig.TIMEOUT_MS, 'application/json; charset=utf-8')
  }

  /** PR-A:GET /api/projects → 学习项目聚合 DTO(含进度/到期数/未读通知数)。 */
  async getProjects(): Promise<WireLearningProject[]> {
    const text: string = await requestJson('/api/projects', http.RequestMethod.GET)
    return (JSON.parse(text) as WireProjectsEnvelope).projects ?? []
  }

  /** PR-B:GET /api/books/:id/concepts → 全书概念聚合(含 mastery 投影)。 */
  async getBookConcepts(bookId: string): Promise<WireAggregatedConcept[]> {
    const text: string =
      await requestJson('/api/books/' + encodeURIComponent(bookId) + '/concepts', http.RequestMethod.GET)
    return (JSON.parse(text) as WireConceptsEnvelope).concepts ?? []
  }

  /** PR-B:GET /api/books/:id/relations → 全书关系聚合(纠正已应用)。 */
  async getBookRelations(bookId: string): Promise<WireAggregatedRelation[]> {
    const text: string =
      await requestJson('/api/books/' + encodeURIComponent(bookId) + '/relations', http.RequestMethod.GET)
    return (JSON.parse(text) as WireRelationsEnvelope).relations ?? []
  }

  /**
   * PR-B:POST /api/books/:id/relations/:rid/corrections {action, suggestedType?, note?}。
   * action: confirm | reject | retype(retype 须带 suggestedType 受控五值之一);幂等。
   */
  async postRelationCorrection(bookId: string, relationId: string, action: string,
    suggestedType: string = ''): Promise<void> {
    const payload: WireCorrectionPayload = { action: action }
    if (suggestedType.length > 0) {
      payload.suggestedType = suggestedType
    }
    const body: string = JSON.stringify(payload)
    await requestJson('/api/books/' + encodeURIComponent(bookId) + '/relations/' +
      encodeURIComponent(relationId) + '/corrections',
      http.RequestMethod.POST, body, ServerConfig.TIMEOUT_MS, 'application/json; charset=utf-8')
  }

  /** PR-D:GET /api/notices → 项目通知(createdAt 降序)。 */
  async getNotices(): Promise<WireProjectNotice[]> {
    const text: string = await requestJson('/api/notices', http.RequestMethod.GET)
    return (JSON.parse(text) as WireNoticesEnvelope).notices ?? []
  }

  /** PR-D:POST /api/notices/:id/read → 标记已读(幂等)。 */
  async markNoticeRead(noticeId: string): Promise<void> {
    await requestJson('/api/notices/' + encodeURIComponent(noticeId) + '/read',
      http.RequestMethod.POST, '{}', ServerConfig.TIMEOUT_MS, 'application/json; charset=utf-8')
  }
}
