# 并发 Agent Run 使用独立 Execution Checkout

Pig 的 Agent Workspace 可以同时运行多个 Pi Runtime 实例，但每个 Agent Run 必须拥有独立的进程、session 状态和明确的 Execution Checkout。UI 中这些可运行工作单元称为 Project 下的 Session，本质是一条 Pi Chat；Task 保留给未来定时任务或自动化任务。历史 Session Trace 不和 Session 列表竞争位置，它归入 Project 的 Analyze 视角。对于 Git 仓库，第一个或前台 Session 可以使用本地 checkout；新增的后台并发 Session 默认创建 Pig 管理的 Git worktree。只有用户明确选择时，后台 Session 才能直接使用本地 checkout。

## Consequences

并发是 Agent Workspace 的一等能力，而不是单个 trace 的附属状态。Pig 需要管理 Pi RPC 子进程池、Session 状态、checkout 生命周期、worktree 清理和 Session-to-trace 归属；同时避免多个 Pi 进程默认写入同一个 checkout。

## Worktree Lifecycle

Pig 不应该把 worktree 生命周期作为每次创建 run 时都要用户理解的选择。默认策略是：

- 后台并发 Session 自动创建 Pig-managed disposable worktree。
- 一个 managed worktree 通常绑定一个 Session，并在后续 follow-up 中继续复用。
- managed worktree 默认 detached HEAD，避免污染用户分支。
- run 完成后保留 worktree，供用户查看 diff、继续 follow-up、handoff 到 Local、创建 branch、commit、push 或开 PR。
- 当 Session 在没有 active run 的情况下被归档，或 worktree 超过保留上限时，managed worktree 进入自动清理候选。
- 清理前保存 snapshot；用户重开历史 run 时可以恢复。
- 用户可以把某个 worktree 提升为 permanent checkout；permanent checkout 不随 Session 归档自动删除，并可以作为独立 workspace 入口继续使用。

## Monorepo Cwd Rule

Git worktree 是 repository 级 checkout，不是 package/app 子目录级 checkout。Pig Project 仍然可以是 monorepo 中的子目录；当后台 Session 需要 Pig-managed worktree 时，Pig 从 Git repo 根创建 worktree，并记录：

- `repoRoot`: 原始 Git repository 根。
- `projectRoot`: 用户选择的 Project 根，可以等于 `repoRoot`，也可以是其子目录。
- `projectRelativePath`: `projectRoot` 相对 `repoRoot` 的路径。
- `executionCheckoutRoot`: 当前 Session 使用的本地 checkout 或 managed worktree 根。

启动 Pi Runtime 时，`cwd` 设置为 `<executionCheckoutRoot>/<projectRelativePath>`，而不是总是使用 worktree 根。Git diff、branch、snapshot、cleanup 和 handoff 以 `executionCheckoutRoot` 为边界；Pi 的上下文加载、project-local 资源、prompt 模板、Session 命名和默认文件访问以 runtime `cwd` 为边界。

这个规则不作为普通创建 Session 流程里的用户选项。需要跨 package 工作时，后续可以提供 “add related directory” 或把 Project 设为 repo root 的高级入口。
