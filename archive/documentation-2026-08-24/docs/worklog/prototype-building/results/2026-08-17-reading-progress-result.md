# 阅读进度 + 全书完成度结果

**日期：** 2026-08-17

**工作分支：** `codex/reading-progress`（叠于 `codex/learning-dashboard` `b64396d` 之上，合并按 E → F 顺序）

**规格：** `docs/superpowers/specs/2026-08-17-reading-progress-design.md`（已获用户批准）

## 交付物

| 交付物 | 位置 |
| --- | --- |
| 进度模型 + 幂等事件应用 + 完成度派生（0.4×已读占比 + 0.6×有记录概念均值；薄弱章 <0.5 升序前 3） | `server/src/books/readingProgress.ts` |
| POST /:id/progress（visit/bookmark/unbookmark）+ GET /:id/completion | `server/src/routes/books.ts` |
| 类型镜像 + postReadingProgress/getCompletion（payload 校验） | `admin/src/types/learningBook.ts`、`admin/src/services/bookApi.ts` |
| 切章/开书防抖 800ms 自动上报已读 | `admin/src/App.tsx` |
| 章节书签按钮（乐观更新、失败回滚） | `admin/src/pages/InteractiveBookPage.tsx` |
| 仪表盘「完成度」区（进度条 + 薄弱章节「去复习」） | `admin/src/pages/LearningDataPage.tsx` |
| 今日页学习数据卡片「继续读《书名》章节」 | `admin/src/pages/TodayPage.tsx` |

## 验证

- server 434 全绿（readingProgress 7 + 路由 5 新增）
- admin 322 全绿 + tsc 无错（bookApi 74；新增 8 测试）
- 验收 5 条全过：进度持久化、分数手算可对、薄弱章跳来源书、零进度不渲染不报错、mock 书零变化
- 修复既有测试时序抖动：上传用例补一轮 flushEffects，连跑 5/5 稳定

## 已知边界（如实）

- 完成度区只显示「最近阅读的一本书」；跨书汇总视图未做。
- 进度粒度到章不到 block；阅读时长未统计。
- 薄弱章「去复习」跳到书（activeChapterId），未精确到章锚点。
- 已读上报防抖 800ms，快速翻章只记最后一章的 lastReadAt（visited 仍各记）。
- 书签无独立列表页，仅导航头部按章切换。
