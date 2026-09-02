# Embedded Browser:内置浏览器 surface 与 annotation design mode

> 立项依据:issue #86(Embedded browser annotation),ADR-0013 把"内嵌浏览器 + DOM 标注"定为切换 Electron 外壳的承重理由。
> 决策来源:2026-09-02 前置条件调查(结论存 Nowledge Mem)+ 用户拍板:**浏览器是 PiGUI 内置基础能力,不等插件 surface 协议(#85 / ADR-0018)定型;后期模块化能力增强后再考虑抽成插件。**
> 落地:切片开成 GitHub Issues 后在本文"切片"段回链;ADR 落地时编号定为 `docs/adr/0029-*.md`。

## 问题

Pi 改完前端代码后,用户要在外部浏览器里看效果、再用文字描述"哪个元素哪里不对"回到 Chat。描述损耗大、定位不精确、来回切窗口。Codex / Claude Desktop / Cursor 都已把"内嵌预览 + 点选元素标注 + 结构化回传"做成 Agent GUI 的标配。PiGUI 的 Electron 外壳就是为此选的,但至今没有任何浏览器相关代码:全仓没有 `WebContentsView` / `<webview>` / CDP 调用,没有 CSP、`will-navigate`、`setWindowOpenHandler`、权限处理器。

## 决策

### 1. 宿主形态:主进程 `WebContentsView`,内置 Session surface

- 用 Electron `WebContentsView`(Electron 42),**不用** `<webview>` 标签(需开 `webviewTag`,渲染层直接持有敌意页面的句柄)、**不用** iframe(跨源不可注入、`X-Frame-Options` 直接拒载)。
- 视图由 **主进程** 创建与持有。命令走现有 `pigui:invoke` 的主进程截留分支(与 `select_project_directory` 同一层),新增 `browser_*` 命令组;事件走新增的 `pigui:browser-event` 通道。**不进 Runtime Gateway,不进 utilityProcess**,嵌入页面永远碰不到后端 MessagePort(ADR-0013 承诺)。
- 作为 SessionInspector 的第三个 surface `browser` 接入(ADR-0028):注册表只加元数据,内容由 `agent-workspace.tsx` 的 `SessionSurfaceContent` 注入;rail 单图标;`multiInstance: false`。
- **每窗口一个视图,状态按 Session 记**:切换 Session 时视图导航到该 Session 记住的 URL;未记则显示空态。不做多 tab。
- ADR-0007 原文只冻结 terminal 与 file tree,"Browser 冻结"仅存在于 ADR-0028 一句与 `surface-registry.ts` 注释。本 PRD 落地时由 ADR-0029 正式记录解冻,并同步删掉那两处引用。

### 2. URL 来源:手输 + 按 Project 记忆

PiGUI 目前对 dev server 零认知(project registry 只有 `{id, path, displayName, addedAt}`,后端只持久化 journal 与 projection)。v1:

- surface 表头一个地址栏,手输 URL,回车导航;前进/后退/刷新/在外部浏览器打开。
- 最近 URL 按 Project id 存渲染层 localStorage(`pigui.browserUrls.v1`),新 Session 默认带出所属 Project 的最近 URL。不新增后端持久化。
- **不做**端口自动探测、不读 `package.json` 的 dev 命令、不代启 dev server。这些留到有真实用户证据再说。

### 3. 安全边界(ADR-0013 留下的"注入 vs 沙箱"张力在此决策)

嵌入内容默认按敌意页面对待,能力边界照抄 ADR-0022 的范式(渲染层只报意图,主进程解析并封顶):

| 项 | 决定 |
|---|---|
| session | 独立 `session.fromPartition("persist:pigui-browser")`,与 PiGUI renderer 的 session 完全隔离;`persist` 让本地 dev 站点的登录态跨重启保留 |
| webPreferences | `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`、`webSecurity: true`,`preload` 只指向标注层 preload |
| 导航 | `will-navigate` 只放行 `http:` / `https:`;`file:` / `javascript:` 等一律拦;`setWindowOpenHandler` 拒绝新窗口,`_blank` 改为本视图内导航 |
| 权限 | `setPermissionRequestHandler` 默认全拒(摄像头/麦克风/通知/地理位置…);v1 不开例外 |
| 下载 | `will-download` 直接取消 |
| 注入方向 | 只有主进程 → 页面(preload + `executeJavaScriptInIsolatedWorld`),页面 → PiGUI 只经 preload 里 `contextBridge` 暴露的、白名单化的标注消息;页面脚本读不到任何 PiGUI 状态 |
| PiGUI 自身 | 顺带给 renderer 补一条 CSP(index.html meta),这是外壳卫生项,可独立切片 |

### 4. 标注层:isolated world + Shadow DOM 覆盖层

- 标注脚本作为 `WebContentsView` 的 preload 注入,运行在 **isolated world**:共享页面 DOM,但页面 JS 看不到标注层的变量与函数。
- 覆盖层是挂在 `document.documentElement` 下的一个宿主元素 + **closed Shadow DOM**,内含高亮框、序号标记、评论气泡;`pointer-events` 只在 design mode 开启时拦截。页面自身样式无法污染它。
- Design mode 开启后:悬停高亮元素、点击选中并落一枚序号标记、每枚标记可写一句评论;`Esc` 退出。表头工具条:`Design` 开关、清空、`Send to composer`。
- v1 不接 CDP。跨源 iframe 内的元素不可选中(会命中 iframe 本身),作为已知限制记入 ADR;CDP `DOM` / `Overlay` 域留作 v2 升级路径。

### 5. 元素标识与载荷形状(定义在 `packages/core`)

```ts
type BrowserAnnotationElement = {
  index: number;               // 标记序号,与截图上的数字一致
  selector: string;            // 唯一 CSS path(优先 id / data-testid,回退 nth-of-type 链)
  tag: string;
  text?: string;               // 元素可见文本,截断 120 字符
  rect: { x: number; y: number; width: number; height: number }; // 相对视口
  reactName?: string;          // best-effort:从 __reactFiber$ 读 displayName,读不到就省略
  source?: { file: string; line: number; column?: number }; // best-effort:data-inspector / data-source 类属性
  comment?: string;
};

type BrowserAnnotationPayload = {
  url: string;
  title?: string;
  viewport: { width: number; height: number; dpr: number };
  elements: BrowserAnnotationElement[];
  capturedAt: string;
};
```

- **截图**走 `webContents.capturePage()` → PNG base64,进现有 `images` 通道(`RuntimePromptImage`,上限 8 MiB,不新开通道)。截图上叠印序号标记后再送,让模型能把编号和图对上。
- **元素与评论**v1 内联进 prompt 文本:core 提供纯函数 `formatBrowserAnnotationPrompt(payload): string`,输出固定 markdown 模板(URL、视口、逐条 `#N selector — comment`,带 `reactName` / `source` 时附上)。不新增结构化附件类型;若未来插件面板也要回传结构化输入,再把它抽成通用 attachment。
- **落到 composer 草稿,不直接 `send_prompt`**:`Send to composer` 把文本与截图塞进当前 Session 的 composer(复用 composer-attachments 的图片附件路径),用户可以改一改再发,也可以作为 steer / queue follow-up 发出。这样三条 prompt 路径都天然覆盖,且不用绕过用户审阅。

### 6. 布局与原生视图的层叠(调查中确认的硬冲突,逐条处理)

| 冲突 | 处理 |
|---|---|
| 面板宽度上下界只在挂载时算一次;实际宽度随拖拽逐帧变化 | 渲染层在 surface 内容区放一个占位 div,`ResizeObserver` + 窗口 `resize` 把 `getBoundingClientRect()` 经 `browser_set_bounds` 推给主进程;bounds 扣掉 40px 表头、内缩 8px 避开 `ResizeHandle` 的 `mx-2` |
| <1280px 时 inspector 变成 Base UI Dialog portal,原生视图会盖在遮罩上 | 断点以下**不显示原生视图**,Sheet 内 browser surface 显示"加宽窗口以使用浏览器"空态;视图 `setVisible(false)` 但保留实例 |
| 弹层(popover / tooltip / model selector / 任何 Dialog)会被原生视图盖住 | v1 接受为已知限制,记入 ADR;备选方案(弹层出现时 `capturePage` 换成静态截图占位)留 v2 |
| macOS `transparent + vibrancy` 会被不透明子视图开洞 | 视图区域本就在面板内、面板本身不透明,给 `WebContentsView` 设 `backgroundColor` 为面板底色,不出现玻璃缺口 |
| `-webkit-app-region: drag` 表头与红绿灯 | bounds 永不覆盖表头带;由上一条 40px 扣除保证 |
| 视图与 Session 生命周期 | inspector 收起、切到其他 surface、Session 切换时 `setVisible(false)`;窗口关闭时销毁 view;不因视图存在而阻止 utilityProcess 重启逻辑 |
| 切到「该 Project 没有记忆 URL」的 Session 时,上一个 Project 的页面仍留在视图里 | 只 `setVisible(false)`,**不销毁** —— 销毁会同时丢掉「重进不重载」的短路。页面因此在内存里存活但不可见,直到窗口关闭或被下一次导航替换。渲染层不会把它的迟到事件记到新 Project 头上:主进程给每次 `browser_navigate` 递增一个 navigation id,`did-navigate` / `did-fail-load` 都带上它,渲染层只认自己最近一次 navigate 返回的那个 id;空态下这个 id 为 null,即一律不认 |

## Spike(先于一切切片,不进主线)

目标只有三个,每个都是一句能证伪的话:

1. 主进程挂一个 `WebContentsView`,渲染层用占位 div 驱动 bounds,拖拽面板宽度时视图跟手、不闪、不越界。
2. Playwright 的 `_electron.launch` 能否拿到 `WebContentsView` 的 contents(`app.windows()` 之外的 page)并断言页面内容;拿不到就要定 E2E 策略(主进程 `__e2e_*` 命令暴露截图/URL 供断言)。
3. preload 在 isolated world 里向一个带严格 CSP 的第三方页面挂 Shadow DOM 覆盖层,页面脚本读不到它,点击能回传 selector。

spike 代码放 `apps/desktop/src/proto/browser/`(沿用 `/proto/surfaces` 的做法),结论回写本文后拆除。

### 结论(2026-09-02 执行,Electron 42.5.0 / Playwright 1.61.1 / macOS)

spike 用一个独立的 CJS Electron 入口(`spike-main.cjs` + 两个 preload + 一个模拟 Chat/面板/表头布局的宿主页),把一个带 `Content-Security-Policy: default-src 'none'; script-src 'self'` 与 `X-Frame-Options: DENY` 的本地 http 页装进 `WebContentsView`,再用 Playwright `_electron.launch` 驱动。三项结论如下,结论产出后 spike 代码已拆除。

1. **`ResizeObserver` → IPC → `setBounds` 的占位 div 驱动是成立的:11 次面板宽度变更后,主进程 `view.getBounds()` 与占位 div 的 `getBoundingClientRect()` 逐像素相等(x/y/width/height 全等,`settledMatchesRect: true`),且始终落在窗口内容区内、`y` 恒 ≥ 40 不侵占表头带(`withinContent: true`、`headerBandClear: true`)。**
   证据:11 组样本形如 `width 700 → rect {x:748,y:40,w:684,h:820}` / `settled {x:748,y:40,w:684,h:820}`;窗口内容区 `1440×868`。
   **但"不闪"未被证明**:11 次采样中有 1 次在 DOM 写宽度后的首次读里,原生视图仍停在旧 bounds(`immediateMatchesRect` 第 10 项为 `false`),下一次读(≤120ms)才对齐。也就是原生视图比 DOM 落后约一个 IPC 往返;离散跳变看不出来,连续拖拽时会表现为视图边缘滞后于分隔线。**记为 ADR-0029 已知限制**,S1 不为此加节流/预测补偿。

2. **Playwright 能直接拿到 `WebContentsView` 的 contents:`app.windows()` 返回 2 个 Page(宿主 `spike-host.html` 与视图内 `http://127.0.0.1:<port>/`),视图 URL 与主进程 `webContents.getURL()` 一致(`viewReachableViaPlaywrightPage: true`)。**
   证据:`playwrightWindowUrls: ["file://…/spike-host.html", "http://127.0.0.1:60797/"]`,`viewUrlFromMain: "http://127.0.0.1:60797/"`;`webContents.getAllWebContents()` 里两条的 `type` 都是 `"window"` —— 这正是 Playwright 把它当 Page 暴露的原因。
   **因此不需要主进程 `__e2e_*` 截图/URL 命令**:E2E 可用 `app.windows()` 里按 URL 挑出嵌入页,直接断言其 DOM。注意 fixture 现有的 `app.firstWindow()` 仍返回宿主窗口(视图后创建),不受影响。

3. **isolated world 的 closed Shadow DOM 覆盖层在严格 CSP 页上可用,且页面脚本读不到它:页面探针拿到 `hostFound: true` 但 `shadowRootReadable: false`、`overlayGlobalsVisible: []`、`documentTextMentionsOverlay: false`;主世界派发的 click 被 isolated world 的监听器收到并回传 `{selector: "#cta", tag: "button", text: "Click me"}`。**
   证据:`spike3.pageProbe` 与 `spike3.ipcResults.selectorClicks`。宿主元素本身(`<pigui-spike-overlay>`)在页面 DOM 里可见且可被删除 —— 这是 Shadow DOM 的固有边界,**记为 ADR-0029 已知限制**(敌意页面能移除覆盖层宿主,但读不到其内容;S2 不做防删)。

**一处对第 3 节实现口径的补正(不改决策,只补实现)**:`will-navigate` **只对页面自身发起的导航生效**,主进程 `webContents.loadURL()` 不触发它 —— spike 里 `loadURL("file:///etc/hosts")` 返回 `"loaded"`,`navigationBlocks` 为空,视图真的停在了 `file:///etc/hosts`。而 `browser_navigate` 走的正是主进程 `loadURL`。因此协议白名单必须**在命令入口先校验 URL**,`will-navigate` 只负责拦页面自己发起的跳转;两处都要有,少任何一处都会漏。第 3 节"导航只放行 http/https"的意图不变。

## v1 范围(切片)

1. **S0 spike**:上文三项验证,产出结论段。
2. **S1 宿主 + surface(只嵌 URL,无标注)**:主进程 `browser_*` 命令组(`open` / `navigate` / `back` / `forward` / `reload` / `set_bounds` / `set_visible` / `open_external` / `dispose`)+ `pigui:browser-event`(`did-navigate` / `title-updated` / `did-fail-load` / `console`);`surface-registry.ts` 注册 `browser`;地址栏表头;按 Project 记 URL;断点以下空态;安全边界第 3 节全部项。
3. **S2 标注层**:preload + isolated world + Shadow DOM 覆盖层;design mode 开关;悬停高亮、点击选中、序号、评论;selector 生成与 `reactName` / `source` best-effort 提取。
4. **S3 载荷回传**:core 里的类型 + `formatBrowserAnnotationPrompt`;`capturePage` 叠印序号;`Send to composer` 落草稿。
5. **S4 收尾**:ADR-0029(宿主形态、安全边界、已知限制、解冻 Browser 并修 ADR-0028 / registry 注释 / `self-built-ui.md`);`/design` 页登记新组件(地址栏、design mode 工具条、空态);renderer CSP 卫生项可并入或单独 issue。

## 验收标准

- [ ] `bunx tsc --noEmit -p tsconfig.json` 通过;`bun test` 通过。
- [ ] 主进程:`browser_*` 命令有单测(以 fake `WebContentsView` 验证 bounds 计算、可见性状态机、导航白名单);`will-navigate` 对 `file:` / `javascript:` 拒绝、`setWindowOpenHandler` 拒绝新窗口、权限请求默认拒绝均有测试。
- [ ] core:selector 生成、`formatBrowserAnnotationPrompt`、载荷解析为纯函数并有 Vitest 覆盖(含 id / data-testid / nth-of-type 回退、文本截断、无 `reactName` 时省略字段)。
- [ ] 渲染层:surface 注册、地址栏交互、断点以下空态、URL 按 Project 记忆有组件测试。
- [ ] E2E(真实 Electron):打开本地静态页 → 面板拖宽 → 视图 bounds 随之变化;开启 design mode 点选一个元素 → composer 草稿出现模板文本与一张截图附件。
- [ ] 手工:对 `X-Frame-Options: DENY` 的站点可加载;带严格 CSP 的站点覆盖层可用;macOS 上面板区域无玻璃缺口;窗口 <1280px 显示空态且无原生视图残留。
- [ ] `/design` 页条目与 `docs/self-built-ui.md` 同 PR 更新;ADR-0029 落地。

## 范围外

- 由 Pi 扩展提供的浏览器面板、插件 surface 协议(#85 / ADR-0018)——浏览器是内置能力,后期再评估抽插件。
- 多 tab、多实例、Session 间共享视图。
- dev server 探测、启动、端口管理;读取项目配置猜 URL。
- CDP 接入(DOM 检视、跨源 iframe 元素、网络面板)——v2 升级路径。
- 结构化附件类型(选择器 / 评论以非文本形式进 prompt);Pi 端对标注语义的专门支持。
- 弹层与原生视图的完美层叠(静态截图占位方案)——已知限制。
- 页面内代理操作(让 Pi 点击 / 填表 / 截图的 browser-use 能力)——这是另一个产品能力,不在标注范围。
- 远程 / WebSocket transport 下的浏览器(视图只存在于本机主进程)。

## 待确认(材料性分歧才列,其余已直接拍板)

- **Send to composer vs 直接发送**:本文选"落草稿"。若期望一键直发(Codex 式),S3 加一个 `Send now` 即可,不影响其他设计。
- **`persist:` 分区**:选了持久化以保留 dev 站点登录态。若担心跨项目串 cookie,可改为按 Project 分区(`persist:pigui-browser:<projectId>`),代价是每个项目首次都要登录。
