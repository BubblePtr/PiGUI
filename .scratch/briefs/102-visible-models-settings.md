# 任务简报：设置页可见模型管理（GitHub #102）

## 关联 Spec
GitHub Issue #102（`gh issue view 102` 查看）。目标与验收标准以该 issue 为准。

## 背景
- #99 模型选择器本体已落地并合并（`apps/desktop/src/shared/ui/model-selector/`，含 `model-selector-logic.ts` 纯逻辑层与 `model-selector-control.tsx`）。选择器一级菜单是扁平模型列表 + 搜索 + `Add Models` 入口。
- 本任务：设置页新增 "Models" 区块，按 provider 分组列出全部可用模型，复选控制哪些出现在选择器里；持久化沿用现有 settings 存储通道；选择器读取配置过滤；`Add Models` 行跳转到该设置区块。
- 参照 Cursor 的做法：选择器里只出现用户勾选的模型。
- 可用模型清单来源见 `packages/backend/src/workspace/available-model-controls.ts`；settings 持久化通道见 `packages/backend/src/workspace/config.ts`（先读代码确认现状，不要凭本简报臆测接口形状）。

## 涉及文件
- `apps/desktop/src/pages/settings.tsx` — 新增 Models 区块
- `apps/desktop/src/shared/ui/model-selector/model-selector-logic.ts` / `model-selector-control.tsx` — 读取可见性配置过滤列表；`Add Models` 跳转
- `packages/backend/src/workspace/config.ts` — 持久化（如现有通道即可承载则复用，不新建存储机制）
- `apps/desktop/src/pages/design.tsx` — 若新增 `shared/ui/` 组件，须同 PR 注册 /design 页

## 约束
- 遵守仓库 AGENTS.md 设计系统纪律：Astryx first（先 `bunx astryx build "<idea>"` 探索现成组件）；token 走语义桥或 Astryx 一级 token，不许硬编码颜色/间距。
- TDD：先写失败测试再实现（选择器过滤逻辑在 `model-selector-logic.test.ts` 层面可测）。
- 降级行为按 issue 验收标准：未配置时全显；当前选中模型被取消可见时需合理降级。
- Git：新建 `feat/settings-visible-models` 分支，Conventional Commits，**只 commit 不 push**，完成后报告分支名与验证命令。

## 范围外
- Appearance 分区/思维链样式选项（#81）不在本任务内；但 Models 区块的结构不要写死成"设置页只有 Provider + Models"的形状，给后续分区留常规扩展空间即可，不必预建。
- 不改动模型选择器的两级菜单交互本体。
