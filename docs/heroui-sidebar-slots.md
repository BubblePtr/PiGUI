# HeroUI Sidebar Slot 速查

本文档记录 PiGUI 使用 `@heroui-pro/react/sidebar` 时的 slot 词汇。新写 sidebar UI 时优先使用这些 compound components；只有 HeroUI 没暴露对应 slot，或 PiGUI 需要承接 macOS window chrome / Electron drag region 这类 shell 语义时，才自己写结构和 class。

## 根组件

| Slot | 中文含义 | PiGUI 用法 |
| --- | --- | --- |
| `Sidebar.Provider` | Sidebar 状态提供器 | 通常由 `AppLayout` 内部创建；不要在 PiGUI shell 里重复包一层。 |
| `Sidebar` / `Sidebar.Root` | 侧边栏面板 | 渲染实际 `<aside>`，承接 `--sidebar-width`、`--spacing` 这类组件级变量。 |
| `Sidebar.Main` | 与 Sidebar 配套的主内容区 | PiGUI 当前由 `AppLayout` 负责主内容区，不直接使用。 |
| `Sidebar.Mobile` | 移动端抽屉侧边栏 | PiGUI 当前是 desktop-only，不使用。 |

## 布局区块

| Slot | 中文含义 | PiGUI 用法 |
| --- | --- | --- |
| `Sidebar.Header` | 侧边栏顶部区 | 用于真实 sidebar header。macOS titlebar 占位如果只是视觉 spacer，可以考虑收敛到这里。 |
| `Sidebar.Content` | 侧边栏可滚动内容区 | 包装 Trace / Usage / Projects，内部自带 `ScrollShadow` 和隐藏滚动条行为。 |
| `Sidebar.Footer` | 侧边栏底部区 | 放 Settings 这类固定底部导航。 |
| `Sidebar.Group` | 分组容器 | 用于 Trace/Usage、Projects、Settings 等逻辑分组。 |
| `Sidebar.GroupLabel` | 分组标题 | 用于 `Projects` 标题和项目组标题；折叠时会自动隐藏。 |
| `Sidebar.Separator` | 分隔线 | 需要组间视觉分隔时优先用它，不手写 border div。 |

## 菜单结构

| Slot | 中文含义 | PiGUI 用法 |
| --- | --- | --- |
| `Sidebar.Menu` | 菜单树容器 | 用于一组可导航或可操作行，支持键盘导航和 guide lines。 |
| `Sidebar.MenuSection` | 菜单分区 | 同一个菜单内需要 section 时使用。 |
| `Sidebar.MenuHeader` | 菜单分区标题 | 菜单内标题，和 `GroupLabel` 不同。 |
| `Sidebar.MenuItem` | 菜单行 | 用于 Trace、Usage、Settings、New Session、Session row。导航行优先用 `href`。 |
| `Sidebar.MenuItemContent` | 菜单行内容包装 | 通常由 `MenuItem` 自动生成；只有需要显式控制内容 wrapper 时才使用。 |
| `Sidebar.Submenu` | 子菜单容器 | Project header 的 session 子项放这里，由 `MenuTrigger` 控制展开状态。 |

## 菜单行内部

| Slot | 中文含义 | PiGUI 用法 |
| --- | --- | --- |
| `Sidebar.MenuIcon` | 菜单图标槽 | 放 Hugeicons 图标或 session 状态 glyph。默认 `size-5` 容器、内部 svg `size-4`。 |
| `Sidebar.MenuLabel` | 菜单主文字 | 放行标题，自动提供 truncate 语义。 |
| `Sidebar.MenuChip` | 菜单右侧轻量信息 | 放时间、计数等始终可见且较轻的信息。 |
| `Sidebar.MenuActions` | 菜单右侧动作容器 | 放 hover/current 才出现的动作。不要放 session 时间这类常驻信息。 |
| `Sidebar.MenuAction` | 菜单动作按钮 | `MenuActions` 内的单个 action button；比手写 icon button 更适合 hover/focus/pressed 状态。 |
| `Sidebar.MenuTrigger` | 子菜单展开按钮 | 用于有子项的 `MenuItem`，不要自己手写 chevron button。 |
| `Sidebar.MenuIndicator` | 子菜单展开指示图标 | 默认 chevron，会随 expanded 状态旋转。 |

## 交互辅助

| Slot | 中文含义 | PiGUI 用法 |
| --- | --- | --- |
| `Sidebar.Trigger` | 整个 sidebar 展开/收起按钮 | PiGUI header chrome 里的 collapse/expand 按钮使用它。 |
| `Sidebar.Rail` | 侧边栏边缘切换热区 | 当前 resizable shell 不使用；不要和 `Resizable.Handle` 混用。 |
| `Sidebar.Tooltip` | 折叠态提示 | icon-only sidebar 才有明显价值；PiGUI 当前 offcanvas 模式通常不需要。 |

## PiGUI 约定

1. sidebar 行优先使用 `Sidebar.MenuItem` 组合 `MenuIcon`、`MenuLabel`、`MenuChip`、`MenuActions`。
2. 常驻右侧信息放 `MenuChip`；hover 才出现的操作放 `MenuActions`。
3. 菜单或弹层优先用 HeroUI `Dropdown` / `Popover`，不要手写 absolute 定位、`role="menu"` 和 focus 逻辑。
4. Project header 是父级 `Sidebar.MenuItem`；展开/收起用 `Sidebar.MenuTrigger`，trigger 内部可以放 PiGUI 自定义状态 indicator，sessions 放在 `Sidebar.Submenu`。
5. PiGUI 自己的 CSS 可以集中定义 sidebar density / radius token；不要在单个 item 上零散覆盖 hover 阴影、圆角、padding 等 Sidebar 内部视觉细节。
