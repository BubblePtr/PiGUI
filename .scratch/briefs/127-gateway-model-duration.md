# 任务简报：Live CoT 时长真值——gateway message start/end 配对（GitHub #127，改判后）

## 关联 Spec
GitHub Issue #127。**以 2026-09-01 的改判 comment 为准**（`gh issue view 127 --comments`）：原「gateway 透传 modelDurationMs 给 Strip」目标已证伪作废；新目标是修 live CoT 的「Thought for Ns」缺陷。

## 背景
调研（见 issue comment）已确证：
- Strip 没有 live gateway 喂养路径，本任务与 Strip 无关。
- 真实缺陷在 live CoT：`agent-workspace.tsx` 的 `thoughtElapsedMs` 聚合的全是终点戳（thinking 取 `message.updatedAt`、tool 取 `tool.updatedAt`），结构性漏掉首段延迟；且 `times.length < 2` 时返回 `undefined`，纯文本回答（无工具调用）根本不显示「Thought for Ns」。
- 数据是齐的：gateway `message` phase:"start"/"end" 事件对同 `messageId`、均带 `seq`+`ts`（`packages/core/src/runtime-gateway.ts:144-176`）；`shouldJournalRuntimeEvent` 只排除 `message_part` update，两个边界都进 journal。

**主循环已裁决的语义**：时间基准接受 gateway 观测窗口墙钟（envelope `ts` 为 gateway emit 时刻，CoT 展示粒度为秒，可接受）。driver 透传 Pi 原生时间戳为**可选增强**：若改动小（给 `AgentRuntimeEvent` 加可选 ts、两个 driver 从 Pi 事件带出）就顺带做，代价大则记录后跳过。

## 要做的事
1. **Gateway/projection 层**：配对 `message` phase:start/end（按 `messageId`），产出每次模型调用的时长/起止，进 `SessionRuntimeModel`（`projectionPatchFromRuntimeEvent` 目前忽略 `message`，需扩展）；journal 回放（`runtimeModelFromReplay`）走同一逻辑，重启后不丢。
2. **渲染侧**：`agent-workspace.tsx` 的 `thoughtElapsedMs` 切换消费新数据——修掉首段延迟遗漏，且纯文本回答也能显示「Thought for Ns」。
3. 保持 `formatThoughtSummary` / `chat-chain-of-thought.tsx` 的展示契约不变，只换数据来源。

## 约束
- TDD：配对逻辑（正常对、缺 start、缺 end、乱序、同 turn 多次调用累计）与 replay 一致性先写失败测试；`thoughtElapsedMs` 的新行为（纯文本回答有时长）加渲染侧测试。
- 防御性处理：配不上对、时长非正数不产出数据，渲染侧回落现有行为，绝不显示负值/假值。
- Git：继续用 `feat/gateway-model-duration` 分支（已从 main 切出，0 commit），Conventional Commits，**只 commit 不 push**，完成后报告分支名与验证命令。

## 范围外
- 不动 Strip / Trace Cockpit（live tail 是另一个可能的 issue，不在本切片）。
- 不做 usage/cost 耗时归因。
- driver 透传 Pi 时间戳若代价大，记录后跳过，不强求。
