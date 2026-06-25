# New Session 先进入 Draft，不立即创建 Runtime Session

用户点击 New Session 或 Project 旁的加号时，Pig 进入 Session Draft 状态，而不是立即创建 Pig Session 或 Pi Session。此时用户看到的是一个 prompt 输入框，可以输入、修改和暂时离开；Pig 应保留这段输入。

Session Draft 只属于 Pig UI/本地状态。每个 Project 最多有一个未提交 draft，并且应跨 app 重启轻量持久化。它可以保存 initial prompt、model override、checkout override、related directories 等少量高级覆盖项，但不分配 Execution Checkout，不启动 Pi Runtime，不创建 Pi Session State，也不产生 Session Trace。

只有用户提交 prompt 时，Pig 才创建真正的 Session：创建或初始化 Session Projection，选择 Execution Checkout，启动或 attach Pi Runtime，创建 Pi Session State，并把 initial prompt 发送给 Pi。

## Consequences

UI 里的 “New Session” 入口不是一个已存在的 Session，而是 Project-scoped Session Draft 输入区。Session 列表不应该因为用户点了加号就出现一个空 Session；只有提交后才出现运行中、失败、已结束或可恢复的 Session。

Draft 内容应按 Project 维度保留，用户切换 Session、切换 Project 或重启 app 后返回时不应丢失。再次点击同一 Project 的 New Session 或加号时，应直接打开这个 Project 已存在的 draft，而不是创建新的空 draft，也不弹出替换/继续确认。只有 Pi Runtime 接受 initial prompt 或发出首个 runtime event 后，draft 才清空，Project 才回到没有 draft 的状态。

未提交 draft 不展示在左侧 Session 列表，不混入 Session Projection，不进入 Analyze，也不占用 checkout/runtime 资源。UI 可以在 New Session / 加号入口上显示轻量提示，表示该 Project 有未提交输入；提示可以是小圆点、短 badge 或轻量文案变化，但不能把它表现成一个可恢复 Session。

如果提交失败，Pig 应保留 draft 和错误状态，让用户可以重试或修改 prompt。失败发生在 Session 创建之后时，可以留下 failed Session Projection；失败发生在创建 Pi Session 之前时，应仍然停留在 draft 状态。点击发送、创建 Projection 或分配 checkout 都不应立即清空 draft。
