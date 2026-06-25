# 首版暂不内置 Terminal 和 File Tree

Pig 首版不做完整 terminal emulator，也不做通用文件树。Live Session View 聚焦 Pi Chat、runtime event stream、运行状态、diff 摘要和结构化动作。真正交互式 shell 暂时交给 Pi Runtime 或外部终端；文件浏览和编辑暂时交给用户已有编辑器。

## Consequences

Pig 的 Session UI 不应该复制 IDE 面板。首版需要提供的是 Structured Action Surface：查看 checkout/diff、打开外部编辑器、运行预设命令、handoff 到 Local、创建 branch、commit、push、PR、archive、promote permanent checkout 等明确动作。

这降低了首版范围，避免提前引入 PTY 生命周期、shell integration、scrollback、terminal 权限、安全策略、文件树性能和编辑器级交互复杂度。后续可以把 terminal 和 file tree 作为独立能力加入，但它们不应阻塞 Pi Runtime bridge、Session lifecycle、worktree 管理和 Analyze 的首版落地。

如果后续加入 terminal 或 file tree，它们也应该是 Session-scoped：默认绑定当前 Execution Checkout 和 runtime `cwd`，而不是成为全局 IDE。权限、命令历史、环境变量和跨 checkout 切换必须显式建模。
