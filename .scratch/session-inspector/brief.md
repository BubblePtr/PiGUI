# 任务简报:SessionInspector Rail 形态落地(issue #140)

## 关联 Spec
`.scratch/session-inspector/PRD.md`(单一事实源:决策、已定数值、v1 范围、验收标准、范围外)。GitHub issue #140 引用同一文件。

## 背景
- 这是 ADR-0023 预言的重构:第二个右侧 surface(Actions)出现,抽取 SessionInspector。先读 `docs/adr/0008`、`0023`、`0007`。
- 参考原型:`apps/desktop/src/proto/surfaces/`(**只作交互与视觉参考,代码不可直接搬**——原型是 throwaway 质量,真实实现要用 Astryx `useResizable`/`ResizeHandle`、遵守 shared/ui 规范)。看 `variant-rail.tsx` 即可理解目标交互;`surfaces.tsx` 的注册表类型可作 API 起点。
- 现状接线全在 `apps/desktop/src/pages/agent-workspace.tsx`:
  - `AgentWorkspaceSessionsView` 的 `aside?: ReactNode` seam(~:3643)是挂载点,split/resize 代码不需要动结构,只换 aside 内容。
  - `SessionToolbarActions`(~:2787)= 现有 Changes 按钮 + SessionActionsSheet + SessionChangesSheet。
  - `SessionActionsContent`(~:2354)、`SessionChangesPanel`(~:2110)、`SessionChangesAside`(~:2630)、`useDockedSessionChangesLayout`(~:209)。
- 浏览器验证:dev server `http://127.0.0.1:1420`(可能已在跑,端口被占就直接用),非 Electron 时自动 mock 数据。截图可用 Playwright headless。
- 测试契约:`agent-workspace.test.tsx`(~6000 行)有 `session-workspace-split-view` / `session-workspace-aside-pane` / `session-changes-aside` 等 testid 断言;`design.test.tsx` 按 `getByRole("region", {name})` 断言 Gallery 标题。

## 涉及文件
- `apps/desktop/src/shared/ui/session-inspector/` — 新建(registry + 组件)
- `apps/desktop/src/pages/agent-workspace.tsx` — 接线、迁移 Actions、泛化断点 hook
- `apps/desktop/src/pages/agent-workspace.test.tsx` — 更新契约
- `apps/desktop/src/pages/design-components.tsx` + `docs/self-built-ui.md` — Design page 注册与台账
- `docs/adr/0024-session-inspector-rail-surface-host.md` — 新 ADR(英文)
- `apps/desktop/src/proto/` + `apps/desktop/src/app/main.tsx` — 拆除原型(删目录,revert `[proto:surfaces]` fence)

## 约束
- TDD:先改/写测试看它失败,再实现。UI 结构类断言以 testid/role 为准,不断言样式字面量。
- Astryx first:布局/交互组件先查 Astryx(`bunx astryx component <Name>`),仅确认无等价物才手写;token 一律走语义桥(`--foreground` 等)或 Astryx 一级 token,禁止硬编码色值/圆角/间距。
- shared/ui 新组件必须同 PR 注册 Design page(repo 硬规则)。
- commit 遵循 Conventional Commits;分支已建:`feat/session-inspector`。
- 不动 `SessionChangesPanel` / `SessionDiffViewer` 内部实现。

## 范围外
见 PRD「范围外」节。另:不要在本 PR 里引入任何持久化新机制、不要动 SideNav/HeaderChrome 结构(只用现有 toolbarActions 槽)。
