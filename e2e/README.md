# PiGUI E2E 测试

Playwright 启动真实 Electron 桌面应用，通过 UI 和持久化文件验证关键产品流程。

## 运行

```bash
# 先构建 Electron main、preload、renderer 和 backend
bun run build

# 运行全部 Electron E2E
bun run test:e2e

# Linux：在 Xvfb 下跑（见下方“Linux 显示环境”）
bun run test:e2e:linux

# 从已生成的 arm64 `.app` 运行同一套 E2E（macOS）
bun run package:mac:unsigned
bun run test:e2e:packaged:mac

# 从已生成的 x64 目录产物运行同一套 E2E（Linux）
bun run package:linux
bun run test:e2e:packaged:linux

# 仅运行当前 smoke 文件
bun run test:e2e -- e2e/smoke/m1-fixture-free.spec.ts
```

当前 smoke 不调用真实 LLM。每条测试都会创建独立的 Electron user data、PiGUI data 和 Project 目录，并在结束后清理，避免读取开发者机器上的 localStorage 或 `~/.pigui`。

`test:e2e:packaged:*` 不使用源码入口，而是直接启动打包产物（macOS `dist/mac-arm64/PiGUI.app/Contents/MacOS/PiGUI`，Linux `dist/linux-unpacked/pigui`），用于发现 ASAR、运行时资产和 utility process 路径只在安装包中出现的问题。

## Linux 显示环境

部分用例依赖真实窗口宽度（`session-dock` 由 `matchMedia("(min-width: 1280px)")` 控制停靠还是弹 sheet）。在平铺式 Wayland 合成器（Hyprland/sway 等）下，合成器会覆盖客户端请求的尺寸——实测 `setSize(1440, 900)` 生效约 500ms 后被抢回 1181px，这类用例必然失败。

所以 Linux 上用 `test:e2e:linux` / `test:e2e:packaged:linux`，它们跑在 Xvfb 里（无窗口管理器，没人改窗口几何）：

```bash
sudo pacman -S xorg-server-xvfb        # Arch；Debian/Ubuntu 是 xvfb
```

两个脚本会 `env -u WAYLAND_DISPLAY` 并给 Electron 传 `--ozone-platform=x11`。注意 `ELECTRON_OZONE_PLATFORM_HINT=x11` 无效——Electron 仍会去连 Wayland，必须用命令行开关。

fixture 通过 `PIGUI_E2E_ELECTRON_ARGS`（空格分隔）接收额外 Electron 开关，需要临时加参数时可直接用这个变量。

## 覆盖范围

- Electron 真空态不显示 browser development fixture
- 真实 Project Registry 数据可进入 Session draft
- Archive UI 会调用 backend、持久化 `archived` 状态并变为只读
- test-only kill command 会真实终止 backend utility process；测试随后验证 disconnected/connected generation 和 Projection 重新加载
- M4 Model / Thinking 使用真实 Pi SDK runtime 和隔离的 Pi session/auth fixture，验证 capability-driven 切换、slider、持久化和 backend restart 恢复；不发送 LLM 请求

backend kill command 仅在 `PIGUI_E2E=1` 时启用，生产运行不可调用。

## 目录

```text
e2e/
  playwright.config.ts
  fixtures/
    electron-app.ts
  smoke/
    m1-fixture-free.spec.ts
```

失败截图和 trace 写入 `test-results/`，该目录不进入 Git。
