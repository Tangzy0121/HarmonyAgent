# Learning Map Design QA

## Comparison Target

- Source visual truth: `C:\Users\LENOVO\AppData\Local\Temp\codex-clipboard-ffdfe830-334c-4ca8-814f-71b38e01afdb.png`
- Rendered implementation: `D:\Codex-workplace\HUAWEI-knowledge-management\docs\worklog\prototype-building\results\2026-07-24-learning-map-clean-final.png`
- Full-view comparison: `D:\Codex-workplace\HUAWEI-knowledge-management\docs\worklog\prototype-building\results\2026-07-24-learning-map-clean-comparison.png`
- Focused node/connector comparison: `D:\Codex-workplace\HUAWEI-knowledge-management\docs\worklog\prototype-building\results\2026-07-24-learning-map-clean-focus-comparison.png`
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

1. Initial clean-node pass: `2026-07-24-learning-map-clean-v1.png`
   - P1: right-side node labels and circles were clipped because all labels extended to the right.
   - P2: the initial graph occupied too little vertical space and the curved links felt less like the supplied structured reference.
2. Fix pass: `2026-07-24-learning-map-clean-v3.png`
   - Moved labels to the inside edge for right-track nodes.
   - Increased vertical graph span and reset scale to 0.72.
   - Verified primary nodes were readable and drag/reset behavior remained intact.
3. Final pass: `2026-07-24-learning-map-clean-final.png`
   - Replaced free curves with thin rounded orthogonal connectors.
   - Re-captured full and focused comparisons.
   - Earlier P1/P2 findings are no longer present.

## Follow-up Polish

- P3: the partial labels of off-canvas second-degree nodes could be hidden until they enter the viewport, but retaining them currently provides a useful drag affordance.

final result: passed
