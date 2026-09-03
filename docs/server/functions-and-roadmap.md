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
| `LearningProject` | **缺**：以 books 列表充当项目视图，无聚合 DTO | Planned |
| `TodayRecommendation` | **缺服务端合同**：entry 端本地派生 + `learner/suggestions` 部分覆盖 | Planned |
| `ProjectNotice` | **缺**：项目任务状态无独立通知对象 | Planned |
| 概念关系纠正 `ConceptRelationCorrection` | **缺** | Planned |

## 3. 缺口与实施顺序

四个缺口按 docs/product/06 §4 的拆分精神逐 PR 推进，每 PR：先在本文档冻结合同 → 服务端实现 + 合同测试 → entry 联调另排切片。

### PR-A 学习项目聚合 DTO（docs/product/04 §2）

合同（2026-09-03 冻结，`feat/projects-dto` 实施）：

- `GET /api/projects` → `{ version: '1', projects: LearningProjectDto[] }`，排序：`lastLearnedAt` 降序（空则 `createdAt`，再空按 `projectId` 字典序），确定性可测试；
- `GET /api/projects/:id` → `{ version: '1', project: LearningProjectDto }`；不存在返回 `404 { error: 'project_not_found' }`；
- 首版 `projectId === bookId`（一书一项目），`owner` 为当前单用户 actor。

`LearningProjectDto`（`version: '1'`）字段：`projectId`、`owner{userId,workspaceId}`、`title`、`goal`、`learnerLevel`、`documentIds[]`、`bookId`、`status`（学习书状态机原值）、`createdAt`、`updatedAt`、`lastLearnedAt|null`（最近学习行为时间）、`progress{chaptersReady,chaptersTotal,completion|null}`（复用 `deriveCompletion`）、`actions{canRead,hasPendingGeneration,dueReviewCount}`、`notices{unreadCount}`（PR-D 落地前恒 0）。

读取时由 Book + 学习状态组合生成，不迁移单表；客户端只消费该 DTO，不自行猜测资源关联。
### PR-B 概念图 API 与纠正（docs/product/04 §8，M5）

concepts/relations 读取端点；受控关系类型（`depends_on/part_of/causes/contrasts_with/applies_to/extends`），`related` 不作兜底；`ConceptRelationCorrection` 写入与投影优先级——已确认纠正不被再生成覆盖，原始记录保留供审计。普通 Chat 在结构上不可写（沿用能力/工具权限模型）。

### PR-C 今日推荐服务端化（docs/product/04 §10.1，M6）

服务端确定性排序：到期复习 > 遗忘悬崖 > 进行中 > 最新证据（沿用 `learning/suggestions.ts` 信号并上移为正式合同）。返回一条主推荐 + 最多两条备选，含动作、原因、项目、预计时间、有效期；模型只生成解释文案，不改业务优先级。entry 端切换为消费服务端合同，兼容窗口内保留本地派生作断网降级。

### PR-D 项目通知（docs/product/04 §10.2，M6）

`ProjectNotice`：解析/生成/失败/恢复等项目任务状态挂钩生成；已读与横幅数据源；与今日推荐分别排序、分别读取；不引用、不修改掌握状态。

## 4. 明确不做

- 生产账户、数据库、多租户、部署（当前文件存储 + 单用户 `local-user` 不变）；
- docs/product/06 §5 首版不做清单：多资料合并学习书、OCR/网页/音视频、全局跨书知识图、自由图编辑器、网页搜索/MCP/Skills/多 Agent 协作、多人协作/社区/积分、Android/iOS 端；
- 多 Agent 编排架构（见 [agent-architecture.md](agent-architecture.md) §7）。

## 5. 合同测试基线

沿用 docs/product/04 §13 最低合同测试，新端点一律补齐：写入幂等重试、稳定错误码、成功/空/部分成功/失败/恢复五态、与 entry 客户端测试同形夹具。专项：纠正不被再生成覆盖（PR-B）、同输入同输出且理由可追溯到证据 ID（PR-C）、通知不参与掌握计算（PR-D）。
