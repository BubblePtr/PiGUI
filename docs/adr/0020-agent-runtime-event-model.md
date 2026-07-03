# Agent Runtime Event Model 作为 core 单一事件契约

PR #33 之后，"哪些事件不应该成为 chat bubble"的知识分散在 SDK adapter、session projection 和 page 组件三处：adapter 用进程内 `assistant.index` 生成 synthetic messageId，projection 按 `(piSessionId, kind, id)` 猜 upsert 边界，Live Chat 还需要 `collapseAssistantRunMessages()` 补丁合并相邻 assistant bubble。renderer 在从扁平事件里推断消息边界，而边界的权威来源其实是 agent-core 的结构化生命周期。

同时确认了两个事实约束（`@earendil-works/pi-agent-core@0.80.2` 类型定义）：agent-core 不提供原生 message id、run id、turn id，只有 `ToolCall.id`/`toolCallId` 是原生稳定 identity；但它提供完整的边界事件（`agent_start/end`、`turn_start/end`、`message_start/update/end`）和 part 级 `contentIndex`。

## Decision

新增 **AgentRuntimeEvent** 作为 PiGUI 产品层事件契约，定义在 `packages/core`，作为 Runtime Gateway envelope 的 payload 类型。`packages/backend` 的 `agent-runtime-event-normalizer` 是唯一的语义归一点——一个纯同步状态机，把 SDK/RPC raw event 映射成 0..n 个 AgentRuntimeEvent。renderer、projection、持久化、审计和未来 Web/mobile 客户端消费同一契约，不再二次映射。

契约的关键形状（完整定义见 `docs/research/agent-runtime-event-model-design.md`）：

- **`phase`（`start | update | end`）与 `bodyMode`（`delta | snapshot`）分离**：生命周期与内容编码不再共用一个字段。旧 `partial | delta | final` 三态废弃。
- **message 生命周期事件不携带流式正文**：正文走 part 级 `message_part` 事件（高频路径，`bodyMode:"delta"` 只传增量）；`message(end)` 携带最终 parts 快照作为权威内容。
- **`run`/`turn` 是显式的 hidden 生命周期事件**：驱动 projection 状态机（Session Status、成本聚合），永不渲染成 bubble。Session 完成与否由 `run(end).outcome` 决定，status 事件不再影响 Session Status。
- **`surface`（`chat | trace | status | composer | hidden`）由 normalizer 盖章**，盖章规则是 core 里的一个纯函数路由表，page 组件不再猜归属。
- **thinking 是 assistant message 的 part**（同一 messageId），surface 路由到 trace——协议表达同属关系，UI 分面渲染。

Identity 生成是契约的一部分：

- `runId = {piSessionId}:run-{n}`、`turnId = {runId}:turn-{m}`、assistant `messageId = {turnId}:msg-{k}`，全部由生命周期事件计数确定性推导，不依赖时间戳或进程内随机数；同一 fixture 回放永远产出同一批 id。
- `partId = {messageId}:part-{contentIndex}`（原生 contentIndex）；`toolCallId` 直接用原生 id；user message 的 id 由 Gateway 在命令接受时铸造。
- 计数器高水位随 projection 持久化，reattach 时续起；禁止只靠进程内 index。
- retry 与 steer 发生在当前 run 内部，不产生新 runId；queued follow-up 触发新 run。
- tool args 合并优先级：message 流内 `tool_call` part 先创建条目，`tool_execution_start` 的验证后 args 覆盖，result 只来自执行事件。

## Alternatives considered

- **renderer 侧归一层**：backend 保持松散 payload，在 gateway-client 之后归一。改动最小，但每个客户端都要复制归一逻辑，违背 ADR-0018 "driver 映射产品语义"的边界，且审计/持久化拿到的仍是松散事件。
- **双契约长期并存**（backend 内部新模型 + renderer 继续 `PiRuntimeEvent`）：避免一次迁移，但两套语义永久并存，映射层本身成为新的猜测点。
- **继续全量 body 重发**：实现简单，但 wire 流量随消息长度平方增长，projection 每个 delta 全量重写事件并触发全量重渲染。

## Consequences

- `PiRuntimeEvent` 降级为迁移期兼容映射，迁移完成后删除；`collapseAssistantRunMessages()` 同期删除。
- 迁移按六个独立切片推进（契约+normalizer → adapter 接入 → projection 换输入 → page 简化 → RPC driver 对齐 → 持久化/replay），每片可独立合并回退；顺序与验收见 `docs/research/agent-runtime-event-model-design.md` §9。
- normalizer 用 agent-core 风格 fixture 做契约测试（纯文本、thinking+text、tool 链、多 turn、retry、abort 六条流），断言完整 id/phase/surface 序列；这是协议行为的可执行规范。
- projection 从扁平事件数组重构为按协议 identity 的 keyed 结构化模型，消灭线性扫描 upsert 和"任意 status 事件把 Session 判成 completed"的缺陷。
- `PiRpcProcessDriver` 映射到同一模型，能力不足显式标 `origin:"rpc"` 并记录 capability 缺口，沿用 ADR-0018 的缺口纪律。
- 术语决议：新增 **Active Run**（协议 `runId` 所指，一次 agent loop 执行）与 **Turn**，保留 **Agent Run** 的 runtime 实例语义；已写入 `CONTEXT.md`。
