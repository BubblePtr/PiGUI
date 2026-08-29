# 0027. Live Chat 思维链：流式视口 + 收束分层展开

日期:2026-08-29
状态:已接受

## 背景

生产 Compact CoT 在流式时 `defaultExpanded` 整段铺开思考和工具，思考正文是 `pre-wrap` 原样 `**`，收束后左边有竖线，ActionBar 要 hover 才出现。`/proto/cot-stream` 上对比了 Baseline / Window / Flip。

## 决策

从原型落地到 Compact CoT（Window / Flip 的共识，不是 Baseline）：

1. **流式**：不可展开。头上是像素格 loader + shimmer「Thinking…」+ 等宽计时；正文只显示当前最后一条（一句思考或一行工具）。
2. **收束**：默认折叠为「Thought for Ns」。展开后按回合时间线穿插思考和 `ChatToolGroup`，去掉左竖线。
3. **思考正文**：轻量行内 markdown（`**` / `*` / `` ` ``），流式未闭合的 `**` 不露出来；颜色用 `--color-text-secondary`。
4. **ActionBar**：助手回合收束后常显（`--persist`），不再只靠 hover。
5. **Rail / Timeline** 仍是独立皮肤，本决策不改。

## 否决

- **Baseline（现状）**：流式全展开、生 `**`、hover ActionBar。对照用，不进产品。
- **把思考和工具拆成两类层**：顺序是假的；真实回合是穿插的。
- **自绘「N tool calls」文案按钮**：工具行必须继续用生产 `ChatToolGroup`。
- **Surfer / Dots / Orbit loader**：只落地 Drive 像素格。
- **`--color-text-disabled` 做思考色**：语义是禁用态，对比度不够当正文。

## 后果

- `ChatChainOfThought` 流式不再走 Collapsible。
- `ChatThoughtMarkdown` 进 `shared/ui/chat/`，并在 `/design` 注册。
- `/proto/cot-stream` 探索面删除。
