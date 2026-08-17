# 薄弱概念智能出题结果

**日期：** 2026-08-17

**工作分支：** `codex/adaptive-quiz`（叠于 `codex/reading-progress` `5a5d998`，合并顺序 E→F→H）

**规格：** `docs/superpowers/specs/2026-08-17-adaptive-quiz-design.md`（已获用户批准）

## 交付物

| 交付物 | 位置 |
| --- | --- |
| 生成 prompt + 归一化（excerpt 子串硬校验，空白不敏感） | `server/src/books/adaptiveQuizPrompt.ts` |
| POST /:id/concepts/:cid/quiz（404/409×2/503/502 重试 1 次/201 落块） | `server/src/routes/books.ts` |
| QuizBlock.origin 'adaptive' 标记（双端镜像） | `bookTypes.ts` / `types/learningBook.ts` |
| 仪表盘薄弱 Top5/悬崖行「出题练习」（pending 防重、上限/失败提示、成功跳书） | `LearningDataPage.tsx` / `App.tsx` / `bookApi.ts` |

## 验证

- server 455 全绿 + tsc 零错误（新增 21：prompt 13 + 路由 8；含答题链路兼容用例——生成块走 POST /:id/attempts 正常）
- admin 331 全绿 + tsc 零错误（新增 9：bookApi 6 + 页面 3）
- 验收 5 条全过：出题落章末可答可诊断可调度、3 道上限 409、citation 非子串重试后 502 不落脏块、零 key 503 明确报错、mock 书无入口

## 已知边界（如实）

- **与总计划的偏差**：生成题未入 userCards/bank（Sprint D 未合并且不在本支线），改为落章内正式 quiz 块；D 合并后这些题自然进题库派生读模型，无需迁移。
- 缺 LLM_API_KEY 返回 503 adaptive_quiz_not_configured（照抄既有生成类路由口径）。
- 一次一题、仅选择题；题目语义去重未做（同概念第 2/3 题可能相近，靠 prompt 里的历史错题规避）。
- 顺手修复 F 遗留：BooksLogEvent 缺 reading_progress 类别导致 server tsc 红（vitest 不查类型未暴露）。
- 页面交互态（loading/error）无点击级测试（admin 测试基建仅 renderToStaticMarkup），渲染存在性已覆盖。
