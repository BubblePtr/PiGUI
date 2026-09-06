# 任务简报：应用内升级（electron-updater）

## 关联 Spec

GitHub Issue #196（`gh issue view 196`）——目标、要做的事与验收标准以它为准。决策依据：`docs/adr/0033-in-app-update-via-electron-updater.md`；PRD：`.scratch/auto-update/PRD.md`。

## 背景

仓库：`/Users/void/code/opensource/PiGUI`（Bun monorepo，Electron 42 桌面端在 `apps/desktop`，主进程 `apps/desktop/electron/main.ts`，后端跑在 `utilityProcess`，见 ADR-0013）。先读 `README.md` 的 Architecture 与 `AGENTS.md`。

发布链路现状：electron-builder 26，`electron-builder.yml` 只出 arm64 DMG；`release-macos.yml` 由 `v*` tag 触发，`--publish never` 构建后由 `scripts/publish-release.sh` 用 `gh release` 先草稿上传再公开，已公开版本不可覆盖。签名与公证在 CI 强制执行，本机没有证书时只能 `bun run package:mac:unsigned`。

主进程已有的模式，照抄即可：`pigui:invoke` 的 handler 里主进程本地命令（`select_project_directory`、`reveal_project_in_finder`、`browser_*`）先截获再转发后端；`pigui:browser-event` 是主进程向渲染层推事件的现成样板（`preload.ts` 的 `onBrowserEvent`、`shared/runtime.ts` 的 `PiGUIRendererApi`）。`before-quit` 已负责取消后端重启定时器并杀后端，`quitAndInstall` 必须走这条路。

## 涉及文件

- `electron-builder.yml`、`.github/workflows/release-macos.yml`、`scripts/release-macos.mjs`、`scripts/publish-release.sh`、`scripts/test-release-macos.mjs`、`scripts/test-release-publish.mjs` — 产物与发布
- `apps/desktop/electron/main.ts`、`preload.ts` — 装配与 IPC；新建 `updater.ts` 与 `updater.test.ts`
- `apps/desktop/src/shared/runtime.ts` — 渲染层 API 类型与浏览器态回退
- `apps/desktop/src/pages/settings.tsx`、`settings.test.tsx` — 设置页新增区块
- `docs/release/macos.md`、`docs/self-built-ui.md` — 文档
- 参考：`apps/desktop/electron/browser-host.ts` 与其测试，看主进程模块如何被测试

## 约束

- 你已在独立 worktree 与分支 `feat/in-app-update` 上，不要切到 `main`，不要碰主 checkout。
- TDD：先写失败的测试再实现；验证命令见 issue 验收标准。
- 主进程保持薄：updater 逻辑全部在 `updater.ts`，`main.ts` 只装配。
- 不改版本号；不加 Linux / Windows 目标；CI 保持 `--publish never`。
- UI 先 `bunx astryx build "settings about section with version and update button"` 找 kit；自建组件必须放 `shared/ui/` 并同 PR 登记 `/design` 页（`apps/desktop/src/pages/design.tsx`）。
- 代码注释英文；文档中文；Conventional Commits；完成后推分支并开 PR（`gh pr create`，正文写 `Closes #196`），不要自己合并。

## 范围外

见 issue"范围外"。另：不改 `apps/web`；不动 Pi 运行时打包（ADR-0031）。
