# 任务简报：数据调色板补绿色 token（GitHub #106）

## 关联 Spec
GitHub Issue #106（`gh issue view 106` 查看）。issue 给了两个方案，**本次采用方案 1：补 `--pigui-data-green` 令牌**——理由：CONTEXT 徽章语义与"操作成功"无关，解耦后未来调整成功色不会被动影响数据编码色。

## 背景
- Trace Cockpit 台账徽章体系：USER(蓝)/ASSISTANT(灰)/TOOL(橙)/CONTEXT(绿)，前三者取自 `--pigui-data-*` 调色板，CONTEXT 暂借语义令牌 `--success`。
- 调色板现有 blue/orange/orange-strong/amber/peach/coral/slate，缺绿。

## 涉及文件
- `apps/desktop/src/app/styles.css` — `:root` 增加 `--pigui-data-green`（如调色板有 dark 分支，两边都补，取值与现有 `--pigui-data-*` 系列的明度/彩度惯例一致，与 `--success` 可近似但独立定义）
- CONTEXT 徽章与 Strip 泳道注解的取色处 — 改用新 token（`grep -rn "success" apps/desktop/src/proto/trace apps/desktop/src/shared/ui` 定位，只改 CONTEXT/泳道注解语义的用法，✓ 成功字形保留 `--success`）
- `apps/desktop/src/pages/design.tsx` — 若 /design 页有数据调色板展示区，同 PR 补上新色

## 约束
- 只做 token 补充与替换，不重构徽章组件。
- 颜色取值可参考 `--success` 现值起步，但要放进 `--pigui-data-*` 系列的视觉一致性里检查（明度/彩度与邻居协调）。
- Git：新建 `feat/pigui-data-green-token` 分支，Conventional Commits，**只 commit 不 push**，完成后报告分支名与验证命令。

## 范围外
- 不新增其他数据色；不改 ✓ 成功字形等真正表达"成功"语义的 `--success` 用法。
