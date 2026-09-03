# 后端功能清单与实施路线

> 状态：现行
>
> 创建日期：2026-09-03
>
> 代码基线：master `d4a41ea`（含 PR #10 六 sprint 功能、PR #11 鸿蒙端接通）
>
> 产品依据：docs/product/04（领域模型）、06（路线与验收）

本文档对照 docs/product/04 的领域对象盘点 `server/` 实现状态，并定义缺口补齐顺序。状态标注：`Integrated`（客户端已按合同接通）/ `Prototype`（服务端已实现）/ `Planned`（已确认未实现）/ `Deferred`（明确不做）。

## 1. API 总览（现状）

### 来源资料 `/api/documents`

| 端点 | 说明 | 状态 |
| --- | --- | --- |
| `POST /` | 上传解析 PDF/MD/DOCX/EPUB（raw body + `x-file-name`），虚拟分页 | Integrated |
| `GET /` | 来源列表 | Integrated |
| `DELETE /:id` | 删除来源 | Integrated |

### 学习书 `/api/books`

| 端点 | 说明 | 状态 |
| --- | --- | --- |
| `POST /` | 创建学习书（单源 `documentId` 或多源 `documentIds`，>5 源 409、合计超长 422），LLM 生成提案 | Integrated |
| `GET /` / `GET /:id` | 列表 / 详情（含章节、块、生成状态） | Integrated |
| `DELETE /:id` | 删除学习书 | Integrated |
| `PUT /:id/proposal` | 编辑提案（标题/顺序/删除章节） | Integrated |
| `POST /:id/confirm` | 确认提案，章节进入生成队列（首章优先） | Integrated |
| `POST /:id/chapters/:cid/generate` | SSE 渐进生成章节；断连即中止并落 error | Integrated |
| `POST /:id/attempts` | 测验提交：判分 + 诊断（concept/application/misread/overconfident）+ 证据 + 调度 | Integrated |
| `POST /:id/concepts/:cid/quiz` | 薄弱概念自适应出题（每概念上限 3 道，落章末 quiz 块） | Prototype |
| `POST /:id/pretest` / `POST /:id/pretest/result` | 摸底生成与评分 | Prototype |
| `POST /:id/chapters/:cid/feynman` | 章末费曼评估 | Integrated |
| `GET /:id/review/due` / `POST /:id/review/:blockId/result` | 到期复习队列 / 复习结果写回 | Integrated |
| `POST /:id/progress` / `GET /:id/completion` | 阅读进度（幂等三动作）/ 完成度（0.4 已读占比 + 0.6 概念均值） | Prototype |
| `GET /:id/bank` / `POST /:id/cards` | 题库派生（错题优先）/ 用户自存卡（≤100） | Prototype |
| `POST /:id/notes` / `DELETE /:id/notes/:noteId` | 用户笔记 | Prototype |
| `GET /:id/estimate` | spine 成本估算（章页数 × 800 + 6000） | Prototype |
| `GET /:id/export` | 导出 Markdown（列全部来源） | Prototype |

### 学习者 `/api/learner`

| 端点 | 说明 | 状态 |
| --- | --- | --- |
| `GET /profile` | 跨书学习者画像（label 归一 + 悬崖 1.5× + 节律四桶 + 30 天活跃日） | Prototype |
| `GET /suggestions` | starter 建议（遗忘悬崖 > 薄弱 < 0.3 > 继续读，≤3 条） | Prototype |

### 学习项目 `/api/projects`（PR #13）

| 端点 | 说明 | 状态 |
| --- | --- | --- |
| `GET /` / `GET /:id` | 学习项目聚合 DTO（目标/来源/进度/动作/未读通知数）；404 project_not_found | Prototype |

### 概念图 `/api/books/:id`（PR #14）

| 端点 | 说明 | 状态 |
| --- | --- | --- |
| `GET /concepts` / `GET /relations` | 跨章聚合概念（含投影 mastery）/关系（含纠正覆盖层） | Prototype |
| `POST /relations/:rid/corrections` | 关系纠正 confirm/reject/retype；幂等；纠正不被再生成覆盖 | Prototype |

### 今日推荐 `/api/today`（PR #15）

| 端点 | 说明 | 状态 |
| --- | --- | --- |
| `GET /` | 确定性派生 1 主 + ≤2 备选（到期复习>悬崖>薄弱>继续阅读）；空态 primary=null | Prototype |
| `POST /state` | dismissed/snoozed(+4h 或 untilIso)/completed；只调展示，不动学习事实 | Prototype |

### 项目通知 `/api/notices`（PR #16）

| 端点 | 说明 | 状态 |
| --- | --- | --- |
| `GET /`（`?bookId=`） | 项目通知列表（createdAt 降序），生成/解析四处挂钩产生 | Prototype |
| `POST /:id/read` | 幂等已读；404 notice_not_found | Prototype |

