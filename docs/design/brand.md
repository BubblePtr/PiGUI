# Pace 品牌资源

## 已确认的方向

软件侧栏不展示品牌字标，让导航与会话内容成为重点。Figma 04 版独立 PACE 矢量字标保留为官网、宣传图片与社媒背景的品牌资源，采用平直端点和切角轮廓。应用图标使用圆润开口 P、黑白底稿与 Icon Composer 原生材质；不使用 Figma 中的烟晶、冰晶或 IP 插画探索版。

设计来源：[Figma 第 04 版字标](https://www.figma.com/design/r5HLnoU3mVD8ddnAXMiGrA?node-id=3-197)，以及 `build/Pace.icon` 源工程。

## 字标资源

`PaceWordmark` 位于 `apps/desktop/src/shared/ui/pace-wordmark.tsx`，直接保留确认后的六条矢量路径，不依赖字体。默认高度为 `h-6`，宽高比为 824:180，颜色继承 `currentColor`；明暗主题使用界面的 foreground，不添加阴影、渐变或玻璃效果。

字标不用于工作区侧栏；Design 页保留资源预览。仅用于品牌识别，不添加点击行为。根 SVG 默认 `role="img"`、`aria-label="Pace"`，支持 `className` 与其他 SVG 属性透传。Design 页展示小尺寸和大尺寸。

## 应用图标

`build/Pace.icon/Assets/P-rounded.svg` 是独立前景层，保留 1024 画布及原始位置；背景和 Liquid Glass 参数保存在 `icon.json`。编辑后运行 `bun run build:icon:mac`，一起提交源工程和三个生成文件：

- `build/Assets.car`：由 Xcode actool 编译，macOS 打包复制到应用 Resources，通过 `CFBundleIconName=Pace` 使用系统渲染。
- `build/icon.icns`：旧 macOS 与 Linux 的兼容图标，包含 16–1024 像素。
- `build/icon-512.png`：未打包 Electron 的 Dock 图标。

兼容图标来自同一个 Icon Composer 默认外观渲染，不另画一套；透明外沿按 actool 的 macOS 图标比例保留。日常打包使用已提交的生成资源，不要求 Linux 或 CI 安装 Icon Composer。

本次只接入品牌资源；应用标识、数据目录、发布名仍沿用 PiGUI，避免把视觉替换扩大为产品迁移。
