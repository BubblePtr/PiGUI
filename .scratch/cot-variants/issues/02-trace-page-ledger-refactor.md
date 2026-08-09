---
Status: needs-triage
---

# Trace 页重构:采用台账(Ledger)形态

## 背景

思维链形态探索(见 ../PRD.md)中,Ledger 变体(等宽字体、kind/name/subject/duration
对齐网格、轮次分隔、行内展开 payload、✓/✕/● 状态字形)被验证为高密度扫读 trace 的
最佳形态——12.4s 的失败 Bash 一眼跳出。它不适合聊天流,但正好命中 Trace 页
"做得不好看、信息密度低"的痛点。

## 要做的事

- 以 Ledger 形态重构 Trace 页的会话事件列表(`pages/trace.tsx` / session-detail)。
- 从原型提炼网格列:状态字形 / kind / 名称 / 对象(target 截断) / 右对齐 tabular-nums
  时长;轮次(或消息)分隔线;行内展开 args/output。
- 组件落 `shared/ui/`(命名待定,如 `pi-trace-ledger`),同 PR 注册 /design 页。
- 原型参考实现见 ../PRD.md 的"关键实现记号"(原型代码已拆除,形态见决策记录)。
