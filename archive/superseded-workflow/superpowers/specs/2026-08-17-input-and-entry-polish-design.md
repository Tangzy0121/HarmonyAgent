# 输入与入口打磨（EPUB / spine 成本估算 / starter 建议）设计规格

**状态：** 已获用户批准（DeepTutor 追赶总计划 Sprint G，2026-08-17）
**日期：** 2026-08-17
**分支：** `codex/input-and-entry-polish`（从主线 9f4b5a9 拉）
**对标：** DeepTutor v1.5.13 EPUB 格式 + spine 确认前逐章成本估算 + 基于记忆的 starter 建议

## 1. 目标

三个独立小项：①EPUB 纳入多格式输入；②提案确认前展示逐章 token 成本估算；③今日页给出三条模板化学习建议。仅 G2/G3 涉及界面；零新增 LLM 调用。

## 2. G1 EPUB 输入

- server `documents/epubParser.ts`：EPUB=zip（OPS XHTML），用 jszip（升为运行时依赖）解包，按 spine 顺序抽取 XHTML 去标签得纯文本；目录缺省/损坏 → `docx_unreadable` 同款错误码 `epub_unreadable`；正文 <200 非空白字符 → `doc_no_text`；>45,000 字 → `doc_too_long`。
- 路由分发：扩展名 `.epub` 优先、Content-Type `application/epub+zip` 兜底，接入既有虚拟分页管线（1500 字/页）。
- format 落盘：`SourceDocument.format` 与 `StoredDocumentMeta.format` 增 `'EPUB'`；admin 类型镜像。
- admin UploadBookSheet 接受 `.epub`，文案同步。

## 3. G2 spine 成本估算

- server：提案确认响应（或 `GET /api/books/:id/estimate`）返回逐章估算：`estimatedTokens = 源文档页均 tokens + 每章生成预算(6000)`，合计随章数汇总；纯算术（页数 × 经验系数），零 LLM。倾向：内联进 `POST /:id/confirm` 前的 GET /:id 响应太重——定 `GET /api/books/:id/estimate`，返回 `{ chapters: [{ chapterId, title, estimatedTokens }], totalTokens }`。
- admin：BookProposalPage 真实书提案页显示逐章估算与合计（确认按钮旁）；mock 提案页不显示。

## 4. G3 starter 建议

- server `GET /api/learner/suggestions`：从 learnerProfile 派生 3 条模板化建议，优先级：遗忘悬崖概念（「复习《书名》· 概念名，已 N 天没碰」）> 待复习（mastery<0.3）> 最近活跃书继续学；不足 3 条按实际返回（可为 0 条）；零 LLM。
- admin：今日页学习数据卡片下方列建议（有点击跳来源书）；无建议不渲染。

## 5. 验收

1. epub 上传→提案→生成全链路与 md/docx 一致；损坏 epub 报 `epub_unreadable`。
2. 提案页逐章估算合计 = 各章之和，数字只读不参与计费。
3. 有悬崖概念时今日页首条建议即悬崖复习；无数据时无任何建议 UI。
4. 既有测试全绿。
