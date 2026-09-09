# PRD: Resource Management（Pi 扩展体系的管理面）

Status: ready-for-agent
Feature: resource-management
Created: 2026-09-09

> 本 PRD 落实 [ADR-0031](../../docs/adr/0031-bundled-pi-runtime-and-extension-compatibility.md) 中"扩展的安装与启用配置、实际加载版本和兼容性需要可理解、可诊断"的承诺，把 Setup 页只读的 Config Inventory 升级为可操作的管理面。名词定义见 CONTEXT.md 的 **Resource Management / Package / Resource / Source / Origin**。决策以 ADR-0037 记录（由实现 PR 落地；ADR-0036 已用于改名与许可证）。

## 名词与边界（2026-09-09 讨论结论）

Pace 的插件系统分三个面，本 PRD 只覆盖第一个：

| 面 | 内容 | 状态 |
| --- | --- | --- |
| **管理面（Resource Management）** | 装 / 卸 / 更新 Package，开关 Resource，版本与加载诊断 | 本 PRD |
| 贡献面 | 扩展向 GUI 声明 Surface、标准 UI request | ADR-0018 能力缺口，#85 |
| 执行面 | Pi 加载并运行 Resource | Pi 自己的事，Pace 不介入 |

用户面对的只有两个名词：**Package**（装卸更新的单位）和 **Resource**（开关的单位，四类：Extension / Skill / Prompt / Theme）。Source（Package 的地址）、Scope、Origin 都是详情字段，不进入动作文案。"extension" 一词不再当四类的统称，Pi 自己在 `pi update --extensions` 里的混用不跟。

层级：`Package（由 Source 标识）→ Resource`。drop-in 目录里的东西没有 Package、没有 Source，直接以 Resource 出现。

## Problem Statement

Pace 承诺复用用户已有的 Pi 扩展（ADR-0031），但今天用户在 Pace 里只能看不能改：Setup 页的 Config Inventory 是只读清单（`apps/desktop/src/pages/setup.tsx:79` 写着 "Read-only Pi inventory"），后端 `buildConfigInventory`（`packages/backend/src/workspace/config.ts:6-46`）用 `SettingsManager.inMemory(settings, { projectTrusted: false })` 展开 user scope 的 packages，`ExtensionInfo` 只有 `name / source / enabled` 三个字段，`promptTemplates` 恒为空数组。用户要装一个包、关掉一个出问题的 extension，仍然得回到终端跑 `pi install` / `pi config`，或者让 agent 替自己改 `settings.json` 和挪文件。

Pi 本身没有"安装单个 extension 或 prompt template"的命令：自写资源要么放进 `~/.pi/agent/extensions/` 等约定目录被自动发现，要么 `pi install ./path` 以本地 Package 登记，要么手写 settings 顶层数组。这三条路 Config Inventory 目前分不清（`origin` 只区分 `package` 和 `top-level`，约定目录发现的资源没有名字）。

SDK 已经把整套管理能力暴露出来了：`DefaultPackageManager` 提供 `installAndPersist / removeAndPersist / update / checkForAvailableUpdates / listConfiguredPackages / resolve`，`SettingsManager` 提供 settings 读写与 Filter。Pace 已经集成 SDK（ADR-0018 / 0031），再 spawn CLI 是浪费。

## Solution

把 Setup 页的 Config Inventory 升级为 **Resource Management**：同一个页面，从只读变为可操作，动作一比一映射到 Pi SDK，不引入 Pi 没有的概念。

### 核心决策

