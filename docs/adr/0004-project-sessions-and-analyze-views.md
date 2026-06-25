# Project 下分离 Sessions 和 Analyze

Pig 的主信息架构以 Project 为顶层组织单元。Project 是用户选择的工作根目录，通常是一个 Git repo 或 repo 内的 package/app 子目录；同一个 Git repo 下可以有多个 Pig Project。Project 下的 Session 是一条可运行、可恢复、可归档的 Pi Chat；Analyze 是复盘历史 Session Trace、成本、token、模型、工具和使用模式的分析视角。这个分离避免把“正在运行的交互入口”和“历史运行记录分析”混成同一个列表，同时保留 Pig 原先 Trace 能力作为 Analyze 的核心材料。

在 monorepo 中，Project 语义优先于 Git repo 根语义。用户选择 `/repo/apps/web` 作为 Project 时，Pig 的 Session 列表、Analyze 过滤、Pi Runtime `cwd`、project-local 配置和上下文加载都围绕 `/repo/apps/web` 展开。Git worktree、diff、branch、snapshot 和 cleanup 仍以 `/repo` 这个 repository 根为实现边界。Pig 应在内部保存 `repoRoot`、`projectRoot`、`projectRelativePath` 和 `executionCheckoutRoot`，而不是要求用户在创建 Session 时理解或选择这些路径。
