# Project Registry、Project Sidebar 与 Draft 模型 Issues

Status: done(补记 2026-08-09:Project Registry/Add Project/侧栏均已上线于 app-shell,此文件当时未回写状态)
Source PRD: `.scratch/project-registry-and-drafts/PRD.md`
Created: 2026-06-30

## Issue 1: 建立 Project Registry 与 Empty Workspace State

## Parent

Local PRD: `.scratch/project-registry-and-drafts/PRD.md`

## User stories covered

1, 2, 3, 7, 15

## What to build

实现 PiGUI 本地 Project Registry：只保存用户手动添加的本地目录，按规范化绝对路径判重，按添加时间倒序返回，默认显示名取目录 basename。Registry 不从 session logs、历史 cwd 或文件系统扫描自动补全 Project。

当 registry 为空时，UI 进入 Empty Workspace State，只提供 Add Project，不显示可输入 prompt 的 composer。Add Project 可以选择非 Git 目录；如果选择已存在路径，直接选中已有 Project 并打开全局 Session Draft。

## Acceptance criteria

- [ ] Project Registry 跨 app 重启持久化。
- [ ] Project identity 使用规范化绝对路径。
- [ ] Project 默认显示名取目录 basename。
- [ ] Project 列表按 `addedAt` 倒序，打开/使用 Project 不改变排序。
- [ ] 添加已存在路径不创建重复 Project，并选择已有 Project。
- [ ] 非 Git 本地目录可以添加为 Project。
- [ ] Empty Workspace State 只提供 Add Project，不提供 prompt 输入。
- [ ] Registry 不从历史 session、cwd 或文件系统扫描自动创建 Project。

## Blocked by

None - can start immediately.

## Required verification

- [ ] 先写 failing registry tests。
- [ ] 运行 repo-native test 命令。
- [ ] 如改空状态 UI，启动 dev server 并截图验证。

## Out of scope

- Project rename。
- 自动发现。
- 子 repo / monorepo package UI。

---

## Issue 2: Project Sidebar 展示所有 Project 并支持展开状态

## Parent

Local PRD: `.scratch/project-registry-and-drafts/PRD.md`

## User stories covered

4, 5, 6, 8, 13

## What to build

把 sidebar 从单 Project fixture 改为 Project Sidebar：展示 Project Registry 中所有 Project，每个 Project 行可以独立展开/收起自己的 Session 列表。Project 行点击只切换展开状态，不切换主内容。新添加 Project 默认展开；展开状态作为 PiGUI 本地 UI state 跨 app 重启保留。

Project 行 New Session 入口把该 Project 设为 Current Project，并打开全局 Session Draft。折叠 Project 如果是全局 Session Draft 目标，或包含有 Follow-up Draft 的 Session，需要显示轻量 draft indicator。Session 有 Follow-up Draft 时，对应 Session 行显示 indicator。

## Acceptance criteria

- [ ] Sidebar 同时展示所有 registry Project。
- [ ] Project 行按 registry `addedAt` 倒序。
- [ ] 每个 Project 可独立展开/收起 Sessions。
- [ ] Project 行点击只 toggle，不改变主内容。
- [ ] 新添加 Project 默认展开。
- [ ] 展开状态跨 app 重启保留。
- [ ] 从外部入口打开某 Session 时，自动展开所属 Project。
- [ ] Project 行 New Session 设置目标 Project 并打开全局 Session Draft。
- [ ] Project draft / Follow-up Draft indicators 按 PRD 规则显示。
- [ ] 空 Project 展开时显示轻量 No chats 状态。

## Blocked by

- Issue 1

## Required verification

- [ ] 先写 failing sidebar component tests。
- [ ] 运行 repo-native test 命令。
- [ ] 启动 dev server，截图验证多 Project、折叠、indicator、空 Project。

## Out of scope

- Project detail page。
- Global session list。
- 自动发现 project tree。

---

## Issue 3: 全局 Session Draft 与 composer Project Selector

## Parent

Local PRD: `.scratch/project-registry-and-drafts/PRD.md`

## User stories covered

8, 9, 10, 11, 13

## What to build

把 New Session draft 改成全局唯一 Session Draft。它保存一份 prompt 文本、可选目标 Project 和少量覆盖项；跨 app 重启保留。Session Draft composer 默认使用 Current Project，但允许从 Project Selector 切换目标 Project；切换目标 Project 不清空文本。

如果 draft 没有目标 Project，composer 显示必须选择 Project 的状态并阻止提交。启动恢复时，如果保存的目标 Project 已不在 Project Registry，保留文本但清空目标。只有 Pi Runtime 接受 initial prompt 或发出首个 runtime event 后，才清空全局 Session Draft。

## Acceptance criteria

- [ ] New Session 打开全局唯一 Session Draft。
- [ ] Session Draft 跨 app 重启保留一份 prompt 和可选目标 Project。
- [ ] Project 行 New Session、顶部 New Session、composer Project Selector 都消费同一份 draft。
- [ ] 切换目标 Project 不清空 draft 文本。
- [ ] 没有目标 Project 时不能提交，并显示 Select Project 必选状态。
- [ ] 启动恢复时目标 Project 不存在，则保留文本、清空目标。
- [ ] 提交失败保留 draft 文本和目标。
- [ ] Pi 接受 initial prompt 或发出首个 runtime event 后清空 draft。
- [ ] draft 不作为 Session 列表项、Session Projection 或 Analyze 材料出现。

## Blocked by

