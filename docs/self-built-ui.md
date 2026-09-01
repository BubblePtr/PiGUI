# 自建 UI 总表(Astryx 无对应物)

> 主干文档:每次做完一轮 UI 工作,回到这张表对位更新,防止漂移。
> 来源:2026-08-09 Astryx 迁移收尾后的全量梳理。/design 页是各组件变体的活注册表,本表是"为什么自建、去哪儿了"的账。

> **2026-08-09 表一达线**(#89 / PR #90):全部组件有测试、/design 覆盖全部变体与典型状态、token 违规 0。此后新增组件须保持这条线。
> **2026-08-09 优先级修订**(Grill 决策,见 #84/#81 评论):工作流可视化为远期 future,当前主线是打磨基础体验;#82 Trace 页整体重构先行,#84/#81 后置。

## 一、已自建、长期自维护

| 组件 | 位置 | 说明 |
| --- | --- | --- |
| chat-chain-of-thought | `shared/ui/chat/` | Astryx 缺口;Compact 皮肤。流式视口只显示当前最后一行/句(过长 ellipsis),换页时旧行上移新行从下进入;收束后折叠为 Thought for Ns(无实测时长只写 Thought,不编数字);无可展开步骤时用 `Label` 变体渲染不可交互纯标签。见 ADR-0027 |
| chat-chain-of-thought-rail | `shared/ui/chat/` | 2026-08-09 原型探索胜出的 Timeline 皮肤(PR #80);接线等 [#81](https://github.com/BubblePtr/PiGUI/issues/81) |
| chat-thought-markdown | `shared/ui/chat/` | 思考正文的流式安全行内 markdown(`**` / `*` / 反引号);Astryx Markdown 过重且会把未闭合标记露出来 |
| text-shimmer | `shared/ui/chat/` | 流式占位闪光 |
| chat-prompt-suggestion | `shared/ui/chat/` | **在用**(agent-workspace 空 draft 建议卡;2026-08-09 核实,此前误判候删) |
| chat-queued-message | `shared/ui/chat/` | 等待区 item(queue-first composer,2026-08-12 原型探索胜出);Astryx 无队列概念;决策记录 `.scratch/composer-redesign/PRD.md` |
| pi-kpi / pi-bar-chart / dot-matrix | `shared/ui/` | KPI/图表原语,Astryx 无 chart 系 |
| pi-sheet | `shared/ui/` | 自建 sheet |
| pi-trace-ledger | `shared/ui/` | Trace Cockpit 台账(2026-08-18 原型重构):Run 顶层分组 + Turn 边界圆点 + 徽章行(`名称 {请求} → 结果`),行永不内联展开;读模型在 `entities/session/trace-model.ts`(Run>Turn>Step,见 CONTEXT.md);USER/ASSISTANT/TOOL/CONTEXT 四徽章一律取自 `--pigui-data-*` 数据调色板,CONTEXT 用 [#106](https://github.com/BubblePtr/PiGUI/issues/106) 新增的 `--pigui-data-green`(不再借语义色 `--success`) |
| pi-trace-strip | `shared/ui/` | Trace Cockpit 概览带:Input/Model/Tools 三泳道、段粒度、游标竖线、单击选中该泳道块 / 拖拽框选连续段;选区外列与台账行置灰(不过滤)、Steps/Time 双宽度模式;Time 模式模型段用 Pi 记录的模型调用起止真实时长([#108](https://github.com/BubblePtr/PiGUI/issues/108)),input 段用「用户提交 → 该 run 首次模型调用开始」的等待([#126](https://github.com/BubblePtr/PiGUI/issues/126) 修掉了原先取尾随间隙、与后续模型/工具段重复计算同一段墙钟的语义),各段区间互不重叠;推不出真实区间的(旧 session 缺起止、缺时间戳、时钟倒挂)退回估算并以斜纹+弱化标出,估算不伪装成实测 |
| pi-trace-inspector | `shared/ui/` | Trace Cockpit 检视器:Summary/Payload/Result/Schema/Timing;大 payload 只在此挂载;Schema 待 Gateway 解析能力 [#107](https://github.com/BubblePtr/PiGUI/issues/107)(现为 unavailable 诚实态) |
| model-selector | `shared/ui/model-selector/` | Composer 模型选择器(#99,2026-08-13 原型探索 "Flat" 胜出):扁平搜索列表 + 模型选项飞出层(Reasoning/Fast Mode),safe-triangle 悬停意图;`visibleModels` 为设置页管理的可见集(#102,空集=全显,当前选中模型即使被隐藏也保留并标注),`onManageModels` 跳到设置页 Models 区块;决策记录 `.scratch/model-selector/PRD.md` |
| context-usage-meter | `shared/ui/` | composer footer 行的上下文占用指示器(#101;#128 历经 composer header → 顶部 toolbar → footer 文本三次试放,2026-09-01 定稿为 **footer 行右侧一枚 14px SVG 圆环**,免责声明行同日移除,footer 只剩它):弧长按占用份额走,红绿灯健康语义:≤70% 绿(状态良好)、>70% 琥珀(偏多,可考虑主动压缩)、>90% 红(逼近窗口极限,被动压缩在即);用的是 `--pigui-data-green/amber/orange-strong` 图形分类色而非 success/warning/danger 文字 token——后者浅色主题下为文字对比度刻意压暗,画在 2px 弧上发闷;阈值对齐 Pi CLI footer;`tokens: null`/未上报只画空轨道而非假弧,压缩中转圈(motion-reduce 静止)且 readout 丢弃过期份额;readout 简化为 `Context 45% · 200K`(compact 记法窗口)进 Astryx Tooltip,同一串文本作 `role="img"` 的可访问名。仅 `piSessionId` 绑定后渲染,queue 模式行为一致。数据链路见下方备注 |
| composer-attachments | `shared/ui/composer-attachments/` | Composer「Add to prompt」菜单 + 附件抽屉(#98,2026-08-14 原型探索 Shelf 胜出):footer 左侧 Plus,Files/Commands/Skills/Plugins;图片 Thumbnail、文本 Token;文本附件内联进 prompt,图片走 Gateway `images` 通道;决策记录 `.scratch/composer-attachments/PRD.md` |
| session-inspector | `shared/ui/session-inspector/` | 会话页右栏的 surface 宿主(Rail 形态,2026-09-02 从 Dock/Rail/Ambient 三原型中选定,见 ADR-0024):面板本体 + 贴面板右缘的 44px 图标 rail + 40px 表头,面板收起时 rail 随之消失。rail 用 Astryx `ToggleButtonGroup`(vertical/single),表头关闭按钮用 `IconButton`,宽度(默认 560 / 最小 340 / 最大 58vw)交给 agent-workspace 里既有的 Astryx `useResizable`;`surface-registry.ts` 只存元数据(id/title/icon/hint/multiInstance),surface 内容由页面注入,注册表因此不依赖 Session 状态。v1 注册 Changes / Actions;Terminal/File/Browser 仍受 ADR-0007 冻结。rail 徽标接口(`badges`)已就位但暂无生产者——Changes 文件数在 `SessionChangesPanel` 内部,要等它的 changes 读取上提 |
| icons.tsx / primitives.css / chat.css | `shared/ui/` | 图标与样式桥,基础设施。chat.css 把对话标题收成 conversation type scale(`#` 比正文大一档,更低层级不小于正文),大纲用 headingLevelStart=3 |

## 二、路线图上将从零写的(已开 issue 跟踪)

| 方向 | Issue | 状态 |
| --- | --- | --- |
| Plugin surfaces 面板宿主(渲染侧) | [#85](https://github.com/BubblePtr/PiGUI/issues/85) | 被 ADR-0018 协议阻塞 |
| Embedded browser annotation 覆盖层/工具条 | [#86](https://github.com/BubblePtr/PiGUI/issues/86) | 先立 PRD |
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

- 新增 `shared/ui/` 组件:进表一,同 PR 注册 /design 页(AGENTS.md 硬规则)。
- 表二的方向落地后:issue 关闭,组件移入表一。
- 每轮 UI 工作收尾时核对本表,状态漂移当场修。
