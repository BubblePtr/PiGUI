# PiGUI E2E 测试

Playwright 启动真实 Electron 桌面应用，通过 UI 和持久化文件验证关键产品流程。

## 运行

```bash
# 先构建 Electron main、preload、renderer 和 backend
bun run build

# 运行全部 Electron E2E
bun run test:e2e

# 仅运行当前 smoke 文件
bun run test:e2e -- e2e/smoke/m1-fixture-free.spec.ts
```

当前 smoke 不调用真实 LLM。每条测试都会创建独立的 Electron user data、PiGUI data 和 Project 目录，并在结束后清理，避免读取开发者机器上的 localStorage 或 `~/.pigui`。

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
