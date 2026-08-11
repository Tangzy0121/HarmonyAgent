# M1 Today 页面 ArkUI 迁移结果

## 目标

以 Web 原型运行截图 `reference/prototype-web-2026-08-06/01-today.png` 为视觉事实来源，在不使用 WebView 的前提下完成 Today 首屏的 ArkUI 原生迁移。

## 已完成

- 重构连续灰紫环境、白色编辑式排版、主烟晶学习面板和次要任务列表。
- 将主卡底部改为独立的深色会话控制带，恢复资料锚点、来源层级和白色继续按钮。
- 校准顶部 `loci` 标识、Profile 胶囊、底部烟晶导航和桃色 Agent 入口。
- Today 页面保持原型的 20vp 页面边距、30vp 主卡圆角、296vp 主卡高度和 66vp 底部控制高度。

## 素材复用

- `admin/public/loci-background-v3.png` 作为环境背景源，生成压暗后的鸿蒙媒体资源 `entry/src/main/resources/base/media/loci_background.png`。
- 从 Web `Icon.tsx` 复用 document、clock、link 和 arrow 的 SVG 路径，保存为鸿蒙 SVG 媒体资源，不再手工近似绘制。
- `BlossomMark` 按 Web 五瓣花形结构改为 ArkUI 原生矢量组件，继续支持不同前景色。

## ArkUI 兼容处理

- 模拟器会把全屏半透明 `Rect.linearGradient` 绘制为不透明黑层，因此 Web 的 20% 至 30% 压暗层被静态烘焙进背景资源副本。
- Web SVG 命令通过 ArkUI `Path` 缩放时出现尺寸异常，因此改用原始 SVG 媒体资源直接加载。
- 主烟晶层使用稳定的实体渐变、边缘高光和阴影表达材质，避免正文对运行时背景模糊产生依赖。

## 验证

- M1 静态校验通过。
- Hvigor ArkTS 编译、资源编译、HAP 打包和签名通过。
- 签名 HAP 已安装到 `127.0.0.1:5555` 模拟器并成功启动。
- 最终模拟器截图：[2026-08-06-m1-today-arkui.jpeg](./2026-08-06-m1-today-arkui.jpeg)
