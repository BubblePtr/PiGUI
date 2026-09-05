# ADR-0029：内置浏览器 surface 与 design mode 标注

- 状态：Accepted
- 日期：2026-09-03
- 来源：`.scratch/embedded-browser/PRD.md`（决策 1–6、Spike 结论、S2 / S3 实现约束）；PR #149（S0 + S1）、#153（S2）、#154（S3）；issue #86

## 背景

ADR-0013 把「内嵌浏览器 + DOM 标注」定为切换 Electron 外壳的承重理由，但在此之前全仓没有任何浏览器相关代码。ADR-0007 原文只冻结 terminal 与 file tree；「Browser 冻结」仅存在于 ADR-0028 的一句话与 `surface-registry.ts` 的注释里。Terminal 已由 PR #147 解冻（无书面 ADR）。

用户改完前端后要在外部浏览器看效果，再用文字描述「哪个元素哪里不对」回到 Chat。描述损耗大、定位不精确、来回切窗口。Codex / Claude Desktop / Cursor 都已把「内嵌预览 + 点选元素 + 结构化回传」做成标配。

本 ADR **正式解冻 Browser surface**：它是 PiGUI 的内置基础能力，不等插件 surface 协议（#85 / ADR-0018）定型；后期模块化能力增强后再评估抽成插件。ADR-0028 中「Terminal / File / Browser surface 仍受 ADR-0007 冻结」一句由本文修订；File surface 仍受 ADR-0007 冻结。

## 决策

### 宿主形态：主进程 `WebContentsView`，内置 Session surface

- 用 Electron `WebContentsView`，不用 `<webview>`（需开 `webviewTag`，渲染层直接持有敌意页面句柄）、不用 iframe（跨源不可注入，`X-Frame-Options` 直接拒载）。
- 视图由**主进程**创建与持有。命令走 `pigui:invoke` 的主进程截留分支（与 `select_project_directory` 同一层），显式命令表，不做前缀嗅探；事件走 `pigui:browser-event`。**不进 Runtime Gateway、不进 utilityProcess**，嵌入页面永远碰不到后端 MessagePort（ADR-0013 承诺）。
- 作为 SessionDock 的第三个 surface `browser` 接入（ADR-0028）：注册表只加元数据，内容由 `agent-workspace.tsx` 注入，rail 单图标，`multiInstance: true`，徽标显示当前 Session 的 tab 数。
- **多实例修订（2026-09-06，#185；前置 #184 已合入）**：每个 Session 持有自己的 tab 组，每个已导航的 tab 持有独立 `WebContentsView`。第一行复用 `SessionSurfaceBar` + `SessionSurfaceTabs`，地址栏与 design mode 工具条位于内容区第一行。
- 命令按 `{ sessionId, tabId }` 寻址，页面事件由主进程按发送方绑定同一身份。每个 tab 独立维护 URL、历史、加载/错误状态、design mode 与标注；只有当前激活 tab 接收 bounds 和显示请求。切换先隐藏旧视图，新视图收到有效 bounds 后才显示。
- 切 surface、关闭 Dock、切 Session 时隐藏视图，保留页面和标注；关闭 tab 才销毁它，关窗销毁全部。关闭最后一个 tab 后保留 Browser 空态，可通过地址栏或新建按钮再打开。
- **恢复分两层**：同一 Session 重入或 renderer 重载，重新附着主进程中已有的 tab；新的 Session 或应用重启时，从所属 Project 的 `pigui.browserTabs.v1` 恢复 URL 列表和激活序号。旧 `pigui.browserUrls.v1` 的单 URL 记录惰性迁移为一个 tab。空列表显式持久化，避免关闭全部后旧 URL 复活。只有 URL 与激活项持久化，标注、截图和历史只在原生实例存活时保留。
- URL 仍由用户输入。不做 dev server 探测、不读项目配置猜 URL、不代启 dev server。

**命令面**：`browser_attach / list / open / close / activate / hide_session` 管理实例；`browser_navigate / back / forward / reload / set_bounds / set_visible / open_external / capture / set_design_mode / clear_annotations / capture_annotation` 操作具体页面。空 tab 在首次导航时才创建原生视图。事件统一发布 tab 状态快照，渲染层只更新对应 Session 内仍存在的 tab，通过每 tab 递增 revision 拒绝过期答复或事件。

### 安全边界

嵌入内容默认按敌意页面对待，能力边界照抄 ADR-0022 的范式（渲染层只报意图，主进程解析并封顶）：

