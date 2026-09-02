# 任务简报：Strip Time 模式模型段改用真实时长（GitHub #108）

## 关联 Spec
GitHub Issue #108（`gh issue view 108 --comments` 查看——**最新一条 comment 是 2026-08-31 的调研结论，本任务按该结论的"方向 1(a)"实现**）。验收标准以 issue 正文"验收"节为准（按方向 1 解释）。

## 背景
调研已核实（细节、文件行号、样本证据都在 issue comment 里）：
- Pi JSONL 每条 assistant 记录有内层 `record.message.timestamp`（epoch ms，模型调用开始）+ 外层 `record.timestamp`（ISO，`message_end` 完成时刻），单次模型调用真实时长 = outer − inner。
- PiGUI 现只读外层：`sessions.ts:199` / `effectiveField()`（:602-606）永远碰不到内层。
- turn 内每次模型调用各有一条 message 记录，多工具轮次天然逐段正确。

## 要做的事
1. `packages/backend/src/workspace/sessions.ts`：assistant turn 补读 `record.message.timestamp`，在 `SessionTurn` 上暴露开始时间（命名如 `startTimestamp`，ISO 或 ms 与现有字段风格一致）；更新 :270-285 一带过时的注释。
2. `apps/desktop/src/entities/session/trace-model.ts`：`TraceTurn` 透传该字段。
3. `apps/desktop/src/shared/ui/pi-trace-strip.tsx`（:51-64,123 现有估算逻辑）：Time 模式下模型段有真数据时用 `outer − inner` 真实时长（不再 30s 封顶、不再按段均摊）;无真数据（旧 session、字段缺失、outer−inner 非正数等异常值）退回现有估算路径。
4. **估算段视觉降级**：退回估算的模型段必须与实测段视觉可分（issue 方向 2 的表达，如半透明/斜纹类处理），把"这是估算"做进编码本身;实测段维持现状。/design 页 Strip 条目补一个"混合真实/估算"状态的展示。
5. 文档同步：strip 组件注释与 CONTEXT.md 的 Strip 词条更新（issue 验收第三条）;`docs/self-built-ui.md` strip 行的"真数据待 #108"备注更新。

## 约束
- TDD：sessions.ts 的时间戳解析（含缺内层字段、outer−inner ≤ 0 的防御）与 strip 的真/估分流先写失败测试。
- 防御性处理：内层时间戳缺失、非数字、晚于外层（时钟漂移）一律视为无真数据走 fallback，绝不渲染负值/零宽。
- 视觉降级样式走 token（语义桥或 `--pigui-data-*`），不硬编码;若引入新视觉状态,同 PR 更新 /design 页 Strip 展示。
- Git：新建 `feat/strip-real-model-durations` 分支，Conventional Commits，**只 commit 不 push**，完成后报告分支名与验证命令。

## 范围外
- 不动 Gateway 实时事件路径（journal 的 phase:start/end 透传属后续优化，本任务只做 JSONL replay 路径——Strip 的现数据源）。
- 不做 usage/cost 的耗时归因（issue 提到的"合并考虑"仅指数据可复用，不在本切片）。
- `DeferredHandle` / 旧版本 pi-coding-agent 的特殊语义不专门处理——fallback 天然兜住。
