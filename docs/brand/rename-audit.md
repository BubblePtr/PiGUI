# PiGUI → Pace 品牌改名盘点

昨天（PR #235）只接入了 Pace 的图标与字标，应用标识、数据目录、发布名仍是 PiGUI（见 `docs/design/brand.md` 末段）。本文盘点把品牌名整体切换到 Pace 时需要改动的每一处，按"用户可感知"到"纯内部标识"分层，并标出会破坏已安装用户的位置。上一次改名（Pig → PiGUI）的记录是 [ADR-0017](../adr/0017-rename-to-pigui.md)，本次落地时应新增一条 ADR。

盘点基线：`main` @ `251d11b`，仓库内共 1270 处 `pigui` 匹配（不含 `node_modules`、`dist`、`.scratch`、`bun.lock`）。

## 先定的命名决策

落地前需要一次性敲定以下名字，后面所有改动都从这里派生：

| 项 | 现值 | 建议 | 说明 |
| --- | --- | --- | --- |
| 产品名 | PiGUI | **Pace** | About 页已显示 "Pace Agent"；建议 "Pace" 为产品名，"Pace Agent" 只作完整展示名（About、官网标题），界面文案里一律用 "Pace" |
| GitHub 仓库 | `BubblePtr/PiGUI` | `everward-works/pace`（转移到 organization） | 用 `gh repo transfer` 或仓库 Settings → Transfer；issue、release、star 随仓库走，旧 URL 重定向。转移后核对 Actions secrets（五个 Apple 凭据）是否还在，缺则重填；`electron-builder.yml` 的 `publish.owner` 与 `linux.maintainer` 同步改。需确认 electron-updater 的 feed 能跟随重定向（见"破坏性位置"） |
| macOS bundle id | `com.bubbleptr.pigui` | `works.everward.pace`（随 organization）或 `com.bubbleptr.pace` | 改 bundle id 等于换一个应用：Gatekeeper、钥匙串条目、`CFBundleIconName` 都按新 id 走；旧版本不会被视为同一应用而原位更新 |
| Linux 可执行名 / desktopName | `pigui` / `pigui.desktop` | `pace` / `pace.desktop` | |
| 后端数据目录 | `~/.pigui`（dev：`~/.pigui-dev`） | `~/.pace`（dev：`~/.pace-dev`） | 必须迁移，见下 |
| Electron userData | `~/Library/Application Support/@pigui/desktop` | 随包名变化 | 由 `apps/desktop/package.json` 的 `name` 派生，必须迁移，见下 |
| workspace 包作用域 | `@pigui/*` | `@pace/*` 或保留 | 五个包全部 `private`，npm 上的 `@pace` 归属无所谓；但改作用域会连带 userData 路径，建议与数据迁移一起做 |
| 环境变量前缀 | `PIGUI_*` | `PACE_*` | 14 个不同变量，主要在 E2E、CI、脚本里 |
| localStorage / IPC / CSS 前缀 | `pigui.*` / `pigui:*` / `pigui-*` | 建议保留 | 纯内部标识，用户看不到；localStorage 键改名需要迁移代码，收益为零 |

## 第一层：用户可感知（必改）

### 应用标识与打包

- `electron-builder.yml`：`appId`、`productName`、`artifactName`（由 productName 派生，DMG/zip 文件名会变）、`dmg.title`、`linux.executableName`、`linux.synopsis`、`publish.repo`。`mac.extendInfo.CFBundleIconName: Pace` 已经是新名。
- `apps/desktop/package.json`：`name`（决定 userData 路径）、`description`、`desktopName`。
- 根 `package.json`：`name`，以及 `test:e2e:packaged:mac` / `test:e2e:packaged:linux` 脚本里写死的 `PiGUI.app/Contents/MacOS/PiGUI`、`linux-unpacked/pigui` 路径。
- `.github/workflows/release-macos.yml`：挂载 DMG 后检查的 `PiGUI.app` 路径与 `lipo` 目标（第 83、84、94 行）；`pigui-notary`、`pigui-dmg` 这类临时目录名可顺带改。
- `scripts/release-macos.mjs`、`scripts/publish-release.sh`、`scripts/test-release-*.mjs`：各含 1 处产品名或产物名断言。
- `build/`：图标已是 Pace；`entitlements.mac.plist` 需核对是否含 bundle id。

### 界面文案（非测试代码中的 `PiGUI` 字面量）