1. **只跟 Pi 原生走，初期不为 Pi 拓展功能。** Pi 的 project scope（≈ VS Code workspace 级）、DeepSeek Harness 式 profile、整包一键禁用、`/reload` 热重载，全部不进首版。首版只做 user scope（`~/.pi/agent/settings.json`）。
2. **写回走 SDK，不 spawn CLI。** 后端新增 gateway 方法（命名待实现 PR 定，建议 `install_package` / `remove_package` / `update_package` / `set_resource_enabled` / `check_package_updates`），内部构造真实的 `SettingsManager.create(agentDir, agentDir)` 与 `DefaultPackageManager`，调用 `installAndPersist` / `removeAndPersist` / `update`；开关 Resource 通过 `SettingsManager` 改写该 Package 在 `packages` 数组里的 Filter（对象形式的 `extensions` / `skills` / `prompts` / `themes` 数组，用 `!pattern` 或 `-path` 排除）。Pace 由此成为 `settings.json` 的第二个写者，必须：每次动作前重新读取 settings、用 `withLock` 写回、失败时把 `settingsManager.drainErrors()` 报到 UI。
3. **安装单位是 Package，由 Source 标识。** 安装输入框只接受 `npm:`、`git:` 和 `https://…`，直接透传给 `installAndPersist(source)`，由 Pi 判定类型与校验；Pace 不做 Source 语法的二次解析。安装进度用 `setProgressCallback` 的 `ProgressEvent`（start / progress / complete / error，action install / remove / update / clone / pull）流回 UI。
4. **自写资源只走 drop-in。** 本地文件不进安装框，另有 **Add local resource** 动作：选择文件后复制进对应约定目录（`~/.pi/agent/{extensions,skills,prompts,themes}/`），成为 drop-in Resource。这是文件系统操作，不经过 `PackageManager`；仅支持单文件 extension（`.ts` / `.js`）、prompt（`.md`）、theme（`.json`）和 Skill 目录（含 `SKILL.md`）。Pi 原生的 `pi install ./path`（登记不复制）不在 GUI 里提供，讨论中判定它与复制重复且原文件移动后会报缺失路径；用户在 CLI 里这样登记的本地 Package，Pace 照常展示与卸载。drop-in 的移除就是删文件，确认文案必须写明。
5. **禁用单位是 Resource。** 每个 Resource 行一个开关。Package 详情页按四类分组列出它的 Resource。Package 本身没有开关（整包禁用留到以后，Pi Filter 能原生表达，届时不算拓展）。"只想要包里的一个 prompt template" 就是装包后关掉其余 Resource：npm / git 源在 Pi 里最小获取单位是 Package，单个文件只能通过 Filter 选择性加载；本地单文件则走第 4 条的 drop-in。安装确认框里预先勾选要启用的 Resource（装完立即写 Filter）是可选的后续增强，首版不做。
6. **Origin 新增 `drop-in` 取值。** Pi 0.84.3 对约定目录自动发现的资源给的是 `origin: "top-level"`、`source: "auto"`（`DefaultPackageManager.addAutoDiscoveredResources`），settings 顶层数组显式列出的则 `source` 为路径本身。`buildConfigInventory` 据此把 `source === "auto"` 的 Resource 标为 `drop-in`，其余 `top-level` 保持原值；引擎升级时用 contract test 守住这条判定。drop-in Resource 不能用 Filter 禁用（它不属于任何 Package）：首版对它只展示不提供开关，行上标注"由约定目录自动加载，移除文件即可禁用"，并提供 Reveal in Finder。
7. **Theme 只读，Skill 有下游。** Theme 类 Resource 展示但开关置灰，标注"仅影响 Pi 终端"。Skill 的启用状态被 composer 插入菜单消费（`use-composer-attachments.tsx:114-145`），禁用 Skill 后菜单必须同步刷新（复用 `["config-inventory"]` query 失效）。
8. **生效时机是显式承诺。** 每个动作完成后的提示统一写明"将在下一个新 Session 生效，运行中的 Session 不受影响"。不实现热重载，不去碰正在运行的 Pi 会话。
9. **诊断信息来自现有事件。** ADR-0031 已把扩展加载与事件处理错误送进首次响应与持久化事件历史；Package 详情页读取最近一次 Session 里与该 Package 路径相关的加载错误并展示，不新造诊断通道。`checkForAvailableUpdates` 的结果作为 Package 行的 "Update available" 徽标。
10. **`ConfigInventory` 契约升级。** `packages/core/src/config.ts` 的 `ExtensionInfo` 扩展为通用 `ResourceInfo { kind, name, path, enabled, origin, scope, packageSource? }`，四类共用；`packages` 从 `string[]` 变为 `PackageInfo { source, scope, filtered, installedPath?, resources: ResourceInfo[] }`；`promptTemplates` 真正填充。Setup 页的五个分类（`setup.tsx:22-30`）改为 Packages 一个总览加四类 Resource 视图，或按 Package 分组，由实现 PR 出截图后定。

