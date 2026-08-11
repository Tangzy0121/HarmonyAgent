# Web 原型移动端视觉基线

本目录记录 2026-08-06 从 `admin` Web 原型实际运行页面采集的移动端截图，供 HarmonyOS ArkUI 迁移和逐页视觉验收使用。

## 采集约束

- 原型入口：`admin`
- 采集地址：`http://127.0.0.1:5173/`
- 视口：390 × 844 px
- 截图类型：首屏视口截图
- 参考优先级：当前 Web 原型运行截图 > 迁移规范中的结构说明 > 归档的最初黑白版本
- 这些截图用于确认空间、排版、色彩、材质和控件关系；ArkUI 实现仍应使用鸿蒙原生组件与交互语义。

## 页面索引

| 编号 | 页面或状态 | 原型路由 | 截图 |
| --- | --- | --- | --- |
| 01 | 今日 | `#today` | [01-today.png](./01-today.png) |
| 02 | 学习地图 | `#learning` | [02-learning-map.png](./02-learning-map.png) |
| 03 | 知识库 | `#library` | [03-knowledge-library.png](./03-knowledge-library.png) |
| 04 | 文件理解 | `#library/ml-chapter-03` | [04-file-understanding.png](./04-file-understanding.png) |
| 05 | 学习解释 | `#learn/supervised-learning/explanation` | [05-learning-explanation.png](./05-learning-explanation.png) |
| 06 | 学习验证 | `#learn/supervised-learning/verification` | [06-learning-verification.png](./06-learning-verification.png) |
| 07 | 学习完成 | `#learn/supervised-learning/completion` | [07-learning-completion.png](./07-learning-completion.png) |
| 08 | 今日学习成果 | `#today/learning-result` | [08-today-outcome.png](./08-today-outcome.png) |
| 09 | 学习地图变化 | `#learning/supervised-learning/change` | [09-learning-map-change.png](./09-learning-map-change.png) |
| 10 | Agent 默认抽屉 | `#today` + Agent 75% 状态 | [10-agent-default.png](./10-agent-default.png) |
| 11 | Agent 全屏对话 | `#today` + Agent 全屏状态 | [11-agent-full.png](./11-agent-full.png) |

## 使用说明

后续每迁移一个页面，应至少对照检查以下五项：

1. 环境场是否保持连续，避免退化成普通白底卡片列表。
2. 大标题、正文和辅助信息的字号与对比层级是否一致。
3. 烟晶表面是否保留背景信息，同时具备足够的前景可读性。
4. 底部导航、Agent 入口和页面操作层是否形成清晰的深浅分层。
5. 页面首屏的信息密度、留白和主操作位置是否与截图相符。

> 注：Agent 全屏截图左上角的黑色矩形是自动化采集时的按钮焦点态，不是默认静态视觉的一部分。
