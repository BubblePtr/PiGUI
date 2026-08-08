# 0026. 前端设计系统从 HeroUI Pro 迁移到 Astryx

日期:2026-08-08
状态:已接受(spike 验证中)

## 背景

当前渲染层基于 HeroUI Pro(通用组件 + AI 聊天垂直套件)。随着产品演进,PiGUI 的核心 UI(会话回放时间线、成本/token 视图、未来的 plugin 面板)越来越多地需要自定义组件,而 HeroUI 是一个封闭的垂直套件:它不开放一级设计 token,自定义组件难以与其设计语言保持一致,长期会被框死在它的设计系统内。

Meta 于 2026-06 开源的 Astryx(MIT,Beta,React 19 + StyleX)提供了相反的模型:150+ 组件 + 完整开放的一级 token(color/spacing/radius/motion),消费侧与 StyleX 解耦(可用任意 CSS 方案覆盖),并自带 agent 工作流(CLI 文档/脚手架/codemod),与本仓库的 agent 协作方式契合。

## 决策

1. 设计系统底座迁移到 **Astryx**(`@astryxdesign/core` + 主题包),业务语义 token 由 Astryx 一级 token 拼装。
2. 无头行为组件采用 **Base UI**(菜单、对话框、折叠等 Astryx 未覆盖且需自定义外观的交互)。
3. AI 聊天栈(流式 Markdown、代码高亮、粘底滚动)Astryx 无对应物,用专用库(shiki、流式 markdown 渲染器)+ Astryx token 自建,迁移放在第二片。
4. 迁移按片进行,期间允许 HeroUI 与 Astryx 并存,但 token/字体只有一个真源(styles.css)。

## 切片

- Slice 1(本 spike):壳层 —— AppFrame(AppShell/SideNav)、Settings;验证两套并存的样式冲突面。
- Slice 2:agent-workspace 聊天栈自建(HeroUI 聊天组件全部退役)。
- Slice 3:其余页面(trace/usage/session-detail)与 HeroUI 依赖清退。

## 后果

- 正向:自定义组件获得一致的 token 地基;摆脱垂直套件锁定;CLI/agent 工作流降低后续 UI 开发成本。
- 代价:Astryx 处于 Beta,升级需跑 `astryx upgrade --apply`;聊天栈需要一次性自建成本(集中于 agent-workspace.tsx);并存期两套 reset/主题需隔离验证。
- 回退:Slice 1 失败则丢弃分支,HeroUI 现状不受影响。

## 相关

- `.scratch/astryx-migration/PRD.md`(切片与验收标准)
- `apps/desktop/AGENTS.md`(Astryx CLI 生成的组件使用约定)
- 0013(Electron shell 架构,壳层组件的宿主约束)
