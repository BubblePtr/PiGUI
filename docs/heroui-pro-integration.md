# HeroUI Pro v3 集成说明

当前项目以源码方式集成私有仓库 `Agile-Avocation/herouipro-v3`，路径是
`vendor/herouipro-v3`。vendor 当前提交是 `26121c0`，README 标注组件库版本为
`1.0.0-beta.6`。

## 为什么不用包登录

组件库的 `package.json` 使用 restricted publish，包名是 `@ag-ui/pro`，但 README 的消费示例使用
`@heroui-pro/react`。为了避免依赖私有 npm registry 登录，Pig 现在通过 Git submodule 拉取源码，再用
Vite/TypeScript alias 把 `@heroui-pro/react` 指向本地源码入口。

这仍然需要 GitHub 对私有仓库有权限；首次拉取或 CI checkout 时需要能访问
`https://github.com/Agile-Avocation/herouipro-v3.git`。

## 当前接入点

- `.gitmodules`：注册 `vendor/herouipro-v3` submodule。
- `package.json`：安装 HeroUI Pro 的 peer dependencies，包括 React 19、HeroUI v3、Tailwind CSS v4、
  Motion、Recharts、React Aria Components、Tiptap 等。
- `vite.config.ts`：把 `@heroui-pro/react` alias 到
  `vendor/herouipro-v3/src/components/index.ts`，把 `@heroui-pro/react/css` alias 到组件 CSS 入口。
- `tsconfig.json`：配置同名 `paths`，并把 `vendor/herouipro-v3/src` 加入类型检查范围。
- `src/styles.css`：导入 Tailwind、`@heroui/styles`、当前需要的 HeroUI Pro 组件 CSS，以及 glass 主题。
- `index.html`：根节点设置 `data-theme="glass-light"`。

## 使用组件

业务代码里直接从 alias 导入组件：

```tsx
import { AppLayout, KPI, Sidebar } from "@heroui-pro/react";
```

如果新增组件，除了导入 React 组件，还要在 `src/styles.css` 里补对应 CSS：

```css
@import "../vendor/herouipro-v3/src/css/components/data-grid/index.css";
```

当前没有一次性导入全部组件 CSS，是为了给后续界面重构保留按需控制。

## 使用 glass 主题

HeroUI Pro v3 内置三组主题：`brutalism`、`glass`、`mouve`。Pig 当前只导入 glass：

```css
@import "../vendor/herouipro-v3/src/css/themes/glass/index.css";
```

浅色 glass：

```html
<html data-theme="glass-light">
```

深色 glass：

```html
<html data-theme="glass-dark">
```

Pig 自己的颜色 token 已映射到 HeroUI token，例如 `--pig-color-surface: var(--surface)`。后续重构时优先使用
HeroUI token 或现有 Pig token，不要再手写一套独立颜色体系。

## 本地验证

常规验证：

```bash
bun run test
bun run build
```

UI/CSS 验证：

```bash
bun run dev
npx --yes playwright screenshot --viewport-size=1440,1000 http://127.0.0.1:1420/ /tmp/pig-glass-theme.png
npx --yes playwright screenshot --viewport-size=390,844 http://127.0.0.1:1420/ /tmp/pig-glass-theme-mobile.png
```

普通浏览器访问 Vite dev server 时没有 Tauri WebView 的 `window.__TAURI_INTERNALS__`。项目现在通过
`src/tauri-runtime.ts` 做最小降级：真实 Tauri 运行时继续走官方 API，浏览器开发态只提供空的 sessions/config
数据，方便做主题和布局验收。