### 不变的部分

- 只读展开仍然 `projectTrusted: false` 且 `onMissing → "skip"`：查询不安装、不执行扩展。安装动作是另一条显式路径。
- Pi 的 settings 文件格式、包目录、约定目录一概不变；Pace 写出的 settings 必须能被 `pi` CLI 原样读取。
- Surface 的 `provider` 字段与贡献面协议不在本 PRD 内。

## User Stories

1. As a Pi user, I want to install a package by pasting an npm name or git URL in Pace, so that I do not need a terminal to extend Pi.
2. As a Pi user, I want to add my own extension file or prompt template from Pace, so that Pi picks it up without me knowing the convention directory layout.
3. As a Pi user, I want to disable one misbehaving extension inside a package without removing the package, so that the rest keeps working.
4. As a Pi user, I want to see where every resource comes from (which package, top-level settings, or a drop-in directory), so that I know how to remove or change it.
5. As a Pi user, I want Pace to tell me that changes apply to the next Session, so that I am not confused when a running Session behaves the same.
6. As a Pi user, I want to see when a package has an update and apply it, so that I stay on the version the author intends.
7. As a Pi user, I want the same settings.json to keep working in the `pi` CLI after Pace edits it.

## Acceptance Criteria（总）

- [ ] Setup 页能安装 `npm:` / `git:` Package，进度与错误可见；安装后 `~/.pi/agent/settings.json` 的 `packages` 出现该项，`pi list` 能列出它。
- [ ] 能卸载 Package（settings 项移除，npm / git 安装目录清理由 Pi 负责）；CLI 登记的本地 Package 也能卸载且不删源文件。
- [ ] 每个非 drop-in、非 Theme 的 Resource 行有开关；切换后 settings 的对应 Package 变为对象形式且 Filter 正确；`pi config` 打开后显示同样的启用状态。
- [ ] drop-in Resource 显示 Origin 为 drop-in，无开关，有 Reveal in Finder 与删除；Add local resource 能把单文件资源放进正确的约定目录。
- [ ] Theme 行开关置灰并标注仅影响终端；禁用 Skill 后 composer 插入菜单立即不再列出它。
- [ ] 每个动作的完成提示写明下一个 Session 生效。
- [ ] Package 行显示 Update available 徽标，Update 动作可用。
- [ ] Pace 与 `pi` CLI 交替修改 settings.json 后互相不丢字段（contract test 覆盖）。
- [ ] CONTEXT.md 五个词条、ADR-0037、README "Where things live" 更新；`bun run typecheck` 与 `bun run test` 全绿；UI 改动附 dev-server 截图。

## Slices

| # | Issue | 内容 | 阻塞 |
| --- | --- | --- | --- |
| 1 | #251 | 契约与只读升级：`ResourceInfo` / `PackageInfo`，Origin 含 drop-in，promptTemplates 填充，Setup 页按新契约展示（仍只读） | — |
| 2 | #252 | 后端写回：install / remove / update / set_resource_enabled / check_updates 五个 gateway 方法，SDK 调用、锁与错误上报，与 CLI 互操作 contract test | Blocked by #251 |
| 3 | #253 | 渲染层动作：安装对话框、Add local resource、Resource 开关、Theme 置灰、生效时机提示、composer 菜单刷新 | Blocked by #252 |
| 4 | #254 | 诊断与更新：加载错误关联到 Package 详情，Update available 徽标；ADR-0037 与文档收尾 | Blocked by #253 |


## Out of Scope

- project scope（`.pi/settings.json`）与 Project Trust 的 GUI。
- profile / 配置集切换。
- Package 级一键禁用。
- `/reload` 热重载，或对运行中 Session 的任何干预。
- Package 搜索、市场、评分等发现类功能。
- 安装时预选要启用的 Resource（先装后关的一步化）。
- 贡献面：Surface `provider` 字段落地、Extension UI request 协议（#85 / ADR-0018）。
- GUI 里以本地路径登记 Package（`pi install ./path`）；多文件目录型资源的 Add local resource。
