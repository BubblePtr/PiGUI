---
Status: ready-for-agent
---

# Astryx 设计系统迁移

## 动机

见 `docs/adr/0026-astryx-design-system-migration.md`。一句话:PiGUI 的核心 UI 需要越来越多的自定义组件,HeroUI Pro 不开放一级 token,长期会锁死设计语言;Astryx 提供开放 token 底座 + agent 工作流。

## 目标 / 非目标

**目标**
- 渲染层设计系统底座换为 Astryx,业务语义 token 由其一级 token 拼装。
- 无头交互用 Base UI;聊天流式渲染用专用库自建,皮肤走 Astryx token。
- 迁移期间 HeroUI/Astryx 并存可发布,行为测试保持绿。

**非目标**
- 不重设计信息架构与交互流程(1:1 视觉语言升级,不改行为契约)。
- 不引入 StyleX 编译链(仅消费 Astryx 预构建产物)。

## 切片

### Slice 1:壳层(本 spike)
- main.tsx 接入 reset.css / astryx.css / neutralTheme。
- AppFrame 渲染层:HeroUI AppLayout/Sidebar → Astryx AppShell/SideNav;业务逻辑与 testid 契约不动;macOS 标题栏 chrome 保留自定义。
- 验收:app-shell 行为测试全绿(HeroUI 结构断言改写);Electron 截图确认侧栏/标题栏/字体正常;记录两套样式冲突清单。

### Slice 2:聊天栈
- ~~agent-workspace.tsx 的 ChatConversation/ChatMessage/ChatTool/ChainOfThought/StreamMarkdown/PromptInput/TextShimmer 自建替换(shiki + 流式 markdown + 粘底 hook + Base UI)。~~
- ~~session-detail.tsx 的 CodeBlock 换 shiki 方案。~~
- **修订(2026-08-08)**:"聊天栈自建"的前提(未确认 Astryx Chat 能力)已不成立。@astryxdesign/core 0.3.0 的 Chat 全家桶(ChatLayout/ChatMessageList/ChatMessage/ChatMessageBubble/ChatToolCalls/ChatComposer + useChatStreamScroll 等 hooks)、流式增量 Markdown、自带高亮的 CodeBlock 已覆盖自建组件的绝大部分能力(官方 `ai-chat` 模板逐一验证)。新方向:**能用 Astryx 则用 Astryx**,仅保留无对应物的自建件(chat-chain-of-thought、text-shimmer、pi-kpi/pi-bar-chart/dot-matrix)。逐组件替换切片见 issues/03 起;首个切片 ChatTool → ChatToolCalls。

### Slice 3:清退
- trace/usage/settings/setup 余量组件迁移;移除 @heroui-pro/react 依赖与其主题测试。

## Slice 1 实测冲突清单(2026-08-08)

- **双 reset 并存**:astryx reset.css 与 Tailwind preflight 叠加,box-sizing/margin 一致;button/link 的 color reset 依赖导入顺序(styles.css 最后加载获胜)——顺序脆弱,清退 HeroUI 时消除。
- **字体 token 覆盖链**:`<Theme>` 包裹层在自身元素上重定义 `--font-family-body/heading`(neutral 主题默认 Figtree),按继承距离压过 `:root`。**教训:Astryx 任何 token 的业务覆盖都必须写在 `[data-astryx-theme]` 作用域,写 `:root` 无效。** 决策(2026-08-08):Astryx 表面先用主题默认字体栈,不桥接 Montserrat;HeroUI 存量页面仍走 `--font-sans`,两套字体并存到 Slice 3 统一。
- **字重**:Astryx 对 section 标题/选中项用 StyleX 原子类上 semibold;PiGUI 全局 400 规则靠后代选择器压制,Astryx 升级若提高 specificity 会破——升级后跑 theme 测试兜底。
- **文字颜色**:未选中导航项 Astryx 用 `--color-text-secondary`,当前覆盖成 HeroUI 的 `--foreground`——存在两套色彩 token 混用,Slice 3 建统一 token 桥。
- **菜单密度**:Astryx MoreMenu 弹层不吃 `.pigui-compact-menu-*`(HeroUI 专用),迁移期两种菜单密度并存。
- **弹层机制**:Astryx 用原生 popover API + CSS anchor,HeroUI 用 portal——不冲突,但 jsdom 中 Astryx 菜单常驻 DOM,测试已适配。
- **MoreMenu 无 danger variant**:Remove Project 用分隔线承载破坏性语义,待主题层补色。
- **SideNav 折叠是 48px 图标轨不是 offcanvas**;且折叠切换时 SideNav 根节点会重挂载,长期 ref/observer 需随 open 状态重挂(已处理)。
- **视觉抛光遗留**:侧栏内容内边距比 HeroUI 版本紧(Projects 标签贴边)、强调色变成 Astryx 默认蓝紫——留到 slice 1 抛光 pass 处理。

## 勘误与后续选项(2026-08-08)

- **Astryx 其实自带 Chat 组件族**(ChatLayout/ChatMessageList/ChatComposer/ChatToolCalls/ChatTokenizedText 等,`astryx component --list` 可见)——立项时查官网文档得出"无聊天组件"的结论有误。Slice 2 的自建原语已交付且测试全绿,不推倒;自建层对 Pi 特有语义(ToolPartState、回放时间线)控制力更强。后续若想收敛维护面,可评估把部分原语底座换成 Astryx Chat*,属可选优化不属债务。
- Slice 2 取舍:Astryx `useResizable` 仅像素边界(42%/64% 挂载时换算,resize 不重 clamp);shiki 语言 chunk 双份(HeroUI 清退后消失)。

## 风险与开放问题

- Astryx Beta:API 变动走 `astryx upgrade --apply`;版本钉死在 bun.lock。
- 双 reset 冲突:astryx reset.css 与 Tailwind preflight 叠加的实际影响,Slice 1 输出清单。
- 字体:当前真源是 styles.css 的 Montserrat token,Astryx 主题的字体 token 需对齐(不许出现第二真源)。
