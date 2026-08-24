# loci Remotion 演示视频验收结果

**更新日期：** 2026-07-25（最终优化版）

**工作分支：** `codex/remotion-demo-video`

**产品基线：** `master` 合并提交 `33d88f5`

## 输出文件

| 文件 | 路径 |
| --- | --- |
| 成片 MP4 | `video/out/final/loci-demo-final.mp4` |
| 导出清单 | `video/out/final/manifest.json` |
| 溯源记录 | `video/out/final/provenance.md` |
| Remotion 工程 | `video/` |
| 捕获脚本 | `video/scripts/capture-states.mjs` |
| 校验脚本 | `video/scripts/validate-assets.mjs` |

## 成片规格

| 项目 | 实际值 |
| --- | --- |
| 比例 | 16:9 横版 |
| 分辨率 | 1920 × 1080 |
| 帧率 | 30fps |
| 时长 | 63 秒（1890 帧） |
| 产品画面视口 | 390 × 844（捕获分辨率 780 × 1688） |
| 输出格式 | MP4 / H.264（yuv420p，兼容性最广的像素格式） |
| 文件大小 | 6,330,914 bytes |
| 声音 | AAC 48 kHz 双声道 |

## 最终优化要点

1. **视觉系统重构**
   - 所有片段的手机固定在画面右侧同一位置，字幕固定在左侧负空间，不再发生跨片段抽动。
   - 增加手机阴影与底部反光，提升体积感。
   - 背景五瓣花水印统一固定，只露出两至三瓣，约占画面 30%，不随页面切换漂移。
2. **连续性**
   - 手机在整条叙事中保持固定构图，页面状态在设备内部连续切换。
   - 删除小幅往复漂移和跨片段重定位，避免手机与背景水印产生无意义抽动。
   - 只保留必要的页面内状态变化，连续流程展示期间不移动设备。
3. **字幕**
   - 标题缩小至 40px，副标题 20px，颜色使用 `ink` 层级。
   - 在镜头推进到细节时淡出字幕，避免遮挡关键内容。

## 素材清单

全部 15 张截图由 `video/scripts/capture-states.mjs` 从当前原型生成，尺寸均为 780 × 1688。

| 文件名 | 对应场景 |
| --- | --- |
| `today-default.png` | 今日默认页 |
| `library-default.png` | 知识库默认页 |
| `file-understanding.png` | 机器学习第三章理解页 |
| `learning-explanation.png` | 深入学习解释页 |
| `verification-default.png` | 判断验证默认状态 |
| `verification-selected.png` | 判断验证选择状态 |
| `verification-feedback.png` | 判断验证反馈状态 |
| `learning-completion.png` | 学习完成页 |
| `map-change-focus.png` | 地图变化聚焦页 |
| `today-outcome.png` | 今日学习结果页 |
| `learning-map-default.png` | 学习地图默认页 |
| `learning-map-node-focus.png` | 学习地图节点聚焦状态 |
| `agent-default.png` | Agent 默认展开状态 |
| `agent-full.png` | Agent 全屏默认状态 |
| `agent-qa.png` | Agent 一轮问答状态 |

## 渲染命令

```bash
cd video
npm run capture      # 重新生成 15 张截图
npm run validate     # 校验截图尺寸
npm run build        # 检查 bundle
npm run render       # 输出 out/loci-demo.mp4
npm run render:cover # 输出 out/loci-demo-cover.png
```

## 验收检查

1. **只展示当前原型能力**：是。视频中的所有页面均来自 `admin/` 当前原型，未新增产品功能或页面。
2. **无旁白可理解主线**：是。按“今日重点 → 知识库 → 理解 → 验证 → 完成 → 地图变化 → 学习地图 → Agent”叙事。
3. **产品画面来自真实原型**：是。所有截图由捕获脚本从 `127.0.0.1:5173` 重新生成。
4. **文字可辨认**：是。成片 1920×1080，手机画面经 1.1 倍缩放并在关键镜头局部推进。
5. **无遮挡冲突**：字幕位于左侧负空间，手机画面顶部留有边距。
6. **转场克制**：使用页面内连续状态切换与淡入淡出，未使用粒子、3D 翻转或强发光。
7. **渲染可复现**：`npm run render` 输出稳定，Studio 预览与 CLI 渲染一致。
8. **无技术瑕疵**：首帧、末帧、转场边界经检查无黑帧、缺图或字体跳变。
9. **单一命令启动**：`npm run dev` 启动 Remotion Studio，`npm run render` 输出 MP4。
10. **不影响 admin 构建**：未修改 `admin/src` 产品代码，`admin` 的 `npm run build` 保持通过。

## 已知边界

- 当前版本未配置中文旁白；如后续加入旁白，需先锁定文稿，再按语句调整场景时长。
- 若原型页面继续迭代，重新运行 `npm run capture` 即可刷新全部素材。

## 结论

本轮演示视频最终版已完成并通过参数校验。worklog 只保留结果文档，成片及导出清单统一存放在 `video/out/final/`，不重复归档大型二进制文件。
