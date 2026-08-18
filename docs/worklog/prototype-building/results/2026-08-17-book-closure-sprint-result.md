# 互动学习书 MVP 闭环收尾结果

**日期：** 2026-08-17

**工作分支：** `codex/interactive-learning-book-mvp`（commit `1662e38`，已推送 origin）

**规格：** `docs/superpowers/specs/2026-08-09-interactive-learning-book-mvp-design.md` §14

## 本轮交付

| 交付物 | 位置 |
| --- | --- |
| 真实书进知识地图（验收 #10） | `admin/src/domain/bookMapProjection.ts`，接线 `LearningMapPage.tsx` / `App.tsx` |
| 今日页接真实数据（验收 #11） | `admin/src/domain/todayNextStep.ts`，接线 `TodayPage.tsx` / `App.tsx` |
| 真实书用户笔记（验收 #14 红线） | server `POST/DELETE /api/books/:id/notes`（`routes/books.ts`）+ admin `BlockNotesSection.tsx` / `bookApi.ts` |
| 本 sprint 计划 | `docs/superpowers/plans/2026-08-17-book-closure-sprint.md` |
| E2E 脚本与结果 | 本地 `HelpCC/book-closure-sprint/e2e/`（不入库） |

## 测试基线

- server：377 全绿（新增 `bookNotes.test.ts` 8 例）
- admin：292 全绿（新增 bookMapProjection 6 例、todayNextStep 13 例、bookApi 笔记 5 例）

## API 级 E2E（真实 DeepSeek，2026-08-17）

20 页文本型 PDF（pdf-lib 程序生成，英文内容降级路径）→ 15/15 通过 + 重启恢复人工核对：

- 解析：200，pageCount=20（#1）
- 提案：201，4 章（#2）；改名后 PUT 200、confirm 200，生成后首章标题即改名结果（#3）
- 渐进生成：ch-1→ch-4 全部 ready（9/10/8/8 块），第一章先可读（#4）
- 每章均含 explanation + citation + quiz（#5）；citation 摘录非空且服务端子串硬校验通过（#6 机制侧）
- 答题：201，evidence + mastery（chapter 0.5 / concept 0.5，单次封顶）（#9）
- 笔记：add 201 → 持久化 → delete 204 → 清空（#14 机制）
- 重启 server 后 GET：书 status=ready、4 章块数不变、改名标题、attempt/evidence 齐全、generationJobs 全 ready（#13）
- 单章失败独立重试（#12）与章节追问隔离/来源卡（#7/#8）：由 server/admin 测试套件覆盖（SSE 事件序、grounded 上下文预算、来源卡片）

## 规格 §14 验收结论

| # | 结论 | 依据 |
| --- | --- | --- |
| 1–5 | ✅ 完成 | 上述 E2E |
| 6 | ⚠️ 机制完成 | 摘录可核对 + 页码定位；原文在线阅读层按设计 §9 延后 |
| 7–8 | ✅ 完成 | 测试覆盖（上下文白名单/预算、来源卡片） |
| 9 | ✅ 完成 | 上述 E2E |
| 10–11 | ✅ 完成（本轮补齐） | bookMapProjection / todayNextStep + 接线；UI 走查待真机/浏览器 |
| 12 | ✅ 完成 | 测试覆盖（章状态机 + 僵死 job 翻 error） |
| 13 | ✅ 完成 | 上述重启核对 |
| 14 | ✅ 完成 | user_note 不入生成白名单；ready 章 409 拒重新生成；E2E 笔记增删 |

## 遗留（如实）

- `2026-08-10-real-book-generation.md` Task 7 的 Step 2–6（浏览器端 390×844 走查、citation 锚点跳转、axe a11y、负路径 UI、独立复审）未做，checkbox 保持未勾。
- 地图/今日/笔记的 UI 在浏览器/真机的人工走查未做（本轮证据为域测试 + API E2E）。
- ArkTS 端（entry/）未迁移上传/提案/生成/地图，默认 fixture。
