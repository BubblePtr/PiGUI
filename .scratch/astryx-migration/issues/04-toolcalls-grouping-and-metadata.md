# Issue 4: 工具调用分组 + target/耗时元数据 + isError 映射修复

Status: ready-for-agent
Source PRD: .scratch/astryx-migration/PRD.md(Slice 2 修订)

## 背景

Issue 03 完成了 ChatTool → Astryx ChatToolCalls 的单调用适配。官方设计里多调用会折叠成 "N tool calls" 摘要,行上还展示 target(文件/命令)、耗时、diff 统计——这些能力我们的事件流里数据都有,只是没接。

同时发现存量 bug:`runTimelineFromRuntimeModel` 把 `phase === "done"` 一律映射为 `output-available`,`SessionRuntimeTool.isError` 从未映射为 `output-error`,live 会话里失败的工具也显示绿勾。

## 方案

1. **`ChatToolGroup`**(`shared/ui/chat/chat-tool.tsx`):接收 `tools: ChatToolItem[]`,渲染单个多调用 `ChatToolCalls`;≥2 条自动出组摘要。`ChatTool` 保留为单元素语法糖。
2. **纯函数**:`toolTargetFromArgs(argsText)` 从 JSON 参数提取常见键(path/file_path/command/query/url/pattern…);`formatToolDuration(ms)` → "45ms" / "3.2s"。
3. **时间线数据**:`SessionRuntimeTool` 增加 `startedAt`(首次 running 的事件时间戳);`RunTimelineItem` 增加 `durationMs`。projection 路径由 tool-call/tool-result 时间戳差值计算;runtime-model 路径由 startedAt/updatedAt 差值计算。`isError` → `output-error`。
4. **渲染**:`AssistantRunTrace` 把连续 `kind === "tool"` 的时间线项聚合为一个 ChainOfThought 步骤,内容为 `ChatToolGroup`;`ChainOfThought.Step` 的 label 变为可选(组内行自带工具名,步骤标签冗余)。
5. **Design 页**:注册 ChatToolGroup 条目(单条/多条/带 target・耗时/错误)。

## 非目标

- diff 增删行统计(`additions/deletions`):Pi 各工具结果格式未标准化,等 edit 类结果有稳定结构后另开切片。
- Live Chat 消息流内的工具渲染结构调整(仍在 ChainOfThought 内,不改成消息体平铺)。

## 验收

- 新增/修改测试先红后绿;全量测试绿。
- Live 会话中连续多个工具显示为一个 "N tool calls" 组,单个工具行内展示 target 与耗时;失败工具显示红叉。
- Design 页新条目 + 截图验证。
