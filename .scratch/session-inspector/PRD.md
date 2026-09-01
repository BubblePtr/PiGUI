# SessionInspector:Rail 形态的 surface host

> 决策来源:`/proto/surfaces` 三变体原型(Dock / Rail / Ambient),2026-09-02 用户选定 Rail。
> 原型位置:`apps/desktop/src/proto/surfaces/`——已拆除。
> 落地:issue #140,ADR-0028(`docs/adr/0028-session-inspector-rail-surface-host.md`);rail 徽标后续项 issue #141。

## 决策

会话页右栏重构为 **SessionInspector**——一个可显隐、可拖拽调宽的全高独立面板,内含:

- **面板本体**:承载当前激活的 surface 内容,顶部 40px 表头(surface 图标 + 标题 + 提示/实例区 + 关闭按钮)。
- **图标 rail**:贴在面板自身右缘的 44px(`w-11`)垂直图标栏,列出所有已注册 surface 类型(带徽标,如 Changes 文件数),点击即切换。rail 是面板的一部分,面板收起时随之消失,**不常驻窗口**。
- **显隐开关**:HeaderChrome 的 toolbarActions 槽位一个 toggle 按钮(开启态高亮),替代现有的 Changes 图标按钮。

### 与三个被否变体的对比(防止三周后重开讨论)

- **Dock(Cursor 式 tab 条 + launcher 网格)**:被否。tab 管理成本高、空态多一步;tab 条随实例线性变宽。
- **Ambient(事件驱动自动浮现 + pin/dismiss)**:被否。自动切换打断用户、行为可预测性差;但其「事件 → surface 徽标脉冲」的提示思路可作为未来增强(rail 图标上的事件徽标)。
- **Rail 初版(rail 常驻窗口右缘、独立于面板)**:被否。用户明确要求 rail 不常驻。

### 已定数值(来自原型实测)

| 项 | 值 |
|---|---|
| 面板默认宽 | 560px |
| 面板最小宽 | 340px |
| 面板最大宽 | 58vw(保 chat 最小宽度) |
| rail 宽 | 44px(`w-11`),图标按钮 36px(`h-9 w-9`) |
| 面板表头高 | 40px(`h-10`,与 HeaderChrome 同基线) |
| dock/sheet 断点 | 1280px(沿用 ADR-0023) |

### 多实例模型(本期不实装,记录设计)

surface 注册表区分单例(Changes/Actions)与多实例(未来的 Terminal/Subagent,`multiInstance: true`)。多实例采用 VS Code 模型:**rail 图标保持类型级永不膨胀**,实例条(`1 2 +`,可关闭)放在面板表头,rail 徽标显示 `×N`。本期没有任何真实多实例 surface,故注册表仅保留类型定义位,实例条 UI 等 Terminal(ADR-0007 解冻时)或 Subagent 详情面板(`.scratch/subagent-detail-panel/`)落地时一并实装——不上死 UI。

## v1 范围

1. 新建 `apps/desktop/src/shared/ui/session-inspector/`:
   - `surface-registry.ts` — surface 元数据类型(id/title/icon/hint/badge/multiInstance)与注册表;v1 注册 `changes`、`actions` 两个 surface。
   - `session-inspector.tsx` — 面板 + rail + resize handle + 表头。resize 复用 Astryx `useResizable`/`ResizeHandle`(agent-workspace 现有用法),不手写拖拽。
2. `agent-workspace.tsx` 接线:
   - `aside` seam(`AgentWorkspaceSessionsView` 的 `aside?: ReactNode`)改挂 `SessionInspector`;`SessionChangesAside` 的职责并入 inspector(Changes surface 内容 = 现有 `SessionChangesPanel`,不动其内部)。
   - **Actions 从 sheet 迁入 inspector**:`SessionActionsContent` 成为 `actions` surface 的内容;`SessionActionsSheet` 移除(<1280px 时 Actions 与 Changes 一样走 sheet 回退)。
   - `SessionToolbarActions` 收敛为单个 inspector toggle(开启态高亮),替代现有 Changes 按钮 + Actions sheet 触发按钮。
   - `useDockedSessionChangesLayout` 泛化为 inspector 级断点 hook:≥1280px dock;<1280px 收起为 sheet(sheet 内保留 surface 切换,可用最简形式,如 sheet 头部的分段切换)。
3. 记忆行为:inspector 开/关状态与激活 surface 在会话切换间保持(与现有 changesOpen 的持久化策略一致即可,不新增存储层)。
4. Design page:`SessionInspector`(含 rail)在 `/design` 注册 Gallery 条目,覆盖典型态(Changes 激活/Actions 激活/收起态说明)。同 PR 更新 `docs/self-built-ui.md`。
5. 新 ADR(落地时定为 `docs/adr/0028-*.md`,中文,沿用仓库多数 ADR 风格;0024 编号已被占用):记录 Rail 决策、与 ADR-0008/0023 的关系(0023 预言的「第二个 surface 出现时抽取 SessionInspector」在此兑现)、Terminal/File 仍受 ADR-0007 约束。
6. 拆除原型:删除 `apps/desktop/src/proto/`,revert `main.tsx` 中 `[proto:surfaces]` fence 内的全部改动。

## 验收标准

- [ ] `bunx tsc --noEmit -p tsconfig.json` 通过。
- [ ] `bun test`(apps/desktop 相关测试)通过;`agent-workspace.test.tsx` 中 split view / aside / sheet 断点的既有契约按新结构更新而非删除,Actions 迁移后原 sheet 断言改为 inspector/sheet 断言。
- [ ] ≥1280px:toolbar toggle 显隐 inspector;rail 切换 Changes/Actions;面板可拖拽调宽(340px–58vw);Changes diff 查看与 Actions 的 checkout/成本/归档功能不回退。
- [ ] <1280px:inspector 收敛为 sheet,两个 surface 均可达。
- [ ] `/design` 页新增 SessionInspector 条目且 `design.test.tsx` 通过。
- [ ] `apps/desktop/src/proto/` 不存在;`git grep "proto:surfaces"` 无结果。
- [ ] 浏览器(`127.0.0.1:1420` mock 数据)截图确认三态:开启-Changes、开启-Actions、收起。

## 范围外

- Terminal / File / Browser surface(ADR-0007 仍然生效)。
- Subagent surface(`.scratch/subagent-detail-panel/` 单独排期)。
- 多实例条 UI、插件 surface 协议(#85 / ADR-0018)。
- Ambient 式事件徽标脉冲(未来增强)。