### Agent `/api/agent`

turns 四端点见 [agent-architecture.md](agent-architecture.md) §4.3（Integrated）；`POST /book-chat` 为 admin 参考端旧合同（Prototype）。

### LLM 代理 `/v1` + `/api`

OpenAI 兼容转发 + 审计日志，密钥不出服务端（Integrated）。

## 2. 领域对象对照 docs/product/04

| 产品对象 | 实现 | 状态 |
| --- | --- | --- |
| `Document` / `DocumentUnit` | `documents/`（documentStore + 虚拟页 + 内容哈希） | Integrated |
| `SourceAnchor` | `books/bookTypes.ts` SourceAnchor（sourceId/文件名/页码区间/摘录） | Integrated |
| `Book` / `Chapter` / `Block` | `books/`（状态机 proposal/generating/partial/ready/error，章节各自生成状态） | Integrated |
| `Conversation` / `Message` | `agent/runtime/turnStore.ts`（turn + 事件持久化，文件型） | Integrated |
| `LearningEvent` | 以 quizAttempts / 复习记录 + 证据链承载（未单列事件表） | Prototype |
| `LearningEvidence` | `learning/learningEvidenceService.ts`（HMAC、版本化、outbox） | Integrated |
| `Concept` / `ConceptRelation` | 块内 `concept`/`ConceptRelation` 随书生成；**无独立端点** | Prototype |
| `ConceptState` | `masteryProjector` 投影读模型（未验证/学习中/已掌握/待复习） | Integrated |
| `ReviewItem` | `books/schedule.ts` + `review/due` | Integrated |
| `LearningProject` | `projects/projectMapper.ts` 聚合 DTO（PR #13） | Prototype |
| `TodayRecommendation` | `today/todayRecommendation.ts` 确定性派生 + todayStore（PR #15） | Prototype |
| `ProjectNotice` | `notices/noticeService.ts` + 生成/解析挂钩（PR #16） | Prototype |
| 概念关系纠正 `ConceptRelationCorrection` | 覆盖层 `concepts/conceptGraph.ts`（PR #14） | Prototype |

## 3. 缺口与实施顺序

四个缺口按 docs/product/06 §4 的拆分精神逐 PR 推进，每 PR：先在本文档冻结合同 → 服务端实现 + 合同测试 → entry 联调另排切片。

### PR-A 学习项目聚合 DTO（docs/product/04 §2）✅ 已完成（PR #13）

合同（2026-09-03 冻结，`feat/projects-dto` 实施）：

- `GET /api/projects` → `{ version: '1', projects: LearningProjectDto[] }`，排序：`lastLearnedAt` 降序（空则 `createdAt`，再空按 `projectId` 字典序），确定性可测试；
- `GET /api/projects/:id` → `{ version: '1', project: LearningProjectDto }`；不存在返回 `404 { error: 'project_not_found' }`；
- 首版 `projectId === bookId`（一书一项目），`owner` 为当前单用户 actor。

`LearningProjectDto`（`version: '1'`）字段：`projectId`、`owner{userId,workspaceId}`、`title`、`goal`、`learnerLevel`、`documentIds[]`、`bookId`、`status`（学习书状态机原值）、`createdAt`、`updatedAt`、`lastLearnedAt|null`（最近学习行为时间）、`progress{chaptersReady,chaptersTotal,completion|null}`（复用 `deriveCompletion`）、`actions{canRead,hasPendingGeneration,dueReviewCount}`、`notices{unreadCount}`（PR-D 落地前恒 0）。

读取时由 Book + 学习状态组合生成，不迁移单表；客户端只消费该 DTO，不自行猜测资源关联。
### PR-B 概念图 API 与纠正（docs/product/04 §8，M5）✅ 已完成（PR #14）

合同（2026-09-03 冻结，`feat/concept-graph-api` 实施）：

- `GET /api/books/:id/concepts` → `{ version:'1', concepts: [{ id,label,description,chapterId,blockId, learningState, mastery|null }] }`：跨章聚合 concept 块内概念；`mastery` 来自掌握投影读模型（无投影为 null），`learningState` 为块内存储值；
- `GET /api/books/:id/relations` → `{ version:'1', relations: [...] }`：聚合全部 concept 块关系（含 `chapterId`/`blockId`），**应用纠正覆盖层**——已确认纠正优先于生成原值，原始记录不落改、保留供审计；
- `POST /api/books/:id/relations/:rid/corrections` → `201 { version:'1', correction }`；body `{ action: 'confirm'|'reject'|'retype', suggestedType?, note? }`。错误：`404 book_not_found` / `404 relation_not_found` / `400 invalid_correction`（retype 缺 suggestedType 或类型非法）。幂等：同 relation+action+suggestedType 重复提交返回 `200` 与既有纠正，不重复记账；
- 纠正匹配：优先 `relationId`，再生成后 ID 变化时按 `(sourceId,targetId)` 对回退匹配——纠正不被再生成覆盖；
- **关系类型沿用生成端现行五类**（`前置/包含/相似/对比/应用`）。docs/product/04 §8 的英文受控类型（depends_on/part_of/…）与现行类型表的映射迁移属产品+后端共同评审事项（docs/product/README §4），不在本 PR。

