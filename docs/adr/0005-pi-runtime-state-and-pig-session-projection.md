# Pi Runtime 拥有 Session 真相，Pig 保存 Session Projection

Pi Runtime 是 Session 运行真相的 owner。消息历史、运行状态、模型配置、队列、fork、follow-up、abort 和 Pi 原生 session 语义都以 Pi Session State 为准。Pig 通过 Pi RPC/SDK 创建、驱动、观察和恢复这些 session，但不重新发明一套独立于 Pi 的 chat/session 协议。

Pig 需要保存自己的 Session Projection。这个投影用于 Project 下的 Session 列表、运行状态索引、Analyze、token/cost 聚合、checkout 生命周期、恢复入口、搜索和 UI 快速渲染。Projection 可以记录 Pi session id、Project id、Execution Checkout、runtime cwd、model/provider 摘要、trace 路径、最近状态、成本摘要和生命周期事件。

## Consequences

Pig 的数据库 schema 应以 query model 和 lifecycle metadata 为目标，而不是成为另一个 Pi session store。恢复或继续 Session 时，Pig 应先定位 Session Projection，再通过其中保存的 Pi session id 和 checkout 信息连接回 Pi Runtime。若 Projection 与 Pi Runtime 状态不一致，Pi Runtime 状态优先，Pig 应重新同步或标记 projection stale。

Analyze 视角可以高度依赖 Pig Projection 和 Session Trace，因为它回答的是历史复盘、聚合和检索问题；交互式 Session 视角则必须尊重 Pi Runtime 的当前 state。这样 Pig 能提供 GUI control plane 的产品体验，同时保留 Pi 作为唯一 runtime 的语义边界。
