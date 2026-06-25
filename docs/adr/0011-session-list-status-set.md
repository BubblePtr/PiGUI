# Session Projection 使用内部状态集合

Pig 的 Session Projection 使用固定内部状态集合：`creating`、`running`、`waiting`、`failed`、`completed`、`archived`。Session Draft 不属于这个集合，因为 draft 尚未创建 Pig Session、Pi Session State、Agent Run 或 Execution Checkout。

## Status Semantics

- `creating`: draft 已提交，Pig 正在创建 Projection、准备 checkout、启动/attach Pi Runtime 或发送 initial prompt。
- `running`: Pi Runtime 正在主动处理当前 turn，或正在执行工具/模型调用。
- `waiting`: Session 可继续交互，但当前没有 active turn；通常是在等待用户 follow-up、确认或下一步操作。
- `failed`: 创建或运行失败，需要用户重试、恢复、查看错误或归档。
- `completed`: Session 正常结束，保留 trace、projection、checkout 摘要和后续动作入口。
- `archived`: 用户把 Session 从默认工作视图中隐藏；它仍可通过历史或 Analyze 找回。

## Consequences

UI 不直接暴露 Pi Runtime 的任意内部状态字符串，也不直接暴露完整 Projection 状态集合。Projection 可以额外保存 `statusReason`、`statusStage`、`lastError` 和 runtime-specific detail，但这些主要用于恢复、错误归因、排序、过滤和后续操作。

Session 列表首版只需要表达粗粒度可见状态：这个 Session 当前有 active run，还是没有 active run。`creating` 和 `running` 映射为有 active run，并用 spinner、shimmer 或同类轻量动态图标表示；不要显示 `Running` 文字标签。没有 active run 的 Session 不显示状态文字，也不区分 `waiting`、`failed` 或 `completed`。

失败和完成都应作为 Live Chat 中的新结果/消息呈现。失败的具体原因出现在 Live Chat 主线或对应 run timeline 事件里，而不是在左侧列表里用错误标记表达。列表可以通过最后消息摘要或 Unread Result Indicator 表达“这里有新结果”，但不需要暴露失败/完成的状态分类。

Unread Result Indicator 是消息提示，不是状态提示。它只表示用户尚未看过该 Session 的新消息、run 结果或失败说明；不区分成功、失败、完成或等待。只有用户打开该 Session，且 Live Chat 渲染到最新消息位置后才清除；hover 列表项、切换 Project 或仅在列表中经过该 Session 都不清除。首版不做复杂 read receipt，也不要求用户手动滚动到底部才算已读。

Session 列表默认排序为：active run 在前，其次有 Unread Result Indicator 的 Session，其余按最近更新时间倒序。多个 active run 同时存在时，active run 组内按最近 runtime event 时间倒序。这个排序服务于“先看正在跑、再看新结果、再看最近历史”，不是内部状态优先级排序。

`completed` 和 `archived` 是两个维度相近但含义不同的状态。`completed` 描述运行终态；`archived` 描述用户对历史 Session 的可见性选择。Archived Session 默认从左侧 Session 列表隐藏，但仍可通过 Analyze 或历史入口找回。归档不应删除 trace、projection、checkout snapshot 或审计材料。正在运行的 Session 不能直接归档；用户必须先 stop/abort，让 Session 没有 active run 后才能 archive。

Draft 的提示只挂在 New Session / 加号入口上。左侧 Session 列表不展示 draft item，也不出现 `draft` status，避免用户误以为每次打开输入框都会创建空 Session。
