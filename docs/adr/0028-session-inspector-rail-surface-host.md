# ADR-0028：SessionInspector 以图标 rail 承载 Session surface

- 状态：Accepted
- 日期：2026-09-02

## 背景

ADR-0008 把 Live Session 页右侧定义为 Structured Action Surface。ADR-0023 把 Changes 停靠到那里，并且明确不提前抽象 inspector：“出现第二个真实的 Session-scoped 右侧 surface 后，再根据共同交互抽取 `SessionInspector`”。Session actions（checkout、model/cost、archive）当时留在自己的工具栏按钮和 Sheet 里。

第二个 surface 已经到了。Actions 同样是 Session-scoped，同样更适合与 Chat 并排而不是盖住它；Subagent 详情面板已在排期、Terminal 仍被 ADR-0007 冻结，它不会是最后一个。两个独立的工具栏按钮、两个 Sheet 加一个 docked 面板，已经是同一块右侧区域的三种到达方式，再加一个 surface 就是第四种。

`/proto/surfaces` 上用真实 Session 内容对比了三个宿主形态：

- **Dock**（Cursor 式 tab 条 + launcher 网格）：被否。tab 管理成本落到用户身上，空态多一步，tab 条随实例线性变宽。
- **Ambient**（事件驱动自动浮现 + pin/dismiss）：被否。自动切换打断用户，面板不再可预测。其“事件 → surface 提示”的思路值得作为未来的 rail 徽标保留。
- **Rail**（面板自带图标 rail）：选定，但改掉一点——rail 不是窗口 chrome。

## 决策

### Inspector 是一个自带 rail 的面板

`SessionInspector`（`shared/ui/session-inspector/`）渲染一个全高面板：40px 表头（surface 图标、标题、提示、关闭按钮），以及贴在面板自身右缘的 44px 图标 rail。rail 是面板的一部分：inspector 关闭时两者一起消失，用户不需要它的时候窗口边上不留任何常驻物。HeaderChrome `toolbarActions` 槽位里一个 toggle 按钮（开启态高亮）取代原先的 Changes 与 Session actions 两个按钮。

面板宽度：默认 560px，最小 340px，最大 58vw（其余留给 Chat），拖拽复用已经驱动 docked Changes 的 Astryx `useResizable` / `ResizeHandle`。

### 注册表只存元数据，不存内容

`surface-registry.ts` 每个 surface 只记 id、title、icon、hint，再无其他。surface 内容留在拥有数据的那一侧——Changes 仍是 `SessionChangesPanel`，Actions 仍是 `SessionActionsContent`——由页面作为 children 注入。注册表因此永远不会认识 Session 状态，新增 surface 也不必改动宿主。

v1 注册 `changes` 与 `actions`。Terminal / File / Browser surface 仍受 ADR-0007 冻结；插件 surface 协议（#85 / ADR-0018）不受影响。

### 多实例只建模，不实装

未来的 Terminal、Subagent 可能是多实例。现在先把模型记下来，免得回头重做 rail：**rail 保持类型级、每类一个图标，永不随实例膨胀**；实例条放在面板表头，rail 徽标显示 `×N`。注册表保留 `multiInstance` 标志位；在真的出现多实例 surface 之前不上任何实例 UI。

### 低于 1280px 时 inspector 收敛为 Sheet

沿用 ADR-0023 的断点，只是作用对象从 Changes 扩大到整个 inspector。窄窗口上 rail 会白白吃掉宽度，因此 Sheet 表头改用分段切换，两个 surface 依然都可达。跨越断点时保留意图——是否打开、停在哪个 surface——只替换承载方式。

开关状态与激活 surface 存在页面层，切换 Session 时保持，与原先的 `changesOpen` 行为一致。不新增任何持久化机制。

## 结果

- 一个 toggle、一块区域：所有 Session-scoped surface 的到达方式统一，宽屏上 Actions 不再用遮罩盖住 Chat。
- `AgentWorkspaceSessionsView` 仍然只暴露那个很薄的 optional `aside` seam；split 布局照旧不知道 diff、surface 或插件的存在。
- rail 徽标（`badges` prop）由 Changes 文件数点亮（#141）：working tree 的读取从 `SessionChangesPanel` 上提到页面层的 `useSessionChanges`，面板与徽标共用同一次读取，因此两处数字不可能各算各的。徽标只在 `state: "ready"` 且有文件时出现——加载中、读取失败、干净树、非 Git checkout 都不显示数字。inspector 收起时不读 Git；停靠形态下 rail 一直在，所以停在 Actions 也照读，Sheet 形态没有 rail，就只在 Changes surface 上读。
- ADR-0023 在工具栏入口与承载容器两个问题上被本文部分取代；Changes 的数据与安全契约（ADR-0022）不受影响。

## 验证

- 组件测试覆盖 rail 切换、“再次点击当前图标不会让 surface 落空”这条边界，以及宽度上下界。
- Workspace 测试覆盖断点两侧：docked 路径（toggle、rail 切换、关闭、resize handle、两个 resizable panel）与 Sheet 路径（表头切换后两个 surface 均可达）。
- Electron E2E 在真实 Git repository 上驱动 docked inspector，并在窄窗口验证 Sheet 回退。
- 1440×900 浏览器截图确认三态：开启-Changes、开启-Actions、收起。
