# Auto Update：应用内升级

> 立项依据：0.0.1 已发布签名并公证的 DMG，但 App 没有任何升级能力；ADR-0031 规定 Pi 运行时随 App 一起升级，升级通道因此是发布链路的组成部分。
> 决策来源：2026-09-06 打包与发布链路调查 + 用户拍板：**采用 electron-updater，GitHub Releases 作为分发源。** 决策记录见 `docs/adr/0033-in-app-update-via-electron-updater.md`。
> 落地：切片开成 GitHub Issues 后在本文"切片"段回链。

## 问题

- 已安装 PiGUI 的用户不知道新版本存在，也没有原地升级的途径，只能回 GitHub 手动下载 DMG。
- 没有 updater 的版本永远收不到推送，越晚接入，"孤儿版本"的用户越多。
- 发布产物只有 DMG 与校验和，缺少任何更新元数据。

## 方案

见 ADR-0033。要点：

1. `electron-updater` + `publish: github`，CI 仍 `--publish never`，上传由 `scripts/publish-release.sh` 完成。
2. macOS 增加 zip 产物；Release 资产扩为 DMG、zip、blockmap、`latest-mac.yml`、`SHA256SUMS.txt`。
3. 自动检查、自动下载、用户点击"重启并安装"后才安装；仅打包态启用。
4. 主进程独立模块 `apps/desktop/electron/updater.ts`；命令走 `pigui:invoke` 主进程截获分支，事件走 `pigui:update-event`。
5. 设置页新增"关于与更新"区：当前版本、状态、检查更新、重启并安装。

## 范围外

- Linux / Windows 的 updater（没有对应发布流程）。
- 强制升级、静默安装、灰度与自建更新服务器。
- 版本号自动提升；本切片不改版本号，发版时按 `docs/release/macos.md` 手动处理。
- Pi 运行时独立更新（ADR-0031 明确禁止）。

## 切片

- #196：electron-updater 接入与发布资产扩展（单切片，含主进程、渲染层、CI 与文档）。
