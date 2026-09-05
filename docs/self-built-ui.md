# 自建 UI 总表(Astryx 无对应物)

> 主干文档:每次做完一轮 UI 工作,回到这张表对位更新,防止漂移。
> 来源:2026-08-09 Astryx 迁移收尾后的全量梳理。/design 页是各组件变体的活注册表,本表是"为什么自建、去哪儿了"的账。

> **2026-08-09 表一达线**(#89 / PR #90):全部组件有测试、/design 覆盖全部变体与典型状态、token 违规 0。此后新增组件须保持这条线。
> **2026-08-09 优先级修订**(Grill 决策,见 #84/#81 评论):工作流可视化为远期 future,当前主线是打磨基础体验;#82 Trace 页整体重构先行,#84/#81 后置。

## 一、已自建、长期自维护

| 组件 | 位置 | 说明 |
| --- | --- | --- |
| chat-chain-of-thought | `shared/ui/chat/` | Astryx 缺口;Compact 皮肤。**只剩 `phase` 一条路径**(#165 接线时删掉了 ADR-0027 的 `isStreaming` / `Live` / `LiveStatus` / `formatThoughtSummary` 一行视口,以及随之失去调用者的 `Trigger` / `Label` / `Content` 复合件):run 期间 step 列表平铺、无头部,底部挂 chat-status-line;`settled` 时整列折进「Worked for Ns」头部(默认折叠,高度过渡吃 Base UI 的 `--collapsible-panel-height`,时长走 `.chain-of-thought` 上的 `--cot-flip-duration: 300ms`——主题的 `--duration-slow-max` 在本仓库是 0.935s,不能拿来当翻页时长);步骤为空时头部退化为纯标签(`hasSteps={false}`,children 对组件不透明,数不出来只能告知);`startedAtMs` 是 run 期间唯一计时入口,组件自己 100ms 走表,没锚点就不显示数字(挂载时刻起表会把「页面开了多久」当成 run 的等待)。两条布局前提写在 chat.css 里且**只能一起成立**:块上 `contain: inline-size` 挡住 nowrap label 往上传的 min-content,`.chat-message__body:has(> .chain-of-thought)` 再把 Astryx 的 fit-content 消息体拉满列宽。Interim Output 行是页面级组合(`.chain-of-thought__interim`),不是组件。见 ADR-0030 |
| chat-chain-of-thought-rail | `shared/ui/chat/` | 2026-08-09 原型探索胜出的 Timeline 皮肤(PR #80);接线等 [#81](https://github.com/BubblePtr/PiGUI/issues/81) |
| chat-pixel-loader | `shared/ui/chat/` | 九格像素心跳,2026-09-04(#164)从 chain-of-thought 的私有函数提为公开原子。周期是 prop(`periodMs`,默认 **860ms**,ADR-0030 第 8 条定案;旧的 650ms 在状态行上显急),经内联 `--chat-pixel-period` 下发——样式表里只读不声明,声明会盖掉上层传下来的值 |
| chat-inline-pager | `shared/ui/chat/` | 行内一行视口(#164):旧页上移翻出、新页下方翻入,由 `pageKey` 变化触发,最小停留 `dwellMs`(默认 700ms,下限钳到 300ms 翻页时长);停留期内多次换页只翻一次且落在最新页,同 key 的内容更新原地替换;减动效下直接切换、不产生 `[data-motion]`。全 `span` / `inline-flex` / 无外边距——ADR-0027 那个块级且带 8px 上外边距的一行视口塞进按钮会让文字比箭头中线低 4px(原型踩过;该视口已随 #165 删除) |
| chat-thought-step | `shared/ui/chat/` | Thinking 作为一行 step(#164,ADR-0030 第 3 条):live 是带 shimmer 的「Thinking…」,收束为「Thought Ns」(不足 1s 写 briefly,没实测时长只写 Thought),live → settled 经翻页容器。有正文时是 Collapsible、正文用 chat-thought-markdown;没正文就是一行无按钮角色的纯 label——thinking 内容由 provider 决定,空正文是常态不是异常态 |
| chat-tool-kind | `shared/ui/chat/` | CoT 工具行的类型 icon(Codex 参考):`toolKindFromName` 把 Pi 内置工具名归成 shell/search/web/file/edit,其余退回 tool;`ChatToolKindIcon` 用 Hugeicons 方框终端(ComputerTerminal01 / Lucide SquareTerminal)/放大镜/地球/文件/铅笔/扳手画出来。ChatToolStep 的总结行与展开行共用,不单独出现在聊天流里 |
| chat-tool-step | `shared/ui/chat/` | 一批 Tool Call 作为一行 step(#164,ADR-0030 第 3/4 条):live 时 label 是「Running {正在跑的工具}…」,随 `activeToolCallId` 翻页(#165 给 `message_part` 加了可选 `toolName`,名字在 part(start) 就有,不必等执行开始;拿不到名字的桥仍退化为「Running…」);收束为动词总结行——单工具「动词 + 对象」(路径保尾、命令保头、72 字截断),多工具按工具类型归并计数(bash / shell → Ran N commands,read / read_file → Read N files,edit / write / write_file → Edited / Wrote N files,grep / find / ls → Searched / Listed,web_search → Searched N web pages,其余 → Used N tools),行末失败数(`--color-danger`)与总耗时。总结行与展开后的每行都带 `ChatToolKindIcon`;展开是每个工具各自的 `ChatToolGroup` 单行,一个工具就是只有一个元素的一批 |
| chat-status-line | `shared/ui/chat/` | run 期间的最后一行(#164):像素 loader + 带 shimmer 的状态词 + 走表计时。状态词由 elapsed 每 4s 取一个(thinking / acting 两个词池,同一间隔稳定、跨间隔伪随机,不用自己的计时器)。`elapsedMs` 可缺省(retry 间隙没有锚点):心跳和状态词照常,只是不渲染时钟——写「0.0s」等于宣称 run 刚开始。它是情绪层,信息在 step 行里;心跳全局只有这一处 |
| chat-thought-markdown | `shared/ui/chat/` | 思考正文的流式安全行内 markdown(`**` / `*` / 反引号);Astryx Markdown 过重且会把未闭合标记露出来 |
| text-shimmer | `shared/ui/chat/` | 流式占位闪光 |
| chat-prompt-suggestion | `shared/ui/chat/` | **在用**(agent-workspace 空 draft 建议卡;2026-08-09 核实,此前误判候删) |
| chat-queued-message | `shared/ui/chat/` | 等待区 item(queue-first composer,2026-08-12 原型探索胜出);Astryx 无队列概念;决策记录 `.scratch/composer-redesign/PRD.md` |
| pi-kpi / pi-bar-chart / dot-matrix | `shared/ui/` | KPI/图表原语,Astryx 无 chart 系 |
| pi-trace-ledger | `shared/ui/` | Trace Cockpit 台账(2026-08-18 原型重构):Run 顶层分组 + Turn 边界圆点 + 徽章行(`名称 {请求} → 结果`),行永不内联展开;读模型在 `entities/session/trace-model.ts`(Run>Turn>Step,见 CONTEXT.md);USER/ASSISTANT/TOOL/CONTEXT 四徽章一律取自 `--pigui-data-*` 数据调色板,CONTEXT 用 [#106](https://github.com/BubblePtr/PiGUI/issues/106) 新增的 `--pigui-data-green`(不再借语义色 `--success`) |
| pi-trace-strip | `shared/ui/` | Trace Cockpit 概览带:Input/Model/Tools 三泳道、段粒度、游标竖线、单击选中该泳道块 / 拖拽框选连续段;选区外列与台账行置灰(不过滤)、Steps/Time 双宽度模式;Time 模式模型段用 Pi 记录的模型调用起止真实时长([#108](https://github.com/BubblePtr/PiGUI/issues/108)),input 段用「用户提交 → 该 run 首次模型调用开始」的等待([#126](https://github.com/BubblePtr/PiGUI/issues/126) 修掉了原先取尾随间隙、与后续模型/工具段重复计算同一段墙钟的语义),各段区间互不重叠;推不出真实区间的(旧 session 缺起止、缺时间戳、时钟倒挂)退回估算并以斜纹+弱化标出,估算不伪装成实测 |
| pi-trace-inspector | `shared/ui/` | Trace Cockpit 检视器:Summary/Payload/Result/Schema/Timing;大 payload 只在此挂载;Schema 待 Gateway 解析能力 [#107](https://github.com/BubblePtr/PiGUI/issues/107)(现为 unavailable 诚实态) |
| model-selector | `shared/ui/model-selector/` | Composer 模型选择器(#99,2026-08-13 原型探索 "Flat" 胜出):扁平搜索列表 + 模型选项飞出层(Reasoning/Fast Mode),safe-triangle 悬停意图;`visibleModels` 为设置页管理的可见集(#102,空集=全显,当前选中模型即使被隐藏也保留并标注),`onManageModels` 跳到设置页 Models 区块;决策记录 `.scratch/model-selector/PRD.md` |
| context-usage-meter | `shared/ui/` | composer footer 行的上下文占用指示器(#101;#128 历经 composer header → 顶部 toolbar → footer 文本三次试放,2026-09-01 定稿为 **footer 行右侧一枚 14px SVG 圆环**,免责声明行同日移除,footer 只剩它):弧长按占用份额走,红绿灯健康语义:≤70% 绿(状态良好)、>70% 琥珀(偏多,可考虑主动压缩)、>90% 红(逼近窗口极限,被动压缩在即);用的是 `--pigui-data-green/amber/orange-strong` 图形分类色而非 success/warning/danger 文字 token——后者浅色主题下为文字对比度刻意压暗,画在 2px 弧上发闷;阈值对齐 Pi CLI footer;`tokens: null`/未上报只画空轨道而非假弧,压缩中转圈(motion-reduce 静止)且 readout 丢弃过期份额;readout 简化为 `Context 45% · 200K`(compact 记法窗口)进 Astryx Tooltip,同一串文本作 `role="img"` 的可访问名。仅 `piSessionId` 绑定后渲染,queue 模式行为一致。数据链路见下方备注 |
| composer-attachments | `shared/ui/composer-attachments/` | Composer「Add to prompt」菜单 + 附件抽屉(#98,2026-08-14 原型探索 Shelf 胜出):footer 左侧 Plus,Files/Commands/Skills/Plugins;图片 Thumbnail、文本 Token;文本附件内联进 prompt,图片走 Gateway `images` 通道;决策记录 `.scratch/composer-attachments/PRD.md` |
| session-dock | `shared/ui/session-dock/` | 会话页右栏的 surface 宿主(Rail 形态,2026-09-02 从 Dock/Rail/Ambient 三原型中选定,见 ADR-0028):面板本体 + 贴面板右缘的 44px 图标 rail,面板收起时 rail 随之消失。**宿主不写表头**(2026-09-05 ADR-0028 修订,[#184](https://github.com/BubblePtr/PiGUI/issues/184)):rail 图标高亮已经命名了当前 surface、tooltip 里又是同一句,表头是第三遍,而且把每个 surface 自己的第一行挤成了第二条 40px 带;现在面板顶部那条 40px 带**就是 Surface 的第一行(状态 + 动作)**,`aside` 的可访问名改用 `aria-label`。rail 用 Astryx `ToggleButtonGroup`(vertical/single),宽度(默认 560 / 最小 340 / 上限 = 可分配宽度 - Chat 最小宽 400,2026-09-02 从原先的 58vw 改来,见 ADR-0028 修订)交给 agent-workspace 里既有的 Astryx `useResizable`;上限随分栏容器的 `ResizeObserver` 实时重算,窗口缩小到容不下时主动把 size clamp 回新上限;`surface-registry.ts` 只存元数据(id/title/icon/hint/multiInstance/flushContent——hint 只剩 rail tooltip 一个消费者,flush 的 surface 去掉内容内边距、自己管 inset),surface 内容由页面注入,注册表因此不依赖 Session 状态。已注册 Changes / Terminal / Browser——Terminal 是首个 multiInstance surface(单 rail 图标 + 第一行实例条,ADR-0028);三者均 flush(第一行与内容贴面板缘);File surface 仍受 ADR-0007 冻结,Browser 已由 ADR-0029 正式解冻。rail 徽标(`badges`)由页面层的 `useSessionChanges` 供给 Changes 文件数(#141),与第一行的文件统计同源;Terminal 徽标是页面层 `SessionTerminalPanel` 上报的实例数;干净树、非 Git、加载中与读取失败都不显示数字 |
| session-surface-bar | `shared/ui/session-dock/surface-bar.tsx` | Surface 第一行的两个共享原语(#184,ADR-0028 2026-09-05 修订)。`SessionSurfaceBar`:`h-10` 容器,与 Chat 标题同基线;`px-2` 是 flush surface 的统一内缩——这里打头的都是自带 ~8px 内边距的控件,图标因此落在与下方内容同一条 16px 列上;左槽状态、右槽动作(动作槽即使暂时空着也保留,Changes 将来的 checkout / commit / push 落在那里,ADR-0008)。`SessionSurfaceTabs`:多实例 surface 的实例条,每个 tab 自带关闭按钮、末尾一枚新建按钮、`exited` 态、`role=tablist`/`aria-selected`;Terminal 是首个消费者,Browser 多实例([#185](https://github.com/BubblePtr/PiGUI/issues/185))复用同一个而不是再画一套。Astryx 都不等价:`Toolbar` 的高度来自 `--size-element-*` 加自身 block padding,钉不到 40px,而且它的 roving tabindex 会和实例条自己的方向键模型嵌套打架;`Tab` 渲染成单个 `<button>`,装不下每个 tab 自己的关闭按钮 |
| browser-surface | `shared/ui/browser/` | Browser 多实例宿主的界面（#185，ADR-0029）：第一行复用 `SessionSurfaceBar` + `SessionSurfaceTabs`，支持新建、激活与关闭；第二行放地址栏、历史导航和 design mode 工具条。`BrowserSurface` 只接收实例列表与当前页状态，原生 `WebContentsView` 按 Session/tab 由主进程持有。Astryx 无法承载原生子视图，故保留自建 placeholder 与 bounds 同步；普通控件使用 Astryx，tab 条沿用 #184 的共享原语。只有 live 态渲染 viewport，narrow / unsupported / empty / error 均不显示原生视图；加载中独立提示，关闭全部 tab 返回 empty。弹层出现时捕获当前 tab 的静态快照再隐藏原生视图，切 tab 时丢弃旧快照。每个 tab 独立记地址、加载/错误、design mode、标注与发送提示；Project 保存 URL 列表和激活项，兼容旧单 URL。`Send to composer` 握手取得同页截图与标注，降采样后只注入当前 Session 草稿；切 tab / Session 后到达的结果丢弃。工具条保持无弹层按钮，避免在冻结快照上标注；页内 closed Shadow DOM 覆盖层不属于 `shared/ui/`。Design 页展示多 tab、单 tab、零 tab、加载、标注、发送、快照、错误和不可用状态。 |
| terminal-view | `shared/ui/terminal/` | xterm.js 宿主原语,Astryx 无终端组件;Terminal + FitAddon 的生命周期(open / ResizeObserver fit / dispose)全收在组件内,对外只有 `write`/`focus` ref 句柄和 `onData`/`onResize` 回调,不含任何后端知识。右缘留白是 xterm 固有结构:FitAddon 为滚动条预留 `overviewRuler?.width || 14`px + 单元格取整余量(≤1 字符);xterm 6 的滚动条是 VS Code 式自绘元素(非原生 gutter),宽度同源 overviewRuler.width——组件内设为 8px(带 canvas 能力检测,jsdom 无 2d context 会硬崩),滑块颜色走 theme 的 `scrollbarSlider*Background`(token 经 color-mix 探针解析为 rgba,18/28/40% 三档,对齐 styles.css 的滚动条语言),闲置自动隐去。chrome 色(背景/前景/光标/选区)从 token 桥解析——桥是链式 var() 且 theme-neutral 的一级 token 在 `@scope` 内,documentElement 上读不到,故在主题作用域内挂探针元素读真实属性,整链(含 light-dark())解析为 rgb;背景取 `--surface` 与 dock 面板同色,OS 明暗切换经 matchMedia 重算主题。ANSI 16 色刻意保留惯例终端色——程序输出语义(diff 红、测试绿),不是 UI chrome——并按背景亮度在 VS Code 深/浅两套惯例色间选择。RPC 封装在 `entities/terminal/terminal-client.ts`;供 SessionDock 的 Terminal surface(`pages/session-terminal-panel.tsx`)使用 |
| icons.tsx / primitives.css / chat.css | `shared/ui/` | 图标与样式桥,基础设施。chat.css 把对话标题收成 conversation type scale(`#` 比正文大一档,更低层级不小于正文),大纲用 headingLevelStart=3 |

## 二、路线图上将从零写的(已开 issue 跟踪)

| 方向 | Issue | 状态 |
| --- | --- | --- |
| Plugin surfaces 面板宿主(渲染侧) | [#85](https://github.com/BubblePtr/PiGUI/issues/85) | 被 ADR-0018 协议阻塞 |
| Embedded browser annotation 覆盖层/工具条 | [#86](https://github.com/BubblePtr/PiGUI/issues/86) | S1 宿主与 surface、S2 标注层与 design mode 工具条、S3 载荷回传 composer([#151](https://github.com/BubblePtr/PiGUI/issues/151))均已落地(见上表 browser-surface);覆盖层在页内 Shadow DOM,不是 `shared/ui/` 组件。S4 ADR-0029 已落地([#152](https://github.com/BubblePtr/PiGUI/issues/152)) |
| 图表原语扩展(折线/面积/热力) | [#87](https://github.com/BubblePtr/PiGUI/issues/87) | 等 usage 需求驱动 |
| Dynamic workflow visualization(图/DAG/时间线) | [#84](https://github.com/BubblePtr/PiGUI/issues/84) | **future,远期**(2026-08-09 降级) |
| 思维链样式可选项(Compact/Timeline) | [#81](https://github.com/BubblePtr/PiGUI/issues/81) | **future,后置**(被 Appearance 设置页阻塞) |
| Composer 队列拖拽重排 | [#97](https://github.com/BubblePtr/PiGUI/issues/97) | 被 runtime gateway reorder 能力阻塞 |
| 设置页可见模型管理(Add Models 落点) | [#102](https://github.com/BubblePtr/PiGUI/issues/102) | future;被 #99 落地解锁 |

## 备注:context-usage-meter 的数据链路(#101)

`AgentSession.getContextUsage()` 是 SDK 的**方法**而非事件,所以链路按既有管线分层接入,
没有开旁路:

- 驱动层 `pi-sdk-runtime-adapter.ts` 把 `() => session.getContextUsage()` 作为
  `readContextUsage` 注入 normalizer,并把同一份读数放进 `getSnapshot()` patch
  (resume/fork 一打开就有真值,不必等下一个 turn)。
- 归一化层 `agent-runtime-event-normalizer.ts` 只在**上下文可能变化的边界**调用它
  (`turn_end` / `compaction_end`),产出 `context_usage` 事件(`surface: "hidden"`,
  与 `usage` 同性质:喂投影而非时间线)。不注入 reader 就一个事件都不发——RPC 驱动与
  fixture 回放行为不变。
- 渲染层 `session-projection.ts` 用 `contextUsage` 字段承接(与 `summary` 对称:
  live 走 agent 事件,resume 走 `runtime-state-resynced` 的快照)。「压缩中」不另存状态,
  由 `isContextCompacting()` 从 status 流推导。压缩必须闭环,否则不确定态会永久卡死:
  Pi 只在正常结束时发 `compaction_end`,run 被 abort / 失败时什么都不发,所以 normalizer
  在 `agent_end` 补发 `compaction_aborted`(独立 code,不谎称 "Compaction complete");
  渲染端再兜一层——run 已结束就不可能还在压缩,覆盖 journal 被拦腰截断后 resume 的情况。

未做:压缩阈值刻度线。`shouldCompact()` 用的是 `CompactionSettings.reserveTokens`,
AgentSession 只暴露了 `isAutoCompactionEnabled`,拿不到具体数值——画一条猜出来的线
比不画更误导。Astryx `ProgressBar` 的 `marks` prop 已经就位,等 SDK 能读到设置即可补。

## 维护规则

- Design 页的 Components 使用 6 个用途分类与可搜索目录，每次挂载一个组件预览；现有 33 组示例，PiSheet 已移除；所有窗口统一使用 SessionDock 面板，不再按 1280px 断点切换 Sheet/Dialog，工具栏开关与右侧 rail 共用同一状态。目录元数据与示例入口在 `pages/design-components.tsx` 的 `componentExamples`，目录布局在 `pages/design-component-browser.tsx`，属于页面组合，不新增共享原语。新增组件时同时填写名称、用途分类、说明和预览入口，各状态采用顶部标签与独立展示区。

- 新增 `shared/ui/` 组件:进表一,同 PR 注册 /design 页(AGENTS.md 硬规则)。
- 表二的方向落地后:issue 关闭,组件移入表一。
- 每轮 UI 工作收尾时核对本表,状态漂移当场修。

## 开发工具：UI intent picker

`dev/ui-intent/` 是开发环境专用检查工具，不新增 `shared/ui/` 组件。组件树复用 Astryx TreeList（展开、选中态、键盘导航），范围切换复用 Button；所有具名 React 组件自动进入可浏览快照，区域术语单独维护于 `regions.ts`。操作方式及源码定位边界见 [开发环境组件选择器](ui-intent-picker.md)。
