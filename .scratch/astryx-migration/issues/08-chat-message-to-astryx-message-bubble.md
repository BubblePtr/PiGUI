# Issue 8: chat-message → Astryx ChatMessage / ChatMessageBubble

Status: done(2026-08-09)
Source PRD: .scratch/astryx-migration/PRD.md(Slice 2 修订,迁移收口后的增量换件)

## 背景

`ChatMessage.User/Assistant` 的对齐布局与 `Bubble` 的气泡视觉是自建的(chat.css)。Astryx `ChatMessage`(sender 驱动对齐/密度,自动接 ChatMessageList 的 density 上下文)与 `ChatMessageBubble`(sender 取色、filled/ghost、多气泡 group)可直接接管;二者都透传任意 `data-*`,现有 `data-slot` 契约可以原位保留,不需要包壳。

## 方案

1. **`ChatMessage.User` / `ChatMessage.Assistant`** → Astryx `ChatMessage sender="user|assistant"`,`data-slot` 原样落在 Astryx 根上;className 透传。
2. **`ChatMessage.Bubble`** → Astryx `ChatMessageBubble`(默认 filled,sender 从上下文取色),`data-slot` 保留。
3. **保留自建**:`Body`/`Content`(纯布局列,Astryx 无对应;assistant 走官方"raw children"形态)与 hover 操作区 `ChatMessageActions` 全家(Astryx 无 message actions 组件)。
4. **chat.css**:删除被接管的 `.chat-message`/`--user`/`--assistant` 对齐与 `.chat-message__bubble` 视觉;保留 body/content/actions 样式与 `:has(> .chat-markdown)` 的 white-space 归位。
5. 调用点(agent-workspace LiveChatMessage、design 页)结构不动,必要处只调布局类。

## 非目标

- ChatComposer / ChatLayout(issue 09)。
- 头像、多气泡 group、ChatMessageMetadata(暂无产品需求)。

## 验收

- 测试先红后绿;全量绿。
- 用户消息右对齐 filled 气泡、assistant 左对齐 raw 内容,由 Astryx sender 布局驱动;`data-slot` 契约与 hover 操作行为不变。
- Design 页 + Electron 截图验证。
