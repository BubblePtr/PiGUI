# ADR-0034：无 Project 的对话使用内置 Chat Workspace

- 状态：Accepted
- 日期：2026-09-07

## 背景

ADR-0004 把 Project 定为唯一顶层组织单元；ADR-0019 与 CONTEXT.md **Empty Workspace State** 规定：Registry 为空时不提供无 Project 归属的 prompt 输入，用户必须先 Add Project。结果是问一句闲话、写一段草稿也要先选一个文件夹——既污染 Project 列表，又让 Pi 在错误的 cwd 下工作。

Pi 永远需要 cwd（`createAgentSession({ cwd })`），所以"无 Project"不等于"无目录"。Codex 桌面版给无项目 chat 准备真实目录；PiGUI 采用同一思路，但目录放在自己的数据目录下，对用户隐藏。

## 决策

### 1. identity 用哨兵 projectId，不把 projectId 改成可空

`create_session` / `resume_session` / `fork_session` 与 Session Projection 的 `projectId` 仍是必填字符串。常量 `CHAT_PROJECT_ID = "chat"`：Registry 的 Project id 都是规范化绝对路径（以 `/` 开头），`chat` 不可能冲突。现有路由 `/projects/$projectId/sessions` 复用为 `/projects/chat/sessions`，不新增路由。

### 2. Chat Workspace 不进入 Project Registry

它是内置描述符（`entities/project/chat-workspace.ts`），不写入 `pigui.projectRegistry.v1`，不可 Remove，不经过 `normalizeProjectPath`。Sidebar 顶部固定 Chats 分组，过滤 `projectId === "chat"` 的 Session。

### 3. 目录由后端创建，每 Chat 一个 sessionId 目录

Gateway 方法 `prepare_chat_workspace({ sessionId }) -> { cwd }`：`mkdir -p <dataDir>/chats/<sessionId>`，幂等，返回绝对路径。渲染层不知道 dataDir，对 Chat 目标走 `foreground-local`，`projectRoot = runtimeCwd = 返回的 cwd`。resume 时若目录被删，后端在启动 runtime 前重建。不做 Codex 的日期 + slug 命名（会话标题总结尚未落地）；目录内不预建子目录。

Fork 一个 Chat Session 产生新的 Chat 目录，不复制源目录文件（与非 Git Project 的 Fork 语义一致）。

### 4. 标签、Draft 目标与空状态

- Trajectory / Usage：cwd 位于 `<dataDir>/chats/` 之下时 `deriveProjectName` 返回 `"Chat"`。
- Session Draft 目标为 Project 或 Chat。ProjectPicker 首项 "Chat · no project"。默认：Registry 为空 → Chat；非空 → Current Project。目标 Project 被移除时仍按 ADR-0019 清空目标并要求重选，不自动回落到 Chat。
- 全局 New Session 始终显示。Empty Workspace State = Chats 分组 + Add Project，landing 到 Chat draft。
- Settings 增加只读的 Chats section（根目录路径 + 打开文件夹）。不做自定义根目录、不做自动清理：目录跟随 `PIGUI_DATA_DIR`。

### 5. 部分推翻的范围

- **部分推翻 ADR-0004**："Project 是唯一顶层组织单元"。Project 仍是代码目录的组织单元；无代码库的对话走 Chat Workspace。Analyze（Trajectory / Usage）仍按 Session 工作，只是 Chat Session 的 project 标签为 "Chat"。
- **部分推翻 ADR-0019**：Empty Workspace 不再禁止 prompt 输入；Project Selector 不再以 Registry 为唯一来源（Chat 是内置首项）。Registry 本身的手动添加语义、Draft 全局唯一、移除 Project 时清空目标且不自动回落——这些不变。

## 后果

- 后端：`packages/backend/src/workspace/chat-workspace.ts` 解析/创建目录；Runtime Gateway 增加 `prepare_chat_workspace`；`resume_session` / `fork_session` 在 `projectId === "chat"` 且 cwd 缺失时重建目录。
- 渲染层：Chat 描述符、landing、Sidebar Chats 分组、ProjectPicker、页头 "Chat"、Settings Chats section。
- CONTEXT.md 新增 **Chat Workspace**、**Chat Session**，并改写与"必须有 Project"冲突的词条。
- Session Creation 状态机（ADR-0010）顺序不变。Pi Session State 仍由 Pi 存到 `~/.pi`（ADR-0021）。
