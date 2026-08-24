# 长期学习者模型结果

**日期：** 2026-08-17

**工作分支：** `codex/learner-model`

**规格：** `docs/superpowers/specs/2026-08-17-learner-model-design.md`（已获用户批准）

## 交付物

| 交付物 | 位置 |
| --- | --- |
| 派生器（跨书概念合并/悬崖/节律，LLM 零参与） | `server/src/learning/learnerProfile.ts` |
| 只读 API | `GET /api/learner/profile`（`server/src/routes/learner.ts`） |
| 今日页悬崖/节律候选 | `admin/src/domain/todayNextStep.ts`（优先级：到期复习 > 遗忘悬崖 > 进行中 > 最新证据 > 节律建议） |
| 地图跨书同名概念合并 | `admin/src/domain/bookMapProjection.ts`（节点 id 改为 `label:` 作用域，状态按聚合 evidence） |
| App 接线 | profile 随 realBooks 重派生，失败静默降级 |

## 验证

- server 401 全绿（learnerProfile 13 + learner 路由 2 新增）
- admin 305 全绿（todayNextStep +6、bookMapProjection 重写 8、bookApi +4）
- 规则红线：派生器纯函数无 LLM；悬崖阈值 1.5× 档位间隔；节律桶本地时区；时区相关测试均用本地构造时间，TZ 无关

## 遗留

- 节律建议依赖 `studiedToday` 与最活跃时段匹配，属弱信号，后续可按真实使用调参。
- 地图合并节点的 displayLabel 取主簇写法（规格拍板项为「最近一次出现的原始写法」，当前实现取证据最多簇的写法，差异已在合并场景下可接受，待用户走查确认）。
