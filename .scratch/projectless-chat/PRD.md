# PRD: Projectless Chat（无 Project 的普通对话）

Status: ready-for-agent
Feature: projectless-chat
Created: 2026-09-07

> 本 PRD 推翻 [ADR-0019](../../docs/adr/0019-project-registry-and-draft-model.md) 与 CONTEXT.md **Empty Workspace State** 中"不提供无 Project 归属的 prompt 输入"这一条。决策以 [ADR-0034](../../docs/adr/0034-projectless-chat-workspace.md) 记录（由实现 PR 落地）。ADR-0033 已用于应用内升级，本决策编号为 0034。

## Problem Statement

PiGUI 今天必须先 Add Project 才能开始任何对话：sidebar 的 New Session 在 registry 为空时直接隐藏（`app-shell.tsx:763-770`），landing 落到 `/trajectory`（`app-landing.ts:16-19`），composer 在没有目标 Project 时拒绝提交（`agent-workspace.tsx:1863-1866`、`session-creation.ts:121-123`）。但大量对话本来就不属于任何代码库：问一个问题、写一段草稿、让 Pi 在临时目录里跑个脚本。用户被迫先选一个无关文件夹，既污染 Project 列表，又让 Pi 在错误的 cwd 下工作。

Pi 本身永远需要一个 cwd（`createAgentSession({ cwd })`，`pi-sdk-runtime-adapter.ts:568-582`），所以"无 Project"不等于"无目录"。Codex 桌面版的做法是：无项目的 chat 使用 `~/Documents/Codex/<YYYY-MM-DD>/<slug>/` 作为 cwd，每个 chat 一个真实目录，用户不需要感知。PiGUI 采用同样的思路，但目录放在 PiGUI 自己的数据目录下（隐藏目录）。

## Solution

引入内置的 **Chat Workspace**：PiGUI 数据目录下的隐藏根目录 `<dataDir>/chats/`，每个 Chat Session 在其中拥有独立的会话目录 `<dataDir>/chats/<sessionId>/`，作为 Pi 的 cwd。Chat Session 是普通 Session，只是目标不是 Project 而是 Chat Workspace。

### 核心决策

1. **identity 用哨兵 projectId，不把 projectId 改成可空。** `projectId` 在 `create_session` / `resume_session` / `fork_session`（`runtime-gateway.ts:283/306/338`）和 projection 守卫（`session-projection-store.ts:69-81`）都是必填字符串；改可空要动每个消费者。定义常量 `CHAT_PROJECT_ID = "chat"`：Registry 中的 Project id 都是规范化绝对路径（以 `/` 开头），`chat` 不可能冲突；现有路由 `/projects/$projectId/sessions` 直接复用为 `/projects/chat/sessions`，不新增路由。
2. **Chat Workspace 不进入 Project Registry。** 它是内置 Project 描述符（`entities/project/chat-workspace.ts` 之类），不写入 `pigui.projectRegistry.v1`，不可 Remove，不经过 `normalizeProjectPath`。Sidebar 分组过滤 `projection.projectId === project.id` 时把它当作一个固定置顶分组。
3. **目录由后端创建，渲染层不知道 dataDir。** 新增 gateway 方法 `prepare_chat_workspace({ sessionId }) -> { cwd }`：`mkdir -p <dataDir>/chats/<sessionId>`，返回绝对路径。渲染层在 `prepareCheckout` 里对 Chat 目标走 `foreground-local`、`projectRoot = runtimeCwd = 返回的 cwd`。projection 照常持久化 `cwd`，所以 resume 不需要特殊处理；目录若被用户删掉，后端在 `resume_session` 前重建（同一个 helper，幂等）。
4. **每个 Chat 一个目录，目录名就是 sessionId。** 不做 Codex 的日期 + slug 命名：会话标题总结（#135）尚未落地，slug 无来源；sessionId 已是 projection identity，可以从 projection 直接反查目录。目录内不预建 `work/`、`outputs/` 子目录，Pi 直接在会话目录里工作。
5. **Fork 一个 Chat Session 产生新的 Chat 目录**，不复制源目录文件（与非 Git Project 的 Fork 语义一致：只复制对话上下文）。Fork 的 composer 提示文案沿用非 Git 的"可能存在源 Session 的文件改动"分支不适用，改为不提示。
6. **Trajectory / Usage 的 project 标签。** `deriveProjectName`（`sessions.ts:930-942`）以 `basename(cwd)` 标签，Chat 目录会显示成 sessionId。后端已知 dataDir，增加一条规则：cwd 位于 `<dataDir>/chats/` 之下时返回 `"Chat"`。
7. **Session Draft 目标扩展为 Project 或 Chat。** `draft.projectId` 可取 `"chat"`；ProjectPicker 首项固定为 "Chat · no project"，其后是 Registry 的 Project。默认目标规则：registry 为空 → Chat；registry 非空 → Current Project（不变）。目标 Project 被移除时仍按 ADR-0019 清空目标并要求重新选择，不自动回落到 Chat（避免 prompt 静默跑到别的 cwd）。
8. **入口与空状态。**
   - Sidebar 全局 New Session 始终显示（去掉 `hasProjects` 门控），点击打开全局 Session Draft，目标按第 7 条默认。
   - Sidebar 顶部固定一个 **Chats** 分组行：可折叠、有自己的 `+`（New Chat，目标锁定 Chat）、无更多菜单/Remove；分组下列出所有 `projectId === "chat"` 的 Session，排序与 Project 内 Session 一致。折叠状态与 Project 一样持久化。
   - Empty Workspace State 改为：Chats 分组 + Add Project 按钮，New Session 可用。
   - Landing：registry 为空且无 draft 目标时 → `/projects/chat/sessions?view=draft`，不再落 `/trajectory`。
   - Live Session 页头对 Chat Session 显示 "Chat" 而非目录名；Git-only 动作（Changes diff、branch、worktree）沿用非 Git Project 的禁用/隐藏态。Terminal surface 的 cwd 为会话目录。
