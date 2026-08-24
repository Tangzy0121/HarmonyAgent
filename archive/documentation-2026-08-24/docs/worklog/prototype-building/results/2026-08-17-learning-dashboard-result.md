# 学习仪表盘结果

**日期：** 2026-08-17

**工作分支：** `codex/learning-dashboard`

**规格：** `docs/superpowers/specs/2026-08-17-learning-dashboard-design.md`（已获用户批准）

## 交付物

| 交付物 | 位置 |
| --- | --- |
| 活跃日序列（近 30 天 YYYY-MM-DD 升序，localDayKey 补零） | `server/src/learning/learnerProfile.ts` |
| 视图模型（掌握四桶/薄弱 Top5/遗忘悬崖/30 格热力，纯派生） | `admin/src/domain/learningDashboard.ts` |
| 学习数据页（坚持/掌握/节律三区 + 空态引导） | `admin/src/pages/LearningDataPage.tsx` + `index.css` |
| 今日页学习数据卡片（streak 摘要入口） | `admin/src/pages/TodayPage.tsx` |
| `#learning-data` hash 路由（刷新可恢复、popstate 同步） | `admin/src/App.tsx` |
| 类型/校验镜像 activeDayKeys | `admin/src/types/learnerProfile.ts`、`admin/src/services/bookApi.ts` |

## 验证

- server 422 全绿（learnerProfile 新增 3 断言：长度/升序/格式）
- admin 314 全绿 + tsc 无错（learningDashboard 9 例新测试；todayNextStep 夹具同步）
- 规格验收 4 条全过：streak 显示、悬崖「去复习」跳来源书（openRealBook）、空态无 mock 泄漏、`#learning-data` 刷新可恢复

## 已知边界（如实）

- 热力图为 30 格横条（15×2 网格），仅活跃/未活跃两态，不做事件量深浅。
- 悬崖「去复习」取概念首个来源书；多来源书的选择 UI 未做。
- 薄弱 Top5 仅含有答题记录的概念（attempts>0）；无记录概念归入「暂无记录」桶。
- 节律分布为事件计数条形，日均事件保留 1 位小数；时区按用户本地（与 server 一致）。
- 页面无独立返回键，经底部导航/「去复习」离开（与既有 destination 页一致）。
