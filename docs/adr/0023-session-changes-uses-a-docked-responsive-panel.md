# ADR-0023：Session Changes 使用可停靠响应式面板

- 状态：Accepted
- 日期：2026-07-19

## 背景

ADR-0008 将 Live Session 定义为左侧 Project 导航、中间 Chat、右侧 Structured Action Surface 的三栏工作区。M3 首次接入真实 Git diff 时，为了先闭合数据与安全契约，把 Changes 放进了 `SessionActionsSheet`。这让用户查看 diff 时会用遮罩覆盖 Chat，与“Chat 是主工作区、Changes 是当前 Session 上下文”的产品关系不一致。

`SessionActionsSheet` 还承载 checkout、model/cost 和 archive。M3.5 只迁移 Changes，不应顺带重构这些动作，也不应在只有一个真实右侧 surface 时提前引入 tabs、Plugin registry 或泛型 `RightPanel<T>`。

## 决策

### Workspace 只暴露 optional aside

`AgentWorkspaceSessionsView` 接受一个可选 `aside`。没有 aside 时保持原来的单列 Chat 布局；有 aside 时使用现有 HeroUI `Resizable`，让 Chat 与 aside 成为同一 Workspace 内的两个水平 pane。

这条边界只描述布局，不知道 Diff、Session Inspector 或插件。Changes 仍由独立的 `SessionChangesPanel` 负责加载、文件选择、unified/split 和异常状态。

### Changes 根据窗口宽度选择承载方式

- 宽屏（`min-width: 1280px`）：Changes 在 Workspace 右侧 docked pane 中展示，可关闭、可拖拽；默认占 54%，范围为 42%–64%，Chat 最少保留 36%。
- 中屏：使用右侧 Sheet，保留 Chat 的可恢复上下文，不强行压缩成两个不可读窄栏。
- 窄屏：同一 Sheet 使用全宽内容区。

窗口跨越断点时保留“Changes 已打开”这一意图，只替换承载方式。工具栏使用独立的 Changes icon button；原 Session actions button 和 Sheet 继续负责 checkout、model/cost 与 archive。

### 不提前抽象 Inspector

M3.5 不增加 tab bar、空 placeholder、Activity/Session 迁移、Plugin surface 或通用 Panel API。出现第二个真实的 Session-scoped 右侧 surface 后，再根据共同交互抽取 `SessionInspector`。

## 结果

- Diff 与 Chat 可以并排查看，面板 resize 不遮挡主工作区。
- 960×720 等默认 Electron 中宽窗口不会得到过窄的 docked diff，而是继续使用 Sheet。
- 现有 checkout/model/archive 流程不随 Changes 迁移而改变。
- Workspace 的未来扩展点保持在一个很薄的 optional `aside`，当前实现不背负尚未出现的插件协议。

## 验证

- 组件测试覆盖宽屏 docked 打开/关闭、Resizable 尺寸边界，以及中屏 Sheet fallback。
- Electron E2E 使用真实临时 Git repository，在宽屏验证 Chat 与 docked Changes 同时可见并存在 resize handle，在中屏验证 Sheet fallback。
- 在 1440×900、1024×768 和窄屏尺寸执行截图检查，确认文字、controls、diff 与 composer 不重叠。