- Issue 1
- Issue 2

## Required verification

- [ ] 先写 failing draft/composer tests。
- [ ] 运行 repo-native test 命令。
- [ ] 如改 composer 布局，截图验证长文本、Project selector、错误状态。

## Out of scope

- 多份 new-session draft。
- Project-scoped draft。
- Follow-up Draft。

---

## Issue 4: Project Removal 与二次确认

## Parent

Local PRD: `.scratch/project-registry-and-drafts/PRD.md`

## User stories covered

14, 15

## What to build

在 Project 行更多菜单中实现 Remove Project。Project Selector 不提供 remove。Remove 需要二次确认，文案说明：Project 会从 PiGUI 移除，本地文件不会删除，历史 Sessions 不会删除。

如果被移除 Project 是全局 Session Draft 的目标，保留 draft 文本但清空目标。如果当前界面正在打开该 Project 下的 Session，跳到 new-session empty state；如果当前界面不在该 Project 的 Session 中，不改变当前界面。

## Acceptance criteria

- [ ] Remove Project 只出现在 sidebar Project 行更多菜单。
- [ ] Project Selector 不显示 remove 管理动作。
- [ ] Remove 前显示二次确认。
- [ ] 确认文案明确不删除本地文件和历史 Sessions。
- [ ] Remove 从 Project Registry 移除 Project。
- [ ] Remove 不删除本地目录、不删除 Session Projection、不删除 Session Trace。
- [ ] Remove draft 目标 Project 时，保留文本并清空目标。
- [ ] 当前正在看被移除 Project 的 Session 时，导航到 new-session empty state。
- [ ] 当前不在被移除 Project 的 Session 中时，主内容不变。

## Blocked by

- Issue 1
- Issue 2
- Issue 3

## Required verification

- [ ] 先写 failing removal flow tests。
- [ ] 运行 repo-native test 命令。
- [ ] 截图验证 confirmation dialog。

## Out of scope

- 删除本地文件。
- 删除历史 Session。
- 批量移除。

---

## Issue 5: Follow-up Draft 按 Session 持久化

## Parent

Local PRD: `.scratch/project-registry-and-drafts/PRD.md`

## User stories covered

12, 13

## What to build

为已有 Session 的 composer 增加 Follow-up Draft。它按 Session id 持久化，一条 Session 最多一份，用于继续当前 Session，不允许切换 Project，也不是全局 Session Draft。

用户在 Session A 写 follow-up 后切到 Session B，再回到 Session A，输入应恢复。普通 submit、Queue 或 Steer 成功后清空对应 Session 的 Follow-up Draft；失败时保留文本并显示错误。对应 Session 行显示 draft indicator；所属 Project 折叠时，Project 行显示汇总 indicator。

## Acceptance criteria

- [ ] Follow-up Draft 按 Session id 跨 app 重启保留。
- [ ] 切换 Session 后回到原 Session，未提交 follow-up 文本仍在。
- [ ] Follow-up composer 不显示 Project Selector。
- [ ] 普通 submit 成功后清空对应 Follow-up Draft。
- [ ] Queue 成功后清空对应 Follow-up Draft。
- [ ] Steer 成功后清空对应 Follow-up Draft。
- [ ] submit / Queue / Steer 失败时保留文本并显示错误。
- [ ] 有 Follow-up Draft 的 Session 行显示 draft indicator。
- [ ] 折叠 Project 内存在 Follow-up Draft 时，Project 行显示汇总 indicator。

## Blocked by

- Issue 2
- Issue 3

## Required verification

- [ ] 先写 failing follow-up draft tests。
- [ ] 运行 repo-native test 命令。
- [ ] 如改 composer/indicator UI，截图验证。

## Out of scope

- Follow-up Draft 跨 Session 移动。
- Follow-up Draft 切 Project。
- Queued Message reorder。

---

## Issue 6: 非 Git Project 的运行与 Git-only action gating

## Parent

Local PRD: `.scratch/project-registry-and-drafts/PRD.md`

## User stories covered

3

## What to build

让非 Git Project 可以正常创建和运行 Session。非 Git Project 使用 foreground local directory 作为 Execution Checkout，Pi Runtime `cwd` 指向 Project 目录。Git-only 能力在 Structured Action Surface 中隐藏或禁用，并显示清晰状态，例如 No Git repository。

Git Project 仍可沿用既有 repo/worktree 行为；这个 issue 不新增 branch/commit/push/PR 自动化，只保证非 Git Project 不被错误拒绝，并且 Git-only UI 不误导用户。

## Acceptance criteria

- [ ] 非 Git Project 可以提交全局 Session Draft 并创建 Session。
- [ ] 非 Git Project 的 Execution Checkout mode 为 foreground local directory。
- [ ] Pi Runtime `cwd` 指向非 Git Project 目录。
- [ ] diff、managed worktree、commit、push、PR 等 Git-only 能力对非 Git Project 不可用。
- [ ] Action surface 明确显示非 Git 状态，不暗示可以执行 Git action。
- [ ] Git Project 的既有 Session creation / checkout 行为不回归。

## Blocked by

- Issue 1
- Issue 3

## Required verification

- [ ] 先写 failing non-Git Project tests。
- [ ] 运行 repo-native test 命令。
- [ ] 如改 action surface UI，截图验证 Git Project 与 non-Git Project。

## Out of scope

- 自动 `git init`。
- Git branch/commit/push/PR 实现。
- 子 repo / monorepo package UI。
