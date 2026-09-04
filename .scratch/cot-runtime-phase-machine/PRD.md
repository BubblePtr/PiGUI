# CoT runtime 阶段机与 step 列表

状态：设计已定案（ADR-0030 已接受），实施拆成三个 GitHub Issue。

## 问题

Live Chat 的 Chain of Thought 在 run 期间由 `isStreaming` 布尔加 React `key` 重挂驱动，跑出 5 个隐式状态：没有「回答中」阶段；计时有两套口径且收束时会跳；头部文案和视口内容脱节；非最后 Turn 的 text（Interim Output）以独立气泡出现；已完成的过程要等 run 结束才能展开看；一行视口的中文分句失效、翻页节奏忽快忽慢。

## 方案

见 `docs/adr/0030-cot-runtime-phase-machine.md`。要点：

- 阶段机 `hidden | thinking | acting | answering | settled` 由 projection 层统一推导，组件只消费。
- CoT 是一列同形 step：Thought Ns、Interim 正文、工具动词总结行；run 期间平铺，settled 才折进「Worked for Ns」。
- 底部状态行：像素格 loader + shimmer 状态词 + 走表，永远最后一行。
- 一行视口与分句翻页退役；翻页只用于工具名切换和 live → settled 的 label 变化，最小停留兜底。
- 计时单一锚点：run 首条 Assistant Message 开始 → 最后一条 Message 首个 text part 开始，含工具执行。
- Interim Output：live 先按回答推定，同 Message 出现 tool_call 即重分类进列表。
- 术语：`CONTEXT.md` 的 Assistant Message / Message Part / Thinking / Tool Call / Tool Execution / Interim Output / Final Answer / Chain of Thought。

动效数值（原型定案）：flip 300ms、dwell 700ms、pixel 860ms、run 期间平铺。

## 原型

`apps/desktop/src/proto/cot-live/`，路由 `/proto/cot-live`（dev-only）。54 秒、6 Turn、7 种工具、含报错与长输出的 mock run，可回放、可拖进度。浏览器预览不需要 Electron：

```bash
cd apps/desktop && bunx vite --config vite.proto.config.ts
```

然后打开 `http://127.0.0.1:1420/proto/cot-live`。原型在 S3 落地后删除。

## 切片

1. [#163](https://github.com/BubblePtr/PiGUI/issues/163) 阶段推导层：`MessagePart.startedAt`、`deriveCotView`、fixture 测试。
2. [#164](https://github.com/BubblePtr/PiGUI/issues/164) 组件层：`ChatThoughtStep` / `ChatToolStep` / `ChatStatusLine` / 行内翻页容器 / `ChatPixelLoader`，`/design` 注册。Blocked by #163。
3. [#165](https://github.com/BubblePtr/PiGUI/issues/165) 接线与清理：`AssistantRunTrace` 换新推导、退役一行视口与旧计时、删除原型。Blocked by #164。

## 已知坑（原型里踩过）

- Astryx 助手消息体是 fit-content 列布局，CoT 需要 `align-self: stretch` 才能占满列宽。
- nowrap 的 label 会把 min-content 传上去撑破列宽，需要 `contain: inline-size`。
- `.chain-of-thought__live` 块级且带 8px 上外边距，塞进按钮会让文字低于箭头中线 4px；行内翻页容器要单独做。
- `src/proto/` 不在 Tailwind 扫描范围，原型里的任意值 class 不生效；生产代码不受影响。
- 组件内不要重新声明动效 CSS 变量，会盖掉上层的值。

## 讨论记录

- 一行视口 + 分句翻页：中途做过，因中文分句、节奏打断、省略长句和 thinking 内容常为摘要而否决。
- loader 位置：头部、行末、行首都试过，最终单独一行状态行。
- 头部在 answering 就折叠：会在 answering → acting 回退时闪现，改为 settled 才折。
- 单工具也走总结行：一个工具就是只有一个元素的一批。
