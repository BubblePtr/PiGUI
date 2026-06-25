# Session Creation 使用显式状态机

用户提交 Session Draft 后，Pig 才进入 Session Creation。创建流程按固定顺序执行：

1. 创建 Session Projection，并标记为 `creating`。
2. 选择或创建 Execution Checkout。
3. 启动或 attach Pi Runtime，并创建 Pi Session State。
4. 发送 initial prompt。
5. 收到 Pi Runtime 接受或首个事件后，清空对应 Project 的 Session Draft，并进入 `running` 或对应的终态/错误态。

## Consequences

Session 创建不是一个不可见的单步副作用。Pig 应把创建阶段写入 Projection，以便 UI 能显示 “preparing checkout”、“starting runtime”、“sending prompt” 这类状态，并能把失败归因到 checkout、runtime 或 prompt 发送阶段。

如果失败发生在创建 Projection 之后，Pig 可以留下 failed Session Projection，保留 initial prompt、错误阶段、错误信息和重试入口，但 Project 的 draft 仍不应清空。若失败发生在 Projection 创建之前，用户仍停留在 Session Draft，draft 内容不丢失。

Execution Checkout 只有在 draft 提交后才分配。未提交 draft 不占用 worktree、不启动 Pi Runtime、不创建 Pi Session State，也不出现在 Analyze 中。

重试应从失败阶段尽量恢复，而不是一律重新创建所有资源。例如 checkout 已创建但 runtime 启动失败时，可以复用 checkout；prompt 发送失败但 Pi Session 已创建时，应通过 Pi session id 判断是否需要重新发送或提示用户确认。确认 Pi 已接受 initial prompt 后，才允许清空 draft，避免重试时丢失用户输入。
