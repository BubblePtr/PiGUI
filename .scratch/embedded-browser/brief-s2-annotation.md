# 任务简报:Embedded Browser S2 标注层(preload + isolated world + Shadow DOM 覆盖层,design mode)

> 简报是派发视图,不是事实源。目标与验收标准以 GitHub Issue #150 与 PRD 为准。

## 关联 Spec

- GitHub Issue **#150**(`gh issue view 150`)—— 要做的事与验收标准。
- `.scratch/embedded-browser/PRD.md` —— 决策 3(安全边界)、4(标注层)、5(`BrowserAnnotationElement` 形状)、6(弹层快照机制,理解为什么工具条不能用弹层)、Spike 结论第 3 项(isolated world 覆盖层实测)、**「S2 / S3 实现约束」段第 1/2/3/6/7 条是本任务的硬约束**。
- 本任务只做 S2。S3(#151,core 类型、截图、Send to composer)与 S4(#152,ADR)不做。

## 背景

- 先读 `AGENTS.md`、`README.md` Architecture 段、PRD,再读 PR #149 正文(`gh pr view 149`)了解 S1 与 PRD 的偏差(命令 8 条、事件只有 `did-navigate` / `did-fail-load`)。
- S1 代码地图(S2 要接的缝):
  - `apps/desktop/electron/browser-host.ts`(+ `.test.ts`):Electron-free 的命令表 / 生命周期 / 状态机。命令集合是枚举式(`browser-host.ts` 顶部),`browser-host.test.ts` 有一条 "claims only the commands it implements" 断言精确锁定命令集合。加命令要动:命令集合、`BrowserHostView` 类型、`invoke` switch、`main.ts` 的 `createBrowserView()` 实现、`src/entities/browser/browser-client.ts`、协议类型、该测试。
  - `apps/desktop/electron/main.ts`:`WebContentsView` 创建处的 `webPreferences` 目前没有 `preload`;preload 路径用 `join(__dirname, "../preload/preload.js")` 的方式算;`pigui:browser-event` 经 `emitBrowserEvent` 上抛;`ipcMain.handle("pigui:invoke")` 是渲染层命令入口,**没有 sender 校验,不要让新 preload 复用它**。
  - `apps/desktop/electron.vite.config.ts`:preload 只有一个入口(`format: "cjs"`,`entryFileNames: "[name].js"`);`@pigui/core` 走 `coreAlias` 打进产物。新入口在 `input` 加一个 key。
  - `apps/desktop/src/shared/browser-protocol.ts`(44 行):main / preload / renderer 三方唯一契约;标注消息类型加在这里。
  - `apps/desktop/src/shared/ui/browser/browser-surface.tsx`:40px 地址栏带,design mode 工具条挤进这里;`use-overlay-presence.ts` 是弹层快照机制的实现。
  - `apps/desktop/src/pages/session-browser-panel.tsx`:surface 容器,管状态机与快照。
  - `e2e/smoke/browser-surface.spec.ts`:fixture 是 `node:http` 现起的内联 HTML 页;嵌入页 Page 由 `testApp.app.waitForEvent("window")` 拿到;页内操作只能 `embedded.evaluate(...)`。
- 可复用的纯函数:`apps/desktop/src/dev/ui-intent/fiber-stack.ts` 里 `nearestTestId` 等纯 DOM 函数可以参考写法,但**不要搬 fiber 相关逻辑**(isolated world 读不到 fiber,见 PRD 实现约束第 1 条)。全仓没有 CSS selector 生成器,要自己写。
- 设计系统:工具条按钮先 `bunx astryx build "<idea>"` 找 Astryx 现成件(`IconButton` / `ToggleButton` 之类);新组件登记到 `apps/desktop/src/pages/design*.tsx` 的 Design 页并对账 `docs/self-built-ui.md`(AGENTS.md 硬规则,同 PR 必做)。覆盖层本身在页内 Shadow DOM,不是 React 组件,不登记;但它的样式要自包含(页面样式碰不到它,它也不能依赖 PiGUI 的 token)。
- 已有实证(PRD Spike 结论 3):isolated world 的 closed Shadow DOM 覆盖层在严格 CSP 页可用;页面能删宿主元素但读不到内容(S2 不做防删);主世界派发的 click 能被 isolated world 监听器收到。

## 涉及文件

- `apps/desktop/electron.vite.config.ts` — preload 第二入口
- `apps/desktop/electron/browser-annotation-preload.ts`(新)— 覆盖层 + design mode 交互 + `contextBridge` 免用(preload 自己就是 isolated world,直接 `ipcRenderer.send` 白名单消息即可,**不要**向页面暴露任何 API)
- `apps/desktop/electron/browser-annotation.ts`(新,+ `.test.ts`)— selector 生成 / 元素提取 / 标注状态的纯函数,不 import Electron,vitest(jsdom)直测
- `apps/desktop/electron/main.ts` — `webPreferences.preload`、标注 channel(`ipcMain.on` + sender 校验)、design mode 命令下发(`webContents.send` 给 view)
- `apps/desktop/electron/browser-host.ts`(+ `.test.ts`)— 新命令(建议 `browser_set_design_mode` / `browser_clear_annotations`,名字自定)
- `apps/desktop/src/shared/browser-protocol.ts` — 标注事件类型、channel 常量
- `apps/desktop/electron/preload.ts`、`apps/desktop/src/shared/runtime.ts` — 若标注事件要单独订阅方法则补;也可以并入现有 `BrowserEvent` 联合类型(优先后者,少一条通道)
- `apps/desktop/src/entities/browser/browser-client.ts` — 封装
- `apps/desktop/src/shared/ui/browser/browser-surface.tsx`、`apps/desktop/src/pages/session-browser-panel.tsx` — 工具条、标注状态展示(至少显示当前标注数)
- `apps/desktop/src/pages/design*.tsx`、`docs/self-built-ui.md` — 登记
- `e2e/smoke/browser-surface.spec.ts` — 新增 design mode 用例

## 约束

- TDD:纯函数与状态机先红后绿;主进程 sender 校验用 fake 测;真实 Electron 只在 E2E。
- 新 preload 与现有 `preload.ts` 不共享任何模块;build 后检查 `out/preload/` 只有两个自包含 `.js`,把检查结果写进报告。
- 标注消息:独立 channel,主进程只认该 view 的 `event.sender`;消息形状白名单化、字段做运行时校验(不信任页面内容,虽然发送方是 preload)。
- 工具条只用普通按钮,不用 Popover / Tooltip / Select / Dialog;评论输入在页内覆盖层里。
- 不做 `reactName`;`source` 只从 `data-*` 属性读(至少认 `data-source` / `data-inspector-relative-path` / `data-inspector-line` 这类,具体属性名自定并写测试)。
- 不进 Runtime Gateway、不改 `packages/backend`;不接 CDP;不改 `pigui:invoke` 的语义(加 sender 校验给它是 S4 后续 issue 的事,本任务不动)。
- 快照冻结期间(`session-browser-panel.tsx` 的 snapshot 状态)design mode 的交互自然不可用,不用特殊处理,但 Design 开关本身不能触发冻结。
- 代码注释英文;Conventional Commits;在 worktree 的功能分支 `feat/embedded-browser-annotation` 上提交,不 push、不开 PR。
- 验证命令:`bunx tsc --noEmit -p tsconfig.json`、`bun run test`(**不是** `bun test`)、`bun run test:e2e`。三条全绿才算完成,报告时附输出。dev 模式 1420 端口常被主 workspace 占着,worktree 里真机调试用 `cd apps/desktop && bun run build && bun run preview`。

## 范围外

- `formatBrowserAnnotationPrompt`、截图叠印、Send to composer、composer 注入口(S3)。
- ADR-0029、解冻引用(S4)。
- 跨源 iframe 内元素、防删宿主、多实例。
- `pigui:invoke` 的 sender 校验(单独 issue)。
