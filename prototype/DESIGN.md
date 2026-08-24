---
name: loci Prototype
description: A mobile-only editorial learning prototype driven by minimalist typography, spacing and traceable content.
colors:
  ink: "#F3F2EE"
  ink-soft: "rgba(243,242,238,.66)"
  paper: "#161616"
  canvas: "#E9E9EE"
  screen: "#000000"
  surface-muted: "#202020"
  line: "rgba(243,242,238,.20)"
  peach: "#DD9A89"
  peach-soft: "#DD9A89"
  study-blue: "#93A9BE"
  study-mist: "#A9B3BB"
  study-stone: "#B8B0A4"
  agent: "#BCA9E9"
  success: "#8FC7A5"
  warning: "#D6B179"
  danger: "#DF938B"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Display, PingFang SC, HarmonyOS Sans SC, sans-serif"
    fontSize: "3.25rem"
    fontWeight: 360
    lineHeight: 0.93
    letterSpacing: "-0.065em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Display, PingFang SC, HarmonyOS Sans SC, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 390
    lineHeight: 1.08
    letterSpacing: "-0.045em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, HarmonyOS Sans SC, sans-serif"
    fontSize: "1rem"
    fontWeight: 430
    lineHeight: 1.75
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, HarmonyOS Sans SC, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 520
    lineHeight: 1.3
rounded:
  control: "999px"
  surface: "8px"
  panel: "0px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  section: "72px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.screen}"
    rounded: "{rounded.control}"
    padding: "0 18px"
  button-accent:
    backgroundColor: "{colors.peach}"
    textColor: "#18100E"
    rounded: "{rounded.control}"
    padding: "0 18px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 17px"
  project-row:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
    padding: "20px"
---

# Design System: loci Prototype

## Overview

**Creative North Star: "Editorial Study Index"**

`prototype/` 在保留旧 `admin/` 移动端气质的基础上，将视觉收敛为编辑式极简主义：固定手机画布、纯黑屏内背景、柔白文字和少量桃色学习动作；手机画布外仍保留银灰底色。Agent 只在明确上下文中出现。层级由字号、灰度、语义断行、细线和大块留白建立，不靠卡片堆叠或装饰材质。

结构像一张被认真整理过的学习桌：大块留白区分阶段，细线和字重承担层级，少量状态色只传达动作或风险。拒绝通用后台仪表盘、游戏化学习面板、文件管理器和全屏毛线图。

**Key Characteristics:**

- 仅移动端，画布最大宽度 480px。
- 柔白正文置于纯黑背景，普通内容尽量直接落在画布上。
- 大标题使用轻字重、紧行距和语义断行，正文舒展。
- 桃色表示学习主动作，紫色只属于 Agent。
- 右上角只保留 loci 标志；任务、列表和覆盖层主要依靠细线与留白区分。
- 不设计桌面版；宽屏只居中展示移动画布。

## Colors

主色策略是局部 Analogous Palette：中性色承担页面主体，相近明度的灰蓝、雾灰与暖石色只用于“今日”的独立学习目标卡片，Agent 紫只出现在明确的上下文动作中。

### Primary

- **Study Peach**：用于学习主动作、当前章节和重要定位，不用于装饰铺色。
- **Study Blue**：用于复习类目标卡片。
- **Study Mist**：用于继续学习类目标卡片。
- **Study Stone**：用于确认与决策类目标卡片。
- **Agent Violet**：只用于 Chat 入口、Agent 消息和作用域标识。

### Secondary

- **Evidence Green**：表示已经保存且可追溯的正式证据。
- **Recovery Amber**：表示需要关注但仍可继续的部分可用状态。
- **Action Red**：只表示不可恢复风险或失败。

### Neutral

- **Ink**：主文字和最强按钮。
- **Soft Ink**：说明、元数据和次要动作。
- **Paper**：正文与主要工作面。
- **Black Screen**：480px 手机画布内的唯一底色。
- **Silver Canvas**：仅用于手机画布外围。
- **Hairline**：列表、字段和结构边界。

**The Contained Palette Rule.** 相近明度、低饱和的色调只出现在彼此独立的学习目标卡片中，同一卡片始终保持单一纯色；列表、导航和覆盖层继续使用黑白中性色。

## Typography

**Display Font:** SF Pro Display / 系统无衬线
**Body Font:** SF Pro Text / 系统无衬线

**Character:** 单一系统字体家族保证跨端熟悉感。标题轻而大，正文克制，标签小而清晰；重要性通过字号与灰度表达，不依赖粗体。

### Hierarchy

- **Display**（360，48–57px，0.93）：一级页面标题，按语义控制在 1–3 行。
- **Page**（370，41–50px，0.98）：项目、章节和流程核心标题。
- **Headline**（390，28px，1.08）：区块与验证问题。
- **Title**（480，18–20px，1.2）：列表项目和任务名称。
- **Body**（430，16px，1.72）：正文与解释，最大宽度 72ch。
- **Label**（520，12px，1.3）：状态、来源、时间与操作提示。

**The Semantic Break Rule.** 大标题必须沿完整语义单元断行，不把短语拆在视觉上不自然的位置。中文不使用低于 350 的字重。

**The Mobile Reading Rule.** 阅读、Chat、来源和目录均使用移动端单栏或底部 Sheet，不出现桌面侧栏。

## Elevation

