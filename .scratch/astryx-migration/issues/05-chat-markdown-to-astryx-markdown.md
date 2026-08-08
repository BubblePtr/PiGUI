# Issue 5: chat-markdown → Astryx Markdown(流式增量解析)

Status: ready-for-agent
Source PRD: .scratch/astryx-migration/PRD.md(Slice 2 修订)

## 背景

`shared/ui/chat/chat-markdown.tsx` 目前用 react-markdown + remark-gfm 自建,fenced code 通过 shiki 的 ChatCodeBlock 渲染,流式版自绘 caret。Astryx `Markdown` 已覆盖全部能力:GFM(表格/任务列表)、内建样式一致的 codeblock、`isStreaming` 流式增量解析 + fade-in 动画(官方 ai-chat 模板在 ChatMessageBubble 内用 `density="compact"`)。

## 方案

1. **ChatMarkdown / ChatStreamMarkdown 保留为 wrapper**(组件名、`data-slot`、`data-testid`、`data-is-streaming` 契约不变),内部渲染换成 `@astryxdesign/core/Markdown`,`density="compact"`。
2. **流式**:`isStreaming` 直通 Astryx(增量解析 + fade-in)。移除自绘 caret 与 `caret` prop——Astryx 的流式动画取代 caret 作为进行中示意,双重示意反而噪。
3. **fenced code**:交给 Astryx 内建 codeblock,不再挂 ChatCodeBlock 覆盖。ChatCodeBlock 本体与 session-detail 的迁移(及 shiki 移除)留到下一切片。
4. **依赖清退**:react-markdown、remark-gfm 无其他消费方,本切片移除。
5. **chat.css**:裁剪被 Astryx 接管的 `.chat-markdown` 排版规则(间距/标题字号等),只保留仍需要的集成样式;必要的密度/间距覆盖写在 `[data-astryx-theme]` 作用域。
6. **Design 页**:更新 ChatMarkdown 条目(caret prop 移除,新增流式态展示)。

## 非目标

- ChatCodeBlock 本体、session-detail.tsx 的 CodeBlock 替换与 shiki 依赖移除(下一切片)。
- 引用/citation、inlinePlugins 等 Astryx 增强能力(有需求另开)。

## 验收

- 测试先红后绿;全量测试绿。
- Live 会话流式输出为增量渲染 + fade-in,无 caret;GFM 表格、代码块样式与 Astryx 一致。
- react-markdown/remark-gfm 从依赖中消失。
- Design 页条目更新 + Electron 截图验证。
