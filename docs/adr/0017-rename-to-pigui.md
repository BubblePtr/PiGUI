# 产品更名 Pig → PiGUI，包作用域 @pig → @pigui

产品品牌从 **Pig** 更名为 **PiGUI**，workspace 包作用域从 `@pig/*` 改为 `@pigui/*`，GitHub 仓库 `BubblePtr/Pig` 改名为 `BubblePtr/PiGUI`。

## 动因

社区已有开发者发布了 `pi-gui`。虽然我们的包 `@pig/*` 全是 `private`、未发布到 npm，与 `pi-gui` **无技术冲突**（不同名、不同 scope、未发布），但为品牌一致性、并为将来可能发布留出清晰空间，统一收敛到 **PiGUI / `@pigui`**。

## 改了什么

- **包作用域**：`@pig/*` → `@pigui/*`（`@pigui/{core,backend,desktop,web,server}`）——所有 package.json name + workspace 依赖 + 全部 import + tsconfig/vite/electron-vite 三处 alias。根包名 `pig` → `pigui`。
- **品牌字串**：README / AGENTS / CONTEXT / CLAUDE 标题与正文中的产品名 "Pig" → "PiGUI"；app 窗口标题、`<title>`、Electron 进程错误信息；以及渲染层少量面向用户的品牌标签（"PiGUI-managed worktree" 等）。
- **仓库**：`gh repo rename PiGUI`（GitHub 自动重定向旧 URL；本地 remote 同步更新）。

## 刻意保留

- **历史 ADR（0001–0016）与 `.scratch/` 已完成的 PRD/issue** 中的 "Pig" / `@pig/`：它们是**点位历史记录**，机械全替会篡改"当时的决策"。本 ADR 即指明此后的真名。
- **"Pi"**（Pi coding agent 本身）：与我们无关，永不改。
- **样例/种子数据**里的项目名 "Pig"（如 sidebar 默认 project）与 `/Users/.../Pig` 本地路径：是数据/路径而非品牌，保留（改动会无谓波及大量测试断言）。
- 源码注释中描述性的 "Pig" 可按需顺带清理，未纳入本次。

## Consequences

- 本地克隆目录名仍是 `Pig`（仓库改名不动本地目录）；如需一致可自行 `mv` + 更新 remote（gh 改名已更新 remote URL）。
- 验证：tsc clean、157 tests、electron-vite build 全绿。
