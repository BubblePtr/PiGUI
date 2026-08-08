# Issue 3: ChatTool 内部替换为 Astryx ChatToolCalls

Status: done(PR #72,2026-08-08)
Source PRD: .scratch/astryx-migration/PRD.md(Slice 2 修订)

## 背景

Slice 2 原决策"聊天栈自建"已修订:Astryx 0.3.0 的 `ChatToolCalls` 覆盖并超出自建 `chat-tool.tsx` 的能力(状态四态、耗时、diff 增删行、node 徽章、单调用内联 / 多调用折叠分组)。本切片为聊天栈迁移的首个试水件。

## 方案

`ChatTool` 保留为 `shared/ui/chat/chat-tool.tsx` 的薄适配层,内部渲染 Astryx `ChatToolCalls`(单元素 `calls` 数组):

- **保留契约**:包装 div 上的 `data-slot="chat-tool"`、`data-state`(仍为 ToolPartState 原值)、`data-tool-call-id`;args/output 作为 `resultDetail` 内两个 `pre`,保留 `data-slot="chat-tool-args"` / `"chat-tool-result"`;行详情收起时不挂载(Astryx 原生行为,与旧版一致)。
- **状态映射**:`input-streaming`/`input-available` → `running`,`output-available` → `complete`,`output-error` → `error`(output 同时作为 `errorMessage` 供 a11y/tooltip)。
- **删除 props**:`triggerPrefix`(Astryx 以等宽字体展示工具名,不支持前缀)、`defaultExpanded`(Astryx 行详情固定默认收起,无行级 default-open API)。
- **消费方**:`agent-workspace.tsx`(去掉 triggerPrefix,断言 "Used tool: read" → "read")、`design-components.tsx` 画廊(去掉 defaultExpanded,同 PR 更新 Design 页条目)。

## 验收

- chat-tool.test.tsx 按新契约重写,先红后绿(TDD)。
- agent-workspace / design-components 行为测试全绿。
- Design 页 ChatTool 区块展示四态(经 Astryx 渲染)。
- 旧 `chat.css` 中 `.chat-tool__*` 样式清理。
