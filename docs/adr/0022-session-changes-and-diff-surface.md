# ADR-0022：Session Changes 与只读 Diff Surface

- 状态：Accepted
- 日期：2026-07-19

## 背景

Session Actions 原先只有静态的 Diff 占位，不能回答“这个 Session 的 checkout 实际改了什么”。PiGUI 同时支持前台本地 checkout 和托管 worktree，因此 diff 必须绑定 Session Projection 中持久化的 checkout，而不能由 Renderer 临时提供任意路径。

## 决策

### Git 是仓库语义的唯一来源

Backend 新增 `SessionChangesReader`，使用只读 Git 命令读取 porcelain v2 status、numstat 和标准 patch。它覆盖 staged、unstaged、untracked、rename、binary 和 conflict，不使用前端文本 diff 库推断仓库状态。

Renderer 只发送 `sessionId`。Backend 从持久化 Projection 恢复 `executionCheckoutRoot` 和 `diffRoot`，执行 `realpath` 后验证：

1. `diffRoot` 必须位于 execution checkout 内。
2. Git repository root 必须位于 execution checkout 内。
3. `diffRoot` 必须位于该 Git repository 内。

任何 Renderer 提供的路径字段都不会参与解析。

### Core 暴露 vendor-neutral contract

`@pigui/core` 的 `SessionChanges` 只描述状态、文件元信息、增删统计、标准 patch 和截断信息，不暴露 Pierre 类型。这样后端协议不会绑定具体渲染器，未来替换 viewer 不影响 Gateway。

状态分为：

- `ready`：存在 staged、unstaged 或 untracked 变化。
- `clean`：Git working tree 在 Session diff scope 内无变化。
- `non-git`：checkout 不是 Git repository。

读取上限为 200 个文件、单文件 patch 512 KiB、总 patch 2 MiB。超限 patch 整体省略并显式标记，不返回不可解析的半截 patch。

### Pierre 只作为懒加载展示适配器

UI 使用固定版本 `@pierre/diffs@1.2.12`。Session Actions 先渲染 PiGUI 自己的文件列表，每次只挂载一个 `FileDiff`；renderer chunk 通过 `React.lazy` 按需加载。

v0.1 不启用 experimental worker pool，也不提供 stage、discard、commit 等写操作。支持 unified/split 切换，并为 loading、clean、non-git、stale、error/retry、binary、conflict 和 truncated 提供独立状态。

## 结果

- Diff 与 Session checkout 一一绑定，前端不能扩大文件系统读取范围。
- Git 语义和展示库解耦，协议可以用于桌面端和未来 headless client。
- 大仓库的响应大小和渲染成本有明确上界。
- 首次打开 Diff 时需要加载 Pierre/Shiki chunk；这是换取主界面不承担该体积的可接受成本。

## 验证

- Backend 使用真实临时 Git repository 覆盖 clean/non-git、staged+unstaged、rename、untracked、binary、子目录 scope、超限和路径越界。
- Electron E2E 在临时 repository 创建 baseline commit，再修改 tracked 文件并新增 untracked 文件，验证 Session Actions 和真实 Pierre renderer 输出。
