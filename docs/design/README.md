# PiGUI 设计系统

> 给"昨天刚入职、以后也没法提问"的工程师看的。每一条没写的决定都会被猜测替代，而猜测和决定长得一模一样。
> 本目录回答"什么时候用哪个、哪个变体、什么不存在"；[`../self-built-ui.md`](../self-built-ui.md) 回答"为什么自建、去哪儿了"；`/design` 页（dev 构建）是活的变体注册表。三者不互相复制。

## 系统性格

PiGUI 是 Astryx（Meta 开源，`@astryxdesign/core` 0.3.x，155 个组件）之上的一层薄壳。Astryx 提供全部一级 token 与通用组件，`apps/desktop/src/app/styles.css` 把它们拼成 15 个语义桥 token 并暴露给 Tailwind 类名，`apps/desktop/src/shared/ui/` 只在 Astryx 没有对应物的地方自建（聊天流、思维链、轨迹台账、图表、终端、浏览器宿主）。主题是 `theme-neutral` + Montserrat 字体，明暗跟随操作系统，**没有应用内主题开关**。整个系统只有一种视觉密度：14px 正文、4px 间距基数、8px 元素圆角。

## 六条硬规则

1. **先找再写。** 写任何 UI 之前 `bunx astryx build "<idea>"`，再 `bunx astryx component <Name>` 看 props。Astryx 没有、`shared/ui/` 也没有，才自建；自建件必须进 `shared/ui/`、同 PR 登记 `/design` 页并在 `self-built-ui.md` 加一行。
2. **只写 token，不写字面量。** 颜色用语义桥（`var(--foreground)` / `text-foreground`）或 Astryx 一级 token（`var(--color-text-secondary)`）；间距、圆角、字号、时长同理。禁止 hex、`px`、`rem`、`ms` 字面量，禁止 Tailwind 调色板类（`text-gray-500`）。规则细节见 [tokens.md](tokens.md)。
3. **Button 默认 `secondary`，一屏一个 `primary`。** IconButton 默认 `ghost` + `sm`。两个 primary 等于没有层级。见 [astryx.md](astryx.md)。
4. **状态用 Token，不用 Badge / StatusDot。** 这两个 Astryx 组件在仓库里零调用，不要成为第一个；图形分类色只用 `--pigui-data-*`，文字状态色只用 `--success/--warning/--danger`，两族不互借。
5. **每个动画都要有 `prefers-reduced-motion` 分支**，静止态不写 `transform` / `will-change`。见 [typography-motion.md](typography-motion.md)。
6. **图标只从 `shared/ui/icons.tsx` 导入。** 它把 Hugeicons 钉在 `strokeWidth 1.5`；页面里直接 `import ... from "@hugeicons/..."` 或 lucide 都是错的。

## 我需要一个 UI 件，从哪拿

```
Astryx 有对应组件吗？(bunx astryx search "<thing>")
 ├── 有 → 直接用，按 astryx.md 的选定变体
 └── 没有
      ├── shared/ui/ 已有？(看 /design 页或本目录的组件索引)
      │    └── 有 → 用它，按其联合类型传值；不存在的变体是 bug 不是选项
      └── 都没有
           ├── 只在一个页面用 → 留在 pages/ 做页面组合，不建原语
           └── 两个以上页面用 → 建到 shared/ui/ + /design 登记 + self-built-ui.md
```

## 文件索引

| 文件 | 回答的问题 |
| --- | --- |
| [tokens.md](tokens.md) | 允许哪一层 token；背景/文字/状态/数据色各选哪个；已知债务不许再添 |
| [typography-motion.md](typography-motion.md) | 字号下限、对话标题阶梯、数字对齐；时长与缓动、减动效、列表进出场 |
| [astryx.md](astryx.md) | 我们实际采用的 Astryx 组件与选定变体；哪些 Astryx 组件不用 |
| [chat.md](chat.md) | 对话流、Composer、思维链三类自建组件：何时用哪个、联合类型、正反例 |
| [workspace.md](workspace.md) | Session Dock、Surface、轨迹台账、图表、图标与视觉原语 |

## 验证方式

没有 linter。token 纪律由 vitest 里的源码字符串断言守着（`bun run test`），加上人的眼睛。改了 token 桥、字体、图标粗细、数据色，先看 `apps/desktop/src/app/design-system.test.ts` 和 `apps/desktop/src/shared/ui/pi-trajectory-ledger.test.tsx` 会不会红。
