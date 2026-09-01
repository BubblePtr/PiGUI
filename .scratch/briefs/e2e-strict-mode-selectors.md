# 任务简报:修复 main 上 e2e smoke 的 7 条失败(issue #143)

## 关联 Spec
GitHub issue #143(`gh issue view 143`)。目标与验收以该 issue 为准:`bun run build && bun run test:e2e` 在本分支 15/15 全绿。

## 背景
- 分支 `fix/e2e-strict-mode-selectors`,基于 main(e495938)。已确认失败与 PR #142 无关,两边失败集合一致。
- m1 的 5 条根因已定位:`e2e/smoke/m1-fixture-free.spec.ts` 的 `openSession()` 用 `getByRole('button', { name: /E2E lifecycle session/i })`,同时匹配 SideNav 会话行按钮和行内菜单按钮 `aria-label="Session actions for E2E lifecycle session"`,strict-mode 冲突。
- s3 的 2 条(`s3-provider-settings.spec.ts`)原因未查,需要你自行诊断(先看 `test-results/*/error-context.md`,跑单文件复现)。
- 运行方式见 `e2e/README.md`;macOS 本机直接 `bun run build && bun run test:e2e`,可用 `-- e2e/smoke/<file>` 跑单文件。

## 约束
- 只改 `e2e/` 下的测试代码;不动应用代码。若诊断发现必须改应用(如真实的 a11y 缺陷),停下来报告,不要自行改。
- 选择器修复取向:收窄语义(`exact: true`、按容器/角色 scope),不要用 `.first()`/`nth()` 这类位置性绕过。
- 注意:PR #142(feat/session-inspector)也改了这两个 spec 文件(testid/label 重命名)。你的修改要尽量小而局部,减少将来 rebase 冲突面;不要顺手重构无关部分。
- Conventional Commits;不 push、不开 PR。

## 范围外
- 新建 CI workflow(issue #143 里建议了,但单独排期)。
- PR #142 分支上的任何改动。
