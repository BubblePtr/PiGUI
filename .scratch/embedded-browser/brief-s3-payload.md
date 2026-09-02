# 任务简报:Embedded Browser S3 标注载荷回传 composer

> 简报是派发视图,不是事实源。目标与验收标准以 GitHub Issue #151 与 PRD 为准。

## 关联 Spec

- GitHub Issue **#151**(`gh issue view 151`)—— 要做的事与验收标准。
- `.scratch/embedded-browser/PRD.md` —— 决策 5(载荷形状、截图通道、`formatBrowserAnnotationPrompt`、落草稿不直发)、「已拍板」段(只落草稿,不加 Send now)、「S2 / S3 实现约束」段第 4、5 条是硬约束。
- 本任务只做 S3。S4(#152,ADR)不做。

## 背景

- 先读 `AGENTS.md`、`README.md` Architecture 段、PRD,再读 PR #153 正文(`gh pr view 153`):S2 已合入 main,里面有「与 PRD 的偏差」与「已知限制」。
- S2 落地的接缝:
  - `apps/desktop/src/shared/browser-protocol.ts`:`BrowserAnnotationElement` 目前定义在这里(S2 偏差 1),`BrowserEvent` 的 `annotations-changed` 事件带完整 `annotations` 数组。**S3 把类型搬到 `packages/core`**,protocol 里只 `export type { ... } from "@pigui/core"`——注意 `electron/browser-annotation*.ts` 对 protocol 只能 `import type`,搬完后 `bun run build` 必须仍是两个自包含 preload(`grep -c 'require("\.' apps/desktop/out/preload/*.js` 为 0)。
  - `apps/desktop/src/pages/session-browser-panel.tsx`:现在只存 `annotationCount`;S3 要存完整 `annotations` 数组。
  - `apps/desktop/electron/main.ts` 的 `capture()`:`webContents.capturePage()` → PNG data URL,已被弹层快照机制使用(`browser_capture`)。
  - `apps/desktop/electron/browser-annotation-overlay.ts`:序号徽章在页内,`capturePage` 自然带上;hover 高亮是 `position: fixed` 的框,指针离开页面到工具条时可能仍留在最后一个元素上,截图前要保证它隐藏(建议:overlay 在 `pointerleave`/`mouseleave` document 时隐藏高亮,或加一条 `hide-highlight` 命令在截图前下发)。
- composer 侧(scout 已核实,路径以此为准):
  - 附件逻辑在 `apps/desktop/src/shared/ui/composer-attachments/`(`composer-attachment-logic.ts`、`use-composer-attachments.tsx`),不在 `pages/`。`ComposerAttachment` 需要真的 `File`;转 base64 在提交时 `buildPromptWithAttachments` 做,并校验 8 MiB(`RuntimePromptImage`,`packages/core/src/prompt-image.ts`)。
  - composer 草稿是 `FullChatComposer`(`apps/desktop/src/pages/agent-workspace.tsx`,`useState` 约 719 行)的局部 state,附件 `useComposerAttachments()` 约 725 行;**没有 store / context / imperative handle**。草稿按 Session 持久化在 `apps/desktop/src/entities/session/follow-up-drafts.ts`(localStorage,只存文本),有 `pigui:follow-up-drafts-changed` CustomEvent,但 `FullChatComposer` 只在 mount / sessionId 变化时读一次,**不订阅**。
  - 因此需要一个新的注入入口:在 `follow-up-drafts.ts` 旁按同一 CustomEvent 范式加一条「注入到 composer」事件(携带 sessionId、要追加的文本、要加的 `File[]`),`FullChatComposer` 订阅并只处理自己 sessionId 的事件:文本追加到草稿(已有内容时空一行再接),文件走 `attachments.addFiles`。**只支持当前 Session 已挂载的 composer**;未挂载时事件无人消费,按钮侧不需要感知。
- core 侧:`packages/core/src/index.ts` 是唯一公共面(禁止深导入),新文件 `packages/core/src/browser-annotation.ts` + 同名 `.test.ts`;markdown 格式化先例见 `packages/core/src/format-intent.ts`。
- 截图体积:`capturePage` 按 DPR 出图,2x 下宽面板 PNG 接近 8 MiB base64 上限。主进程用 `nativeImage.resize` 缩到 CSS 像素尺寸(1x)再转 PNG;仍超限则报错给渲染层而不是静默丢图。
- 载荷里的 `viewport { width, height, dpr }`:渲染层知道占位 div 的 bounds 与 `window.devicePixelRatio`;或让 preload 在 `annotations` 消息里带 `innerWidth/innerHeight/devicePixelRatio`,二选一,选后者更准(页面自己的视口)。
- 设计系统:`Send to composer` 是工具条上的普通按钮(不用弹层,原因见 PRD 实现约束 3),先 `bunx astryx build` 找现成件;`/design` 页 `browser-surface` 条目更新变体,`docs/self-built-ui.md` 对账。
- E2E:`e2e/smoke/browser-surface.spec.ts` 已有 design mode 用例(严格 CSP 页、`embedded.evaluate` 派发点击),在其基础上加「Send to composer → composer 草稿出现模板文本 + 一张图片附件」。E2E 跑的是 `apps/desktop/out/`,改渲染层后要先 `bun run build`。

## 涉及文件

- `packages/core/src/browser-annotation.ts`(新,+ `.test.ts`)、`packages/core/src/index.ts` — `BrowserAnnotationElement` / `BrowserAnnotationPayload` 类型、`formatBrowserAnnotationPrompt(payload): string`
- `apps/desktop/src/shared/browser-protocol.ts` — 类型改为从 core 再导出
- `apps/desktop/electron/main.ts`、`browser-host.ts`(+ test)— 截图降采样(可给 `browser_capture` 加参数,或新命令,自定;命令集合测试要同步)
- `apps/desktop/electron/browser-annotation-overlay.ts`(+ test)— 截图前隐藏高亮
- `apps/desktop/src/entities/session/follow-up-drafts.ts`(或旁边新文件,+ test)— composer 注入事件
- `apps/desktop/src/pages/agent-workspace.tsx` — `FullChatComposer` 订阅注入事件
- `apps/desktop/src/pages/session-browser-panel.tsx`(+ test)— 保存 annotations、组装 payload、截图、触发注入
- `apps/desktop/src/shared/ui/browser/browser-surface.tsx`(+ test)— `Send to composer` 按钮(有标注时才可用)
- `apps/desktop/src/pages/design-components.tsx`、`docs/self-built-ui.md` — 登记
- `e2e/smoke/browser-surface.spec.ts` — 回传用例

## 约束

- TDD:`formatBrowserAnnotationPrompt`、注入事件、payload 组装先红后绿;真实 Electron 只在 E2E。
- 只落草稿,不调用 `send_prompt`,不加 Send now。
- 不进 Runtime Gateway、不改 `packages/backend`;不新增后端持久化;图片不进 localStorage。
- 不改 `pigui:invoke` 语义;不复用它给嵌入页。
- 工具条只用普通按钮。
- `formatBrowserAnnotationPrompt` 输出固定 markdown:URL、视口、逐条 `#N <selector> — <comment>`,有 `source` 时附 `file:line`,有 `text` 时附截断文本;无 comment 时该条仍列出。模板一旦定下就是 Pi 看到的契约,测试锁定它。
- 代码注释英文;Conventional Commits;在 worktree 的功能分支 `feat/embedded-browser-payload` 上提交,不 push、不开 PR。
- 验证命令:`bunx tsc --noEmit -p tsconfig.json`、`bun run test`(不是 `bun test`)、`bun run test:e2e`。三条全绿才算完成,报告时附输出;另附 preload 自包含检查结果。

## 范围外

- ADR-0029(S4);Send now;结构化附件类型;跨 Session 回传;图片草稿持久化;`reactName`。
