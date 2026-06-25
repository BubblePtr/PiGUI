# Live Session 输入区暴露 Steer 和 Queue

Pig 首版的 Live Session 输入区以用户可感知的 `Queue` 为默认运行中动作，并在需要时暴露 `Steer` 作为显式替代，而不是让用户理解 Pi 的所有底层控制命令。

没有 active run 时，输入框提交的是普通 prompt，用于开始新 turn 或继续当前 Session。有 active run 时，输入框默认提交为 `Queue`：

- `Queue`: 排队下一条 follow-up prompt。它不会改变当前正在执行的 turn，而是在当前 run 停下来后继续处理，适合“做完这个以后，再做下一步”。
- `Steer`: 在输入会进入 Queue 的 active run 场景下显示为显式替代动作。它给当前正在运行的 Pi 添加方向修正，Pi 会在当前工具调用结束后、下一次模型调用前处理它，适合“先别这么做，改成这样”。

`Stop` 是次级安全阀，用于停止 active run。它的产品文案叫 Stop，内部可以映射到 Pi 的 `abort` 能力；不要同时在 UI 暴露 Stop 和 Abort 两套按钮。

## Consequences

Live Session 输入区在 active run 期间默认把提交解释为 `Queue`；按 Enter 或点击默认提交按钮都走 Queue。主提交按钮保持同一个发送图标，但 tooltip 或状态说明为 `Queue`。只有在这个 Queue 场景里，UI 才需要显示 `Steer` 入口，让用户明确选择“排队下一步”还是“插入方向修正”。没有 active run 时，不显示 Steer。

普通发送按钮使用发送图标，不需要显示 `Send` 文案。有 active run 时，仍使用同一个发送图标作为默认提交按钮，只是语义变成 `Queue`。`Queue` 和 `Steer` 的语义标签直接使用这两个词，可以通过 tooltip 或辅助文案解释 Queue 是“排队下一步”、Steer 是“插入方向修正”，但不要改名为 Redirect、Guide Current Run 等新词。没有 active run 时，不显示 Queue 或 Steer，只显示普通发送图标。

Queue 提交后应立即可见，但不能直接混入正式 Live Chat 消息流。它应显示为 Queued Message，例如位于输入区上方或 run timeline 附近的 pending 区域/样式，让用户知道“这条已经排上了”。当 Pi Runtime 真正开始处理这条 queued follow-up 时，它才转为正式 Live Chat 消息。

Steer 提交后也必须立即上 Live Chat 屏，但展示语义不同于 Queue。它应作为当前 active run 下的 steer 消息/控制事件显示在 Live Chat 主屏中，靠近当前 run，而不是进入 pending queue。这样用户能看到自己已经对正在运行的 Pi 插入了方向修正，同时不会把它误认为下一条排队消息。

Queued Message 在 Pi 开始处理前支持撤回。撤回只移除 pending follow-up，不影响当前 active run。Pi 一旦开始处理这条消息，它就不再可撤回；用户需要通过新的 Queue 或 Steer 修正。

首版不支持 Queued Message 重排。多个 Queued Message 按提交顺序显示和执行；用户可以撤回尚未处理的消息，但不能拖拽或改顺序。

Session 列表只用 spinner/shimmer 表示 active run。真正的运行中交互发生在 Live Session View：用户默认 Queue，必要时 Steer 或 Stop。这样用户感知的是“我如何安排下一步，必要时如何修正当前方向”，而不是 `abort`、`follow_up`、`streamingBehavior` 这些协议细节。

内部实现仍应使用 Pi 的原生语义：Steer 映射到 Pi `steer` / `streamingBehavior: "steer"`，Queue 映射到 Pi `follow_up` / `streamingBehavior: "followUp"`，Stop 映射到 Pi `abort`。
