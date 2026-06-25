# Live Session 页面采用三栏结构

Pig 首版的 Session 页面采用三栏结构：

1. 左侧是 Project / Session 列表，用于切换 Project、查看当前 Project 下的 Sessions、创建新 Session、恢复或归档旧 Session。未提交 Session Draft 不作为列表项出现，只在 New Session / 加号入口显示轻量提示；Session 有未看新消息或 run 结果时，可以显示 Unread Result Indicator。列表默认排序为 active run 在前，其次有 unread result，其余按最近更新时间倒序；active run 组内按最近 runtime event 时间倒序。
2. 中间是 Live Chat + run timeline，用于展示 Pi 消息、runtime event stream、工具调用、状态变化、错误、follow-up 和 abort 等交互主线。
3. 右侧是 Structured Action Surface，用于展示 diff 摘要、Execution Checkout、runtime `cwd`、model/cost 摘要，以及 handoff、commit、push、PR、archive、promote permanent checkout 等结构化动作。

## Consequences

这个布局让 Pig 的首屏心智接近 agent control plane，而不是 trace viewer 或 IDE。左侧回答“我在哪个 Project / Session”，中间回答“Pi 正在做什么 / 我如何继续交互”，右侧回答“这次运行对代码和成本产生了什么影响 / 下一步可执行动作是什么”。

Analyze 不嵌入 Live Session 主路径。用户需要复盘历史 token、成本、工具调用和模型行为时，进入 Project 的 Analyze 视角；Session 页面只展示当前 Session 需要的摘要和行动入口。

右侧面板不承担 terminal 或 file tree 职责。它可以打开外部编辑器或外部终端，也可以触发预设命令，但不提供任意 shell 交互或通用文件浏览器。后续若加入 terminal/file tree，也应作为 Session-scoped 能力独立设计。
