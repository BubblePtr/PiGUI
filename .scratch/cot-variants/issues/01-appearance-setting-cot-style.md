---
Status: needs-triage
---

# Appearance 设置:思维链样式可选项(Baseline / Rail)

## 背景

思维链形态探索(见 ../PRD.md)决定同时保留两种渲染:默认 Baseline
(`ChatChainOfThought`),可选 Rail(`ChatChainOfThoughtRail`,已落
`shared/ui/chat/` 并注册 /design 页)。

## 要做的事

- 等 Settings 出现 Appearance 分区时,增加 "Chain of thought style" 选项:
  `Compact(默认,Baseline)` / `Timeline(Rail)`。
- 偏好持久化(跟随现有 settings 存储机制),agent-workspace 的
  `AssistantRunTrace` 按偏好在两个组件间切换。
- 两种样式共用同一数据(RunTimelineItem 序列),切换不改行为契约
  (data-slot 断言、折叠默认值 DF-005B 的 remount 逻辑保持)。

## 阻塞

- 依赖 Appearance 设置页立项(当前 Settings 只有 Provider 配置)。
