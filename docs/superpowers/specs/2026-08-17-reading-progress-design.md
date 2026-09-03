# 阅读进度 + 全书完成度 设计规格

**状态：** 已获用户批准（DeepTutor 追赶总计划 Sprint F，2026-08-17）
**日期：** 2026-08-17
**分支：** `codex/reading-progress`
**对标：** DeepTutor v1.5.13「阅读进度真实记录（visited/bookmarked pages + 完成度分数 + 薄弱章节）」

## 1. 目标

真实记录每本书的章节阅读进度（已读/书签/最近阅读时间），派生全书完成度分数与薄弱章节，在学习仪表盘与阅读器呈现。零新增 LLM 调用。

## 2. 范围

**范围内**
- server：`StoredBook.readingProgress` 持久化；`POST /api/books/:id/progress`（visit/bookmark/unbookmark，幂等）；`GET /api/books/:id/completion`（完成度 + 薄弱章节派生）
- admin：真实书切章自动上报已读（防抖 800ms）；章节导航书签切换；仪表盘新增「完成度」区（最近阅读书的进度条 + 薄弱章节带「去复习」）；今日页学习数据卡片附「继续读第 X 章」

**范围外**
- 跨书完成度汇总视图、 block 级阅读进度、阅读时长统计、书签独立列表页、mock 书进度行为

## 3. 数据模型

```ts
interface ReadingProgress {
  visitedChapterIds: string[]            // 首次已读顺序
  bookmarkedChapterIds: string[]
  lastReadAt: Record<string, string>     // chapterId -> ISO 最近阅读时间
}
```

`StoredBook.readingProgress?: ReadingProgress`（可选，存量书缺省为空空进度）。

## 4. 派生规则（server/src/books/readingProgress.ts，纯函数）

- `applyProgressEvent(book, { chapterId, action }, nowIso)`：visit 幂等加入 visited 并刷新 lastReadAt；bookmark/unbookmark 幂等增删。
- `deriveCompletion(book)`：
  - `completionScore = 0.4 × (visited/total) + 0.6 × avgMastery`；total=0 → 0。
  - avgMastery：全书概念块中有答题记录的概念掌握度（复用 computeMastery + masteryBoard 归因规则：conceptId 空串只算自身块）均值；无记录概念不参与，全无记录时 avgMastery=0。
  - `weakChapters`：按章归并——章内概念（有记录）均值 < 0.5 视为薄弱，升序取前 3，带 chapterId/title/mastery；全无记录 → 空数组。

## 5. API

- `POST /api/books/:id/progress`，body `{ chapterId, action: 'visit'|'bookmark'|'unbookmark' }`
  - 400 invalid_request / 404 book_not_found / 409 chapter_not_found / 200 `{ progress, completion }`
- `GET /api/books/:id/completion` → 200 `{ completion }` / 404

## 6. admin 行为

- `chapterVisitReporter`：InteractiveBookPage 真实书切换章节 → 防抖 800ms POST visit；失败静默（不阻断阅读）。
- 章节导航头部加书签按钮（已书签实心/未书签空心），点击 POST bookmark/unbookmark，乐观更新。
- 仪表盘「完成度」区：App 取 lastReadAt 最近的真实书，GET completion 传入 LearningDataPage；无阅读记录不渲染该区。
- 今日页学习数据卡片：有最近阅读书时副标题改「继续读《书名》第 X 章 · 已连续学习 N 天」。

## 7. 验收标准

1. 刷新/重开书后已读与书签仍在（持久化）。
2. 仪表盘完成度分数与章节已读数、概念掌握一致（手算可对）。
3. 薄弱章节「去复习」跳回来源书对应章。
4. 空书/零进度不报错、不渲染完成度区。
5. mock 书行为零变化；既有 422/314 测试全绿。