| 文件 | 内容 |
| --- | --- |
| `apps/desktop/electron/main.ts:140` | 窗口标题 `title: "PiGUI"` |
| `apps/desktop/index.html:6` | `<title>PiGUI</title>` |
| `apps/desktop/src/pages/preflight.tsx:132` | 预检页标题 "PiGUI — Environment check" |
| `apps/desktop/src/pages/settings-changelog.tsx:42` | "What's new in PiGUI" |
| `apps/desktop/src/pages/agent-workspace.tsx:285,1999,2120,3415,3421` | 搜索项 meta、空态 shimmer 文字、"PiGUI-managed worktree"、fork 提示两条 |
| `apps/desktop/src/app/app-shell.tsx:1458,1546,1572,1587,1606` | 移除 Project、重命名/归档/删除 Session 的确认与错误文案 |
| `apps/desktop/src/shared/ui/composer-attachments/composer-attachment-logic.ts:15` | 附件类型限制提示 |
| `apps/desktop/src/entities/session/use-session-projections.tsx:82` | Session 文件缺失提示 |
| `apps/desktop/src/pages/design.tsx:230` | Design 页副标题（dev-only） |
| `apps/desktop/src/dev/ui-intent/format-intent.ts:36` | UI intent picker 输出头（dev-only） |
| `packages/backend/src/workspace/environment-preflight.ts:114,125,148,160` | 预检项的 detail / summary / 修复建议 |
| `apps/desktop/electron/main.ts:245,252,332,431,669,673` | 主进程错误信息（会进日志，用户可能在 issue 里贴出） |
| `packages/backend/src/drivers/terminal.ts:297` | `TERM_PROGRAM = "PiGUI"`，Terminal Surface 里的 shell 能读到 |
| `apps/desktop/src/entities/release/changelog.ts:21,22,65,66` | 历史发布说明与 Release 链接。**建议保留**"The first PiGUI release"这类历史叙述，只把链接域跟随仓库改名（旧链接会重定向，不改也能用） |

### 仓库与发布面

- `gh repo rename` + `gh repo edit --description`：当前描述仍写 "traces / plugin panels"，与 ADR-0032 改用 trajectory / extension 的口径不一致，改名时一并更新。
- 本地 remote URL 会由 `gh repo rename` 自动更新；每个 worktree 与其他机器的 clone 需要手动 `git remote set-url`。
- GitHub Release 标题模板："PiGUI 0.0.2" 出自 `docs/release/macos.md` 的 tag 命令示例与 `scripts/publish-release.sh`。

## 破坏性位置：会影响已安装的 v0.0.1 / v0.0.2 用户

这三处不处理，改名就等于让老用户丢数据或断更新。建议它们在同一个 PR 内和改名一起落地，并各自带测试。

1. **自动更新 feed。** `electron-updater` 用 `electron-builder.yml` 的 `publish.owner/repo` 生成 `app-update.yml` 打进已发布的 0.0.2 包里，也就是说老版本永远去 `BubblePtr/PiGUI/releases` 找 `latest-mac.yml`。GitHub 对改名仓库的 `releases/download` 与 API 路径做 301 重定向，electron-updater 的 GitHub provider 走 HTTPS 也会跟随；但这必须在发布前用 0.0.2 的安装包实测一次，不能靠推理。另外 `appId` 变了，macOS 上 Squirrel 替换 `.app` 时不校验 bundle id，但钥匙串里以 bundle id 存的条目（若有）不会跟过来。
2. **后端数据目录 `~/.pigui`。** journal、projection、preflight 状态都在这里，`docs/dogfooding.md` 明确要求宿主升级后仍能读旧数据。改成 `~/.pace` 需要在 `session-event-journal.ts` 的 `resolveDataDir` 里加一次性迁移：新目录不存在且旧目录存在时整体 `rename`（同一文件系统内原子），失败则回退读旧目录并记日志。也可以选择**不改目录名**，只改品牌；这是最省事的方案，代价是 `~/.pigui` 会永远留着旧名。
3. **Electron userData。** 路径由包名 `@pigui/desktop` 派生，renderer 的 localStorage（项目注册表 `pigui.projectRegistry.v1`、草稿、模型偏好、浏览器 tab）全在这里。改包名后 Chromium 会当作全新 profile，所有本地偏好归零。处理方式二选一：在 `main.ts` 的 `app.setPath("userData", …)` 之前迁移旧目录；或用 `app.setName`/显式 `setPath` 把 userData 固定在旧路径。`backend-environment.ts` 里 `-dev` 后缀逻辑要一起验证，否则 dev 实例与宿主又会撞同一个 Chromium profile。

