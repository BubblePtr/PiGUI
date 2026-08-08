# Issue 1: SideNavItem 行内动作按钮造成 button 嵌套（hydration 警告）

Status: done(兄弟覆盖层方案,2026-08-08)
Source PRD: .scratch/astryx-migration/PRD.md

## 现象

所有带侧边栏的页面，开发模式控制台报 React 警告：

```
In HTML, <button> cannot be a descendant of <button>.
This will cause a hydration error.
```

## 根因

`app-shell.tsx` 的项目行把行内动作放进了 `SideNavItem` 的 `endContent`：`IconButton`（New Session）和 `MoreMenu` 触发器都是 `<button>`，而 Astryx `SideNavItem` 本身渲染为 `<button>`，形成非法的 button 嵌套。HTML 解析器会提前闭合外层 button，除警告外还可能导致点击目标错乱和可访问性问题（嵌套的可交互元素对屏幕阅读器不可达）。

## 修复方向（供实现者评估）

- 首选：让行容器不再是 `<button>`——例如 Astryx `SideNavItem` 支持 `as="div"` + `role="button"`，或行主体与行内动作平级布局（动作绝对定位覆盖在行上，DOM 上是兄弟节点）。
- 参考 Astryx 上游是否已有 `endContent` 含交互元素的官方模式；若无，考虑向上游提 issue。

## 验收

1. 开发模式控制台不再出现 button 嵌套警告。
2. 行点击、行内 New Session、MoreMenu 三者的点击区域互不干扰（现有 `app-shell.test.tsx` 交互测试全绿）。
3. 键盘 Tab 顺序可依次到达行、行内动作。
