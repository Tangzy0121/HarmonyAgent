# 全页面方向光迁移结果

**日期：** 2026-07-24

**状态：** 已完成，待用户逐页精修确认。

## 交付结果

- 方向光材质已经从页面试点提升为 AppShell 全局环境。
- 今日首页、知识库继续使用已确认的高、中、低三层高度。
- 今日学习成果的大面积黑色卡片改为受光实体，轨道核心和推进操作保留近黑焦点。
- 文件理解的 Agent 阅读结果改为中性实体，资料封面继续作为小面积黑色视觉锚点。
- 学习解释、验证与完成页面获得统一背景光、顶部玻璃导航和底部玻璃操作区。
- 学习证据卡改为中性实体，关系中的当前焦点保留近黑节点。
- 学习地图获得方向性背景光与统一节点投影。
- 地图变化面板和证据卡改为分层玻璃与实体表面。

## 浏览器验收

以下路由已逐页打开并检查：

1. `#today`
2. `#today/learning-result`
3. `#library`
4. `#library/ml-chapter-03`
5. `#learn/supervised-learning/explanation`
6. `#learn/supervised-learning/verification`
7. `#learn/supervised-learning/completion`
8. `#learning`
9. `#learning/supervised-learning/change`

## 工程验收

- TypeScript 检查通过。
- Vite 生产构建通过。
- Git 差异检查通过。

## 当前边界

- 材质实验页保持独立，不继承正式页面全局材质。
- 本轮没有修改业务逻辑、模拟数据和页面结构。
- 当前完成的是全局一致性迁移，后续仍可按页面继续精修光照强度、文字对比和动效。
