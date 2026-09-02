# 任务简报：session 重命名/删除的后端与 entities 层能力

## 目标

为侧边栏 session 行的「重命名 / 删除」操作提供后端 RPC 与前端 entities 层支撑（归档 `archive_session` 已存在，无需改动）。做完后：`rename_session` 可持久化自定义标题并在列表中生效，`delete_session` 可永久移除一个非 active 的 session 投影。

## 验收标准

- [ ] `PersistedSessionProjection`（`packages/backend/src/persistence/session-projection-store.ts`）新增 `title?: string`；store 新增 `remove(sessionId)`（删除对应 JSON 文件，幂等：不存在时不抛错）。
- [ ] 新增 RPC `rename_session`（args: `{ sessionId, title }`）：trim 后非空才写入；返回更新后的 `PersistedSessionProjection`；session 不存在时报错。实现位置与 `archive_session` 对齐（`packages/backend/src/gateway/runtime-gateway.ts` + `service.ts` 的 `isRuntimeGatewayMethod` 白名单）。
- [ ] 新增 RPC `delete_session`（args: `{ sessionId }`）：active（creating/running）session 拒绝删除并报错（参照 archive 的前置校验模式）；成功则从 store 移除并返回被删的投影。**只删投影记录，不删 Pi 的 session 源文件**（Pi 拥有 session 真相，PiGUI 只管理自己的投影）。
- [ ] 前端 `apps/desktop/src/entities/session/sessions.ts` 新增 `renameSessionProjection(sessionId, title)`、`deleteSessionProjection(sessionId)` 封装。
- [ ] 前端 `SessionProjection` 类型（`apps/desktop/src/entities/session/session-projection.ts`）新增 `title: string | null`；`sessionProjectionFromPersistedProjection`（`use-session-projections.tsx`）读入 `record.title ?? null`；`getSessionProjectionListItems` 的列表 `title` 取 `projection.title ?? projection.initialPrompt`。
- [ ] TDD：先写失败测试再实现。测试落点：`packages/backend/src/persistence/session-projection-store.test.ts`、`packages/backend/src/gateway/runtime-gateway.test.ts`（参照 793/809 行的 archive_session 用例）、`packages/backend/src/service.test.ts`、`apps/desktop/src/entities/session/session-projection.test.ts`。
- [ ] 验证命令：仓库根 `bun run test`（Vitest）全绿；`bunx tsc -b`（或项目现有 typecheck 命令）通过。

## 背景

PiGUI 侧边栏 project 下的 session 列表要加 重命名/归档/删除 三个操作按钮（UI 由主循环另做，本任务不碰 `app-shell.tsx` 等页面/UI 文件）。现状：`archive_session` 已实现（`runtime-gateway.ts:437` 起，置 `status:"archived"` + `archivedAt`）；title 目前是从 `initialPrompt` 派生显示，没有可编辑的存储字段；store 只有 save/get/list。

## 涉及文件

- `packages/backend/src/persistence/session-projection-store.ts` — 类型 + remove 方法
- `packages/backend/src/gateway/runtime-gateway.ts` — rename/delete 实现（参照 archiveSessionProjection，约 616 行起）
- `packages/backend/src/service.ts` — RPC 白名单/分发（223-259、397-412）
- `apps/desktop/src/entities/session/sessions.ts` — RPC 封装
- `apps/desktop/src/entities/session/session-projection.ts` — SessionProjection.title、列表 title 取值
- `apps/desktop/src/entities/session/use-session-projections.tsx` — 持久化记录 → 投影的水合
- 对应各 test 文件

## 约束

- 遵循仓库既有代码风格；代码注释英文、只写 why。
- 不改 UI/页面文件（`app-shell.tsx`、`pages/**`）；不加新依赖。
- 不动 Pi 的 session 源文件（sessionFile），delete 只作用于 PiGUI 投影存储。

## 范围外

- 侧边栏按钮/菜单 UI 与交互（主循环负责）。
- trace 页 `session-list.tsx` 面板的改动。
- 归档能力（已存在）。
