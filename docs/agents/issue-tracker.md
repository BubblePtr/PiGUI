# Issue tracker: GitHub Issues + in-repo PRDs

自 2026-08-09 起,本仓库采用**混合制**:

- **可执行的切片/任务/遗留问题 → GitHub Issues**(`gh issue` 操作),五个 triage 角色以 GitHub label 表达(见 `triage-labels.md`)。
- **PRD 与决策记录 → 仓库内 markdown**,仍在 `.scratch/<feature>/PRD.md`。长文档、要进版本历史的内容不放 GitHub Issue。

此前(≤2026-08-09)的 issue 以 `.scratch/<feature>/issues[/]` 下的 markdown 存在,保留作历史记录;其中未完成的已迁移为 GitHub Issue,原文件只留指针。

## PRD layout

```
.scratch/<feature>/
└── PRD.md    # 问题、方案、决策、范围;执行切片开成 GitHub Issues 并在此处链接
```

PRD 里列切片时直接链 GitHub Issue 编号(`#N`);反过来每个 Issue 的正文第一行链回其 PRD 路径。

## Issue shape

每个 GitHub Issue 是自足的实施简报,agent 冷启动只靠它就能动手:

- **背景**:一句话 + 指回 `.scratch/<feature>/PRD.md`
- **要做的事**:实现要点(要动的文件/模块尽量点名)
- **验收标准**:checklist
- **阻塞**:`Blocked by #N` 或前置条件

打上对应 triage label(通常 `ready-for-agent`)。状态流转靠 GitHub 原生机制:PR 描述里写 `Closes #N` 自动关闭,不再手工维护 Status 行。

## When a skill says "publish to the issue tracker"

用 `gh issue create` 建 GitHub Issue,按上面的 shape 写正文,打对应 triage label。

## Dependencies between issues

不用 parent/child 层级。在正文里写 `Blocked by #N`;被阻塞的 issue 在前置合并前不动。

## 给 agent 的操作提示

- 列表:`gh issue list --label ready-for-agent`
- 冷启动读单个:`gh issue view <N>`
- 需要网络与 `gh` 已认证;离线环境下只读 PRD,不猜 issue 状态。
