# 任务简报：Composer 附近的实时上下文占用指示器（GitHub #101）

## 关联 Spec
GitHub Issue #101（`gh issue view 101` 查看）。目标与验收标准以该 issue 为准；issue 里已核实数据源（Pi SDK `AgentSession.getContextUsage(): ContextUsage`，含 tokens/contextWindow/percent，刚压缩完为 null）。

## 背景
- PiGUI 目前完全没接这份数据（`grep -ri contextUsage` 全仓无命中），需要打通整条链路：Pi SDK → driver（`packages/backend/src/drivers/pi-sdk-runtime-adapter.ts`）→ gateway 归一化（`packages/backend/src/gateway/`）→ 投影/推送 → 渲染侧 composer 附近的指示器组件。
- 架构地图在 README「Architecture」节（事件管线图 + "Where things live" 表），先读它决定各层怎么接，不要绕过既有管线自开旁路。
- Pi 自己的 CLI footer 渲染 `45%/200K` 可作展示语义参考。
- 交互/摆位背景见 `.scratch/composer-redesign/PRD.md`（composer 周边控件）。

## 涉及文件
- `packages/backend/src/drivers/pi-sdk-runtime-adapter.ts` — 读取 getContextUsage
- `packages/backend/src/gateway/agent-runtime-event-normalizer.ts` / `runtime-gateway.ts` — 归一化透传（形态按现有管线惯例定）
- `apps/desktop/src/pages/agent-workspace.tsx` — composer 所在页面，指示器接入点
- `apps/desktop/src/shared/ui/` — 新组件放这里，并**同 PR 注册 `apps/desktop/src/pages/design.tsx`**（含 tokens 为 null 的"未知/刚压缩"态）
- `docs/self-built-ui.md` — 若属自建组件，收尾时对账

## 约束
- Astryx first：先 `bunx astryx build "context usage indicator"` 探索，能用现成 progress/meter 类组件就不手搓。
- token 走语义桥（`apps/desktop/src/app/styles.css`）；接近压缩阈值的警示色用语义 token，不硬编码。
- TDD：归一化逻辑与组件状态（null/正常/高占用）先写失败测试。
- `tokens: null` 时不得显示误导数字，按 issue 语义展示未知态。
- Git：新建 `feat/context-usage-indicator` 分支，Conventional Commits，**只 commit 不 push**，完成后报告分支名与验证命令。

## 范围外
- 压缩设置（CompactionSettings）的配置 UI 不做。
- 不做模型窗口大小的静态展示改版，只做实时占用。
- 不动 #102（可见模型管理）相关代码，两任务并行在不同 worktree。