| 项 | 决定 |
|---|---|
| session | 独立 `session.fromPartition("persist:pigui-browser")`，与 renderer 的 session 完全隔离；`persist` 让本地 dev 站点登录态跨重启保留。**全局单分区**（已拍板）：分区名只在主进程一处，将来要按 Project 隔离只改字符串并把 projectId 传进主进程 |
| webPreferences | `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`、`webSecurity: true`，`preload` 只指向标注层 preload |
| 导航 | **两道闸缺一不可**：命令入口先校验 URL 只放行 `http:` / `https:`（主进程 `loadURL` 不触发 `will-navigate`，spike 实测 `file:///etc/hosts` 能直接装进去），`will-navigate` 再拦页面自己发起的跳转。`setWindowOpenHandler` 拒绝新窗口，`_blank` 改为本视图内导航（`setImmediate` 延后 `loadURL`，同步调用会死锁） |
| 权限 | `setPermissionRequestHandler` 默认全拒，v1 不开例外 |
| 下载 | `will-download` 直接取消 |
| 注入方向 | 只有主进程 → 页面（preload 即 isolated world，无 `contextBridge`，**不向页面暴露任何 API**）；页面 → PiGUI 只经 `pigui:browser-annotation` 这一条独立 channel，主进程按 `event.sender` 只认该 view 的 webContents，消息形状白名单化、逐字段重建。**不复用 `pigui:invoke`**：它没有 sender 校验，S2 之前安全只是因为视图没有 preload |
| 销毁 | 关窗后先 `webContents.close()`，再在 `isDestroyed()` 守卫下 `removeChildView`，否则 app 永不退出 |

### 标注层：isolated world + closed Shadow DOM

- 标注脚本是 `WebContentsView` 的第二个 preload（`electron/browser-annotation-preload.ts`），与 renderer 的 `preload.ts` **不共享任何运行时模块**：electron-vite 多入口会抽公共 chunk，sandbox preload 的 `require` 不支持相对路径；共享类型只能 `import type`。构建产物必须是两个自包含文件。
- 覆盖层是挂在 `document.documentElement` 下的宿主元素 + **closed Shadow DOM**：高亮框、序号徽章、评论输入框。结构全走 DOM API、样式全走 CSSOM（不用 `innerHTML`、不用 `<style>`），以扛住 Trusted Types 与严格 `style-src` 的页面。
- design mode 开启后：悬停高亮、点击选中并落序号、点序号展开评论、Esc 退出；期间页面的全部指针事件被吞。标记 `position: fixed`，window 捕获阶段的 `scroll` / `resize` 经 rAF 重测。主进程给每个新文档重放 design mode（preload 以 `ready` 消息报到）。
- **不做 `reactName`**：isolated world 共享 DOM 但不共享 JS wrapper，主世界挂在节点上的 `__reactFiber$` expando 在这里不存在；且 `_debugStack` 只在 React dev build 有。`source` 只从 `data-source` / `data-inspector-*` 属性 best-effort 读取。经主世界注入或 CDP 获取留作后续 issue。
- v1 不接 CDP；CDP `DOM` / `Overlay` 域留作 v2 升级路径。

### 载荷回传：core 类型、固定模板、只落草稿

- `BrowserAnnotationElement` / `BrowserAnnotationPayload` 与 `formatBrowserAnnotationPrompt` 在 `packages/core/src/browser-annotation.ts`；`browser-protocol.ts` 只做 type 再导出。模板固定、由测试锁定：有截图时靠序号定位，无截图时每条附 rect。
- **截图握手**：`browser_capture_annotation` → 主进程向页面下发 `prepare-capture` → overlay 收起评论气泡（提交评论）、隐藏 hover 高亮、重测视口，回 `capture-ready { annotations, viewport }` → 主进程 `capturePage` 并按面板 CSS 宽度 `nativeImage.resize` 降采样 → 返回 `{ image, annotations, viewport, url }`。渲染层用这份答复组装 payload，不用闭包状态。页面 500ms 不应答则按主进程最后收到的标注直接截图。序号本身在页内，`capturePage` 自然带上，不做 canvas 叠印。
- **只落草稿，不直发**（已拍板，不加 `Send now`）：`entities/session/composer-injections.ts` 用 window CustomEvent（与 follow-up-drafts 同范式）把文本与 `File` 交给当前 Session 已挂载的 `FullChatComposer`；文本追加到草稿并持久化，截图经 `attachments.addFiles` 走既有附件路径（抽屉预览 + 8 MiB 校验）。注入返回是否被消费，未消费时 surface 一行纯文本提示。图片不进 localStorage。

### 布局与原生视图的层叠

