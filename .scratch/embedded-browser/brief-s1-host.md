# 任务简报:Embedded Browser S0 spike + S1 宿主与 surface(只嵌 URL,无标注)

> 简报是派发视图,不是事实源。目标与验收标准以 PRD 为准。

## 关联 Spec

`.scratch/embedded-browser/PRD.md` —— 本任务覆盖其中 **「Spike」段的三项验证** 与 **「v1 范围」的 S1**。决策段 1(宿主形态)、2(URL 来源)、3(安全边界)、6(布局层叠)是本任务的实现依据;验收标准段中与主进程 / 渲染层 / E2E 相关的条目适用。S2–S4(标注层、载荷回传、ADR/design 页)不在本任务。

## 背景

- 仓库是 Bun + electron-vite 的 monorepo。先读 `AGENTS.md` 与 `README.md` 的 Architecture 段,再读 PRD。
- 最近一个同类先例是 Terminal surface(commit `0f46e38`,PR #147)。它展示了 surface 如何接入:`apps/desktop/src/shared/ui/session-inspector/surface-registry.ts` 只存元数据,`apps/desktop/src/pages/agent-workspace.tsx` 的 `SessionSurfaceContent` 按 `surfaceId` 注入内容,docked 布局与 `<1280px` Sheet 回退也在同一文件。**区别**:Terminal 的驱动在 utilityProcess 后端,浏览器视图必须在 Electron 主进程。
- 主进程接入点:`apps/desktop/electron/main.ts` 的 `ipcMain.handle("pigui:invoke")` 已有一条主进程截留分支(`__e2e_kill_backend` / `select_project_directory` / `reveal_project_in_finder`),`browser_*` 命令组加在这里。事件参考 `webContents.send("pigui:backend-event")` 的做法新开 `pigui:browser-event` 通道,并在 `electron/preload.ts` 与 `apps/desktop/src/shared/runtime.ts` 的 `PiGUIRendererApi` 补订阅方法。
- 当前外壳 `webPreferences` 只有 `preload` / `contextIsolation: true` / `sandbox: true` / `nodeIntegration: false`;全仓无 CSP、无 `will-navigate`、无 `setWindowOpenHandler`、无权限处理器。PRD 第 3 节的安全项全部由本任务落地(renderer 自身的 CSP 可选,做了要保证现有 E2E 不挂)。
- 布局冲突事实(已调查确认):面板宽度上下界只在挂载时算一次,实际宽度走 `style={{width}}`;`<1280px` 时 inspector 是 Base UI Dialog portal;macOS 窗口 `transparent + vibrancy`;两栏间的 `ResizeHandle` 带 `mx-2`;内容区顶部有 40px 表头。处理方式见 PRD 第 6 节表格,逐条落实。
- E2E 用 Playwright 驱动真实 Electron(`e2e/fixtures/electron-app.ts`,`e2e/smoke/terminal-surface.spec.ts` 是范例)。fixture 只暴露首窗口的 page,`WebContentsView` 的 contents 能否被 Playwright 拿到**未验证**,这正是 spike 第 2 项;拿不到就按 PRD 说的加主进程 `__e2e_*` 命令暴露当前 URL / 截图供断言。
- 设计系统:任何新 UI 先 `bunx astryx build "<idea>"` 找组件,只在没有等价物时自建到 `shared/ui/`,并在 `/design` 页登记(见 `AGENTS.md`「Design system discipline」)。地址栏、导航按钮、空态优先用 Astryx 现成件。
- 记忆存储:URL 按 Project id 记在渲染层 localStorage,参考 `apps/desktop/src/entities/project/project-registry.ts` 的 key 命名风格(`pigui.projectRegistry.v1`)。

## 涉及文件

- `apps/desktop/electron/main.ts` — 主进程 `browser_*` 命令组、`WebContentsView` 生命周期、安全处理器
- `apps/desktop/electron/preload.ts`、`apps/desktop/src/shared/runtime.ts` — 暴露 browser-event 订阅
- `apps/desktop/src/shared/ui/session-inspector/surface-registry.ts` — 注册 `browser` surface;删掉第 9 行「Browser 仍被 ADR-0007 冻结」的注释
- `apps/desktop/src/pages/agent-workspace.tsx` — `SessionSurfaceContent` 注入 browser surface 内容
- `apps/desktop/src/shared/ui/`(新建 browser surface 组件目录)— 地址栏表头、占位 div + bounds 同步 hook、断点以下空态
- `apps/desktop/src/entities/`(新建 browser client)— invoke 封装与 URL 记忆
- `apps/desktop/src/pages/design.tsx` — 登记新组件
- `e2e/smoke/` — 新增 browser surface 冒烟
- `docs/self-built-ui.md` — 登记自建件(若有)
- spike 代码放 `apps/desktop/src/proto/browser/`,结论回写 PRD「Spike」段后**拆除**,不进最终 diff

## 约束

- 先跑 spike 三项,把结论(每项一句能证伪的话 + 证据)写进 PRD「Spike」段下方的「结论」小节,再动 S1。spike 若推翻 PRD 某条决策,停下来报告,不要自行改决策。
- TDD:主进程逻辑(bounds 计算、可见性状态机、导航白名单、窗口打开 / 权限拒绝)抽成不依赖 Electron 的纯模块先写失败测试;渲染层组件测试用 Vitest + RTL;真实 Electron 只在 E2E。
- 浏览器命令不进 Runtime Gateway、不进 utilityProcess、不改 `packages/backend`。
- 不开 `webviewTag`,不用 iframe。
- 不新增后端持久化。
- 遵守 ADR-0028:注册表只存元数据;rail 单图标;不做多实例 UI。
- 代码注释英文;commit 用 Conventional Commits;在 worktree 的功能分支 `feat/embedded-browser-host` 上提交,不 push、不开 PR。
- 验证命令:`bunx tsc --noEmit -p tsconfig.json`、`bun test`、`bun run test:e2e`(macOS 下直接跑)。三条全绿才算完成,报告时附输出。

## 范围外

- 标注层、design mode、截图与载荷回传(S2–S4)。
- ADR-0029 正文(S4);但要在报告里列出 spike 与实现中发现的、应写进 ADR 的已知限制。
- dev server 探测 / 启动;多 tab;CDP。
- 弹层被原生视图盖住的完美处理——按 PRD 记为已知限制即可。
