# 01 — 子代理详情面板（pi-subagents 运行详情）

## 目标

在 PiGUI desktop 的 Trace 视图里，让 `pi-subagents` 扩展派发的子代理运行成为可检视对象：选中一次子代理调用，能看到它的 agent 定义、实际模型与 thinking 档、token/费用、耗时、状态，以及子代理内部的工具调用时间线。

## 背景事实（调研结论，实现依据）

Pi 核心 runtime（含最新 0.84.4）**没有** subagent 概念；子代理由 `pi-subagents` 扩展以独立 `pi` 子进程实现。数据全部在盘上与父会话事件流里：

1. **父会话工具结果**：`pi-subagents` 的工具调用结果 payload 为 `SingleResult`（源码 `/Users/void/code/pi-agent-config/node_modules/pi-subagents/src/shared/types.ts:900-960`），含：
   - `usage: { input, output, cacheRead, cacheWrite, cost, turns }`（types.ts:99-106）
   - `model`、`thinking`、`attemptedModels`、`modelAttempts`（含 fallback 记录）
   - `progressSummary: { toolCount, tokens, durationMs }`
   - `sessionFile`（子会话 JSONL 路径）、`artifactPaths: { inputPath, outputPath, jsonlPath, transcriptPath, metadataPath }`
   - `exitCode/error/interrupted/timedOut/stopped/turnBudgetExceeded/acceptance/finalOutput`
2. **子会话文件**：`<父session目录>/<父basename>/<runId>/run-<index>/session.jsonl`（`subagent-executor.ts:6222-6239`）。
3. **artifact 文件**（默认 `<父session目录>/subagent-artifacts/`，命名 `<runId>_<agent>[_<index>]`，`shared/artifacts.ts:156-193`）：
   - `_meta.json`：runId、agent、usage、model、attemptedModels、durationMs、toolCount、exitCode、acceptance 等（`execution.ts:141-172`）
   - `_transcript.jsonl`：逐事件时间线，每行 `{ version, recordType: message|tool_start|tool_end|stdout|stderr|truncated, runId, agent, ts, ... }`；`tool_start` 带 `toolName/argsPreview`，`tool_end` 带 `toolName/isError`（`shared/child-transcript.ts:102-264`）
4. **agent 定义**：`~/.pi/agent/agents/<name>.md`（YAML frontmatter：name/model/thinking/tools/systemPromptMode）。
5. 本机目前**没有真实的子代理运行产物样本**——所有文件形状结论来自 writer 源码。fixtures 必须按上述源码合成，并在 spec 里标注"待真实运行回归验证"。

PiGUI 侧：事件契约在 `packages/core/src/agent-runtime-event.ts`（surface 路由 chat|trace|status|composer|hidden，ADR-0020）；Trace 读模型是 Run > Turn > Step（`apps/desktop/src/entities/session/trace-model.ts`）；台账 `pi-trace-ledger.tsx` 行永不内联展开，选中行在 `pi-trace-inspector.tsx` 侧边检视器打开（Summary/Payload/Result/Schema/Timing 五 tab 的 master-detail 模式）。

## 验收标准

- [ ] **检测**：Trace 读模型能从父会话的 tool 事件中识别 pi-subagents 调用（以扩展注册的工具名为准——从 pi-subagents 源码确认实际工具名，不要猜），并解析 `SingleResult` 的关键字段；非 subagent 工具调用行为不变。
- [ ] **台账**：子代理调用在 `PiTraceLedger` 中呈现为可区分的 Step（显示 agent 名、实际模型、状态、耗时），遵守"行永不内联展开"约定。
- [ ] **检视器**：选中子代理 Step 后，`pi-trace-inspector` 展示 Subagent 专属内容：
  - Summary：agent 名、定义模型 vs 实际模型（含 fallback 链 `attemptedModels`）、thinking 档、usage（input/output/cacheRead/cacheWrite/cost/turns）、耗时、状态（正常/超时/中断/预算超限/错误）；
  - Timeline：读取 `_transcript.jsonl` 渲染工具调用时间线（tool_start/tool_end 配对，toolName + argsPreview + 相对时间戳），文件缺失时优雅降级为提示而非报错；
  - 保留原有 Payload/Result 等通用 tab 的可用性。
- [ ] **文件读取**：`_meta.json`/`_transcript.jsonl` 的读取走现有 backend/IPC 通道惯例（先找现有文件读取通道复用；确无才新建），路径来源仅限 `SingleResult.artifactPaths`/`sessionFile` 字段，不做目录扫描推断。
- [ ] **测试**：解析层（SingleResult 提取、transcript 解析、状态归一化）有单测，fixtures 按 pi-subagents writer 源码合成；transcript 缺失/损坏行/超大 argsPayload 有降级测试。UI 层按仓库现有测试惯例覆盖台账行渲染与检视器 tab 切换。
- [ ] 全量测试与 TypeScript 检查通过（以仓库现有 CI 命令为准）。

## 范围外（v1 不做）

- 运行中子代理的实时状态轮询（background/fleet-view 路径）。
- 把子 `session.jsonl` 作为完整会话打开/回放（只展示路径与入口，后续切片）。
- `run-history.jsonl` 聚合统计仪表盘。
- 工作流 DAG 可视化（#84）。
- 插件化（Extension-UI 协议 #85 未定型，本面板为内置视图）。
- 修改 pi-subagents 扩展本身（如补父子回链字段）——缺口记录到报告即可。