系统只以色调分层和细边界建立层级。所有页面、悬浮导航、覆盖层和可拖动面板都不使用投影、内阴影、文字阴影、模糊或高光。

### Flat Layer Vocabulary

- **Screen**：手机画布内使用纯黑底色，不叠加环境光或纹理。
- **Canvas**：手机画布外保留银灰底色。
- **Surface**：烟灰纯色块，通过明度差和 1px 细边界与画布分离。
- **Overlay**：更深的纯色面板配合遮罩，不使用模糊或投影。

**The Always Flat Rule.** 所有层级都用留白、分隔线、边界和纯色明度差表达，不模拟光源或景深。

## Components

### Buttons

- **Shape:** 胶囊形控制，最小高度 44px；内容卡片不沿用按钮圆角。
- **Primary:** 深色底用于页面唯一最高优先级动作。
- **Accent:** 柔桃色用于阅读或学习的下一步。
- **Hover / Focus:** 150–220ms 状态变化，焦点使用 2px 实线外环。
- **Secondary / Ghost:** 透明或暖灰底，不与主动作争夺对比。

### Chips

- **Style:** 默认使用文字与底部 1px 指示线；只有独立筛选控件才使用细边框。
- **State:** 文字始终说明含义，不只靠颜色表达筛选状态。

### Cards / Containers

- **Corner Style:** 内容色块最多使用 8px，覆盖层与普通列表不使用装饰圆角。
- **Background:** 普通内容直接落在黑色画布上；只有真正独立的学习项目或主推荐使用纯色色块。
- **Shadow Strategy:** 所有静态与浮动内容都不使用阴影。
- **Border:** 1px 低对比完整边框，不使用彩色侧条。
- **Internal Padding:** 16–24px，章节与正文区通过 48–72px 留白分段。

### Library Rows

学习库项目卡片只展示状态与最近时间、项目标题、章节进度、来源格式和一个恢复动作。学习目标与完整文件名留在项目详情，不在列表中重复；卡片高度保持紧凑，标题最多承担两行视觉空间。

### Create Flow

新建项目统一使用“来源、设置、确认”三步进度。每一步只保留一个页面问题：选择文件、设置目标与学习强度、确认章节。步骤标题、顶部元数据和操作按钮使用短文案；水平与深度各使用一行三列选择，避免六个选项纵向堆叠。确认页的章节只展示可编辑标题与预计时间，详细目标和概念留到项目详情。

### Inputs / Fields

- **Style:** 搜索使用 1px 描边胶囊；长文本字段只保留底部细线，标签置于字段上方。
- **Focus:** 深墨色边框与 2px 低透明焦点环。
- **Error / Disabled:** 错误同时给文字说明；禁用态降低对比但保持可读。

### Navigation

不设置常驻底部导航、Profile 入口或悬浮 Agent 入口。一级页面左上角使用两条不等长细线作为导航入口，打开后以全屏大字号菜单展示“今日、学习库、新建项目”；右上角保留 loci 标志。沉浸页使用顶部返回，Agent 仅在章节、概念等明确上下文中作为文字动作出现。

### Today Carousel

“今日”固定为单屏，不允许页面纵向滚动。学习目标使用原生横向滚动与 `scroll-snap` 切换，下一张卡片保留少量露出以提示方向。每个目标绑定固定的灰蓝、雾灰或暖石色，三者保持相近明度与饱和度，滑动本身不改变颜色。卡片使用接近参考图的短矩形比例，内容只保留短标签、核心标题、一句提示和操作；标签、标题、说明与操作分别占用统一的水平轨道，不因文字长短改变同级元素的起始位置。卡片、分页提示和日期切换组成一个整体沉在屏幕底部，中间留白随屏幕高度自适应。顶部“本周”控件可展开周日历并切换周次和日期；分页细线为非触控用户提供替代入口。

### Evidence Strip

证据条将“事件、评价、来源”按顺序横向或纵向展示，使用细线连接和状态文字，不使用分数仪表盘。

## Do's and Don'ts

### Do:

- **Do** 让每页只有一个最高优先级动作，并在文案中说明依据和预计时间。
- **Do** 用纯黑背景、柔白文字、轻字重大标题、语义断行和桃色主动作保持 loci 识别度。
- **Do** 让大块留白与细分隔线承担分组，普通内容不额外套卡片。
- **Do** 为成功、空、部分可用、失败和重试提供同一组件族的状态表达。
- **Do** 让 Chat、来源、概念图和复习共享当前项目及章节上下文。
- **Do** 在大屏中仍只居中展示 480px 内的移动原型。

### Don't:

- **Don't** 做文件管理器、摘要生成器或单文档聊天壳。
- **Don't** 做带总时长、打卡、积分、排行榜和精确掌握百分比的学习仪表盘。
- **Don't** 做独立全局知识图、Memory 工作台或把 Chat 变成第三个一级 Tab。
- **Don't** 用大量相同卡片、嵌套卡片和装饰性玻璃材质掩盖信息层级。
- **Don't** 使用彩色粗侧边框、渐变文字、弹跳动效或无语义的装饰色。
- **Don't** 使用环境光、渐变、高光、投影、内阴影、模糊或毛玻璃。
- **Don't** 用粗体堆叠、徽章群或统一 16px 间距替代真正的排版层级。
- **Don't** 把后台任务、工程状态或 fixture 伪装成用户学习成果。