- 渲染层在 surface 内容区放占位 div，`ResizeObserver` + `resize` 把 `getBoundingClientRect()` 经 `browser_set_bounds` 推给主进程（spike：11 次宽度变更后逐像素相等）。
- <1280px 时 inspector 是 Base UI Dialog portal，原生视图会盖住遮罩：断点以下不显示原生视图，只显示「加宽窗口」空态。
- **任何 DOM 弹层打开期间**，先 `browser_capture` 把静态快照铺满占位 div，再 `setVisible(false)`；弹层全关后换回。弹层检测必须同时用两种信号：Astryx Layer 走 Popover API 的 `toggle` 事件（捕获阶段；`showPopover()` 不改属性不移节点，MutationObserver 看不见），Base UI 走 `[data-base-ui-portal] [data-open]` 的 MutationObserver。**因此浏览器 surface 自己的工具条只能用普通按钮**，任何 Popover / Tooltip / Select 都会把用户放到冻结截图上做标注。
- `WebContentsView` 设 `backgroundColor` 为面板底色，避免 macOS `transparent + vibrancy` 被开洞；bounds 永不覆盖 40px 表头带。
- 每个 tab 的导航独立递增 navigationId；截图握手绑定原页面，关闭或导航后返回的旧截图作废。渲染层在切 tab、切 Session 或关闭 tab 后丢弃仍在途的 Send to composer，避免把旧页面截图送进新上下文。

## 已知限制

宿主：

- 原生视图比 DOM 滞后约一个 IPC 往返；连续拖拽时视图边缘略落后于分隔线。
- `about:blank` / `file:` 不经 `will-navigate`（由命令入口白名单兜底）。
- 占位 div 纯位移（不改尺寸）不重推 bounds。
- `backgroundColor` 只在创建时取一次，主题切换后需重建视图才跟随。
- 单分区跨 Project 共享 cookie。
- 快照期间页面不可交互，有动画或视频的页面会看到一瞬冻结；从弹层打开到换上快照约 17ms 空窗。

标注层：

- 敌意页面能删覆盖层宿主（读不到内容）；页面能从宿主存在与子节点数推断 design mode 与标记数。
- 覆盖层只在主框架：iframe（同源或跨源）内元素标不到，design mode 也拦不住其点击。
- 页面自有 shadow DOM 内元素能选中，但 selector 止于 shadow root，从 document 查不到。
- `reactName` 不可得；`source` 依赖 dev server 打的 `data-*` 属性，生产站点为空。
- design mode 期间页面全部指针事件被吞，「先点开菜单再标注菜单项」做不到。
- `text` 取 `textContent`，`display:none` 子节点也算进去。
- 无单条删除；清空后序号从 1 重开。切 tab / surface 保留标注，重入时由主进程状态恢复计数；页面文档替换或关闭 tab 才丢弃对应标注。
- 覆盖层没有 hover / focus 的 CSS 态（CSSOM 内联样式的代价）。

载荷回传：

- 回传的 `rect` 是标记时刻的视口坐标，标记本身跟随滚动但 rect 不更新；无截图时退回 rect，对滚动过的元素是错的。
- 握手 500ms 超时后按最后收到的标注截图，进行中的评论可能缺失、打开的气泡可能入镜。
- 截图降采样到面板 CSS 宽度，HiDPI 下 Pi 看到 1x 图；滚出视口的标记在文本里列出但不在图上。
- 页面标题用于 tab 提示；实例名保持稳定的 Browser 序号。
- 注入只到达当前 Session 已挂载的 composer，不排队；注入文本作为 follow-up 草稿持久化，截图不持久化，重载后只剩文本。

## 结果

- ADR-0028「Terminal / File / Browser surface 仍受 ADR-0007 冻结」修订为：Terminal 由 PR #147 解冻、Browser 由本文解冻、File 仍冻结。
- `docs/self-built-ui.md` 的 browser-surface 条目指向本文。
- 后续小切片各开 issue：常见 errno 映射成人话；renderer 自身 CSP；固定宽度站点整页缩放；`reactName` 经主世界 / CDP 获取；`pigui:invoke` 补 sender 校验；`main.ts` 的 `capture` 降采样加 fake `nativeImage` 单测。

## 验证

- `browser-host.ts` 与 `browser-annotation*.ts` 均 Electron-free，Vitest 覆盖命令表、导航白名单、可见性状态机、握手 ack 与超时、selector 生成、消息校验、覆盖层交互。
- 渲染层组件测试覆盖 surface 五态、URL 按 Project 记忆、design mode 工具条、Project tab 组迁移与恢复、跨 tab 状态隔离、过期截图丢弃及注入口。
- Electron E2E 追加两 tab 的打开、切换、标注隔离、徽标、重载恢复与全部关闭空态。
- Electron E2E（`e2e/smoke/browser-surface.spec.ts`）：bounds 跟随面板、弹层换快照、`ERR_ABORTED` 不算失败、严格 CSP 页上 design mode 可用且页面读不到覆盖层、标注 → Send → composer 草稿出现模板文本与 PNG 附件。
