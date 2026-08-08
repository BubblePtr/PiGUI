# Issue 2: `--radius-none` 在 theme-neutral 下解析为 0.25rem 而非 0

Status: needs-info
Source PRD: .scratch/astryx-migration/PRD.md

## 现象

Design 页（`/design`，PR #69）的 Radius 区块从运行时 `getComputedStyle` 实时读取 token 值，显示 `--radius-none` 解析为 `0.25rem`。按命名语义，`*-none` 应为 `0`。

## 待查

1. 是 `@astryxdesign/theme-neutral@0.3.0` 的 bug，还是 Astryx 有意为之（例如 "none" 表示"最小可感知圆角"）？查上游源码 / CHANGELOG / 文档确认。
2. PiGUI 代码中是否有依赖 `--radius-none` 的地方（当前 grep 应为零，确认后记录）。

## 处置

- 若上游 bug：向 Astryx 提 issue，跟踪版本修复；PiGUI 不做本地 override。
- 若有意为之：在 Design 页该 token 旁加注释说明语义，避免后续误用。

## 验收

结论（bug 或 by-design）落回本 issue 并更新 Status；对应动作（上游 issue 链接 / Design 页注释）完成。
