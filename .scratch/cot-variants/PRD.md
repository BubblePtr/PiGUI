---
Status: done
---

# 思维链(Chain of Thought)形态探索 — 决策记录

2026-08-09,从 `/proto` 原型跑了 4 个变体(基于真实数据形态:Pi 一条 assistant 消息 =
`thinking | tool_call | text` 的有序 part 序列,think→tool→think 多轮循环是一等公民,
见 `packages/core/src/agent-runtime-event.ts:21`),对比后决策如下。

## 决策

- **Baseline(现状,折叠一行 + 左边线步骤列表)保持默认**。ChatChainOfThought 不动。
- **Rail(时间轨)保留为正式组件** `shared/ui/chat/chat-chain-of-thought-rail.tsx`:
  轮次分界 + 节点轨道,思考/工具是不同形态节点,每步时长右对齐(tabular-nums)。
  暂不在 agent-workspace 接线;等 Appearance 设置页落地后作为用户可选项
  (见 issues/01)。
- **Ledger(台账,等宽五列网格)不进聊天流**,但形态验证成功,定为 **Trace 页重构方向**
  (见 issues/02)。原型实现要点:等宽字体、`kind/name/subject/duration` 网格列、
  轮次分隔线、行内展开 payload、状态字形(✓/✕/●)。
- **Narrative(叙事流,工具压成行内 chip)淘汰**:设计不成立——工具信息弱化过头,
  chip 超过一排后挤压严重,气质上也没有带来足够收益。

## 关键实现记号(从原型带出)

- 节点圆点必须按节点类型分别对齐首行中心(思考标签行中心 ≈12px,32px 工具行中心
  ≈16px),统一 top 值必然错位。
- 说明性 `<p>` 在深色浮层里要显式设 color,应用全局段落色(近黑)会压过继承。
- 工具行 target 提取与时长格式化直接复用 `chat-tool.tsx` 的
  `toolTargetFromArgs` / `formatToolDuration`。

## 原型位置(已拆除)

原型面 `apps/desktop/src/proto/chain-of-thought/` 与 `main.tsx` 中带
`proto:chain-of-thought` 栅栏注释的 dev-only 挂载已在决策后删除。
