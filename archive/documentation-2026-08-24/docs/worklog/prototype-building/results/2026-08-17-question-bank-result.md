# 学习沉淀闭环（题库 + 对话沉淀）结果

**日期：** 2026-08-17

**工作分支：** `codex/question-bank`

**规格：** `docs/superpowers/specs/2026-08-17-question-bank-design.md`（已获用户批准）

## 交付物

| 交付物 | 位置 |
| --- | --- |
| 题库派生读模型（错题优先、掌握度升序） | `server/src/books/bank.ts` |
| `GET /api/books/:id/bank`、`POST /api/books/:id/cards`（≤100 张） | `server/src/routes/books.ts` |
| 用户问答卡复习（due 收录 + 轻量调度自评） | `schedule.ts` / review result 路由 |
| 看板升级「题库与掌握度」（原地重练/自评） | `admin/src/components/book/MasteryBoardSheet.tsx` |
| Agent 回答「存为笔记 / 存入题库」 | `admin/src/components/AgentDrawer.tsx` + App capture 处理器 |

## 验证

- server 435 全绿（bank 派生 6 + 路由 7 新增）
- admin 311 全绿 + tsc（getBank/addCard 6 新增；看板新标题断言同步）
- 红线锁死：cards 后续章生成不动（测试）、零 LLM（派生/拼装全规则）、重练走既有 attempts 链路

## 已知边界（如实）

- userCards 自评只更新复习调度，不产出学习证据（不经 evidenceService，属规格内轻量路径）。
- 「存为笔记」挂当前章首块（笔记是块级模型），回答原文（含引用标记）原样保存。
- 题库首版按书组织，无跨书聚合视图（跨书掌握度由学习者模型覆盖）。
