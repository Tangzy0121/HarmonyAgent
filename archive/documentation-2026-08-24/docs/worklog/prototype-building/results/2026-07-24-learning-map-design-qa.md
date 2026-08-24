# Learning Map Design QA

> **状态：已归档。** 本文只用于追溯 2026-07-24 地图清理过程，不定义当前颜色、材质或组件样式。当前视觉规范以仓库根目录的 `prototype/DESIGN.md` 为准。

## Comparison Target

- Source visual truth: `C:\Users\LENOVO\AppData\Local\Temp\codex-clipboard-ffdfe830-334c-4ca8-814f-71b38e01afdb.png`
- Rendered implementation: `D:\Codex-workplace\HUAWEI-knowledge-management\archive\documentation-2026-08-24\docs\worklog\prototype-building\results\2026-07-24-learning-map-clean-final.png`
- State: learning page, all filters selected, no node modal open, map reset to its initial viewport.

## Viewport And Normalization

- Source pixels: 913 × 942 at 144 dpi.
- Browser capture pixels: 708 × 880; browser CSS viewport reported 723 × 898 at device pixel ratio 1.5.
- Loci app region used for comparison: 480 × 880 pixels, matching the visible 480 CSS-pixel mobile prototype width in the capture.
- Full-view normalization: source resized proportionally to 854 × 880; implementation app region kept at 480 × 880; both placed on one comparison canvas without stretching.
- Focused comparison: source graph region cropped to 800 × 650 and normalized to 689 × 560; implementation graph region cropped to 480 × 570 and normalized proportionally to 472 × 560.
- The reference is a visual-language target rather than a Loci information-architecture mock. App header, filters, bottom navigation, Chinese copy, learning states, and node count intentionally remain Loci-owned.

## Findings

- No actionable P0, P1, or P2 mismatches remain.
- Fonts and typography: Loci retains its established display and UI typography. Node labels use compact bold titles with quiet metadata, matching the reference hierarchy without copying its unrelated Latin font.
- Spacing and layout rhythm: nodes use a consistent 62-pixel world-space circle, external labels, broad whitespace, and two balanced relationship tracks. Left and right labels alternate sides so mobile-edge clipping does not obscure primary nodes.
- Colors and visual tokens: the map is warm white with neutral gray lines. Learning state is expressed only through black, white, and gray fills; peach-blossom imagery and colored node surfaces are absent.
- Image quality and asset fidelity: the source contains no required raster imagery. Existing UI icons are rendered sharply at the map scale; no placeholder or generated decorative asset is used.
- Copy and content: all eight existing knowledge topics, categories, learning states, summaries, and actions are preserved.
- Icons: all node icons share one stroke family and size. Their semantics map to learning, review, mastery, and unseen states.
- Responsiveness: primary nodes and their labels remain visible at the 480-pixel app width. Off-canvas neighbors remain partial exploration cues and are reachable by drag.
- Accessibility: every node remains a labeled button, filters remain semantic buttons, focus-visible styles are present, and node contrast is sufficient against the warm-white canvas.
- Intentional deviation: the reference's inline plus controls are omitted because they imply a graph-editing action that is outside the requested product scope.

## Interaction Verification

- Dragged the map from a blank canvas area and confirmed the world transform changed.
- Used the locate control and confirmed the map returned to `matrix(0.72, 0, 0, 0.72, -150, 62)`.
- Opened the machine-learning node and confirmed the centered detail modal, scrim, close action, related-topic count, and learning actions were present.
- Selected the review filter and confirmed only the two review nodes remained at full opacity; restored the all filter afterward.
- Checked browser console errors: none.

## Comparison History

1. 初稿曾出现右侧节点被裁切、图谱纵向跨度不足和曲线结构松散的问题。
2. 修正稿将右侧标签移至内侧，增加图谱纵向跨度，并将初始缩放重置为 `0.72`。
3. 最终稿改用细线圆角正交连接，早期 P1/P2 问题均已消除。中间稿与比较拼图已按 worklog 保留规则清理。

## Follow-up Polish

- P3: the partial labels of off-canvas second-degree nodes could be hidden until they enter the viewport, but retaining them currently provides a useful drag affordance.

final result: passed
