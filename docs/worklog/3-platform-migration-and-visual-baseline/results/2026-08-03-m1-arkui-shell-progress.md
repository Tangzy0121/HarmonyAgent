# M1 ArkUI 原生壳与“今日”垂直切片进展

## 当前结论

M1 已完成首轮原生代码落地，并通过 DevEco Studio 6.1.1.300 自带 Hvigor 的完整干净构建，但尚未达到里程碑退出条件。390 × 844 基准截图、真机或官方模拟器运行、性能记录和最终视觉对齐仍待设备启动及签名配置完成后执行。

本轮不再使用 `prototype-building` 中的早期黑白稿作为视觉来源。该批图片已归档至 `docs/worklog/archive/prototype-building-original-monochrome/`，当前实现以 `admin` 现有页面源码、语义 Token 和《跨平台客户端迁移方案》为依据。

## 已完成

- 使用 `@Entry` + `@ComponentV2` 建立 `Index` 与 `AppRoot`；
- 建立浅灰紫连续环境，并让根容器扩展至系统顶部与底部安全区域；
- 拆分顶部身份栏、三目的地底部导航、66vp 桃色 Agent 入口与品牌花形标记；
- 迁移当前 Today 标题、日期、焦点学习面板和两条行动项；
- 使用 `@Local`、`@Param`、`@Event` 完成页面切换与交互事件边界；
- 内容面板使用不透明实体表面；烟晶仅用于短控件，并先采用显式半透明降级 Token；
- 未接入 WebView、DOM 或浏览器运行时；
- 新增 `scripts/verify-m1.mjs`，用于检查 M1 文件、关键结构、当前文案、材质边界和 WebView 禁用项。
- 修正原有数据库层的 ArkData Kit 导入和受限异常抛出写法，使工程适配当前 API 24 SDK；
- 为 Ability 色彩模式设置和 Agent 数据发送补充异常边界；
- 使用 DevEco Studio 内置 Node 18.20.1、OHPM 6.1.2.285、Hvigor 6.24.4 完成 `clean` 与 `assembleHap`；
- 生成 `entry/build/default/outputs/default/entry-default-unsigned.hap`。

## 有意不包含

- 真实 Agent 会话；
- 学习流程、文件导入、学习地图和后端调用；
- 未经目标设备验证的实时背景模糊；
- 以占位页面冒充后续里程碑的完整功能。

## 待完成验收

1. 在 DevEco Studio 登录开发者账号并完成调试签名配置；
2. 启动 Pura 90 或其他手机模拟器，完成运行和 390 × 844 截图；
3. 核对状态栏、底部手势区、滚动、返回与生命周期；
4. 对照当前 Web 实现校准构图、字号、间距和烟晶层级；
5. 在目标真机或官方模拟器记录首屏、页面切换和滚动性能；
6. 仅在读写性和性能通过后评估启用原生实时模糊，否则保留当前实体降级。

## 验证状态

- 静态 M1 契约检查：可在仓库内执行；
- `git diff --check`：通过；
- ArkTS 编译：通过；
- 完整干净构建：通过，`BUILD SUCCESSFUL in 17 s 334 ms`；
- HAP：已生成未签名调试包；
- HDC：当前没有已连接或运行中的设备；
- 截图与真机性能：未执行，不计为完成。
