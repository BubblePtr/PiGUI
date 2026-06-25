# Live Session UI 使用 Pi Runtime Events

正在运行或可继续交互的 Session UI 以 Pi RPC/event stream 和当前 Pi Session State 为主数据源。Pig 不应该用 Session Trace replay 或 log tail 作为 live chat 的主驱动；trace/log 只用于 backfill、恢复、审计、Analyze 和运行后复盘。

这个选择把 Pig 从被动 replay 工具推进到真正的 Control Plane：用户看到的 live 状态、消息增量、工具调用、Steer/Queue/Stop 反馈和错误都来自当前 Pi Runtime，而不是从落盘日志里推断。Session Projection 由 runtime events、Pi state snapshot、trace ingestion 和 checkout lifecycle events 同步更新。

## Consequences

Live Session View 必须有一个 runtime connection lifecycle：start、attach、reconnect、stale、ended 和 failed。UI 切换 Session 时，应优先 attach 到对应 Pi Runtime 或用 Pi session id 拉取当前 snapshot，再订阅增量事件。只有 runtime 不可用或 Session 已结束时，才退回到 Session Trace / Projection 做只读展示。

Analyze 可以继续沿用 Pig 原先的 trace 能力，并且应该把 trace 作为成本、token、工具调用和模型行为分析的权威材料之一。但 Analyze 的职责是解释历史；它不应该反向决定 live Session 的当前状态。

当 Runtime Event Stream 与 Session Trace 或 Projection 不一致时，live UI 以 Pi Runtime 为准；Projection 标记为 stale 并重新同步，trace ingestion 可以在 run 结束后补齐审计记录。
