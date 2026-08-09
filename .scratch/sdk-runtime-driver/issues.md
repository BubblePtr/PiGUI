# Pi SDK Runtime Driver Spike Issues

Status: done(补记 2026-08-09:spike harness 与 pi-sdk-driver/pi-sdk-runtime-adapter 均已落 packages/backend/src/drivers/,此文件当时未回写状态)
Source PRD: `.scratch/sdk-runtime-driver/PRD.md`
Created: 2026-07-01

## Issue 1: 建立 backend-only SDK spike harness

## Parent

Local PRD: `.scratch/sdk-runtime-driver/PRD.md`

## What to build

在 `packages/backend` 中建立可复跑的 Pi SDK spike harness，围绕 `createPiSdkDriver` 和 `PiRuntimeDriver` contract 验证真实 Pi SDK 是否能支撑 Runtime Gateway 核心闭环。真实 SDK 调用以 backend CLI script 承载，必须显式 opt-in，默认不进入常规测试路径；Vitest 只覆盖 fake runtime / driver contract / mapping 自动回归。

## Acceptance criteria

- [x] harness 只位于 backend 层，不接 renderer。
- [x] 不修改 `createBackendService()` 默认 driver。
- [x] 不修改 `PiRpcProcessDriver`。
- [x] 真实 SDK harness 是 backend CLI script。
- [x] Vitest 默认路径只跑 fake runtime / contract / mapping 测试。
- [x] 真实 SDK / 模型调用需要 `PIGUI_RUN_PI_SDK_SPIKE=1` 显式 opt-in。
- [x] 无 `PIGUI_RUN_PI_SDK_SPIKE=1` 时清楚拒绝运行。
- [x] prompt 固定为 `Reply with exactly: PIGUI_SDK_SPIKE_OK`。
- [x] prompt 低成本、无工具调用意图、无代码修改风险。
- [x] harness 只依赖 `@earendil-works/pi-coding-agent` public exports。
- [x] public API 不足时记录为 capability gap，而不是 import 私有深路径。
- [x] 能输出或更新 capability matrix 所需证据。

## Required verification

- [x] 运行默认测试，确认 spike 不被默认执行。
- [x] 运行 opt-in CLI harness，记录真实 SDK 能力证据。

## Out of scope

- 切默认 driver。
- UI / Electron 集成。
- RPC 修改。
- Live Chat 去重。
- Pi SDK 私有深路径集成。

---

## Issue 2: 验证 Runtime Gateway 核心闭环

## Parent

Local PRD: `.scratch/sdk-runtime-driver/PRD.md`

## What to build

使用 SDK spike harness 验证最小闭环：

```text
create_session -> send_prompt -> receive normalized runtime event -> get_runtime_snapshot
```

通过/失败判定以 Runtime Gateway contract 为准，而不是 SDK raw state/event。

## Acceptance criteria

- [x] 能创建或绑定 Pi session。
- [x] 能发送一条 prompt。
- [x] 能收到至少 user/assistant message 级别事件。
- [x] assistant event 或 snapshot 可见文本中能找到 `PIGUI_SDK_SPIKE_OK`，或记录 SDK 返回的最终可见输出。
- [x] 能映射为 Runtime Gateway envelope。
- [x] 能读取 snapshot。
- [x] snapshot 足以重建当前会话状态的核心字段。
- [x] 记录 session identity、message identity、event order 的能力证据。

## Required verification

- [x] 运行 opt-in SDK harness。
- [x] 更新 `.scratch/sdk-runtime-driver/capability-matrix.md`。

## Out of scope

- Queue、Steer、Stop 的完整产品集成。
- Usage/cost、model/thinking、extension UI request 的完整实现。

---

## Issue 3: 汇总下一阶段 gate 和缺口清单

## Parent

Local PRD: `.scratch/sdk-runtime-driver/PRD.md`

## What to build

在 SDK spike harness 运行后，整理 capability matrix，并把未满足的 Gateway/SDK 映射问题转成后续 issues。只有核心能力满足 next-stage gate 时，才允许另起工作讨论切默认 driver。

## Acceptance criteria

- [x] `create_session`、`send_prompt`、`receive normalized runtime event`、`get_runtime_snapshot` 都是 `confirmed`，或明确记录阻塞原因。
- [x] `session identity` 是 `confirmed`，或明确记录阻塞原因。
- [x] `event order` 至少是 `partial`，且不稳定点可解释。
- [x] `message identity` 至少是 `partial`，并说明是否足以解决或避免重复消息。当前真实 spike 结果是 `partial`：SDK public event 未提供稳定 raw message id，PiGUI backend 定义 synthetic `messageId` 和 `bodyFormat=full`，足以在 Gateway 侧避免重复 user prompt 和 assistant token/final 重复；UI Projection 仍需后续消费这些字段。
- [x] 没有为了 SDK raw shape 污染 Runtime Gateway public contract。
- [x] RPC fallback/default 路径仍未被修改。
- [x] Open gaps 已转成 `.scratch/sdk-runtime-driver/issues.md` 后续条目或独立 issue 文件。

## Required verification

- [x] 复核 `.scratch/sdk-runtime-driver/capability-matrix.md`。
- [x] 运行 `git diff -- packages/backend/src/service.ts packages/backend/src/pi-rpc-driver.ts`，确认默认 driver 和 RPC 未被本 spike 修改。

## Out of scope

- 切默认 driver。
- 修 Live Chat 去重。
- 实现 Queue、Steer、Stop 的完整 SDK 产品路径。

---

## Issue 4: 设计 SDK message identity 与重复消息归一化

## Parent

Local PRD: `.scratch/sdk-runtime-driver/PRD.md`

## What to build

