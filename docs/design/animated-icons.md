# Sidebar 与 Header 的动画图标

2026-09-12 选型：先从现成动画库挑选语义与外观合适的图形，再映射到 Pace。现有 glyph 不构成兼容性要求。Trajectory 选 Hugeicons Animated 的 `history`；Usage 选 Lucide Animated 的 `chart-pie`；Packages 选 Hugeicons Animated 的 `puzzle`。插件入口的图标后续另选。

本批仅用于 AppShell 的 Sidebar 与 Header。Dock 的图标与开关保持原实现；项目目录的展开指示已有状态反馈，不叠加悬停动画。

| 使用位置 | 导出 | 来源图标 | 动作 |
| --- | --- | --- | --- |
| Trajectory 导航与 Open Trajectory 菜单 | `AnimatedHistory` | Hugeicons `history` | 外环与指针倒转 |
| Usage 导航 | `AnimatedChartPie` | Lucide `chart-pie` | 扇区向右上方分离，离开时归位 |
| Packages 导航 | `AnimatedPuzzle` | Hugeicons `puzzle` | 拼图片抬起、轻转后落位 |
| New Chat 导航 | `AnimatedNewChat` | Hugeicons `message-add-01` | 对话框轻动，加号弹出 |
| Settings 导航 | `AnimatedSettings` | Hugeicons `settings-01` | 外齿轮转动，轴心静止 |
| Header 的 Sidebar 开关 | `AnimatedSidebar` | Hugeicons `panel-left` | 分隔线沿外框收起、展开 |
| Chats / Projects / 项目行的新增按钮 | `AnimatedPlus` | Hugeicons `plus-sign` | 两笔先后伸展、回弹 |
| 项目与会话的更多菜单 | `AnimatedMoreHorizontal` | Hugeicons `more-horizontal` | 三个点依次轻跳 |

## 接入与状态

- 只从 `shared/ui/icons.tsx` 导入。实现集中在 `animated-icons.tsx`，保留原库 SVG 几何与动作含义，用现有 CSS 动效机制接入，不增加 Motion 运行时依赖。
- 根节点是 SVG；接受 `className`、`size` 与其余 SVG props，React 19 的 `ref` 直接指向 SVG。默认 `size=24`、`currentColor`、`strokeWidth=1.5`，导航仍使用现有的 16px 尺寸。Lucide 的单枚图形也采用相同线宽。
- 默认装饰性图标 `aria-hidden=true`；可访问名与 tooltip 留在现有按钮。新增图标不创建按钮、事件监听或新的焦点节点，也不改变点击逻辑。
- 只有精细指针悬停实际按钮或菜单项时触发，动画不循环。离开悬停恢复静止；点击不等待动画。键盘聚焦、触屏和系统减少动态效果设置均不触发动画。
- `isAnimated=false` 强制静态。禁用按钮保持静态；只读状态标记、列表批量图标不用这些动画导出。
- 不放大按钮，也不改变 Sidebar 既有的颜色反馈与透明背景。动画只作用于 SVG 内部部件，静止态不保留 `transform` 或 `will-change`。
- 时长使用 Astryx 的 `--duration-medium*` 与 `--duration-slow*`；短小部件动作可以跨越按钮颜色反馈的时长，但不阻塞交互。SVG 内部的坐标、角度、关键帧百分比是原图几何参数，不是界面间距 token。
- `panel-left` 的分隔线通过 CSS `d: path()` 做 SVG 几何插值，运行于 Electron Chromium；减少动态效果时直接使用 SVG 的原始 `d`。

`/design → Components → AnimatedIcons` 展示全部 8 枚的导航尺寸、常规尺寸、禁用与强制静态状态。

来源与授权见 [动画图标许可证](../licenses/animated-icons.md)。
