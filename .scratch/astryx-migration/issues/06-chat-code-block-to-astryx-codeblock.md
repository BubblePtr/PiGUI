# Issue 6: chat-code-block → Astryx CodeBlock(移除 shiki)

Status: done(PR #75,2026-08-08)
Source PRD: .scratch/astryx-migration/PRD.md(Slice 2 修订)

## 背景

Issue 05 后 markdown 内的代码块已走 Astryx 内建渲染,`ChatCodeBlock`(shiki)只剩两个消费方:session-detail 的日志代码块(恒为 plaintext,懒加载以避开 shiki 语言 chunk)和 Design 页条目。Astryx `CodeBlock` 自带高亮、复制按钮、语言标签,能力覆盖后 shiki 与懒加载间接层都可清退。

## 方案

1. **`ChatCodeBlock` 改为 Astryx `CodeBlock` 的薄 wrapper**(保留组件名与 `data-slot`/`data-testid` 契约):`language` 缺省映射 `"plaintext"`;`width="100%"` 适配日志/画廊场景;复制按钮用 Astryx 内建(自绘按钮与 copied 态删除)。
2. **session-detail**:shiki 没了就不需要懒加载,`LazyChatCodeBlock`/`Suspense` 换成直接引用;超长(>4000 字符)仍走 `PlainLogCodeBlock` 纯文本兜底(高亮成本与 DOM 体积仍在)。
3. **依赖清退**:移除 `shiki`;删除 `chat.css` 中 `.chat-code-block` 全部规则(表面由 Astryx 接管)。
4. **Design 页**:ChatCodeBlock 条目沿用两个变体(highlighted ts / plaintext),按新渲染核实截图。

## 非目标

- trace/usage 等其余 HeroUI 余量(Slice 3)。
- Astryx CodeBlock 的行号/折叠/高亮行等增强能力(日志场景暂无需求)。

## 验收

- 测试先红后绿;全量测试绿。
- 未知语言不报错、按纯文本渲染;复制按钮可用。
- `shiki` 从依赖消失;bundle 中无 shiki 语言 chunk。
- Design 页截图验证。