基于 opt-in SDK spike 的真实事件证据，设计 SDK-backed Runtime Gateway 的 message identity 与重复消息归一化策略。当前 spike 已确认核心 SDK 闭环可行，但 Gateway message event 中没有稳定 `turnId` / `messageId` / payload id；早期完整事件 dump 还观察到 SDK 自身 user message lifecycle 与 `send_prompt` 回显可能同时进入 Gateway，存在重复用户消息风险。

该 issue 不切默认 driver，只定义并验证 backend normalization 规则，避免把 dedupe 压给 Live Chat UI。

## Acceptance criteria

- [x] 复跑 opt-in SDK harness，并保留足够的 Gateway event sample 证明 SDK raw event phase、final/delta signal、user/assistant message 来源。
- [x] 明确 SDK public event 是否能提供稳定 message identity；不能提供时，定义 Gateway 侧 synthetic identity 规则。
- [x] 明确 user prompt 只应由 SDK event 或 `send_prompt` synthetic event 之一进入 Projection，不能重复进入。
- [x] assistant streaming delta 与 final content 的关系有明确规则，避免 token、partial、final content 在 Projection 中重复显示。
- [x] 规则通过 fake runtime / adapter tests 覆盖。
- [x] 不修改 `PiRpcProcessDriver`。
- [x] 不切 `createBackendService()` 默认 driver。

## Required verification

- [x] `bunx vitest run packages/backend/src/pi-sdk-runtime-adapter.test.ts packages/backend/src/pi-sdk-spike.test.ts`
- [x] `PIGUI_RUN_PI_SDK_SPIKE=1 bun packages/backend/scripts/spike-pi-sdk-driver.ts`
- [x] 更新 `.scratch/sdk-runtime-driver/capability-matrix.md` 的 `message identity` 行。

## Out of scope

- Live Chat UI 去重。
- 切默认 SDK driver。
- Queue、Steer、Stop 产品集成。

---

## Issue 5: 验证 SDK 扩展能力到 Runtime Gateway 的产品映射

## Parent

Local PRD: `.scratch/sdk-runtime-driver/PRD.md`

## What to build

对首个 spike 中不作为 gate 的 SDK 能力做第二轮验证，并把 public SDK API 能力落到 Runtime Gateway 产品语义上。当前 `.scratch/sdk-runtime-driver/capability-matrix.md` 已根据 public docs/types 做只读检查，相关能力均为 `partial`：SDK 公开面存在，但 Gateway 映射、真实运行行为、稳定 identity 或错误恢复语义尚未验证。

## Acceptance criteria

- [x] Queue：验证 `followUp()`、`queue_update`、`clearQueue()`、pending getters 是否足以支撑 Gateway `queue_follow_up`，并明确是否能支持 `withdraw_queued_message`。结果：backend mapping 已实现；withdraw 因 SDK 无稳定 queued item id 仍是 best-effort，矩阵保持 `partial`。
- [x] Steer：验证 `steer()` 或 `prompt(..., { streamingBehavior: "steer" })` 在 streaming run 中的真实 Gateway 映射。结果：backend `steer_run -> session.steer()` mapping 已实现并测试；长流 live interruption 语义仍未 opt-in 验证，矩阵保持 `partial`。
- [x] Stop：验证 `abort()` 在 streaming run 中的真实停止语义、status event、snapshot status。结果：backend `stopRun -> session.abort()`、status event、snapshot status mapping 已实现并测试；长流 abort 语义仍未 opt-in 验证，矩阵保持 `partial`。
- [x] usage/cost：验证 `getSessionStats()` 或 assistant usage 是否能稳定映射到 Gateway `summary.totalTokens` / `summary.totalCostUsd`。结果：opt-in SDK run confirmed，矩阵为 `confirmed`。
- [x] model/thinking：验证 public `setModel()` / `cycleModel()` / thinking APIs 能否映射成 Gateway command 和 snapshot summary。结果：snapshot summary 和 `thinking_level_changed` event mapping 已实现；Gateway command 尚未定义，矩阵保持 `partial`。
- [x] extension UI request：明确 SDK `ExtensionUIContext` 请求如何进入 PiGUI 后端协议，或记录缺口。结果：Runtime Gateway 目前没有 SDK extension UI request 通道，矩阵为 `missing`。
- [x] resource loading / cwd：验证 `cwd`、`resourceLoader`、skills/extensions/prompts/context discovery 的 PiGUI 期望行为。结果：`cwd` 与 `resourceLoader` 注入已覆盖；完整 discovery 未产品验证，矩阵保持 `partial`。
- [x] auth/model registry：验证显式 `AuthStorage` / `ModelRegistry` 注入和无可用 auth 的错误映射。结果：显式注入 passthrough 已测试，默认 auth/model opt-in 成功；无 auth 错误映射未覆盖，矩阵保持 `partial`。
- [x] error and crash recovery：验证 retry/compaction/error events 与 subprocess/SDK crash 后的 Gateway 恢复策略。结果：retry/compaction/error status mapping 已实现；SDK crash/restart 策略仍需单独设计，矩阵保持 `partial`。
- [x] 所有结果回写 `.scratch/sdk-runtime-driver/capability-matrix.md`，从 `partial` 推进到 `confirmed` / `missing` / 更具体的后续 issue。

## Required verification

- [x] 扩展 opt-in harness 或新增 backend-only harness，不接 renderer。
- [x] 默认 `bun run test` 不触发真实 SDK/model 调用。
- [x] 不修改 `PiRpcProcessDriver`。
- [x] 不切 `createBackendService()` 默认 driver。

## Out of scope

- 默认切换到 SDK driver。
- UI 层实现。
- 修改 RPC fallback 行为。
