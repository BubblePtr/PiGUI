# Issue 9: chat-prompt-input → Astryx ChatComposer(聊天栈收官)

Status: done(2026-08-09)
Source PRD: .scratch/astryx-migration/PRD.md(Slice 2 修订,迁移收口后的增量换件)

## 背景

`ChatPromptInput` 是最后一个有 Astryx 对应物的自建件。Astryx `ChatComposer` 的槽位模型(input/footerActions/sendActions/sendButton/status)+ `ChatSendButton`(context 驱动 send/stop 切换,透传 aria-label)覆盖现有能力。关键约束:`ChatComposerInput` 是 contentEditable,会摧毁现有测试面(getByPlaceholderText/fireEvent.change/toHaveValue)与原生 textarea 行为——官方 `input` 槽支持经 `useChatComposerContext` 接自建输入,**textarea 保留原生**。

## 方案

1. **`ChatPromptInput` API 从 compound slots 收敛为单组件 props**:`value/status/placeholder/allowSubmitWhileRunning/lockInputOnRun/startActions/endActions/footer/error/sendAriaLabel/stopAriaLabel/onSubmit/onStop/onValueChange`。根 div 保留 `data-slot="prompt-input"` + `data-status`。
2. **壳与按钮**:Astryx `ChatComposer`(`elevation="none"` 贴近现有描边面板观感)+ 定制 `sendButton`(`ChatSendButton`,aria-label 透传,disabled 由本地 canSubmit 驱动);错误走 `status={type:'error'}`;中性脚注("AI can make mistakes")保留自建 footer slot(Astryx status 只有 error/warning 语义)。
3. **输入**:自建 `PromptTextArea`(原生 textarea)挂 `input` 槽,经 `useChatComposerContext` 读 value/onChange/onSubmit 并注册 `inputControlRef.focus`;保留 autosize、Enter 提交/Shift+Enter 换行、`lockInputOnRun` 时禁用(不用 composer 级 isDisabled——那会连 stop 一起禁掉)。
4. **调用点**:FullChatComposer(queue/steer/stop/模型控件/错误)与 draft 空态 composer 改新 API;模型控件→`footerActions`,Steer→`sendActions`。
5. **ChatLayout 不上**(修订先前计划):slice 07 已交付滚动栈,ChatLayout 此时仅净增 frosted dock 视觉,却强制 read-only 会话提供 composer 槽并需重排队列横幅——收益/风险不成比例,记为可选后续。
6. chat.css 清退 `.prompt-input__shell/content/textarea/toolbar/send` 中被接管的样式,保留 textarea 与 footer 所需。

## 验收

- 测试先红后绿;全量绿。placeholder/change/toHaveValue 测试面因原生 textarea 全数保留。
- 发送/停止切换、排队模式并行提交、Steer、模型控件、错误提示行为不变。
- Design 页状态矩阵更新 + Electron 截图。