普通 Chat 在结构上不可写关系：不为纠正注册任何 Agent 工具（沿用能力/工具权限模型）。

### PR-C 今日推荐服务端化（docs/product/04 §10.1，M6）✅ 已完成（PR #15）

合同（2026-09-03 冻结，`feat/today-recommendation` 实施）：

- `GET /api/today` → `{ version:'1', generatedAt, primary: TodayRecommendationDto|null, alternatives: TodayRecommendationDto[] }`（备选 ≤2）；无可推荐时 `primary=null`（空态）；
- `POST /api/today/state` → body `{ recommendationId, state: 'dismissed'|'snoozed'|'completed' }`，`200 { version:'1', recommendationId, state }`；非法 body `400 invalid_request`。拒绝/稍后/完成只调展示状态，**不改变任何掌握状态**；
- 推荐派生**零 LLM、确定性**：优先级 到期复习 > 遗忘悬崖 > 薄弱巩固 > 继续阅读（信号沿用 `learning/suggestions.ts` 与 `learnerProfile.ts`）；同优先级内按最近学习降序、bookId 字典序兜底——同输入同输出；
- `TodayRecommendationDto`：`id`（按日确定：`rec_<日期>_<action>_<bookId>[_<concept>]`，状态每日自然重置）、`action`（`review_due/review_cliff/review_weak/continue_reading`）、`bookId`、`conceptLabel|null`、`reason`（一句可读原因）、`evidenceRefs[]`（参与排序的块/概念引用）、`estimatedMinutes`、`expiresAt`（次日 00:00）、`rank`（primary/alternative）、`state`（active/dismissed/snoozed/completed，叠加自 todayStore）；
- 状态持久化：`server/data/today-state.json`（按推荐 ID 记录 dismissed/snoozed(until)/completed）；snoozed 默认 +4 小时，可用 `untilIso` 指定；
- entry 端切换数据源另排切片，兼容窗口内保留本地派生作断网降级。

### PR-D 项目通知（docs/product/04 §10.2，M6）✅ 已完成（PR #16）

合同（2026-09-03 冻结，`feat/project-notices` 实施）：

- `GET /api/notices` → `{ version:'1', notices: ProjectNoticeDto[] }`（`createdAt` 降序，`id` 字典序兜底；`?bookId=` 过滤）；与今日推荐分别排序、分别读取；
- `POST /api/notices/:id/read` → `200 { version:'1', notice }`；不存在 `404 notice_not_found`；重复已读幂等（返回现状）；
- `ProjectNoticeDto`：`version:'1'`、`id`、`kind`（`chapter_failed/chapter_ready/book_ready/parse_failed`）、`severity`（`info/error`）、`message`（用户可读文案）、`target{bookId?,chapterId?,documentId?,fileName?}`、`createdAt`、`readAt|null`；
- 生成挂钩：章节生成失败/成功、全书就绪、来源解析失败四处；去重键（如 `chapter_failed:<bookId>:<chapterId>`）在通知未读期间抑制重复——重试失败不刷重复横幅；
- 通知**不参与**掌握投影、不修改任何学习事实；PR-A 的 `notices.unreadCount` 占位自本 PR 起由 `NoticeService.unreadCountByBook()` 真实填充；
- 存储：`server/data/notices.json`。

## 4. 明确不做

- 生产账户、数据库、多租户、部署（当前文件存储 + 单用户 `local-user` 不变）；
- docs/product/06 §5 首版不做清单：多资料合并学习书、OCR/网页/音视频、全局跨书知识图、自由图编辑器、网页搜索/MCP/Skills/多 Agent 协作、多人协作/社区/积分、Android/iOS 端；
- 多 Agent 编排架构（见 [agent-architecture.md](agent-architecture.md) §7）。

## 5. 合同测试基线

沿用 docs/product/04 §13 最低合同测试，新端点一律补齐：写入幂等重试、稳定错误码、成功/空/部分成功/失败/恢复五态、与 entry 客户端测试同形夹具。专项：纠正不被再生成覆盖（PR-B）、同输入同输出且理由可追溯到证据 ID（PR-C）、通知不参与掌握计算（PR-D）。
