# 任务简报：Strip Time 模式 input 泳道去重复计算（GitHub #126）

## 关联 Spec
GitHub Issue #126（`gh issue view 126 --comments`）。问题描述与方向以 issue 为准。

## 背景
#108（PR #125）给 Time 模式的模型段落地了真实时长后，暴露出 input 列的既有语义缺陷：input 列宽度取"到下一 turn 的完整墙钟间隔"，而这段时间正是后续 assistant turn 的模型+工具段占用的同一区间——同一段时间在两条泳道各画一次。gallery fixture 上 input 泳道吞掉超过一半的 strip，挤压刚变成真数据的模型段。

**设计决策（主循环已定）**：Time 模式的语义应为各段区间互不重叠。input 列宽度改为「用户输入时刻 → 该 run 启动（assistant 首次模型调用开始）」的真实间隔；当无法推导（缺时间戳、非正值等）时退回一个固定小权重，绝不再使用尾随间隙。#108 落地的 `startTimestamp`（模型调用开始时刻）正好可以做"run 启动"锚点。

## 涉及文件
- `apps/desktop/src/shared/ui/pi-trace-strip.tsx` — turn 间隔/宽度逻辑所在（#108 改过的估算/真值分流也在这里，注意保持一致）
- `apps/desktop/src/entities/session/trace-model.ts` — 若需要透传新字段
- /design 页 Strip 条目 — 若视觉状态语义变化需同步展示说明

## 约束
- TDD：input 宽度计算（真实间隔、缺数据 fallback、非正值防御）先写失败测试再实现。
- 防御性处理：时间戳缺失、非数字、倒序一律走固定权重 fallback，绝不渲染负值/零宽。
- 不引入硬编码颜色/尺寸，样式走既有 token。
- Git：新建 `fix/trace-strip-input-overlap` 分支（从 main 切），Conventional Commits，**只 commit 不 push**，完成后报告分支名与验证命令。

## 范围外
- 不动模型/工具段的时长逻辑（#108 已落地，保持现状）。
- 不做 gateway 实时路径的时长透传（那是 #127，另一个任务）。
- 不重构 strip 的整体布局算法，只改 input 列的宽度语义。
