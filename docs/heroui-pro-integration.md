# HeroUI Pro 集成说明

Pig 通过 HeroUI Pro CLI 登录和安装 React 组件包，不再把 HeroUI Pro 源码作为
`vendor/` 子模块提交到仓库。运行时代码只依赖 `@heroui-pro/react` 包，组件文档和最新
API 以 HeroUI Pro Dashboard、Docs 和 MCP 为准。

## 本地安装

首次配置本机时先登录 HeroUI Pro：

```bash
bunx heroui-pro@latest login
```

Pig 使用 Bun 作为包管理器。安装 React 产品包时必须显式传入 `react`，不要运行无参
`install`，以免交互默认选择其他产品：

```bash
bunx heroui-pro@latest install react --yes
```

安装后确认状态：

```bash
bunx heroui-pro@latest status
bun pm untrusted
```

`package.json` 应包含 `@heroui-pro/react` 和 Bun 的 `trustedDependencies`：

```json
{
  "dependencies": {
    "@heroui-pro/react": "^1.0.0-beta.6"
  },
  "trustedDependencies": ["heroui-pro", "@heroui-pro/react"]
}
```

## 样式入口

全局 CSS 必须保持这个顺序：

```css
@import "tailwindcss";
@import "@heroui/styles";
@import "@heroui-pro/react/css";

@source "../node_modules/@heroui-pro/react/dist/components/**/*.{js,ts,tsx}";
@source "./**/*.{ts,tsx}";
```

Pig 的样式层继续把项目 token 映射到 HeroUI token，例如：

```css
--pig-color-background: var(--background);
--pig-color-surface: var(--surface);
--pig-color-border: var(--border);
```

`index.html` 仍在根节点设置 `data-theme="glass-light"`。如果后续切换主题，优先通过
HeroUI Pro 官方 CSS 入口和根节点 `data-theme` 完成，不要重新引入 vendor 路径。

## 使用组件

业务代码直接从包的公开 subpath 导入 Pro 组件，避免 TypeScript 为单个页面解析整套 Pro
组件类型：

```tsx
import { AppLayout } from "@heroui-pro/react/app-layout";
import { KPI } from "@heroui-pro/react/kpi";
import { Sidebar } from "@heroui-pro/react/sidebar";
```

不要再从旧的源码 vendor 路径、历史包名或包内未公开源码路径导入组件。

## CI

当前仓库没有 `.github` workflow。后续新增 CI 或托管平台构建时，需要在对应环境配置
HeroUI Pro Dashboard 生成的 CI/CD token：

```bash
HEROUI_AUTH_TOKEN=...
```

该 token 只用于可信 CI/CD 环境，不应提交到仓库。

## 验证

常规验证：

```bash
bun run test
bun run build
git diff --check
```

UI/CSS 验证：

```bash
bun run dev
npx --yes playwright screenshot --viewport-size=1440,1000 http://127.0.0.1:1420/ /tmp/pig-heroui-pro.png
```