## 第二层：内部标识（可选，建议单独 PR）

这些改不改用户都看不出来，但会让代码库里新旧名混杂。建议改名 PR 只做第一层，第二层用一个纯机械替换的 PR 跟进，或者明确决定保留。

| 类别 | 规模 | 建议 |
| --- | --- | --- |
| `@pigui/*` 包名、`workspace:*` 依赖、tsconfig / vite / electron-vite 三处 alias、全部 import | 5 个包，import 遍布 `apps/` 与 `packages/` | 若决定改数据目录与 userData，一起改；否则保留 |
| `PIGUI_*` 环境变量 | 14 个：`PIGUI_DATA_DIR`、`PIGUI_HOME`、`PIGUI_E2E_*`（27 处）、`PIGUI_ENABLE_BROWSER_DEVELOPMENT_MOCKS__`、`PIGUI_APP_VERSION__`、`PIGUI_PI_VERSION__`、`PIGUI_SDK_SPIKE_*`、`PIGUI_RUN_PI_SDK_SPIKE`、`PIGUI_IDLE_MEMORY_*` | 改；`PIGUI_DATA_DIR` 是文档公开的覆盖入口，改名后保留一个版本的旧名兼容读取 |
| localStorage 键 `pigui.*.v1/v2`（10 个） | 持久化用户数据 | **保留**，改名需要迁移代码，无收益 |
| IPC channel `pigui:*`（约 15 个） | preload ↔ main 契约 | 保留或改，纯机械 |
| CSS class `pigui-*`（约 25 个）、`data-testid` | 样式与测试选择器 | 保留或改，纯机械；改则 71 个测试文件跟着动 |
| TS 标识符 `PiGUIRendererApi`、`PiGUIIcon`、`window.pigui` | 3 处 | 顺带改 |
| 源码注释里的 "PiGUI"（约 30 处） | 说明性 | 顺带改 |

## 第三层：文档

- `README.md` / `README.zh-CN.md`：本次重写，见同 PR。
- `AGENTS.md`（`CLAUDE.md` 只是导入）、`CONTEXT.md`：产品名与仓库路径提示。
- `docs/` 下 48 个文件含旧名，其中 30 个是 ADR。**ADR 是历史记录，不回改正文**；只在 `docs/adr/README` 或新 ADR 里说明"ADR-0036 之前的 PiGUI 即 Pace"。非 ADR 文档（`dogfooding.md`、`release/macos.md`、`design/*.md`、`self-built-ui.md`、`changelog.md`、`agents/*.md`、`ui-intent-picker.md`、`runtime-release-validation.md`、`research/*.md`）按需改，`research/` 可当归档不动。
- `.scratch/` 是归档，不动。
- `apps/server/README.md`、`apps/web/README.md` 随包名改。

## 缺失的开源基建（改名时一并补齐）

对照 Apache Maka 的仓库结构，本仓库缺：

- `LICENSE`：仓库根目录**没有任何许可证文件**。没有它，任何外部贡献在法律上都不成立；README 也无法写 License 段。需先选定（Apache-2.0 / MIT）。
- `CONTRIBUTING.md`：现有贡献规则散在 `AGENTS.md`（分支、PR、gh stack）与 `docs/agents/`（issue、triage 标签），面向的是 agent 而非人类贡献者。
- `CODE_OF_CONDUCT.md`、`SECURITY.md`、`.github/ISSUE_TEMPLATE/`、`.github/PULL_REQUEST_TEMPLATE.md`。

## 建议的落地顺序

1. **决策 PR**：新增 ADR-0036 记录上表命名决策，补 `LICENSE`。
2. **改名 PR（第一层 + 三处迁移）**：文案、打包配置、脚本、CI；数据目录与 userData 迁移各带单元测试；`gh repo rename` 在合并后执行。发版前用 0.0.2 安装包实测自动更新能跟到改名后的仓库。
3. **标识 PR（第二层）**：包作用域、环境变量、类型名的机械替换，`tsc` + 全量测试 + `electron-vite build` 全绿即可。
4. **文档 PR**：`AGENTS.md`、`CONTEXT.md`、`docs/` 非 ADR 文件、`CONTRIBUTING.md`。
5. 发一个 MINOR 版本（`0.1.0`）作为改名后的首个版本，Release 说明里写明旧名与数据迁移行为。
