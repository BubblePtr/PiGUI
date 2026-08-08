# Issue 7: chat-conversation → Astryx ChatMessageList + 流式滚动 hooks

Status: done(2026-08-09)
Source PRD: .scratch/astryx-migration/PRD.md(Slice 2 修订,迁移收口后的增量换件)

## 背景

`ChatConversation` 的粘底滚动是自建的(MutationObserver + 32px 阈值),一直是自维护的易碎点。Astryx 提供 standalone 可用的 `useChatStreamScroll`(rAF 弹簧跟随、滚动方向感知解锁、scrollend 落底重锁、reduced-motion 降级)与 `useChatNewMessages`(ResizeObserver 内容增长跟随 + 未读新消息提示),以及 `ChatMessageList`(role="log" + aria-live="polite" + aria-busy 流式语义)和 `ChatLayoutScrollButton`。

完整 `ChatLayout`(frosted dock + composer 停靠)留到 issue 09 换 ChatComposer 时一起上,本片不动页面结构。

## 方案

1. **`ChatConversation` 重构**(组件名与调用点不变):根 div 保留 `data-slot="chat-conversation"`、`data-pinned`(由 `scroll.isLocked` 驱动)与外部 className;内部拆出滚动 viewport(`data-slot="chat-conversation-viewport"`),消息容器换 `ChatMessageList`(`aria-label` 透传,role/log/aria-live 由 Astryx 接管;新增 `isStreaming` prop 映射 aria-busy)。
2. **滚动**:`useChatStreamScroll({scrollRef: viewport})` + `useChatNewMessages({isLocked, onResize: scrollIfLocked})`(contentRef 挂到 ChatMessageList);删除自建 `useStickToBottom` 与 `ScrollAnchor`(调用点同步移除)。
3. **回底按钮**:`ChatLayoutScrollButton`,`isVisible = isScrolledUp || hasNewMessages`,包在 `data-slot="chat-conversation-scroll-button"` 定位层里,绝对定位于 viewport 底部居中。
4. **`Content` 子组件保留**(纯宽度约束容器,列表内层间距交给 ChatMessageList 的 density/gap)。
5. chat.css:滚动容器样式移到 viewport;新增按钮定位层样式;anchor 样式删除。

## 非目标

- ChatLayout / ChatComposer(issue 09)。
- chat-message → Astryx ChatMessage/Bubble(issue 08)。

## 验收

- 测试先红后绿;全量绿。
- 流式输出时视口粘底跟随;向上滚动立即解锁;解锁时出现"回到底部"按钮,点按回底重锁。
- role="log"/aria-live 由 Astryx 列表提供,`aria-label` 契约不变。
- Electron 截图/交互验证。
