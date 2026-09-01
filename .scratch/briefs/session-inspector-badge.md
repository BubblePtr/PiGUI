# 任务简报:rail 徽标显示 Changes 文件数(issue #141)

## 关联 Spec
GitHub issue #141(`gh issue view 141`)。目标:SessionInspector 的 rail 上,Changes 图标显示变更文件数徽标,且与面板内 totals 行的数字一致。

## 背景
- 分支 `feat/session-inspector-badge`,基于 main(已含 #142:SessionInspector 落地)。
- `SessionInspector` 已支持 `badges?: Partial<Record<SessionSurfaceId, string>>` prop(`apps/desktop/src/shared/ui/session-inspector/session-inspector.tsx`),rail 会渲染它,Design page Gallery 已有演示;缺的只是 app 侧生产者。
- 数据源现状:`SessionChangesPanel`(`apps/desktop/src/pages/agent-workspace.tsx`)内部自己 fetch `getSessionChanges(sessionId)`。issue 给了两条路:把 fetch 提升到页面层,或给面板加 `onChangesLoaded` 回调 seam。**选型自定,但说明理由**;倾向于避免重复请求(同一数据别 fetch 两次)和避免 badge 在面板关闭时失效——注意 inspector 收起时 rail 不渲染,badge 只需在 inspector 打开时正确即可,不要为收起态引入额外轮询。
- ADR-0028 与 `docs/self-built-ui.md` 都记录了「v1 无生产者」,落地后同 PR 更新这两处措辞。
- 徽标语义:`state: "clean"` 或 `non-git` 时不显示数字(见 `packages/core/src/session-changes.ts` 的 `SessionChanges` 类型);`omittedFileCount` 是否计入以面板 totals 行为准——两处必须同源,不能各算各的。

## 涉及文件
- `apps/desktop/src/pages/agent-workspace.tsx` — 生产者接线
- `apps/desktop/src/shared/ui/session-inspector/*` — 如需微调 badge 渲染
- `apps/desktop/src/pages/agent-workspace.test.tsx`、`session-inspector.test.tsx` — TDD
- `docs/adr/0028-*.md`、`docs/self-built-ui.md` — 措辞更新

## 约束
- TDD;Conventional Commits;不 push、不开 PR。
- 验证:`bunx tsc --noEmit`、仓库根 `bunx vitest run` 全绿;`bun run build && bun run test:e2e` 15/15(e2e 若无相关断言不必新增,但不能回归)。
- 浏览器 mock 下 `get_session_changes` 不可用(会报错重试态),badge 在该态不应显示脏数据——处理好 error/loading 态。

## 范围外
- 其他 surface 的徽标、事件驱动的徽标脉冲(Ambient 遗产)、CI workflow。
