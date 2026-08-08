# PRD: Design Gallery（开发环境组件陈列馆）

Status: ready-for-agent
Feature: design-system-gallery
Created: 2026-08-08

> 定位：一个**只存在于开发构建**的 `/design` 页面，陈列 PiGUI 的设计系统三层真相——Astryx 一级 token、选定的 Astryx 原语变体约定、以及 `shared/ui` 下所有 PiGUI 自封装可复用组件及其全部变体与状态。它是内部 Storybook 的轻量替代：组件跑在真实的 `Theme(neutralTheme)`、真实的 token 桥接（`styles.css`）和真实的应用布局里，不存在"gallery 里对、产品里错"的偏差。

---

## Problem Statement

PiGUI 已完成 Astryx 迁移（slice 1-3），`shared/ui` 下积累了 `pi-kpi`、`pi-bar-chart`、`pi-sheet`、`dot-matrix`、chat 栈、icons 等自封装组件，但它们的变体、状态和使用约定只存在于各自的调用点和维护者的脑子里。新增页面时无法回答："已经有哪些可复用组件？某组件有哪些变体？我们约定只用 Astryx 某组件的哪几种 size/variant？"——结果是重复造轮子和视觉漂移。

## Solution

侧边栏 System 区新增 **Design** 入口（仅开发构建），指向 `/design` 页面，自底向上分三层陈列：

1. **Tokens 层**：语义色板（`foreground/background/surface/muted/primary/danger/success/warning/separator` 等，直接从 CSS 变量实时读取渲染）、数据可视化色板（`--pigui-data-*`）、间距刻度、圆角、字号阶梯。token 改动后页面自动跟随，永不过期。
2. **Astryx 原语层**：我们实际采用的 Astryx 组件及**选定变体约定**（如 `IconButton` 的 size/variant 组合、`SideNavItem`、`MoreMenu`），起"只用这些变体"的规范作用。
3. **PiGUI 组件层**：`shared/ui` 全部可复用组件，每个组件一节，展示全部变体 + 典型状态（loading / empty / error），数据依赖用 fixture 喂假数据（复用 `browser-development-data` 模式）。

### 环境门控机制

- 路由在 `main.tsx` 用 `import.meta.env.DEV` 条件注册；生产构建时 Vite 将其折叠为 `false`，整个页面被 tree-shake，不进 prod bundle。
- 侧边栏入口同样以 `DEV` 条件加入 `systemNavigationItems`。
- `/design` 加入 preflight 豁免路径（`isPreflightExemptPath`），未完成首跑检查也能访问。

### 硬性纪律（同步写入 AGENTS.md）

任何新的可复用组件合入 `apps/desktop/src/shared/ui/` 时，**必须**同时在 Design 页登记其全部变体展示；修改既有组件的变体/状态时同步更新登记。否则陈列馆会腐烂成不可信的摆设。

## Non-Goals

- 不引入 Storybook / Ladle 等外部工具。
- 不做交互式 props playground（v1 只做静态陈列 + 少量可交互实例）。
- 不陈列页面级组件（`pages/` 下的东西不属于可复用层）。

## Slices

- **S1 — 骨架 + Tokens 层**：dev-only 路由、侧边栏入口、preflight 豁免、Tokens 层（色板/间距/圆角/字号）。
- **S2 — PiGUI 组件层**：`shared/ui` 现有组件全量登记（pi-kpi、pi-bar-chart、pi-sheet、dot-matrix、icons 全集、chat 栈）。
- **S3 — Astryx 原语层**：选定变体约定陈列（IconButton、SideNavItem、MoreMenu 等）。

## Acceptance（S1）

1. 开发构建下侧边栏 System 区出现 Design 入口，点击进入 `/design`，标题栏显示 "Design"。
2. `/design` 展示语义色板（每个色块标注 token 名）、数据色板、间距刻度、圆角与字号阶梯，值来自运行时 CSS 变量。
3. 生产构建产物中不含 Design 页面代码与入口（以 `import.meta.env.DEV` 折叠保证）。
4. preflight 未完成时可直接访问 `/design` 不被重定向。
