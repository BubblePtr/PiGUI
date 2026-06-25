# Pig 转向 Agent Workspace Control Plane

Pig 不再只定位为 Pi Agent 的被动飞行记录仪，而是转向 Agent Workspace 的 GUI 控制台：它仍然保留 Session Trace、Usage 和配置观察能力，但产品边界扩展到创建、切换、启动、管理和观察 agent 工作空间。这个选择牺牲了原先“纯只读观察者”的简单性，换取更大的日常操作价值，因为 Pi 缺少的是一个能承载 workspace 心智和运行控制的桌面界面，而不只是事后复盘工具。

## Consequences

后续设计必须明确哪些动作会写入本地状态或触发 Pi，不能再默认所有功能都是只读。原有 Trace 能力应作为 Agent Workspace 的证据层保留，而不是被重写成独立产品。