9. **Settings。** 新增 `chats` section（`settings.tsx:727-731` 的 sections 数组 + `shared/settings-navigation.ts` 类型），内容只有两项：Chat Workspace 根目录的只读路径 + "Reveal in Finder / Open folder" 按钮（走现有 shell 打开能力，若无则新增 `reveal_path` IPC）。不做自定义根目录设置：目录跟随 `PIGUI_DATA_DIR`，dev 与正式 app 天然隔离，自定义路径留作未来需求。不做自动清理设置。
10. **词汇。** CONTEXT.md 新增 **Chat Workspace**、**Chat Session** 两条；改写 **Empty Workspace State**（保留 heading，`regions.test.ts` 断言 heading 存在）、**Project Selector**、**Session Draft**、**Session** 中与"必须有 Project"相冲突的句子。新增 [ADR-0034](../../docs/adr/0034-projectless-chat-workspace.md) 记录本决策并注明部分推翻 ADR-0019 与 ADR-0004 的"Project 是唯一顶层组织单元"。

### 不变的部分

- Session Creation 状态机（ADR-0010）顺序不变：projection → checkout → runtime → prompt。
- Pi Session State 仍由 Pi 自己存到 `~/.pi/agent/sessions/<encoded cwd>/`（ADR-0021），PiGUI 不传 `sessionManager`。
- Project Registry 语义不变：仍然只有手动添加的目录，Chat Workspace 不是自动发现。
- Session Projection 格式不变（`projectId: "chat"` 是合法字符串，旧版本读到也不会丢弃）。

## User Stories

1. As a Pi user, I want to open PiGUI and immediately type a prompt without adding a Project, so that casual questions do not require choosing a folder.
2. As a Pi user, I want chat sessions to run in an isolated directory PiGUI manages, so that Pi's file writes never land in a random Project.
3. As a Pi user, I want chat sessions listed in the sidebar under a fixed Chats group, so that they do not mix with Project sessions.
4. As a Pi user, I want to start a new chat from the Chats group or pick "Chat" in the composer target picker, so that I can choose per prompt whether it belongs to a Project.
5. As a Pi user, I want to resume, fork, and archive chat sessions exactly like Project sessions.
6. As a Pi user, I want the Trajectory and Usage pages to label these sessions as "Chat" instead of a random id.
7. As a Pi user, I want Settings to tell me where chat directories live and open that folder, so that I can retrieve files Pi produced.

## Acceptance Criteria（总）

- [ ] registry 为空时启动 app：landing 到 Chat draft，可直接提交 prompt 并创建 running Session；`~/.pigui-dev/chats/<sessionId>/` 存在且 Pi 的 cwd 等于它。
- [ ] registry 非空时，New Session 默认目标仍是 Current Project；picker 首项为 Chat。
- [ ] Chats 分组固定置顶，可折叠，无 Remove；chat session 不出现在任何 Project 分组下。
- [ ] Chat Session 的 resume（冷恢复）与 fork 正常；目录被删后 resume 自动重建目录。
- [ ] Trajectory 列表与 Usage 页对 chat session 显示 "Chat"。
- [ ] Settings 出现 Chats section，显示根目录并能打开。
- [ ] CONTEXT.md / ADR-0033 / README "Where things live" 更新；`regions.test.ts` 通过。
- [ ] `bun run typecheck` 与 `bun run test` 全绿；UI 改动附 dev-server 截图。

## Slices

| # | Issue | 内容 | 阻塞 |
| --- | --- | --- | --- |
| 1 | #208 | 后端：Chat Workspace 目录解析 + `prepare_chat_workspace` RPC + resume 重建 + Trajectory 标签 | — |
| 2 | #209 | 渲染层：Chat 目标的创建路径、Sidebar Chats 分组、Landing、Picker、页头、Settings section | Blocked by #1 |
| 3 | #210 | 词汇与文档：CONTEXT.md、ADR-0033、README、self-built-ui ledger（如有新组件） | Blocked by #2 |

## Out of Scope

- 自定义 Chat Workspace 根目录设置。
- Chat 目录的自动清理 / 配额。
- 日期 + slug 目录命名（等 #135 会话标题落地后再评估）。
- 把 Chat Session 迁移到某个 Project（"Move to Project"）。
- 扫描 `~/.pi` 导入外部 chat。

## Open Notes

- `resolveTerminalCwd`（`service.ts:468`）在既无 checkout root 又无 runtime cwd 时抛错；Chat Session 有 runtime cwd，应可直接工作，实现时验证一次。
- Windows 路径：`normalizeProjectPath` 只接受 `/` 开头；Chat 目录不经过它，但 `chat` 哨兵 id 与 Windows 盘符路径（`C:/...`）同样不冲突。
