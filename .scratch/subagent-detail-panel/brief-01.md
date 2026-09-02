# 任务简报：子代理详情面板 v1

## 关联 Spec

`/Users/void/code/opensource/PiGUI/.scratch/subagent-detail-panel/issues/01-subagent-detail-panel.md` — 目标与验收标准以该文件为准。

## 背景

仓库：`/Users/void/code/opensource/PiGUI`（Bun monorepo，desktop 端在 `apps/desktop`，Electron shell）。当前 checkout 停在 `feat/context-meter-toolbar` 且有未提交改动——**不要碰**；你在自己的 worktree 里工作（见约束）。

Spec 的"背景事实"节已含全部调研结论与源码定位。pi-subagents 完整未压缩源码在 `/Users/void/code/pi-agent-config/node_modules/pi-subagents/src`，需要确认工具名、payload 形状时直接读它。

## 涉及文件

- `packages/core/src/agent-runtime-event.ts` — 事件契约与 surface 路由（ADR-0020）
- `apps/desktop/src/entities/session/trace-model.ts` — Run > Turn > Step 读模型，检测/解析逻辑的落点
- `apps/desktop/src/shared/ui/pi-trace-ledger.tsx` — 台账主列表
- `apps/desktop/src/shared/ui/pi-trace-inspector.tsx` — 侧边检视器（tab 骨架）
- `docs/adr/0020-agent-runtime-event-model.md`、`docs/adr/0023-session-changes-uses-a-docked-responsive-panel.md`、`docs/self-built-ui.md` — 架构约定
- `packages/backend/src/persistence/session-event-journal.ts` — backend 文件读取惯例参考

## 约束

- 用 git worktree 在新分支 `feat/subagent-detail-panel` 上工作（基于 `main`），不要切换或污染主 checkout 的 `feat/context-meter-toolbar`。
- 遵循 ADR-0020 的 surface 路由模式与 ADR-0023 的面板约定；不引入新的面板系统。
- 文件读取复用现有 backend/IPC 通道；渲染进程不得直接 fs 读任意路径（如现有架构如此约定）。
- 代码注释英文；文档中文；Conventional Commits；不 push。
- 测试先行（按 spec 的测试验收标准；fixtures 合成自 pi-subagents writer 源码）。

## 范围外

见 spec"范围外"节。另：不改 `apps/web`；不动 pi-subagents 源码。
