# 任务简报：shared/ui 契约层（#217）

## 关联 Spec
GitHub Issue #217（`gh issue view 217`）。目标与验收标准以该 issue 为准；PRD 在 `.scratch/component-api-contract/PRD.md`。

## 背景
- 仓库规则见 `AGENTS.md`（根）与 `apps/desktop/AGENTS.md`；设计系统规则 `docs/design/README.md`。
- React 19.2：`ref` 是普通 prop，随 `...rest` 到达根元素即可，不要引入 `forwardRef`。`TerminalView` 已有 `useImperativeHandle`，保留。
- 目前只有 `dot-matrix.tsx` 和 `icons.tsx` 做了 rest 透传，可作为范式：`type Props = Omit<ComponentProps<"span">, "children"> & {...}`，rest 在内部 `data-slot` / `role` 之后展开，使调用方能覆盖。
- 组件根若是 Astryx 组件（如 `ChatConversation` 包 Astryx 的 chat 容器），rest 透传给该 Astryx 组件；Astryx 组件本身接受什么以其 `.d.ts` 为准（`apps/desktop/node_modules/@astryxdesign/core/dist/<Name>`）。
- `PiKpi` 现有 `valueClassName` / `valueTestId` 是值元素的槽位属性，保留；补的是根级 `className` 与 rest。
- 命名改动不属于本切片（#218 处理），不要顺手改 prop 名。

## 涉及文件
- `apps/desktop/src/shared/ui/**/*.tsx`（非测试）— 逐个组件补 `className` + rest 透传
- `apps/desktop/src/shared/ui/pi-trajectory-ledger.tsx` — 显式列出转给 `Run` 的 prop
- `apps/desktop/src/shared/ui/pi-trajectory-inspector.tsx` — Schema tab 中文文案改英文（约 :163、:177-179）
- `apps/desktop/src/shared/ui/contract.test.tsx`（新建）— 表驱动契约测试
- `docs/design/README.md` — 硬规则 7；`docs/self-built-ui.md` — 维护规则段加一行
- 现有 `*.test.tsx` 只在断言被本次改动影响时调整

## 约束
- TDD：先写 `contract.test.tsx` 看它对未透传的组件失败，再逐个修到绿。
- 只写 token，不写字面量；本切片不应产生任何视觉或样式差异。
- 类型：用 `ComponentProps<"...">` 派生，`Omit` 掉与自定义 prop 冲突的键；不要 `any`。
- 验证命令：`bun run typecheck` 与 `bun run test`（在仓库根运行）。
- 在当前分支 `fix/ui-api-contract` 上工作，完成后用 Conventional Commits 提交（可多次），**不要 push、不要开 PR、不要碰 main**。

## 范围外
- prop 改名（#218）、复合件拆分与 context（#219）。
- 不改受控/非受控模型，不加 `defaultX`。
- 不改 `pages/` 下的调用方式，除非类型变化强制要求。
