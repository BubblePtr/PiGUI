# 自建 UI 总表(Astryx 无对应物)

> 主干文档:每次做完一轮 UI 工作,回到这张表对位更新,防止漂移。
> 来源:2026-08-09 Astryx 迁移收尾后的全量梳理。/design 页是各组件变体的活注册表,本表是"为什么自建、去哪儿了"的账。

> **2026-08-09 表一达线**(#89 / PR #90):全部组件有测试、/design 覆盖全部变体与典型状态、token 违规 0。此后新增组件须保持这条线。
> **2026-08-09 优先级修订**(Grill 决策,见 #84/#81 评论):工作流可视化为远期 future,当前主线是打磨基础体验;#82 Trace 页整体重构先行,#84/#81 后置。

## 一、已自建、长期自维护

| 组件 | 位置 | 说明 |
| --- | --- | --- |
| chat-chain-of-thought | `shared/ui/chat/` | Astryx 缺口;默认 Compact 皮肤 |
| chat-chain-of-thought-rail | `shared/ui/chat/` | 2026-08-09 原型探索胜出的 Timeline 皮肤(PR #80);接线等 [#81](https://github.com/BubblePtr/PiGUI/issues/81) |
| text-shimmer | `shared/ui/chat/` | 流式占位闪光 |
| chat-prompt-suggestion | `shared/ui/chat/` | **在用**(agent-workspace 空 draft 建议卡;2026-08-09 核实,此前误判候删) |
| chat-queued-message | `shared/ui/chat/` | 等待区 item(queue-first composer,2026-08-12 原型探索胜出);Astryx 无队列概念;决策记录 `.scratch/composer-redesign/PRD.md` |
| pi-kpi / pi-bar-chart / dot-matrix | `shared/ui/` | KPI/图表原语,Astryx 无 chart 系 |
| pi-sheet | `shared/ui/` | 自建 sheet |
| pi-trace-ledger | `shared/ui/` | Trace 页台账形态(#82 已完结,PR #92/#93/#94);entry 抽象为历史/live 共通,live 接入留待后续 |
| model-selector | `shared/ui/model-selector/` | Composer 模型选择器(#99,2026-08-13 原型探索 "Flat" 胜出):扁平搜索列表 + 模型选项飞出层(Reasoning/Fast Mode),safe-triangle 悬停意图;决策记录 `.scratch/model-selector/PRD.md` |
| composer-attachments | `shared/ui/composer-attachments/` | Composer「Add to prompt」菜单 + 附件抽屉(#98,2026-08-14 原型探索 Shelf 胜出):footer 左侧 Plus,Files/Commands/Skills/Plugins;图片 Thumbnail、文本 Token;文本附件内联进 prompt,图片走 Gateway `images` 通道;决策记录 `.scratch/composer-attachments/PRD.md` |
| icons.tsx / primitives.css / chat.css | `shared/ui/` | 图标与样式桥,基础设施 |

## 二、路线图上将从零写的(已开 issue 跟踪)

| 方向 | Issue | 状态 |
| --- | --- | --- |
| Plugin surfaces 面板宿主(渲染侧) | [#85](https://github.com/BubblePtr/PiGUI/issues/85) | 被 ADR-0018 协议阻塞 |
| Embedded browser annotation 覆盖层/工具条 | [#86](https://github.com/BubblePtr/PiGUI/issues/86) | 先立 PRD |
| 图表原语扩展(折线/面积/热力) | [#87](https://github.com/BubblePtr/PiGUI/issues/87) | 等 usage 需求驱动 |
| Dynamic workflow visualization(图/DAG/时间线) | [#84](https://github.com/BubblePtr/PiGUI/issues/84) | **future,远期**(2026-08-09 降级) |
| 思维链样式可选项(Compact/Timeline) | [#81](https://github.com/BubblePtr/PiGUI/issues/81) | **future,后置**(被 Appearance 设置页阻塞) |
| Composer 队列拖拽重排 | [#97](https://github.com/BubblePtr/PiGUI/issues/97) | 被 runtime gateway reorder 能力阻塞 |
| Context usage 指示器(composer 附近) | [#101](https://github.com/BubblePtr/PiGUI/issues/101) | needs-triage;数据源 getContextUsage() 待 gateway 透传 |
| 设置页可见模型管理(Add Models 落点) | [#102](https://github.com/BubblePtr/PiGUI/issues/102) | future;被 #99 落地解锁 |

## 维护规则

- 新增 `shared/ui/` 组件:进表一,同 PR 注册 /design 页(AGENTS.md 硬规则)。
- 表二的方向落地后:issue 关闭,组件移入表一。
- 每轮 UI 工作收尾时核对本表,状态漂移当场修。
